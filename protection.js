const crypto = require('crypto');
const { ethers } = require('ethers');

const ABI = [
  'function operator() view returns (address)',
  'function changeDelay() view returns (uint64)',
  'function protectionCount() view returns (uint256)',
  'function createProtection(bytes32 ruleHash) returns (uint256)',
  'function requestChange(uint256 protectionId, bytes32 newRuleHash)',
  'function executeChange(uint256 protectionId)',
  'function recordMedicalBasis(uint256 protectionId, bytes32 basisHash)',
  'function getMedicalBasisHash(uint256 protectionId) view returns (bytes32)',
  'function requestRelease(uint256 protectionId, bytes32 requestHash)',
  'function recordPhoneVerification(uint256 protectionId, bytes32 requestHash, bytes32 verificationHash)',
  'function completeRelease(uint256 protectionId, bytes32 requestHash)',
  'function getReleaseStatus(uint256 protectionId, bytes32 requestHash) view returns (bool requested, bool phoneVerified, bytes32 verificationHash, bool completed)',
  'function getProtection(uint256 protectionId) view returns (bytes32 ruleHash, bytes32 pendingRuleHash, uint64 createdAt, uint64 executeAfter, bool active)',
  'event ProtectionCreated(uint256 indexed protectionId, bytes32 indexed ruleHash, uint256 createdAt)',
  'event ProtectionChangeRequested(uint256 indexed protectionId, bytes32 indexed newRuleHash, uint256 executeAfter)',
  'event ProtectionChanged(uint256 indexed protectionId, bytes32 indexed oldRuleHash, bytes32 indexed newRuleHash)',
  'event MedicalBasisRecorded(uint256 indexed protectionId, bytes32 indexed basisHash, uint256 recordedAt)',
  'event ReleaseRequested(uint256 indexed protectionId, bytes32 indexed requestHash, uint256 requestedAt)',
  'event ReleasePhoneVerified(uint256 indexed protectionId, bytes32 indexed requestHash, bytes32 indexed verificationHash, uint256 verifiedAt)',
  'event ReleaseCompleted(uint256 indexed protectionId, bytes32 indexed requestHash, uint256 completedAt)'
];

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} 환경변수가 필요합니다.`);
  return v;
}

function getClient() {
  const privateKey = required('IEUM_PRIVATE_KEY');
  const contractAddress = required('IEUM_PROTECTION_CONTRACT_ADDRESS');
  const rpcUrl = process.env.IEUM_RPC_URL || process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
  const provider = new ethers.JsonRpcProvider(rpcUrl, 11155111);
  const wallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(contractAddress, ABI, wallet);
  return { provider, wallet, contract, contractAddress };
}

function isBytes32(v) { return typeof v === 'string' && /^0x[0-9a-fA-F]{64}$/.test(v); }

function makeAccessToken(protectionId) {
  const secret = required('IEUM_ACCESS_SECRET');
  return crypto.createHmac('sha256', secret).update(`protection:${protectionId}`).digest('hex');
}
function verifyAccessToken(protectionId, token) {
  const expected = makeAccessToken(protectionId);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(token || ''), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function requireAccess(protectionId, token) {
  if (!verifyAccessToken(protectionId, token)) throw new Error('보호 설정 접근 토큰이 올바르지 않습니다.');
}

function parseEvent(receipt, contract, name) {
  for (const log of receipt.logs || []) {
    try { const p = contract.interface.parseLog(log); if (p && p.name === name) return p; } catch (_) {}
  }
  return null;
}

module.exports = { getClient, isBytes32, makeAccessToken, requireAccess, parseEvent };
