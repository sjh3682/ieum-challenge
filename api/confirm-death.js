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
      return res.status(403).json({ error:"이 금고를 변경할 권한을 확인할 수 없습니다." });
    }

    const { wallet, contract } = getChain();
    const verifier = await contract.verifier();
    if(verifier.toLowerCase() !== wallet.address.toLowerCase()){
      return res.status(403).json({
        error:"현재 서버 지갑이 이 컨트랙트의 사망 검증 권한자가 아닙니다.",
        serverWallet:wallet.address,
        contractVerifier:verifier
      });
    }

    const tx = await contract.confirmDeath(Number(vaultId));
    const receipt = await tx.wait();

    return res.status(200).json({ ok:true, txHash:tx.hash, blockNumber:receipt.blockNumber });
  }catch(e){
    return sendError(res,e);
  }
}
