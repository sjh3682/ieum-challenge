const { getClient, isBytes32, requireAccess } = require('../../lib/protection');

module.exports = async function handler(req, res) {

  if (req.method !== 'POST') {
    return res.status(405).json({
      error:'METHOD_NOT_ALLOWED'
    });
  }

  try {

    const {
      protectionId,
      accessToken,
      basisHash
    } = req.body || {};

    const id = Number(protectionId);

    if (
      !Number.isInteger(id) ||
      id < 0
    ) {
      return res.status(400).json({
        error:'protectionId가 필요합니다.'
      });
    }

    if (!isBytes32(basisHash)) {
      return res.status(400).json({
        error:'basisHash(bytes32)가 필요합니다.'
      });
    }

    requireAccess(
      id,
      accessToken
    );

    const { contract } = getClient();

    const existing = String(
      await contract.getMedicalBasisHash(id)
    ).toLowerCase();

    // 같은 의료정보 근거가 이미 기록되어 있으면
    // 블록체인에 다시 보내지 않음
    if (
      existing ===
      basisHash.toLowerCase()
    ) {
      return res.status(200).json({
        ok:true,
        already:true,
        protectionId:id,
        basisHash,
        txHash:null
      });
    }

    const tx = await contract.recordMedicalBasis(
      id,
      basisHash
    );

    // tx.wait() 없이 바로 응답
    return res.status(200).json({
      ok:true,
      protectionId:id,
      basisHash,
      txHash:tx.hash
    });

  } catch(e) {

    console.error(e);

    return res.status(500).json({
      error:
        e.shortMessage ||
        e.reason ||
        e.message ||
        '의료 분석 근거 기록 실패'
    });
  }

};