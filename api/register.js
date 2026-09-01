const { getClient, isBytes32 } = require('../lib/vault');
const { makeTxPollToken } = require('../lib/tx');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res
      .status(405)
      .json({ error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const { dataHash } = req.body || {};

    if (!isBytes32(dataHash)) {
      return res
        .status(400)
        .json({
          error: 'dataHash(bytes32)가 필요합니다.'
        });
    }

    const { wallet, contract } = getClient();

    const dataURI =
      `ieum://sealed/${dataHash.slice(2, 18)}`;

    const tx = await contract.registerVault(
      dataHash,
      dataURI,
      [wallet.address]
    );

    return res.status(202).json({
      ok: true,
      status: 'pending',
      txHash: tx.hash,
      pollToken: makeTxPollToken(tx.hash),
      dataHash
    });

  } catch (e) {
    console.error(e);

    return res.status(500).json({
      error:
        e.shortMessage ||
        e.reason ||
        e.message ||
        '사후 전달 등록 실패'
    });
  }
};