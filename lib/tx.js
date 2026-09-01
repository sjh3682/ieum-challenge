const crypto = require('crypto');

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} 환경변수가 필요합니다.`);
  return v;
}

function makeTxPollToken(txHash) {
  const secret = required('IEUM_ACCESS_SECRET');

  return crypto
    .createHmac('sha256', secret)
    .update(`tx-poll:${String(txHash || '').toLowerCase()}`)
    .digest('hex');
}

function verifyTxPollToken(txHash, token) {
  const expected = makeTxPollToken(txHash);

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(token || ''), 'utf8');

  return (
    a.length === b.length &&
    crypto.timingSafeEqual(a, b)
  );
}

module.exports = {
  makeTxPollToken,
  verifyTxPollToken
};