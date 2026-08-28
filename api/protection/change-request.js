const { getClient, isBytes32, requireAccess, parseEvent } = require('../../lib/protection');

module.exports = async function handler(req, res) {

  if (req.method !== 'POST') {
    return res.status(405).json({ error:'METHOD_NOT_ALLOWED' });
  }

  try {

    const {
      protectionId,
      accessToken,
      newRuleHash
    } = req.body || {};

    const id = Number(protectionId);

    if (
      !Number.isInteger(id) ||
      !isBytes32(newRuleHash)
    ) {
      return res.status(400).json({
        error:'요청값을 확인해주세요.'
      });
    }

    requireAccess(
      id,
      accessToken
    );

    const { contract } = getClient();

    const tx = await contract.requestChange(
      id,
      newRuleHash
    );

    const receipt = await tx.wait();

    const ev = parseEvent(
      receipt,
      contract,
      'ProtectionChangeRequested'
    );

    return res.status(200).json({
      ok:true,
      txHash:receipt.hash || tx.hash,
      executeAfter:
        ev
          ? Number(ev.args.executeAfter)
          : null
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