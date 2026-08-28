const crypto = require('crypto');
const { ethers } = require('ethers');

const ABI = [
  'function verifier() view returns (address)',
  'function vaultCount() view returns (uint256)',
  'function registerVault(bytes32 _dataHash, string _dataURI, address[] _recipients) returns (uint256)',
  'function confirmDeath(uint256 vaultId)',
  'function openVault(uint256 vaultId) view returns (bytes32, string)',
  'function recordOpen(uint256 vaultId)',
  'function getVaultInfo(uint256 vaultId) view returns (address, bool, uint256)',
  'event VaultRegistered(uint256 indexed vaultId, address indexed owner, bytes32 indexed dataHash, string dataURI)',
  'event DeathConfirmed(uint256 indexed vaultId, address indexed verifier)',
  'event VaultOpened(uint256 indexed vaultId, address indexed opener)'
];

function required(name){
  const v=process.env[name];
  if(!v) throw new Error(`${name} 환경변수가 필요합니다.`);
  return v;
}
function getClient(){
  const privateKey=required('IEUM_PRIVATE_KEY');
  const contractAddress=required('IEUM_CONTRACT_ADDRESS');
  const rpcUrl=process.env.IEUM_RPC_URL || process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
  const provider=new ethers.JsonRpcProvider(rpcUrl,11155111);
  const wallet=new ethers.Wallet(privateKey,provider);
  const contract=new ethers.Contract(contractAddress,ABI,wallet);
  return {provider,wallet,contract,contractAddress};
}
function isBytes32(v){ return typeof v==='string' && /^0x[0-9a-fA-F]{64}$/.test(v); }
function makeAccessToken(vaultId, registrationTx){
  const secret=required('IEUM_ACCESS_SECRET');
  return crypto.createHmac('sha256',secret).update(`vault:${vaultId}:${String(registrationTx||'')}`).digest('hex');
}
function requireAccess(vaultId, registrationTx, token){
  const expected=makeAccessToken(vaultId,registrationTx);
  const a=Buffer.from(expected,'utf8');
  const b=Buffer.from(String(token||''),'utf8');
  if(a.length!==b.length || !crypto.timingSafeEqual(a,b)) throw new Error('사후 전달 접근 토큰이 올바르지 않습니다.');
}
function parseEvent(receipt,contract,name){
  for(const log of receipt.logs||[]){
    try{ const p=contract.interface.parseLog(log); if(p && p.name===name) return p; }catch(_){}
  }
  return null;
}
module.exports={ethers,getClient,isBytes32,makeAccessToken,requireAccess,parseEvent};
