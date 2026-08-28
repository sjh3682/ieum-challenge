module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      configured: Boolean(apiKey),
      model
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'METHOD_NOT_ALLOWED'
    });
  }

  if (!apiKey) {
    return res.status(503).json({
      error: 'GEMINI_API_KEY가 설정되지 않았습니다.'
    });
  }

  try {
    const {
      fileName,
      mimeType,
      fileBase64,
      documentText,
      demoText,
      context = {}
    } = req.body || {};

    const linkedText =
      typeof documentText === 'string' && documentText.trim()
        ? documentText
        : demoText;

    const allowed = new Set([
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp'
    ]);

    const hasFile = Boolean(fileBase64);

    const hasDemoText =
      typeof linkedText === 'string' &&
      linkedText.trim().length > 0;

    if (!hasFile && !hasDemoText) {
      return res.status(400).json({
        error: '연결된 의료정보 또는 지원되는 의료서류 정보가 필요합니다.'
      });
    }

    if (hasFile && !allowed.has(mimeType)) {
      return res.status(400).json({
        error: '지원하지 않는 의료정보 형식입니다.'
      });
    }

    if (hasFile) {
      const bytes = Buffer.from(fileBase64, 'base64');

      if (!bytes.length || bytes.length > 2 * 1024 * 1024) {
        return res.status(413).json({
          error: '분석 파일은 2MB 이하로 사용해주세요.'
        });
      }
    }

    if (hasDemoText && linkedText.length > 2500) {
      return res.status(400).json({
        error: '의료정보 요약이 너무 깁니다.'
      });
    }

    const prompt = `
당신은 대한민국 금융안심 서비스 '이음(IEUM)'의 의료정보 보조 분석기입니다.

이 작업은 의료 진단, 치료 지시, 수명 예측,
개인의 미래 병원비를 정확하게 예측하는 작업이 아닙니다.

연결된 의료정보에 이미 적혀 있는 내용을 바탕으로
향후 지속적인 진료·관리 필요성만 분류합니다.

그 결과는 사용자가 생활비와 의료비를 고려해
생전 보호자금을 설정할 때 참고자료로 사용됩니다.

반드시 다음 규칙을 지키세요.

1. 새로운 질병을 진단하지 마세요.
2. 개인의 미래 병원비를 정확한 금액으로 예측하지 마세요.
3. 제공된 정보에 없는 사실을 추정하지 마세요.
4. 질병명, 주민등록번호, 병원명 등 상세 개인정보를 결과에 다시 출력하지 마세요.
5. careLevel은 low, moderate, high 중 하나만 사용하세요.
6. reserveAddMillionWon은 0, 10, 20, 30 중 하나만 사용하세요.
7. reserveAddMillionWon의 단위는 백만원입니다.
8. 정보가 불명확하면 confidence는 low로 설정하세요.
9. 정보가 불명확한 경우 보호금액을 과도하게 높이지 마세요.

회원 및 금융 참고정보:

나이:
${Number(context.age || 0)}세

월평균 생활비:
${Number(context.monthlyLiving || 0)}만원

월 연금 또는 정기소득:
${Number(context.monthlyIncome || 0)}만원

보험 보장 수준:
${String(context.insurance || 'unknown')}

순금융자산:
${Number(context.netAssetMillionWon || 0)}백만원

입력 유형:
${fileBase64 ? '의료서류 파일' : '의료기관 전자문서 연계 요약'}

파일명:
${String(fileName || 'linked-medical-record')}

결과의 summary와 reason은
개인정보나 구체적인 질병명을 포함하지 않고
짧고 일반적인 표현으로 작성하세요.
`;

    const schema = {
      type: 'object',

      properties: {
        careLevel: {
          type: 'string',
          enum: [
            'low',
            'moderate',
            'high'
          ]
        },

        ongoingCare: {
          type: 'boolean'
        },

        confidence: {
          type: 'string',
          enum: [
            'low',
            'medium',
            'high'
          ]
        },

        reserveAddMillionWon: {
          type: 'integer',
          enum: [
            0,
            10,
            20,
            30
          ]
        },

        summary: {
          type: 'string',
          description:
            '질병명 없이 지속적인 진료 또는 관리 필요성을 1~2문장으로 설명'
        },

        reason: {
          type: 'string',
          description:
            '의료 예비자금 보정 이유를 개인정보 없이 간단히 설명'
        }
      },

      required: [
        'careLevel',
        'ongoingCare',
        'confidence',
        'reserveAddMillionWon',
        'summary',
        'reason'
      ],

      additionalProperties: false
    };

    const parts = [
      {
        text: prompt
      }
    ];

    if (hasFile) {
      parts.push({
        inlineData: {
          mimeType,
          data: fileBase64
        }
      });
    } else {
      parts.push({
        text: `
연결된 의료기관 전자문서 요약:

${linkedText}
`
      });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },

        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts
            }
          ],

          generationConfig: {
            responseFormat: {
              text: {
                mimeType: 'application/json',
                schema
              }
            }
          }
        })
      }
    );

    const raw = await response.json();

    if (!response.ok) {
      console.error(
        'Gemini API error:',
        JSON.stringify(raw)
      );

      return res.status(response.status || 502).json({
        error:
          raw?.error?.message ||
          'Gemini API 요청에 실패했습니다.'
      });
    }

    const text = (
      raw?.candidates?.[0]?.content?.parts || []
    )
      .map((part) => part.text || '')
      .join('')
      .trim();

    if (!text) {
      console.error(
        'Gemini empty response:',
        JSON.stringify(raw)
      );

      return res.status(502).json({
        error: 'AI 분석 결과가 비어 있습니다.'
      });
    }

    let analysis;

    try {
      analysis = JSON.parse(text);
    } catch (parseError) {
      console.error(
        'Gemini JSON parse error:',
        text
      );

      return res.status(502).json({
        error: 'AI 분석 결과 형식을 읽을 수 없습니다.'
      });
    }

    const allowedLevels = [
      'low',
      'moderate',
      'high'
    ];

    const allowedConfidence = [
      'low',
      'medium',
      'high'
    ];

    const allowedReserve = [
      0,
      10,
      20,
      30
    ];

    if (
      !allowedLevels.includes(
        analysis.careLevel
      )
    ) {
      analysis.careLevel = 'moderate';
    }

    if (
      !allowedConfidence.includes(
        analysis.confidence
      )
    ) {
      analysis.confidence = 'low';
    }

    const reserveNumber = Number(
      analysis.reserveAddMillionWon || 0
    );

    if (
      allowedReserve.includes(
        reserveNumber
      )
    ) {
      analysis.reserveAddMillionWon =
        reserveNumber;
    } else {
      analysis.reserveAddMillionWon =
        allowedReserve.reduce(
          (best, current) =>
            Math.abs(current - reserveNumber) <
            Math.abs(best - reserveNumber)
              ? current
              : best,
          0
        );
    }

    analysis.ongoingCare =
      Boolean(analysis.ongoingCare);

    analysis.summary = String(
      analysis.summary ||
      '지속적인 진료·관리 필요성을 의료 예비자금에 반영했습니다.'
    ).slice(0, 220);

    analysis.reason = String(
      analysis.reason || ''
    ).slice(0, 260);

    return res.status(200).json({
      ok: true,
      model,
      analysis
    });
  } catch (error) {
    console.error(
      'Analyze medical server error:',
      error
    );

    return res.status(500).json({
      error:
        error?.message ||
        'AI 분석 중 서버 오류가 발생했습니다.'
    });
  }
};