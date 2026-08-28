const { getClient, requireAccess } = require('../lib/vault');
module.exports = async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  try{
    const {vaultId,registrationTx,accessToken}=req.body||{};
    const id=Number(vaultId);
    if(!Number.isInteger(id) || id<0 || !registrationTx) return res.status(400).json({error:'요청값을 확인해주세요.'});
    requireAccess(id,registrationTx,accessToken);
    const {contract}=getClient();
    const tx=await contract.confirmDeath(id); const receipt=await tx.wait();
    return res.status(200).json({ok:true,txHash:receipt.hash||tx.hash});
  }catch(e){ console.error(e); return res.status(500).json({error:e.shortMessage||e.reason||e.message||'사망 확인 결과 반영 실패'}); }
};
