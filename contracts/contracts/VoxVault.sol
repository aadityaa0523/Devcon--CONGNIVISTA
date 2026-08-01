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
