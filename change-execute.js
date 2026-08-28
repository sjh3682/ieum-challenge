const { getClient, requireAccess } = require('../../lib/protection');
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error:'METHOD_NOT_ALLOWED' });
  try {
    const { protectionId, accessToken } = req.body || {};
    if (!Number.isInteger(Number(protectionId))) return res.status(400).json({ error:'protectionId가 필요합니다.' });
    requireAccess(Number(protectionId), accessToken);
    const { contract } = getClient();
    const tx = await contract.executeChange(Number(protectionId)); const receipt = await tx.wait();
    return res.status(200).json({ ok:true, txHash:receipt.hash || tx.hash });
  } catch(e) {
    const msg=e.shortMessage || e.reason || e.message || '변경 적용 실패';
    console.error(e); return res.status(/CHANGE_DELAY_ACTIVE/.test(msg)?409:500).json({ error:msg });
  }
};
