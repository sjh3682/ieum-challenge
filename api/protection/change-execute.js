const { getClient, requireAccess } = require('../../lib/protection');

const ZERO_HASH = '0x' + '0'.repeat(64);

module.exports = async function handler(req, res) {

  if (req.method !== 'POST') {
    return res.status(405).json({ error:'METHOD_NOT_ALLOWED' });
  }

  try {

    const { protectionId, accessToken } = req.body || {};
    const id = Number(protectionId);

    if (!Number.isInteger(id)) {
      return res.status(400).json({
        error:'protectionId가 필요합니다.'
      });
    }

    requireAccess(id, accessToken);

    const { contract } = getClient();

    const current = await contract.getProtection(id);

    const pendingRuleHash =
      String(current[1] || '').toLowerCase();

    const executeAfter =
      Number(current[3] || 0);

    // 이미 변경이 완료된 경우
    if (
      pendingRuleHash === ZERO_HASH &&
      executeAfter === 0
    ) {
      return res.status(200).json({
        ok:true,
        already:true,
        txHash:null
      });
    }

    // 아직 60초 대기시간이 끝나지 않은 경우
    if (
      executeAfter >
      Math.floor(Date.now() / 1000)
    ) {
      return res.status(409).json({
        error:'CHANGE_DELAY_ACTIVE',
        executeAfter
      });
    }

    const tx =
      await contract.executeChange(id);

    return res.status(200).json({
      ok:true,
      txHash:tx.hash
    });

  } catch(e) {

    const message =
      e.shortMessage ||
      e.reason ||
      e.message ||
      '변경 적용 실패';

    console.error(e);

    return res.status(
      /CHANGE_DELAY_ACTIVE/.test(message)
        ? 409
        : 500
    ).json({
      error:message
    });
  }

};