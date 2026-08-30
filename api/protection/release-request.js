const { getClient, isBytes32, requireAccess } = require('../../lib/protection');

// 공모전 시연용 가상 금융사기 신고 데이터.
// 실제 서비스에서는 금융기관·공공 사기정보 시스템 조회로 대체합니다.
const REPORTED_ACCOUNTS = new Set([
  '3333123456789',
  '110999999999'
]);

function normalizeAccount(value) {
  return String(value || '').replace(/[^0-9]/g, '');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const {
      protectionId,
      accessToken,
      requestHash,
      transfer = {}
    } = req.body || {};

    const id = Number(protectionId);

    if (!Number.isInteger(id) || !isBytes32(requestHash)) {
      return res.status(400).json({
        error: '요청값을 확인해주세요.'
      });
    }

    requireAccess(id, accessToken);

    const recipientType = String(
      transfer.recipientType || 'institution'
    );

    const account = normalizeAccount(
      transfer.account
    );

    const amountManwon = Number(
      transfer.amountManwon || 0
    );

    const totalAssetMillionWon = Number(
      transfer.totalAssetMillionWon || 0
    );

    const thresholdAmountManwon = Number(
      transfer.thresholdAmountManwon || 0
    );

    const thresholdPercent = Number(
      transfer.thresholdPercent || 0
    );

    if (
      account.length < 7 ||
      amountManwon <= 0
    ) {
      return res.status(400).json({
        error: '수취 계좌와 송금 금액을 확인해주세요.'
      });
    }

    const amountMillionWon =
      amountManwon / 100;

    const ratioPercent =
      totalAssetMillionWon > 0
        ? (
            amountMillionWon /
            totalAssetMillionWon
          ) * 100
        : 0;

    // 본인 계좌가 아닌 경우에만
    // 금융사기 신고 계좌 여부 확인
    const reported =
      recipientType !== 'self' &&
      REPORTED_ACCOUNTS.has(account);

    // 사용자가 미리 설정한 금액 기준 초과
    const amountExceeded =
      recipientType === 'other' &&
      thresholdAmountManwon > 0 &&
      amountManwon >=
        thresholdAmountManwon;

    // 사용자가 미리 설정한 자산 비율 기준 초과
    const ratioExceeded =
      recipientType === 'other' &&
      thresholdPercent > 0 &&
      ratioPercent >=
        thresholdPercent;

    // 신고 계좌는 신뢰 연락처 확인만으로
    // 바로 처리하지 않고 별도 강화 확인
    const requireTrustedContact =
      !reported &&
      (
        amountExceeded ||
        ratioExceeded
      );

    const { contract } = getClient();

    const status =
      await contract.getReleaseStatus(
        id,
        requestHash
      );

    // 이미 사용 요청이 기록된 경우
    if (Boolean(status[0])) {
      return res.status(200).json({
        ok: true,
        already: true,
        txHash: null,

        risk: {
          reported,
          amountExceeded,
          ratioExceeded,

          ratioPercent:
            Math.round(
              ratioPercent * 10
            ) / 10,

          requireTrustedContact,

          action:
            reported
              ? 'manual_review'
              : requireTrustedContact
                ? 'trusted_contact'
                : 'normal'
        }
      });
    }

    // 보호자금 사용 요청을 블록체인에 전송
    const tx =
      await contract.requestRelease(
        id,
        requestHash
      );

    return res.status(200).json({
      ok: true,
      submitted: true,
      txHash: tx.hash,

      risk: {
        reported,
        amountExceeded,
        ratioExceeded,

        ratioPercent:
          Math.round(
            ratioPercent * 10
          ) / 10,

        requireTrustedContact,

        action:
          reported
            ? 'manual_review'
            : requireTrustedContact
              ? 'trusted_contact'
              : 'normal'
      }
    });

  } catch (e) {
    console.error(e);

    const msg =
      e.shortMessage ||
      e.reason ||
      e.message ||
      '사용 요청 기록 실패';

    const waiting =
      /NOT_FOUND|nonce|replacement|already known/i.test(
        msg
      );

    return res
      .status(waiting ? 409 : 500)
      .json({
        error: msg
      });
  }
};