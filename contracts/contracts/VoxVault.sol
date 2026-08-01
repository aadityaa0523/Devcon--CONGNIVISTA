// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title VoxVault
 * @dev Privacy-preserving smart wallet using biometric authentication
 * Supports session keys, social recovery with timelock, and guardian privacy
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
    event BiometricReVerified(bytes32 commitmentHash, bool exactMatch, uint256 timestamp);

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

    modifier onlyOwner() override {
        require(msg.sender == owner(), "not owner");
        _;
    }

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

    function reVerifyBiometric(bytes32 freshCommitmentHash) external onlyOwner returns (bool) {
        bool exactMatch = freshCommitmentHash == biometricCommitmentHash;
        emit BiometricReVerified(freshCommitmentHash, exactMatch, block.timestamp);
        return exactMatch;
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
        _transferOwnership(pendingNewOwner);
        _invalidateAllSessionKeys();
        _clearRecoveryState();

        emit RecoveryExecuted(oldOwner, pendingNewOwner);
    }

    function cancelRecovery(bytes32 freshCommitmentHash) external onlyOwner {
        require(recoveryRequestTime != 0, "no pending recovery");
        require(freshCommitmentHash == biometricCommitmentHash, "biometric mismatch");

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
