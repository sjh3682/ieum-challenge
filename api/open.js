import { getChain, verifyAccessToken, sendError } from "./_chain.js";

export default async function handler(req, res){
  if(req.method !== "POST"){
    return res.status(405).json({ error:"POST 요청만 허용됩니다." });
  }

  try{
    const { vaultId, registrationTx, accessToken } = req.body || {};
    if(vaultId === undefined || vaultId === null){
      return res.status(400).json({ error:"금고 번호가 없습니다." });
    }
    if(!verifyAccessToken(vaultId, registrationTx, accessToken)){
      return res.status(403).json({ error:"이 금고를 열람할 권한을 확인할 수 없습니다." });
    }

    const { contract } = getChain();
    const [dataHash, dataURI] = await contract.openVault.staticCall(Number(vaultId));

    return res.status(200).json({ ok:true, dataHash, dataURI });
  }catch(e){
    return sendError(res,e);
  }
}
