const { getClient, isBytes32, requireAccess } = require('../../lib/protection');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const {
      protectionId,
      accessToken,
      requestHash,
      verificationHash
    } = req.body || {};

    const id = Number(protectionId);

    if (
      !Number.isInteger(id) ||
      !isBytes32(requestHash) ||
      !isBytes32(verificationHash)
    ) {
      return res.status(400).json({
        error: '전화 본인확인 기록값을 확인해주세요.'
      });
    }

    requireAccess(id, accessToken);

    const { contract } = getClient();

    const status = await contract.getReleaseStatus(
      id,
      requestHash
    );

    if (
      Boolean(status[3]) ||
      Boolean(status[1])
    ) {
      return res.status(200).json({
        ok: true,
        already: true,
        txHash: null
      });
    }

    if (!Boolean(status[0])) {
      return res.status(409).json({
        error: 'RELEASE_NOT_READY'
      });
    }

    const tx =
      await contract.recordPhoneVerification(
        id,
        requestHash,
        verificationHash
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
      '전화 본인확인 기록 실패';

    const waiting =
      /RELEASE_NOT_REQUESTED|RELEASE_NOT_READY|NOT_FOUND|nonce|replacement|already known/i.test(msg);

    return res.status(
      waiting ? 409 : 500
    ).json({
      error: msg
    });
  }
};