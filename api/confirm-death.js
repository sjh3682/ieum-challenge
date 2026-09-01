const {
  getClient,
  requireAccess
} = require('../lib/vault');

const {
  makeTxPollToken
} = require('../lib/tx');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res
      .status(405)
      .json({ error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const {
      vaultId,
      registrationTx,
      accessToken
    } = req.body || {};

    const id = Number(vaultId);

    if (
      !Number.isInteger(id) ||
      id < 0 ||
      !registrationTx
    ) {
      return res
        .status(400)
        .json({
          error: '요청값을 확인해주세요.'
        });
    }

    requireAccess(
      id,
      registrationTx,
      accessToken
    );

    const { contract } = getClient();

    // 블록체인에 제출까지만 대기
    // tx.wait()은 하지 않음
    const tx =
      await contract.confirmDeath(id);

    return res.status(202).json({
      ok: true,
      status: 'pending',
      txHash: tx.hash,
      pollToken:
        makeTxPollToken(tx.hash)
    });

  } catch (e) {
    console.error(e);

    return res.status(500).json({
      error:
        e.shortMessage ||
        e.reason ||
        e.message ||
        '사망 확인 결과 반영 실패'
    });
  }
};