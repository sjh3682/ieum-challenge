const { getClient, isBytes32, makeAccessToken, parseEvent } = require('../lib/vault');
module.exports = async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  try{
    const {dataHash}=req.body||{};
    if(!isBytes32(dataHash)) return res.status(400).json({error:'dataHash(bytes32)가 필요합니다.'});
    const {wallet,contract}=getClient();
    const dataURI=`ieum://sealed/${dataHash.slice(2,18)}`;
    const tx=await contract.registerVault(dataHash,dataURI,[wallet.address]);
    const receipt=await tx.wait();
    const ev=parseEvent(receipt,contract,'VaultRegistered');
    if(!ev) throw new Error('VaultRegistered 이벤트를 찾지 못했습니다.');
    const vaultId=Number(ev.args.vaultId);
    const txHash=receipt.hash||tx.hash;
    return res.status(200).json({ok:true,vaultId,txHash,dataHash,accessToken:makeAccessToken(vaultId,txHash)});
  }catch(e){ console.error(e); return res.status(500).json({error:e.shortMessage||e.reason||e.message||'사후 전달 등록 실패'}); }
};
