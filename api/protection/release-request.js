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

    const reported =
      recipientType !== 'self' &&
      REPORTED_ACCOUNTS.has(account);

    const amountExceeded =
      recipientType === 'other' &&
      thresholdAmountManwon > 0 &&
      amountManwon >=
        thresholdAmountManwon;

    const ratioExceeded =
      recipientType === 'other' &&
      thresholdPercent > 0 &&
      ratioPercent >=
        thresholdPercent;

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