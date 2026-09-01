const {
  getClient,
  requireAccess
} = require('../lib/vault');

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

    // view 함수라 채굴을 기다릴 필요 없음
    const result =
      await contract.openVault(id);

    // 열람 감사기록은 트랜잭션 제출만 하고
    // 채굴을 기다리느라 화면을 막지 않음
    let openTxHash = null;

    try {
      const tx =
        await contract.recordOpen(id);

      openTxHash = tx.hash;

    } catch (e) {
      console.error(
        'recordOpen 실패(열람 자체는 성공):',
        e.shortMessage || e.message
      );
    }

    return res.status(200).json({
      ok: true,
      dataHash: result[0],
      dataURI: result[1],
      openTxHash,
      openStatus:
        openTxHash
          ? 'pending'
          : 'skipped'
    });

  } catch (e) {
    console.error(e);

    return res.status(500).json({
      error:
        e.shortMessage ||
        e.reason ||
        e.message ||
        '정보 열람 실패'
    });
  }
};