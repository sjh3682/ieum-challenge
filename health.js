const { ethers, getClient } = require('./_lib/vault');
module.exports = async function handler(req,res){
  try{
    const {provider,wallet,contract,contractAddress}=getClient();
    const [network,balance,verifier]=await Promise.all([provider.getNetwork(),provider.getBalance(wallet.address),contract.verifier()]);
    return res.status(200).json({ok:true,network:'Sepolia',chainId:Number(network.chainId),walletAddress:wallet.address,balanceETH:ethers.formatEther(balance),contractAddress,contractVerifier:verifier,verifierMatchesWallet:verifier.toLowerCase()===wallet.address.toLowerCase()});
  }catch(e){ console.error(e); return res.status(500).json({ok:false,error:e.message||'health check failed'}); }
};
