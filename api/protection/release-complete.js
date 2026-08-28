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

    if (Boolean(status[3])) {
      return res.status(200).json({
        ok: true,
        already: true,
        txHash: null
      });
    }

    if (!Boolean(status[1])) {
      return res.status(409).json({
        error: 'PHONE_NOT_READY'
      });
    }

    const tx = await contract.completeRelease(
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
      '사용 완료 기록 실패';

    const waiting =
      /PHONE_NOT_VERIFIED|PHONE_NOT_READY|RELEASE_NOT_REQUESTED|NOT_FOUND|nonce|replacement|already known/i.test(msg);

    return res.status(
      waiting ? 409 : 500
    ).json({
      error: msg
    });
  }
};