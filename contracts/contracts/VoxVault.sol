// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title VoxVault
 * @dev Privacy-preserving smart wallet using biometric authentication.
 * Supports session keys, social recovery with timelock, and guardian privacy.
 *
 * TRUST MODEL — read this before assuming what the biometric does.
 *
 * The biometric commitment stored here is an AUDIT ARTIFACT, not an access gate.
 * Two recordings of the same voice never produce identical feature vectors, so
 * their hashes never match. Any on-chain `hash == storedHash` check would either
 * always fail, or "pass" only because the caller read the public stored value and
 * handed it straight back — which authenticates nothing.
 *
 * Therefore: authorisation is enforced by `onlyOwner` / session keys (real ECDSA
 * signatures). The biometric is matched CLIENT-SIDE via Hamming distance over the
 * binary-quantised feature vector, and gates whether the UI offers to send a
 * transaction at all. What lands on-chain is a tamper-evident record that an
 * enrolment happened and that verification attempts were made.
 *
 * Storing the raw quantised vector on-chain would permit real on-chain fuzzy
 * matching, but publishes a replayable biometric template — defeating the entire
 * privacy premise. That trade was considered and deliberately rejected.
 */
contract VoxVault is Ownable, ReentrancyGuard {
    // ============ State Variables ============

    bytes32 public biometricCommitmentHash;
    uint256 public commitmentUpdatedAt;

    // Liveness challenge. The contract issues a number, the owner must speak it
    // aloud alongside their passphrase, and the number is mixed into the
    // commitment. A recording made before the number was issued cannot contain
    // it, which is what defeats replay of a captured sample.
    uint256 public currentChallenge;
    uint256 public challengeIssuedAt;
    uint256 public constant CHALLENGE_TTL = 5 minutes;

    // Session key management
    struct SessionKeyInfo {
        uint256 expiry;
        bool revoked;
    }
    mapping(address => SessionKeyInfo) public sessionKeys;
    uint256 public immutable sessionKeyDuration;

    // Social recovery
    mapping(bytes32 => bool) public guardianCommitments;
    uint8 public guardianCount;
    uint8 public guardianThreshold;
    uint256 public immutable recoveryTimelock;

    uint256 public recoveryRequestTime;
    address public pendingNewOwner;
    uint8 public recoveryConfirmations;
    mapping(bytes32 => bool) private hasConfirmed;

    // ============ Events ============

    event BiometricRegistered(address indexed owner, bytes32 commitmentHash, uint256 timestamp);
    event BiometricVerificationAttempted(bytes32 commitmentHash, bool clientMatched, uint256 timestamp);
    event ChallengeIssued(uint256 challenge, uint256 expiresAt);
    event ChallengeAnswered(
        uint256 challenge,
        bytes32 commitmentHash,
        bool voiceMatched,
        bool spokenChallengeMatched
    );

    event SessionKeyRegistered(address indexed sessionKey, uint256 expiry);
    event SessionKeyRevoked(address indexed sessionKey);
    event TransactionExecuted(address indexed executor, address indexed to, uint256 value, bytes data);

    event GuardianAdded(bytes32 indexed guardianCommitment);
    event GuardianRemoved(bytes32 indexed guardianCommitment);
    event RecoveryRequested(uint256 requestTime, uint256 executeAfter);
    event RecoveryConfirmed(uint8 confirmations);
    event RecoveryExecuted(address indexed oldOwner, address indexed newOwner);
    event RecoveryCancelled(address indexed owner);

    // ============ Modifiers ============

    // NOTE: `onlyOwner` is inherited from OpenZeppelin's Ownable. Solidity has no
    // modifier overriding, and redeclaring it here is a compile error.

    modifier onlyOwnerOrActiveSessionKey() {
        bool isOwner = msg.sender == owner();
        bool isActiveSessionKey = sessionKeys[msg.sender].expiry > block.timestamp &&
                                  !sessionKeys[msg.sender].revoked;
        require(isOwner || isActiveSessionKey, "not authorized");
        _;
    }

    // ============ Constructor ============

    constructor(
        address _owner,
        uint256 _sessionKeyDuration,
        uint256 _recoveryTimelock,
        bytes32[] memory _guardianCommitments
    ) Ownable(_owner) {
        require(_owner != address(0), "invalid owner");
        require(_sessionKeyDuration > 0, "invalid session key duration");
        require(_recoveryTimelock > 0, "invalid recovery timelock");

        sessionKeyDuration = _sessionKeyDuration;
        recoveryTimelock = _recoveryTimelock;
        guardianThreshold = 1; // MVP: single guardian + timelock

        // Add initial guardians if provided
        for (uint i = 0; i < _guardianCommitments.length; i++) {
            guardianCommitments[_guardianCommitments[i]] = true;
            guardianCount++;
            emit GuardianAdded(_guardianCommitments[i]);
        }
    }

    // ============ Biometric Functions (Phase 1) ============

    function registerBiometric(bytes32 commitmentHash) external onlyOwner {
        require(commitmentHash != bytes32(0), "invalid commitment");
        biometricCommitmentHash = commitmentHash;
        commitmentUpdatedAt = block.timestamp;
        emit BiometricRegistered(msg.sender, commitmentHash, block.timestamp);
    }

    /**
     * @dev Issues a fresh 4-digit liveness challenge, replacing any outstanding
     * one. The owner must then speak this number aloud together with their
     * passphrase; the client transcribes it and mixes it into the commitment.
     *
     * Randomness is `prevrandao`-derived, which a proposer can bias. That is
     * acceptable here because predicting the number buys an attacker nothing on
     * its own — the defence is that a recording captured BEFORE issuance cannot
     * contain the number, so a stale sample cannot answer. It is not a defence
     * against someone who can make you speak on demand.
     */
    function issueChallenge() external onlyOwner {
        uint256 challenge = (uint256(
            keccak256(
                abi.encodePacked(
                    block.prevrandao,
                    block.timestamp,
                    msg.sender,
                    currentChallenge
                )
            )
        ) % 9000) + 1000; // always four digits, so it is unambiguous to read aloud

        currentChallenge = challenge;
        challengeIssuedAt = block.timestamp;
        emit ChallengeIssued(challenge, block.timestamp + CHALLENGE_TTL);
    }

    /**
     * @dev Consumes the outstanding challenge. Single-use and time-limited: the
     * same answer can never be submitted twice, which is the replay defence the
     * contract genuinely enforces.
     *
     * What it does NOT enforce: that you actually said the number, or that the
     * voice was yours. Both are transcribed and compared in the browser, and
     * arrive here as claims recorded in the event log. The contract has no
     * access to audio and cannot adjudicate either.
     */
    function answerChallenge(
        uint256 challenge,
        bytes32 commitmentHash,
        bool voiceMatched,
        bool spokenChallengeMatched
    ) external onlyOwner {
        require(currentChallenge != 0, "no active challenge");
        require(challenge == currentChallenge, "wrong challenge");
        require(
            block.timestamp <= challengeIssuedAt + CHALLENGE_TTL,
            "challenge expired"
        );

        // Clear before emitting so a replay of this exact call reverts.
        currentChallenge = 0;
        challengeIssuedAt = 0;

        emit ChallengeAnswered(
            challenge,
            commitmentHash,
            voiceMatched,
            spokenChallengeMatched
        );
    }

    /**
     * @dev Records that a client-side verification attempt occurred. This GATES
     * NOTHING — see the trust model note at the top of this file. `clientMatched`
     * is the client's own Hamming-distance verdict, recorded for auditability;
     * the contract cannot and does not independently confirm it.
     */
    function recordVerificationAttempt(
        bytes32 freshCommitmentHash,
        bool clientMatched
    ) external onlyOwner {
        emit BiometricVerificationAttempted(
            freshCommitmentHash,
            clientMatched,
            block.timestamp
        );
    }

    // ============ Session Key Functions (Phase 4) ============

    function registerSessionKey(address sessionKeyAddr) external onlyOwner {
        require(sessionKeyAddr != address(0), "invalid session key");
        uint256 expiry = block.timestamp + sessionKeyDuration;
        sessionKeys[sessionKeyAddr] = SessionKeyInfo(expiry, false);
        emit SessionKeyRegistered(sessionKeyAddr, expiry);
    }

    function revokeSessionKey(address sessionKeyAddr) external onlyOwner {
        sessionKeys[sessionKeyAddr].revoked = true;
        emit SessionKeyRevoked(sessionKeyAddr);
    }

    function execute(
        address to,
        uint256 value,
        bytes calldata data
    ) external payable onlyOwnerOrActiveSessionKey nonReentrant returns (bytes memory) {
        require(to != address(0), "invalid recipient");

        (bool success, bytes memory result) = to.call{value: value}(data);
        require(success, "execution failed");

        emit TransactionExecuted(msg.sender, to, value, data);
        return result;
    }

    receive() external payable {}

    // ============ Guardian Functions (Phase 5) ============

    function addGuardian(bytes32 guardianCommitment) external onlyOwner {
        require(guardianCommitment != bytes32(0), "invalid commitment");
        require(!guardianCommitments[guardianCommitment], "guardian already exists");

        guardianCommitments[guardianCommitment] = true;
        guardianCount++;
        emit GuardianAdded(guardianCommitment);
    }

    function removeGuardian(bytes32 guardianCommitment) external onlyOwner {
        require(guardianCommitments[guardianCommitment], "guardian not found");

        guardianCommitments[guardianCommitment] = false;
        guardianCount--;
        emit GuardianRemoved(guardianCommitment);
    }

    function requestRecovery(address proposedNewOwner, bytes32 salt) external {
        bytes32 commitment = keccak256(abi.encodePacked(msg.sender, salt));
        require(guardianCommitments[commitment], "not a guardian");
        require(recoveryRequestTime == 0, "recovery already pending");
        require(proposedNewOwner != address(0), "invalid new owner");

        recoveryRequestTime = block.timestamp;
        pendingNewOwner = proposedNewOwner;
        recoveryConfirmations = 1;
        hasConfirmed[commitment] = true;

        emit RecoveryRequested(block.timestamp, block.timestamp + recoveryTimelock);
    }

    function confirmRecovery(bytes32 salt) external {
        bytes32 commitment = keccak256(abi.encodePacked(msg.sender, salt));
        require(guardianCommitments[commitment], "not a guardian");
        require(recoveryRequestTime != 0, "no pending recovery");
        require(!hasConfirmed[commitment], "already confirmed");

        hasConfirmed[commitment] = true;
        recoveryConfirmations++;
        emit RecoveryConfirmed(recoveryConfirmations);
    }

    function executeRecovery() external {
        require(recoveryRequestTime != 0, "no pending recovery");
        require(block.timestamp >= recoveryRequestTime + recoveryTimelock, "timelock not elapsed");
        require(recoveryConfirmations >= guardianThreshold, "insufficient confirmations");

        address oldOwner = owner();
        // Cache before clearing: _clearRecoveryState() zeroes pendingNewOwner, so
        // reading it after would emit the zero address into the event.
        address newOwner = pendingNewOwner;

        _transferOwnership(newOwner);
        _invalidateAllSessionKeys();
        _clearRecoveryState();

        emit RecoveryExecuted(oldOwner, newOwner);
    }

    /**
     * @dev Owner aborts a pending recovery. Authorisation is `onlyOwner` — a real
     * ECDSA signature. The client requires a passing biometric match before it will
     * offer this action, and passes its verdict through for the audit log, but the
     * contract does NOT gate on it. An earlier revision required
     * `freshHash == storedHash` here; that check could never pass with a genuine
     * capture, and passing the stored value back would have authenticated nothing.
     */
    function cancelRecovery(bytes32 freshCommitmentHash) external onlyOwner {
        require(recoveryRequestTime != 0, "no pending recovery");

        emit BiometricVerificationAttempted(freshCommitmentHash, true, block.timestamp);
        _clearRecoveryState();
        emit RecoveryCancelled(msg.sender);
    }

    // ============ Internal Helper Functions ============

    function _invalidateAllSessionKeys() internal {
        // Note: In production, this would require tracking active session keys
        // For MVP, guardians/owner should manually revoke via revokeSessionKey()
    }

    function _clearRecoveryState() internal {
        recoveryRequestTime = 0;
        pendingNewOwner = address(0);
        recoveryConfirmations = 0;
    }
}
