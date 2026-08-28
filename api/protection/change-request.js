const { getClient, isBytes32, requireAccess, parseEvent } = require('../../lib/protection');
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error:'METHOD_NOT_ALLOWED' });
  try {
    const { protectionId, accessToken, newRuleHash } = req.body || {};
    if (!Number.isInteger(Number(protectionId)) || !isBytes32(newRuleHash)) return res.status(400).json({ error:'요청값을 확인해주세요.' });
    requireAccess(Number(protectionId), accessToken);
    const { contract } = getClient();
    const tx = await contract.requestChange(Number(protectionId), newRuleHash); const receipt = await tx.wait();
    const ev = parseEvent(receipt, contract, 'ProtectionChangeRequested');
    return res.status(200).json({ ok:true, txHash:receipt.hash || tx.hash, executeAfter:ev ? Number(ev.args.executeAfter) : null });
  } catch(e) { console.error(e); return res.status(500).json({ error:e.shortMessage || e.reason || e.message || '변경 요청 기록 실패' }); }
};const { getClient, isBytes32, requireAccess } = require('../../lib/protection');

module.exports = async function handler(req, res) {

  if (req.method !== 'POST') {
    return res.status(405).json({ error:'METHOD_NOT_ALLOWED' });
  }

  try {

    const { protectionId, accessToken, newRuleHash } = req.body || {};

    if (
      !Number.isInteger(Number(protectionId)) ||
      !isBytes32(newRuleHash)
    ) {
      return res.status(400).json({
        error:'요청값을 확인해주세요.'
      });
    }

    requireAccess(Number(protectionId), accessToken);

    const { contract } = getClient();

    const delay = Number(await contract.changeDelay());

    const tx = await contract.requestChange(
      Number(protectionId),
      newRuleHash
    );

    return res.status(200).json({
      ok:true,
      txHash:tx.hash,
      executeAfter:
        Math.floor(Date.now() / 1000) + delay
    });

  } catch(e) {

    console.error(e);

    return res.status(500).json({
      error:
        e.shortMessage ||
        e.reason ||
        e.message ||
        '변경 요청 기록 실패'
    });
  }

};
