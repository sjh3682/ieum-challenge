import { getChain, makeAccessToken, sendError, validBytes32 } from "./_chain.js";

export default async function handler(req, res){
  if(req.method !== "POST"){
    return res.status(405).json({ error:"POST 요청만 허용됩니다." });
  }

  try{
    const { dataHash } = req.body || {};
    if(!validBytes32(dataHash)){
      return res.status(400).json({ error:"올바른 32바이트 데이터 지문이 아닙니다." });
    }

    const { wallet, contract } = getChain();
    const dataURI = "ieum://prototype/" + Date.now();

    // Competition prototype: the server test wallet acts as the blockchain recipient identity.
    const tx = await contract.registerVault(dataHash, dataURI, [wallet.address]);
    const receipt = await tx.wait();

    let vaultId = null;
    for(const log of receipt.logs || []){
      try{
        const parsed = contract.interface.parseLog(log);
        if(parsed?.name === "VaultRegistered"){
          vaultId = Number(parsed.args.vaultId);
          break;
        }
      }catch(_){ }
    }
    if(vaultId === null){
      const count = await contract.vaultCount();
      vaultId = Number(count) - 1;
    }

    const accessToken = makeAccessToken(vaultId, tx.hash);

    return res.status(200).json({
      ok:true,
      vaultId,
      txHash:tx.hash,
      blockNumber:receipt.blockNumber,
      dataHash,
      dataURI,
      walletAddress:wallet.address,
      accessToken
    });
  }catch(e){
    return sendError(res,e);
  }
}
