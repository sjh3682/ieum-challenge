const { getClient, isBytes32, requireAccess } = require('../../lib/protection');
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error:'METHOD_NOT_ALLOWED' });
  try {
    const { protectionId, accessToken, requestHash, verificationHash } = req.body || {};
    if (!Number.isInteger(Number(protectionId)) || !isBytes32(requestHash) || !isBytes32(verificationHash)) {
      return res.status(400).json({ error:'전화 본인확인 기록값을 확인해주세요.' });
    }
    requireAccess(Number(protectionId), accessToken);
    const { contract } = getClient();
    const tx = await contract.recordPhoneVerification(Number(protectionId), requestHash, verificationHash);
    const receipt = await tx.wait();
    return res.status(200).json({ ok:true, txHash:receipt.hash || tx.hash });
  } catch(e) {
    console.error(e);
    return res.status(500).json({ error:e.shortMessage || e.reason || e.message || '전화 본인확인 기록 실패' });
  }
};
