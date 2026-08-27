import { ethers } from "ethers";
import { getChain, sendError } from "./_chain.js";

export default async function handler(req, res){
  if(req.method !== "GET"){
    return res.status(405).json({ error:"GET 요청만 허용됩니다." });
  }

  try{
    const { provider, wallet, contract, contractAddress } = getChain();
    const network = await provider.getNetwork();
    const balance = await provider.getBalance(wallet.address);
    const verifier = await contract.verifier();

    return res.status(200).json({
      ok:true,
      network:"Sepolia",
      chainId:Number(network.chainId),
      walletAddress:wallet.address,
      balanceETH:ethers.formatEther(balance),
      contractAddress,
      contractVerifier:verifier,
      verifierMatchesWallet:verifier.toLowerCase() === wallet.address.toLowerCase()
    });
  }catch(e){
    return sendError(res,e);
  }
}
