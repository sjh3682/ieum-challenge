const { getClient, isBytes32, requireAccess } = require('../../lib/protection');
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error:'METHOD_NOT_ALLOWED' });
  try {
    const { protectionId, accessToken, requestHash } = req.body || {};
    if (!Number.isInteger(Number(protectionId)) || !isBytes32(requestHash)) return res.status(400).json({ error:'요청값을 확인해주세요.' });
    requireAccess(Number(protectionId), accessToken);
    const { contract } = getClient();
    const tx = await contract.completeRelease(Number(protectionId), requestHash); const receipt = await tx.wait();
    return res.status(200).json({ ok:true, txHash:receipt.hash || tx.hash });
  } catch(e) { console.error(e); return res.status(500).json({ error:e.shortMessage || e.reason || e.message || '사용 완료 기록 실패' }); }
};
