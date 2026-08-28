const { ethers, getClient: getVaultClient } = require('../lib/vault');
const { getClient: getProtectionClient } = require('../lib/protection');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'METHOD_NOT_ALLOWED'
    });
  }

  try {
    const {
      provider,
      wallet,
      contract,
      contractAddress
    } = getVaultClient();

    const [network, balance, verifier] = await Promise.all([
      provider.getNetwork(),
      provider.getBalance(wallet.address),
      contract.verifier()
    ]);

    let protection = {
      configured: Boolean(
        process.env.IEUM_PROTECTION_CONTRACT_ADDRESS
      ),
      ok: false
    };

    if (process.env.IEUM_PROTECTION_CONTRACT_ADDRESS) {
      try {
        const p = getProtectionClient();

        const [operator, delay] = await Promise.all([
          p.contract.operator(),
          p.contract.changeDelay()
        ]);

        protection = {
          configured: true,
          ok: true,
          contractAddress: p.contractAddress,
          contractOperator: operator,
          operatorMatchesWallet:
            operator.toLowerCase() ===
            p.wallet.address.toLowerCase(),
          changeDelaySeconds: Number(delay)
        };
      } catch (e) {
        protection = {
          configured: true,
          ok: false,
          error:
            e.message ||
            '생전 보호 상태 확인 실패'
        };
      }
    }

    return res.status(200).json({
      ok: true,
      network: 'Sepolia',
      chainId: Number(network.chainId),
      walletAddress: wallet.address,
      balanceETH: ethers.formatEther(balance),
      contractAddress,
      contractVerifier: verifier,
      verifierMatchesWallet:
        verifier.toLowerCase() ===
        wallet.address.toLowerCase(),

      protection,

      gemini: {
        configured: Boolean(
          process.env.GEMINI_API_KEY
        ),
        model:
          process.env.GEMINI_MODEL ||
          'gemini-3.6-flash'
      }
    });
  } catch (e) {
    console.error(e);

    return res.status(500).json({
      ok: false,
      error:
        e.message ||
        'health check failed'
    });
  }
};