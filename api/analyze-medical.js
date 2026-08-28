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
        ? documentText.trim()
        : typeof demoText === 'string'
          ? demoText.trim()
          : '';

    const allowedMimeTypes = new Set([
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp'
    ]);

    const hasFile =
      typeof fileBase64 === 'string' &&
      fileBase64.trim().length > 0;

    const hasText =
      linkedText.length > 0;

    if (!hasFile && !hasText) {
      return res.status(400).json({
        error: '연결된 의료정보가 필요합니다.'
      });
    }

    if (
      hasFile &&
      !allowedMimeTypes.has(mimeType)
    ) {
      return res.status(400).json({
        error: '지원하지 않는 의료정보 형식입니다.'
      });
    }

    let cleanBase64 = '';

    if (hasFile) {
      cleanBase64 = fileBase64.includes(',')
        ? fileBase64.split(',').pop()
        : fileBase64;

      const fileBytes = Buffer.from(
        cleanBase64,
        'base64'
      );

      if (!fileBytes.length) {
        return res.status(400).json({
          error: '의료정보 파일이 비어 있습니다.'
        });
      }

      if (
        fileBytes.length >
        2 * 1024 * 1024
      ) {
        return res.status(413).json({
          error: '분석 파일은 2MB 이하로 사용해주세요.'
        });
      }
    }

    if (
      hasText &&
      linkedText.length > 2500
    ) {
      return res.status(400).json({
        error: '의료정보 요약이 너무 깁니다.'
      });
    }

    const safeNumber = (value) => {
      const n = Number(value);

      return Number.isFinite(n)
        ? n
        : 0;
    };

    const prompt = `
당신은 대한민국 금융안심 서비스 '이음(IEUM)'의 의료정보 보조 분석기입니다.

이 분석은 의료 진단, 치료 지시, 수명 예측 또는 개인의 미래 병원비를 정확하게 예측하는 작업이 아닙니다.

제공된 의료정보에 이미 포함된 내용만 바탕으로 향후 지속적인 진료 또는 관리 필요성의 수준을 분류하세요.

결과는 사용자가 생활비와 의료비를 고려하여 생전 보호자금을 설정할 때 참고자료로만 사용됩니다.

규칙:

1. 새로운 질병을 진단하지 마세요.
2. 제공된 정보에 없는 사실을 추정하지 마세요.
3. 미래의 구체적인 치료비를 예측하지 마세요.
4. 질병명, 주민등록번호, 병원명 등 상세 개인정보를 결과에 다시 출력하지 마세요.
5. careLevel은 low, moderate, high 중 하나만 사용하세요.
6. ongoingCare는 지속적인 진료 또는 관리 필요 여부입니다.
7. confidence는 low, medium, high 중 하나만 사용하세요.
8. reserveAddMillionWon은 0, 10, 20, 30 중 하나만 사용하세요.
9. reserveAddMillionWon의 단위는 백만원입니다. 10은 1천만원입니다.
10. 자료가 불명확하면 confidence를 low로 설정하고 예비자금을 과도하게 높이지 마세요.
11. summary와 reason은 질병명이나 상세 개인정보 없이 짧고 일반적인 표현으로 작성하세요.

회원 및 금융 참고정보:

- 나이: ${safeNumber(context.age)}세
- 월평균 생활비: ${safeNumber(context.monthlyLiving)}만원
- 월 연금 또는 정기소득: ${safeNumber(context.monthlyIncome)}만원
- 보험 보장 수준: ${String(context.insurance || 'unknown').slice(0, 50)}
- 순금융자산: ${safeNumber(context.netAssetMillionWon)}백만원
- 정보 유형: ${hasFile ? '의료서류' : '의료기관 전자문서 연계 요약'}
- 문서명: ${String(fileName || '의료기관 전자문서').slice(0, 100)}
`;

    const responseSchema = {
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
          type: 'string'
        },

        reason: {
          type: 'string'
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

    const input = [
      {
        type: 'text',
        text: prompt
      }
    ];

    if (hasFile) {
      input.push({
        type:
          mimeType === 'application/pdf'
            ? 'document'
            : 'image',

        data:
          cleanBase64,

        mime_type:
          mimeType
      });
    } else {
      input.push({
        type: 'text',

        text:
          `의료기관 전자문서 연계 요약:\n${linkedText}`
      });
    }

    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        () => controller.abort(),
        25000
      );

    let response;

    try {
      response = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/interactions',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',

            'x-goog-api-key':
              apiKey
          },

          signal:
            controller.signal,

          body: JSON.stringify({
            model,

            store: false,

            input,

            generation_config: {
              thinking_level: 'low'
            },

            response_format: {
              type: 'text',

              mime_type:
                'application/json',

              schema:
                responseSchema
            }
          })
        }
      );
    } finally {
      clearTimeout(timeout);
    }

    const raw =
      await response.json();

    if (!response.ok) {
      console.error(
        'Gemini API error:',
        JSON.stringify(raw)
      );

      return res.status(502).json({
        error:
          raw?.error?.message ||
          'Gemini API 요청에 실패했습니다.'
      });
    }

    let outputText = '';

    if (
      typeof raw.output_text ===
        'string' &&
      raw.output_text.trim()
    ) {
      outputText =
        raw.output_text.trim();
    }

    if (
      !outputText &&
      Array.isArray(raw.steps)
    ) {
      outputText =
        raw.steps
          .filter(
            (step) =>
              step?.type ===
                'model_output' &&
              Array.isArray(
                step.content
              )
          )
          .flatMap(
            (step) =>
              step.content
          )
          .filter(
            (item) =>
              item?.type ===
                'text' &&
              typeof item.text ===
                'string'
          )
          .map(
            (item) =>
              item.text
          )
          .join('')
          .trim();
    }

    if (!outputText) {
      return res.status(502).json({
        error:
          'AI 분석 결과가 비어 있습니다.'
      });
    }

    const analysis =
      JSON.parse(outputText);

    const allowedCareLevels = [
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
      !allowedCareLevels.includes(
        analysis.careLevel
      )
    ) {
      analysis.careLevel =
        'moderate';
    }

    if (
      !allowedConfidence.includes(
        analysis.confidence
      )
    ) {
      analysis.confidence =
        'low';
    }

    analysis.ongoingCare =
      analysis.ongoingCare === true;

    const reserveNumber =
      Number(
        analysis.reserveAddMillionWon
      );

    analysis.reserveAddMillionWon =
      allowedReserve.includes(
        reserveNumber
      )
        ? reserveNumber
        : allowedReserve.reduce(
            (
              nearest,
              value
            ) =>
              Math.abs(
                value -
                  reserveNumber
              ) <
              Math.abs(
                nearest -
                  reserveNumber
              )
                ? value
                : nearest,
            0
          );

    analysis.summary =
      String(
        analysis.summary ||
          '지속적인 진료·관리 필요성을 의료 예비자금에 반영했습니다.'
      ).slice(
        0,
        220
      );

    analysis.reason =
      String(
        analysis.reason ||
          '확인된 의료정보를 바탕으로 의료 예비자금 수준을 보수적으로 산정했습니다.'
      ).slice(
        0,
        260
      );

    return res.status(200).json({
      ok: true,
      model,
      analysis
    });
  } catch (error) {
    console.error(
      'Analyze medical error:',
      error
    );

    if (
      error?.name ===
      'AbortError'
    ) {
      return res.status(504).json({
        error:
          'AI 분석 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.'
      });
    }

    return res.status(500).json({
      error:
        error?.message ||
        'AI 분석 중 서버 오류가 발생했습니다.'
    });
  }
};