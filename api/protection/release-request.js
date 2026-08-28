const { getClient, isBytes32, requireAccess } = require('../../lib/protection');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const { protectionId, accessToken, requestHash } = req.body || {};
    const id = Number(protectionId);

    if (!Number.isInteger(id) || !isBytes32(requestHash)) {
      return res.status(400).json({
        error: '요청값을 확인해주세요.'
      });
    }

    requireAccess(id, accessToken);

    const { contract } = getClient();

    const status = await contract.getReleaseStatus(
      id,
      requestHash
    );

    if (Boolean(status[0])) {
      return res.status(200).json({
        ok: true,
        already: true,
        txHash: null
      });
    }

    const tx = await contract.requestRelease(
      id,
      requestHash
    );

    return res.status(200).json({
      ok: true,
      submitted: true,
      txHash: tx.hash
    });

  } catch (e) {
    console.error(e);

    const msg =
      e.shortMessage ||
      e.reason ||
      e.message ||
      '사용 요청 기록 실패';

    const waiting =
      /NOT_FOUND|nonce|replacement|already known/i.test(msg);

    return res.status(
      waiting ? 409 : 500
    ).json({
      error: msg
    });
  }
};