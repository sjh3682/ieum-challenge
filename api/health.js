const { ethers, getClient: getVaultClient } = require('../lib/vault');
const {
  getClient: getProtectionClient
} = require('../lib/protection');

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

    const [network, balance, verifier] =
      await Promise.all([
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

    if (
      process.env.IEUM_PROTECTION_CONTRACT_ADDRESS
    ) {
      try {
        const protectionClient =
          getProtectionClient();

        const [operator, delay] =
          await Promise.all([
            protectionClient.contract.operator(),
            protectionClient.contract.changeDelay()
          ]);

        protection = {
          configured: true,
          ok: true,

          contractAddress:
            protectionClient.contractAddress,

          contractOperator:
            operator,

          operatorMatchesWallet:
            operator.toLowerCase() ===
            protectionClient.wallet.address.toLowerCase(),

          changeDelaySeconds:
            Number(delay)
        };
      } catch (error) {
        console.error(
          'Protection health error:',
          error
        );

        protection = {
          configured: true,
          ok: false,
          error:
            error?.message ||
            '생전 보호 상태 확인에 실패했습니다.'
        };
      }
    }

    const geminiModel =
      process.env.GEMINI_MODEL ||
      'gemini-3.6-flash';

    return res.status(200).json({
      ok: true,

      network: 'Sepolia',

      chainId:
        Number(network.chainId),

      walletAddress:
        wallet.address,

      balanceETH:
        ethers.formatEther(balance),

      contractAddress,

      contractVerifier:
        verifier,

      verifierMatchesWallet:
        verifier.toLowerCase() ===
        wallet.address.toLowerCase(),

      protection,

      gemini: {
        configured:
          Boolean(process.env.GEMINI_API_KEY),

        model:
          geminiModel
      }
    });
  } catch (error) {
    console.error(
      'Health check error:',
      error
    );

    return res.status(500).json({
      ok: false,

      error:
        error?.message ||
        'health check failed'
    });
  }
};