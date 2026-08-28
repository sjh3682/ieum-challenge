// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * IEUMVault
 * 2026 AI Blockchain Challenge in Daegu - IEUM prototype
 *
 * Prototype trust model:
 * - The wallet that deploys this contract becomes the verifier.
 * - In the competition demo, deploy with the dedicated "IEUM Test" Sepolia wallet.
 * - Recipients request death verification off-chain.
 * - Only the verifier wallet can commit the verified death result on-chain.
 * - Financial data itself is NOT stored on-chain; only a bytes32 fingerprint + URI are stored.
 */
contract IEUMVault {
    struct Vault {
        address owner;
        bytes32 dataHash;
        string dataURI;
        bool deathConfirmed;
        bool active;
        address[] recipients;
    }

    address public immutable verifier;
    uint256 public vaultCount;

    mapping(uint256 => Vault) private vaults;
    mapping(uint256 => mapping(address => bool)) private isRecipient;

    event VaultRegistered(
        uint256 indexed vaultId,
        address indexed owner,
        bytes32 indexed dataHash,
        string dataURI
    );
    event DeathConfirmed(uint256 indexed vaultId, address indexed verifier);
    event VaultOpened(uint256 indexed vaultId, address indexed opener);
    event RecipientUpdated(uint256 indexed vaultId, address indexed recipient, bool allowed);
    event VaultCancelled(uint256 indexed vaultId);

    modifier onlyVerifier() {
        require(msg.sender == verifier, "ONLY_VERIFIER");
        _;
    }

    modifier vaultExists(uint256 vaultId) {
        require(vaultId < vaultCount && vaults[vaultId].owner != address(0), "VAULT_NOT_FOUND");
        _;
    }

    constructor() {
        verifier = msg.sender;
    }

    function registerVault(
        bytes32 _dataHash,
        string calldata _dataURI,
        address[] calldata _recipients
    ) external returns (uint256) {
        require(_dataHash != bytes32(0), "EMPTY_HASH");
        require(_recipients.length > 0, "NO_RECIPIENT");

        uint256 vaultId = vaultCount;
        vaultCount += 1;

        Vault storage v = vaults[vaultId];
        v.owner = msg.sender;
        v.dataHash = _dataHash;
        v.dataURI = _dataURI;
        v.active = true;

        for (uint256 i = 0; i < _recipients.length; i++) {
            address recipient = _recipients[i];
            require(recipient != address(0), "ZERO_RECIPIENT");
            if (!isRecipient[vaultId][recipient]) {
                isRecipient[vaultId][recipient] = true;
                v.recipients.push(recipient);
            }
        }

        emit VaultRegistered(vaultId, msg.sender, _dataHash, _dataURI);
        return vaultId;
    }

    /**
     * Only the trusted verifier commits a verified death result.
     * In the prototype the Vercel server signs this with the IEUM Test wallet.
     */
    function confirmDeath(uint256 vaultId)
        external
        onlyVerifier
        vaultExists(vaultId)
    {
        Vault storage v = vaults[vaultId];
        require(v.active, "VAULT_INACTIVE");
        require(!v.deathConfirmed, "ALREADY_CONFIRMED");

        v.deathConfirmed = true;
        emit DeathConfirmed(vaultId, msg.sender);
    }

    /**
     * Read the protected fingerprint/URI only after death verification.
     * The Vercel server calls this with the IEUM Test wallet.
     */
    function openVault(uint256 vaultId)
        external
        view
        vaultExists(vaultId)
        returns (bytes32, string memory)
    {
        Vault storage v = vaults[vaultId];
        require(v.active, "VAULT_INACTIVE");
        require(v.deathConfirmed, "DEATH_NOT_CONFIRMED");
        require(_canOpen(vaultId, msg.sender), "NOT_AUTHORIZED");

        return (v.dataHash, v.dataURI);
    }

    /**
     * Records the actual opening as a Sepolia transaction/event.
     * This is separate from openVault() so the data can still be returned safely.
     */
    function recordOpen(uint256 vaultId)
        external
        vaultExists(vaultId)
    {
        Vault storage v = vaults[vaultId];
        require(v.active, "VAULT_INACTIVE");
        require(v.deathConfirmed, "DEATH_NOT_CONFIRMED");
        require(_canOpen(vaultId, msg.sender), "NOT_AUTHORIZED");

        emit VaultOpened(vaultId, msg.sender);
    }

    /**
     * Prototype-ready lifecycle controls for the registered owner.
     * These are not required by the current UI, but make the service model explicit.
     */
    function setRecipient(uint256 vaultId, address recipient, bool allowed)
        external
        vaultExists(vaultId)
    {
        Vault storage v = vaults[vaultId];
        require(msg.sender == v.owner, "ONLY_OWNER");
        require(v.active, "VAULT_INACTIVE");
        require(!v.deathConfirmed, "ALREADY_CONFIRMED");
        require(recipient != address(0), "ZERO_RECIPIENT");

        isRecipient[vaultId][recipient] = allowed;
        if (allowed) {
            bool found = false;
            for (uint256 i = 0; i < v.recipients.length; i++) {
                if (v.recipients[i] == recipient) {
                    found = true;
                    break;
                }
            }
            if (!found) v.recipients.push(recipient);
        }
        emit RecipientUpdated(vaultId, recipient, allowed);
    }

    function cancelVault(uint256 vaultId)
        external
        vaultExists(vaultId)
    {
        Vault storage v = vaults[vaultId];
        require(msg.sender == v.owner, "ONLY_OWNER");
        require(!v.deathConfirmed, "ALREADY_CONFIRMED");
        require(v.active, "VAULT_INACTIVE");

        v.active = false;
        emit VaultCancelled(vaultId);
    }

    function getVaultInfo(uint256 vaultId)
        external
        view
        vaultExists(vaultId)
        returns (address, bool, uint256)
    {
        Vault storage v = vaults[vaultId];
        return (v.owner, v.deathConfirmed, v.recipients.length);
    }

    function canOpen(uint256 vaultId, address account)
        external
        view
        vaultExists(vaultId)
        returns (bool)
    {
        Vault storage v = vaults[vaultId];
        return v.active && v.deathConfirmed && _canOpen(vaultId, account);
    }

    function _canOpen(uint256 vaultId, address account) internal view returns (bool) {
        Vault storage v = vaults[vaultId];
        return account == v.owner || account == verifier || isRecipient[vaultId][account];
    }
}
