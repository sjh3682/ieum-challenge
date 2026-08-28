const { ethers } = require('ethers');
const { getClient } = require('../_lib/protection');
module.exports = async function handler(req, res) {
  try {
    const { provider, wallet, contract, contractAddress } = getClient();
    const [network, balance, operator, delay] = await Promise.all([
      provider.getNetwork(), provider.getBalance(wallet.address), contract.operator(), contract.changeDelay()
    ]);
    return res.status(200).json({
      ok:true, network:'Sepolia', chainId:Number(network.chainId), walletAddress:wallet.address,
      balanceETH:ethers.formatEther(balance), contractAddress,
      contractOperator:operator, operatorMatchesWallet:operator.toLowerCase()===wallet.address.toLowerCase(),
      changeDelaySeconds:Number(delay)
    });
  } catch(e) { console.error(e); return res.status(500).json({ ok:false, error:e.message || 'health check failed' }); }
};
