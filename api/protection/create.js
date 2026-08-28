const { getClient, isBytes32, makeAccessToken, parseEvent } = require('../../lib/protection');

module.exports = async function handler(req, res) {

  if (req.method !== 'POST') {
    return res.status(405).json({ error:'METHOD_NOT_ALLOWED' });
  }

  try {

    const { ruleHash } = req.body || {};

    if (!isBytes32(ruleHash)) {
      return res.status(400).json({
        error:'ruleHash(bytes32)가 필요합니다.'
      });
    }

    const { contract } = getClient();

    const tx = await contract.createProtection(ruleHash);
    const receipt = await tx.wait();

    const ev = parseEvent(
      receipt,
      contract,
      'ProtectionCreated'
    );

    if (!ev) {
      throw new Error('ProtectionCreated 이벤트를 확인하지 못했습니다.');
    }

    const protectionId = Number(
      ev.args.protectionId
    );

    return res.status(200).json({
      ok:true,
      protectionId,
      txHash:receipt.hash || tx.hash,
      accessToken:makeAccessToken(protectionId)
    });

  } catch(e) {

    console.error(e);

    return res.status(500).json({
      error:
        e.shortMessage ||
        e.reason ||
        e.message ||
        '보호 설정 기록 실패'
    });
  }

};