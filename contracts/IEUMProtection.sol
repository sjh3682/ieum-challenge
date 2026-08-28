// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * IEUMProtection
 * 2026 AI Blockchain Challenge in Daegu - lifetime asset protection prototype
 *
 * IMPORTANT:
 * - This contract does NOT custody money and does NOT freeze a bank account.
 * - A participating financial institution would protect the real funds off-chain.
 * - This contract stores only hashes + state transitions for auditability.
 * - Medical documents, account numbers, balances and diagnosis details must never be written on-chain.
 */
contract IEUMProtection {
    struct Protection {
        bytes32 ruleHash;
        bytes32 pendingRuleHash;
        uint64 createdAt;
        uint64 executeAfter;
        bool active;
    }

    address public immutable operator;
    uint64 public immutable changeDelay;
    uint256 public protectionCount;

    mapping(uint256 => Protection) private protections;
    mapping(uint256 => mapping(bytes32 => bool)) private releaseRequested;
    mapping(uint256 => mapping(bytes32 => bool)) private releasePhoneVerified;
    mapping(uint256 => mapping(bytes32 => bytes32)) private releaseVerificationHash;
    mapping(uint256 => mapping(bytes32 => bool)) private releaseCompleted;
    mapping(uint256 => bytes32) private medicalBasisHash;

    event ProtectionCreated(uint256 indexed protectionId, bytes32 indexed ruleHash, uint256 createdAt);
    event ProtectionChangeRequested(uint256 indexed protectionId, bytes32 indexed newRuleHash, uint256 executeAfter);
    event ProtectionChanged(uint256 indexed protectionId, bytes32 indexed oldRuleHash, bytes32 indexed newRuleHash);
    event MedicalBasisRecorded(uint256 indexed protectionId, bytes32 indexed basisHash, uint256 recordedAt);
    event ReleaseRequested(uint256 indexed protectionId, bytes32 indexed requestHash, uint256 requestedAt);
    event ReleasePhoneVerified(uint256 indexed protectionId, bytes32 indexed requestHash, bytes32 indexed verificationHash, uint256 verifiedAt);
    event ReleaseCompleted(uint256 indexed protectionId, bytes32 indexed requestHash, uint256 completedAt);
    event ProtectionCancelled(uint256 indexed protectionId);

    modifier onlyOperator() {
        require(msg.sender == operator, "ONLY_OPERATOR");
        _;
    }

    modifier exists(uint256 protectionId) {
        require(protectionId < protectionCount && protections[protectionId].createdAt != 0, "NOT_FOUND");
        _;
    }

    constructor(uint64 _changeDelay) {
        require(_changeDelay > 0, "DELAY_REQUIRED");
        operator = msg.sender;
        changeDelay = _changeDelay;
    }

    function createProtection(bytes32 ruleHash) external onlyOperator returns (uint256) {
        require(ruleHash != bytes32(0), "EMPTY_HASH");
        uint256 id = protectionCount++;
        protections[id] = Protection({
            ruleHash: ruleHash,
            pendingRuleHash: bytes32(0),
            createdAt: uint64(block.timestamp),
            executeAfter: 0,
            active: true
        });
        emit ProtectionCreated(id, ruleHash, block.timestamp);
        return id;
    }

    function requestChange(uint256 protectionId, bytes32 newRuleHash)
        external onlyOperator exists(protectionId)
    {
        Protection storage p = protections[protectionId];
        require(p.active, "INACTIVE");
        require(newRuleHash != bytes32(0), "EMPTY_HASH");
        require(newRuleHash != p.ruleHash, "SAME_RULE");
        p.pendingRuleHash = newRuleHash;
        p.executeAfter = uint64(block.timestamp + changeDelay);
        emit ProtectionChangeRequested(protectionId, newRuleHash, p.executeAfter);
    }

    function executeChange(uint256 protectionId)
        external onlyOperator exists(protectionId)
    {
        Protection storage p = protections[protectionId];
        require(p.active, "INACTIVE");
        require(p.pendingRuleHash != bytes32(0), "NO_PENDING_CHANGE");
        require(block.timestamp >= p.executeAfter, "CHANGE_DELAY_ACTIVE");
        bytes32 oldHash = p.ruleHash;
        bytes32 newHash = p.pendingRuleHash;
        p.ruleHash = newHash;
        p.pendingRuleHash = bytes32(0);
        p.executeAfter = 0;
        emit ProtectionChanged(protectionId, oldHash, newHash);
    }


    function recordMedicalBasis(uint256 protectionId, bytes32 basisHash)
        external onlyOperator exists(protectionId)
    {
        require(protections[protectionId].active, "INACTIVE");
        require(basisHash != bytes32(0), "EMPTY_BASIS_HASH");
        medicalBasisHash[protectionId] = basisHash;
        emit MedicalBasisRecorded(protectionId, basisHash, block.timestamp);
    }

    function getMedicalBasisHash(uint256 protectionId)
        external view exists(protectionId) returns (bytes32)
    {
        return medicalBasisHash[protectionId];
    }

    function requestRelease(uint256 protectionId, bytes32 requestHash)
        external onlyOperator exists(protectionId)
    {
        require(protections[protectionId].active, "INACTIVE");
        require(requestHash != bytes32(0), "EMPTY_HASH");
        require(!releaseRequested[protectionId][requestHash], "RELEASE_ALREADY_REQUESTED");
        releaseRequested[protectionId][requestHash] = true;
        emit ReleaseRequested(protectionId, requestHash, block.timestamp);
    }


    function recordPhoneVerification(uint256 protectionId, bytes32 requestHash, bytes32 verificationHash)
        external onlyOperator exists(protectionId)
    {
        require(protections[protectionId].active, "INACTIVE");
        require(requestHash != bytes32(0), "EMPTY_HASH");
        require(verificationHash != bytes32(0), "EMPTY_VERIFICATION_HASH");
        require(releaseRequested[protectionId][requestHash], "RELEASE_NOT_REQUESTED");
        require(!releasePhoneVerified[protectionId][requestHash], "PHONE_ALREADY_VERIFIED");
        require(!releaseCompleted[protectionId][requestHash], "RELEASE_ALREADY_COMPLETED");
        releasePhoneVerified[protectionId][requestHash] = true;
        releaseVerificationHash[protectionId][requestHash] = verificationHash;
        emit ReleasePhoneVerified(protectionId, requestHash, verificationHash, block.timestamp);
    }

    function completeRelease(uint256 protectionId, bytes32 requestHash)
        external onlyOperator exists(protectionId)
    {
        require(protections[protectionId].active, "INACTIVE");
        require(requestHash != bytes32(0), "EMPTY_HASH");
        require(releaseRequested[protectionId][requestHash], "RELEASE_NOT_REQUESTED");
        require(releasePhoneVerified[protectionId][requestHash], "PHONE_NOT_VERIFIED");
        require(!releaseCompleted[protectionId][requestHash], "RELEASE_ALREADY_COMPLETED");
        releaseCompleted[protectionId][requestHash] = true;
        emit ReleaseCompleted(protectionId, requestHash, block.timestamp);
    }

    function getReleaseStatus(uint256 protectionId, bytes32 requestHash)
        external view exists(protectionId) returns (bool requested, bool phoneVerified, bytes32 verificationHash, bool completed)
    {
        return (
            releaseRequested[protectionId][requestHash],
            releasePhoneVerified[protectionId][requestHash],
            releaseVerificationHash[protectionId][requestHash],
            releaseCompleted[protectionId][requestHash]
        );
    }

    function cancelProtection(uint256 protectionId)
        external onlyOperator exists(protectionId)
    {
        protections[protectionId].active = false;
        emit ProtectionCancelled(protectionId);
    }

    function getProtection(uint256 protectionId)
        external view exists(protectionId)
        returns (bytes32 ruleHash, bytes32 pendingRuleHash, uint64 createdAt, uint64 executeAfter, bool active)
    {
        Protection storage p = protections[protectionId];
        return (p.ruleHash, p.pendingRuleHash, p.createdAt, p.executeAfter, p.active);
    }
}
