module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, configured: Boolean(apiKey), model });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  if (!apiKey) return res.status(503).json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' });

  try {
    const { fileName, mimeType, fileBase64, documentText, demoText, context = {} } = req.body || {};
    const linkedText = (typeof documentText === 'string' && documentText.trim()) ? documentText : demoText;
    const allowed = new Set(['application/pdf','image/png','image/jpeg','image/jpg','image/webp']);
    const hasFile = Boolean(fileBase64);
    const hasDemoText = typeof linkedText === 'string' && linkedText.trim().length > 0;
    if (!hasFile && !hasDemoText) return res.status(400).json({ error: '연결된 의료정보 또는 지원되는 의료서류 정보가 필요합니다.' });
    if (hasFile && !allowed.has(mimeType)) return res.status(400).json({ error: '지원하지 않는 의료정보 형식입니다.' });
    if (hasFile) {
      const bytes = Buffer.from(fileBase64, 'base64');
      if (!bytes.length || bytes.length > 2 * 1024 * 1024) return res.status(413).json({ error: '분석 파일은 2MB 이하로 사용해주세요.' });
    }
    if (hasDemoText && linkedText.length > 2500) return res.status(400).json({ error: '의료정보 요약이 너무 깁니다.' });

    const prompt = `
당신은 대한민국 금융안심 서비스 '이음(IEUM)'의 의료정보 보조 분석기입니다.
이 작업은 의료 진단, 치료 지시, 수명 예측, 개인의 미래 병원비 예측이 아닙니다.
첨부 문서에 이미 적힌 내용을 바탕으로 '향후 지속적인 진료·관리 필요성'만 분류하여,
사용자가 생활·의료 예비자금을 지나치게 적게 남기지 않도록 하는 보호금액 추천에 참고합니다.

반드시 지킬 규칙:
1) 새 질병을 진단하지 마세요.
2) 개인의 미래 치료비를 정확한 금액으로 예측하지 마세요.
3) 문서에 없는 사실을 추정하지 마세요.
4) 결과에 질병명, 주민번호, 병원명, 상세 개인정보를 재출력하지 마세요.
5) careLevel은 low / moderate / high 중 하나만 선택하세요.
6) reserveAddMillionWon은 보수적인 추가 의료·요양 예비자금 보정치이며 0, 10, 20, 30 중 하나만 선택하세요.
   (단위는 백만원, 즉 10 = 1천만원입니다.)
7) 문서가 불명확하면 confidence를 low로 하고 reserveAddMillionWon을 과도하게 높이지 마세요.

회원·금융 참고정보(진단용이 아니라 생활자금 계산 맥락):
- 나이: ${Number(context.age || 0)}세
- 월평균 생활비: ${Number(context.monthlyLiving || 0)}만원
- 월 연금·정기소득: ${Number(context.monthlyIncome || 0)}만원
- 보험 보장 수준: ${String(context.insurance || 'unknown')}
- 순금융자산: ${Number(context.netAssetMillionWon || 0)}백만원
- 입력 유형: ${fileBase64 ? '의료서류 파일' : '의료기관 전자문서 연계 요약'}
- 파일명: ${String(fileName || 'linked-medical-record')}

짧고 일반적인 표현으로 결과를 작성하세요.`;

    const schema = {
      type: 'OBJECT',
      properties: {
        careLevel: { type: 'STRING', enum: ['low','moderate','high'] },
        ongoingCare: { type: 'BOOLEAN' },
        confidence: { type: 'STRING', enum: ['low','medium','high'] },
        reserveAddMillionWon: { type: 'INTEGER' },
        summary: { type: 'STRING', description: '질병명 없이 지속 진료·관리 필요성만 1~2문장으로 설명' },
        reason: { type: 'STRING', description: '보정치가 선택된 이유를 개인정보 없이 간단히 설명' }
      },
      required: ['careLevel','ongoingCare','confidence','reserveAddMillionWon','summary','reason']
    };

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: fileBase64
          ? [{ text: prompt }, { inlineData: { mimeType, data: fileBase64 } }]
          : [{ text: prompt }, { text: `의료기관 전자문서 연계 요약:
${linkedText}` }] }],
        generationConfig: { temperature: 0.15, responseMimeType: 'application/json', responseSchema: schema }
      })
    });

    const raw = await response.json();
    if (!response.ok) {
      console.error('Gemini error', raw);
      return res.status(502).json({ error: raw?.error?.message || 'Gemini API 요청에 실패했습니다.' });
    }
    const text = (raw?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
    if (!text) return res.status(502).json({ error: 'AI 분석 결과가 비어 있습니다.' });
    const analysis = JSON.parse(text);
    const allowedAdd = [0,10,20,30];
    const n = Number(analysis.reserveAddMillionWon || 0);
    analysis.reserveAddMillionWon = allowedAdd.reduce((best, v) => Math.abs(v-n) < Math.abs(best-n) ? v : best, 0);
    if (!['low','moderate','high'].includes(analysis.careLevel)) analysis.careLevel = 'moderate';
    if (analysis.careLevel === 'moderate' && analysis.reserveAddMillionWon < 10) analysis.reserveAddMillionWon = 10;
    if (analysis.careLevel === 'high' && analysis.reserveAddMillionWon < 20) analysis.reserveAddMillionWon = 20;
    if (!['low','medium','high'].includes(analysis.confidence)) analysis.confidence = 'low';
    analysis.summary = String(analysis.summary || '지속적인 진료·관리 필요성을 의료 예비자금에 반영했습니다.').slice(0, 220);
    analysis.reason = String(analysis.reason || '').slice(0, 260);

    return res.status(200).json({ ok: true, model, analysis });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || 'AI 분석 중 오류가 발생했습니다.' });
  }
};
