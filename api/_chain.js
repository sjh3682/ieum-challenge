import { ethers } from "ethers";
import crypto from "crypto";

export const CONTRACT_ADDRESS = "0x7487A47db916C481132035a3397C25ab38C45fcA";

export const ABI = [
  "function registerVault(bytes32 _dataHash, string _dataURI, address[] _recipients) returns (uint256)",
  "function confirmDeath(uint256 _vaultId)",
  "function openVault(uint256 _vaultId) returns (bytes32, string)",
  "function getVaultInfo(uint256 _vaultId) view returns (address, bool, uint256)",
  "function vaultCount() view returns (uint256)"
];

export function getChain(){
  let privateKey = (process.env.IEUM_PRIVATE_KEY || "").trim();
  if(!privateKey){
    throw new Error("서버 환경변수 IEUM_PRIVATE_KEY가 설정되지 않았습니다.");
  }
  if(!privateKey.startsWith("0x")) privateKey = "0x" + privateKey;

  const rpc = (process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com").trim();
  const provider = new ethers.JsonRpcProvider(rpc);
  const wallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);

  return { provider, wallet, contract };
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
  const msg = error?.shortMessage || error?.reason || error?.message || "알 수 없는 오류";
  return res.status(500).json({ error: msg });
}
