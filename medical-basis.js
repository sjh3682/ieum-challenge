const { getClient, isBytes32, requireAccess, parseEvent } = require('../../lib/protection');
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error:'METHOD_NOT_ALLOWED' });
  try {
    const { protectionId, accessToken, basisHash } = req.body || {};
    const id = Number(protectionId);
    if (!Number.isInteger(id) || id < 0) return res.status(400).json({ error:'protectionId가 필요합니다.' });
    if (!isBytes32(basisHash)) return res.status(400).json({ error:'basisHash(bytes32)가 필요합니다.' });
    requireAccess(id, accessToken);
    const { contract } = getClient();
    const tx = await contract.recordMedicalBasis(id, basisHash);
    const receipt = await tx.wait();
    const ev = parseEvent(receipt, contract, 'MedicalBasisRecorded');
    if (!ev) throw new Error('MedicalBasisRecorded 이벤트를 찾지 못했습니다.');
    return res.status(200).json({ ok:true, protectionId:id, basisHash, txHash:receipt.hash || tx.hash });
  } catch(e) {
    console.error(e);
    return res.status(500).json({ error:e.shortMessage || e.reason || e.message || '의료 분석 근거 기록 실패' });
  }
};
