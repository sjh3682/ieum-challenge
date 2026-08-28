const { getClient, isBytes32, makeAccessToken } = require('../../lib/protection');

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

    const protectionId = Number(
      await contract.createProtection.staticCall(ruleHash)
    );

    const tx = await contract.createProtection(ruleHash);

    return res.status(200).json({
      ok:true,
      protectionId,
      txHash:tx.hash,
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