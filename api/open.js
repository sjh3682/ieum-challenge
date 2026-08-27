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

    // 1) 먼저 조건을 읽기 방식으로 검증
    const [dataHash, dataURI] = await contract.openVault.staticCall(Number(vaultId));

    // 2) 실제 열람 사실도 Sepolia 트랜잭션으로 남김
    const tx = await contract.recordOpen(Number(vaultId));
    const receipt = await tx.wait();

    return res.status(200).json({
      ok:true,
      dataHash,
      dataURI,
      openTxHash:tx.hash,
      blockNumber:receipt.blockNumber
    });
  }catch(e){
    return sendError(res,e);
  }
}
