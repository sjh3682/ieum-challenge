import { ethers } from "ethers";
import crypto from "crypto";

export const ABI = [
  "function verifier() view returns (address)",
  "function registerVault(bytes32 _dataHash, string _dataURI, address[] _recipients) returns (uint256)",
  "function confirmDeath(uint256 _vaultId)",
  "function openVault(uint256 _vaultId) view returns (bytes32, string)",
  "function recordOpen(uint256 _vaultId)",
  "function getVaultInfo(uint256 _vaultId) view returns (address, bool, uint256)",
  "function vaultCount() view returns (uint256)",
  "event VaultRegistered(uint256 indexed vaultId, address indexed owner, bytes32 indexed dataHash, string dataURI)"
];

export function getContractAddress(){
  const address = (process.env.IEUM_CONTRACT_ADDRESS || "").trim();
  if(!address){
    throw new Error("서버 환경변수 IEUM_CONTRACT_ADDRESS가 설정되지 않았습니다.");
  }
  if(!ethers.isAddress(address)){
    throw new Error("IEUM_CONTRACT_ADDRESS가 올바른 Ethereum 주소가 아닙니다.");
  }
  return ethers.getAddress(address);
}

export function getChain(){
  let privateKey = (process.env.IEUM_PRIVATE_KEY || "").trim();
  if(!privateKey){
    throw new Error("서버 환경변수 IEUM_PRIVATE_KEY가 설정되지 않았습니다.");
  }
  if(!privateKey.startsWith("0x")) privateKey = "0x" + privateKey;

  const rpc = (process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com").trim();
  const provider = new ethers.JsonRpcProvider(rpc);
  const wallet = new ethers.Wallet(privateKey, provider);
  const contractAddress = getContractAddress();
  const contract = new ethers.Contract(contractAddress, ABI, wallet);

  return { provider, wallet, contract, contractAddress };
}

export function makeAccessToken(vaultId, registrationTx){
  const key = (process.env.IEUM_PRIVATE_KEY || "").trim();
  return crypto.createHmac("sha256", key)
    .update(String(vaultId) + ":" + String(registrationTx).toLowerCase())
    .digest("hex");
}

export function verifyAccessToken(vaultId, registrationTx, token){
  if(!token || !registrationTx) return false;
  const expected = makeAccessToken(vaultId, registrationTx);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(token), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a,b);
}

export function validBytes32(value){
  return /^0x[0-9a-fA-F]{64}$/.test(String(value || ""));
}

export function sendError(res, error){
  console.error(error);
  const raw = error?.shortMessage || error?.reason || error?.message || "알 수 없는 오류";
  const map = {
    "ONLY_VERIFIER":"사망 확인 권한이 없는 지갑입니다. IEUM Test 지갑으로 배포한 새 컨트랙트인지 확인해 주세요.",
    "VAULT_NOT_FOUND":"등록된 금고를 찾을 수 없습니다.",
    "VAULT_INACTIVE":"비활성화된 금고입니다.",
    "ALREADY_CONFIRMED":"이미 사망 사실 검증이 완료된 금고입니다.",
    "DEATH_NOT_CONFIRMED":"아직 사망 사실 검증이 완료되지 않았습니다.",
    "NOT_AUTHORIZED":"이 금고를 열람할 권한이 없습니다."
  };
  let msg = raw;
  for(const [code, friendly] of Object.entries(map)){
    if(String(raw).includes(code)){ msg = friendly; break; }
  }
  return res.status(500).json({ error: msg, code: raw });
}
