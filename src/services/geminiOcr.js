// ============================================================
// geminiOcr.js  (v8 — maxTokens増加・バージョン管理追加)
//
// 変更点:
//   v8: analyzeWithGemini を4096、analyzePDFWithGemini を8192に増加
//       GEMINI_OCR_VERSION をエクスポート（設定画面での確認用）
//   v7: 429詳細取得・AQ.キー認証修正
// ============================================================

export const GEMINI_OCR_VERSION = "v8";

const ENDPOINTS = [
  { base: "https://generativelanguage.googleapis.com/v1beta/models", model: "gemini-2.5-flash"        }, // ① 最高精度
  { base: "https://generativelanguage.googleapis.com/v1beta/models", model: "gemini-2.5-flash-lite"   }, // ② 高精度（2.5世代）
  { base: "https://generativelanguage.googleapis.com/v1beta/models", model: "gemini-1.5-flash-latest" }, // ③ 標準（最終フォールバック）
  { base: "https://generativelanguage.googleapis.com/v1/models",     model: "gemini-2.5-flash"        }, // ④ APIv1でのリトライ
];

// ─── FileReader で base64 化（iOS 全形式対応）────────────────
// ─── 画像を圧縮してbase64化（iPhoneの高解像度写真対策）────────
const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1280; // 長辺の最大px
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
        else                { width  = Math.round(width  * MAX / height); height = MAX; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl  = canvas.toDataURL("image/jpeg", 0.80); // JPEG 80%
      const base64   = dataUrl.split(",")[1];
      const mimeType = "image/jpeg";
      resolve({ base64, mimeType });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      // 圧縮失敗時はそのまま送る
      const reader = new FileReader();
      reader.onload  = () => resolve({ base64: reader.result.split(",")[1], mimeType: file.type || "image/jpeg" });
      reader.onerror = () => reject(new Error("ファイルの読み込みに失敗しました"));
      reader.readAsDataURL(file);
    };
    img.src = url;
  });

// ─── 40秒タイムアウト ────────────────────────────────────────
const fetchWithTimeout = (url, options) =>
  Promise.race([
    fetch(url, options),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("TIMEOUT")), 40000)
    ),
  ]);

// ─── API キーの種類を判定 ────────────────────────────────────
// AQ. / ya29. → まずAPIキーとして試し、失敗したらBearerも試す
// AIzaSy / その他 → APIキー（URLパラメータ）のみ
const isOAuthLike = (key) =>
  key.startsWith("AQ.") || key.startsWith("ya29.") || key.startsWith("AQ ");

// ─── Gemini API 呼び出し ─────────────────────────────────────
const callGemini = async (apiKey, parts, maxTokens = 2048) => {
  const errors  = [];
  const body    = JSON.stringify({
    contents: [{ parts }],
    generationConfig: { temperature: 0.1, maxOutputTokens: maxTokens },
  });

  for (const { base, model } of ENDPOINTS) {
    const urlParam  = `${base}/${model}:generateContent?key=${apiKey}`;
    const urlBearer = `${base}/${model}:generateContent`;

    // AQ.キーは「APIキー方式」を先に試す（v7変更点）
    // → AI StudioのAQ.キーは実はAPIキーとして扱うべき可能性があるため
    const attempts = isOAuthLike(apiKey)
      ? [
          { url: urlParam,  headers: { "Content-Type": "application/json" } },
          { url: urlBearer, headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` } },
        ]
      : [
          { url: urlParam,  headers: { "Content-Type": "application/json" } },
          { url: urlBearer, headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` } },
        ];

    let res = null;
    for (const attempt of attempts) {
      try {
        const r = await fetchWithTimeout(attempt.url, { method: "POST", headers: attempt.headers, body });
        if (r.status === 401) continue; // 認証失敗 → 次の方式を試す
        res = r;
        break;
      } catch (e) {
        if (e.message === "TIMEOUT") {
          throw new Error("⏱ タイムアウト（40秒）\nGeminiに接続できません。ネット接続を確認してください。");
        }
        throw new Error(`ネットワークエラー: ${e.message}`);
      }
    }

    if (!res) { errors.push(`${model}: 認証失敗(401)`); continue; }

    // ─── 429: レスポンスボディを取得して詳細を表示（v7変更点）───
    if (res.status === 429) {
      let detail = "";
      let isQuotaExhausted = false;
      let isRateLimit      = false;
      try {
        const errBody = await res.json();
        const msg     = errBody?.error?.message || "";
        const status  = errBody?.error?.status  || "";
        detail = msg ? `\n詳細: ${msg.slice(0, 120)}` : "";
        isQuotaExhausted = status === "RESOURCE_EXHAUSTED" || msg.includes("quota") || msg.includes("Quota");
        isRateLimit      = msg.includes("rate") || msg.includes("Rate") || status === "RATE_LIMIT_EXCEEDED";
      } catch {}

      if (isQuotaExhausted) {
        // Quota超過 → 次のモデルで試す（フォールバック）
        errors.push(`${model}(429 QUOTA): Quota超過→次のモデルへ`);
        continue;
      }
      if (isRateLimit) {
        throw new Error(
          `⚠️ レート上限（429 RATE_LIMIT_EXCEEDED）\n` +
          `1〜2分待ってから再試行してください。${detail}`
        );
      }
      // 詳細不明の429 → 次のモデルで試す
      errors.push(`${model}(429): 上限→次のモデルへ`);
      continue;
    }

    // 404 = モデル未対応 → 次を試す
    if (res.status === 404) {
      errors.push(`${model}(404): not found`);
      continue;
    }

    // 400 = APIキーまたはリクエストエラー
    if (res.status === 400) {
      const err = await res.json().catch(() => ({}));
      const msg = err.error?.message || "";
      if (msg.includes("API_KEY") || msg.includes("key") || msg.includes("credential")) {
        throw new Error(`❌ APIキーエラー\n${msg.slice(0, 100)}\n\nAI Studio でキーを再確認してください。`);
      }
      errors.push(`${model}(400): ${msg.slice(0, 50)}`);
      continue;
    }

    // 503 = 混雑
    if (res.status === 503) {
      throw new Error("⚠️ Gemini サーバーが混雑中。少し待って再試行してください。");
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      errors.push(`${model}(${res.status}): ${(err.error?.message || "").slice(0, 50)}`);
      continue;
    }

    // ─ 成功 ─
    const data       = await res.json();
    const candidate  = data.candidates?.[0];
    const text       = candidate?.content?.parts?.[0]?.text || "";
    const finishReason = candidate?.finishReason || "";

    if (!text) {
      // finishReasonで原因を詳細表示
      if (finishReason === "SAFETY") {
        throw new Error("Geminiがレシート画像をブロックしました（安全フィルター）\n別の画像で試してください");
      } else if (finishReason === "RECITATION") {
        throw new Error("Geminiから応答が空でした（著作権フィルター）\n別の画像で試してください");
      } else if (finishReason === "MAX_TOKENS") {
        throw new Error("Geminiの応答が長すぎて途中で切れました\n再試行してください");
      } else if (data.promptFeedback?.blockReason) {
        throw new Error(`Geminiにブロックされました: ${data.promptFeedback.blockReason}\nAPIキーを確認してください`);
      } else {
        // キーが期限切れの場合はprompFeedbackなしで空になることが多い
        throw new Error(`Geminiから応答が空でした（finishReason: ${finishReason || "不明"}）\nAPIキーが期限切れの可能性があります。AI Studioで新しいキーを発行してください`);
      }
    }

    // { ... } を直接抽出（コードブロック有無に関わらず確実に動く）
    const jsonStart = text.indexOf("{");
    const jsonEnd   = text.lastIndexOf("}");
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      try {
        return JSON.parse(text.slice(jsonStart, jsonEnd + 1));
      } catch {}
    }
    throw new Error(`JSON解析失敗(${model}):\n${text.slice(0, 60)}`);
  }

  // すべてのモデルでQuota超過の場合
  const allQuota = errors.every(e => e.includes("QUOTA") || e.includes("上限"));
  if (allQuota) {
    throw new Error(
      `⚠️ すべてのモデルでQuota上限に達しました\n` +
      `明日（太平洋時間0時）にリセットされます。\n\n` +
      `対処法:\n` +
      `・しばらく待ってから再試行\n` +
      `・Google AI Studioで使用量を確認\n` +
      `・有料プランにアップグレード`
    );
  }

  throw new Error(
    `❌ すべてのモデルで失敗\n\n` +
    `${errors.map(e => `・${e}`).join("\n")}\n\n` +
    `キーの種類: ${isOAuthLike(apiKey) ? "AQ.形式（APIキーとして送信）" : "AIzaSy形式（標準APIキー）"}`
  );
};

// ─── APIキー診断 ──────────────────────────────────────────────
export const testGeminiKey = async (apiKey) => {
  // callGeminiはJSONを期待するため、直接fetchでテストする
  const isOAuth = isOAuthLike(apiKey);
  const base    = "https://generativelanguage.googleapis.com/v1beta/models";
  const model   = "gemini-2.5-flash";
  const body    = JSON.stringify({
    contents: [{ parts: [{ text: "Say: OK" }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 10 },
  });

  const attempts = isOAuth
    ? [
        { url: `${base}/${model}:generateContent?key=${apiKey}`, headers: { "Content-Type": "application/json" } },
        { url: `${base}/${model}:generateContent`,               headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` } },
      ]
    : [
        { url: `${base}/${model}:generateContent?key=${apiKey}`, headers: { "Content-Type": "application/json" } },
      ];

  for (const attempt of attempts) {
    try {
      const res = await fetch(attempt.url, { method: "POST", headers: attempt.headers, body });
      if (res.status === 200) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        if (text) return true;  // 何かテキストが返れば成功
        // finishReasonを確認
        const reason = data.candidates?.[0]?.finishReason;
        if (reason === "STOP" || reason === "MAX_TOKENS") return true;
        throw new Error(`応答が空です (finishReason: ${reason || "不明"})`);
      }
      if (res.status === 401) continue;
      const err = await res.json().catch(() => ({}));
      throw new Error(`HTTP ${res.status}: ${err?.error?.message || "不明なエラー"}`);
    } catch (e) {
      if (e.message.startsWith("HTTP") || e.message.startsWith("応答")) throw e;
      // ネットワークエラーは次を試す
    }
  }
  throw new Error("認証失敗: キーが無効か期限切れの可能性があります");
};

// ─── レシート画像解析（画像直接送信）────────────────────────
const RECEIPT_PROMPT = `このレシート画像から情報を抽出してください。JSONのみ出力（コードブロック不要）：
{
  "storeName": "店舗名（例: ダイソー静岡川合店）",
  "date": "YYYY-MM-DD",
  "totalAmount": 税込合計金額の整数,
  "items": [{"name":"商品名","unitPrice":単価整数,"quantity":数量整数,"amount":合計整数}]
}

【重要な抽出ルール】

■ 数量・単価の読み方
・「NコX単価」「N点×単価」「N×単価」形式は必ず数量と単価に分解する
  例: 「2コX単148  ¥296」→ unitPrice:148, quantity:2, amount:296
  例: 「3コX単39   ¥117」→ unitPrice:39, quantity:3, amount:117
  例: 「やきそば 3コX単98 ¥294」→ unitPrice:98, quantity:3, amount:294
・次の行に「NコX単価」が続く場合は、前の行の商品名とセットで1品目として扱う

■ 割引・値引きの読み方
・マイナス金額（-○○、▲○○）は割引として必ずamountをマイナス値にする
  例: 「操作割引 -102」→ name:"操作割引", amount:-102
  例: 「亀田柿の種 -20」→ name:"亀田柿の種割引", amount:-20
・「¥○○から¥○○に致します」は値引き行なので割引として1品目追加する
  例: 「¥208から  ¥188に致します」→ name:"値引き", amount:-20

■ 除外する行
・小計・合計・外税・消費税・内税・お預り・お釣り・クレジット・ポイント行は除外
・バーコード番号（4513454100821等の長い数字）は除外
・「(10%対象 ¥○○)」などの税区分の説明行は除外

■ totalAmount
・レシート最下部の「合計」または「お会計」の税込金額
・外税方式の場合: 小計＋消費税の合計値

・不明な値は0を使用`;

export const analyzeWithGemini = async (imageFile, apiKey, onProgress) => {
  onProgress?.(10);
  const { base64, mimeType } = await fileToBase64(imageFile);
  onProgress?.(40);
  const parsed = await callGemini(apiKey, [
    { text: RECEIPT_PROMPT },
    { inline_data: { mime_type: mimeType, data: base64 } },
  ], 4096);
  onProgress?.(100);

  const items = Array.isArray(parsed.items) ? parsed.items.map(item => {
    const unitPrice = Math.abs(Number(item.unitPrice) || Number(item.amount) || 0);
    const quantity  = Math.max(1, Number(item.quantity) || 1);
    // amountが明示されていれば優先、なければ単価×数量
    const amount    = Number(item.amount) || (unitPrice * quantity);
    return { ...item, unitPrice, quantity, amount };
  }) : [];

  return {
    storeName:   String(parsed.storeName   || "").trim(),
    date:        String(parsed.date        || "").trim(),
    totalAmount: Number(parsed.totalAmount) || 0,
    items,
  };
};

// ─── テキスト→構造化解析（ハイブリッド用）──────────────────
export const parseOCRTextWithGemini = async (ocrText, apiKey, onProgress) => {
  onProgress?.(10);
  const parsed = await callGemini(apiKey, [{
    text: `以下はレシートのOCRテキストです。JSONのみ出力（コードブロック不要）：
{
  "storeName": "店舗名",
  "date": "YYYY-MM-DD",
  "totalAmount": 合計金額の整数,
  "items": [{"name":"商品名","amount":単価整数,"quantity":数量整数}]
}
・totalAmount は「合計」の税込金額
・割引はnameに「割引」を含めamountをマイナス値

OCRテキスト:\n${ocrText}`,
  }]);
  onProgress?.(100);
  return {
    storeName:   String(parsed.storeName   || "").trim(),
    date:        String(parsed.date        || "").trim(),
    totalAmount: Number(parsed.totalAmount) || 0,
    items:       Array.isArray(parsed.items) ? parsed.items : [],
  };
};

// ─── PDF明細解析 ─────────────────────────────────────────────
export const analyzePDFWithGemini = async (file, apiKey, onProgress) => {
  onProgress?.(10);
  const { base64 } = await fileToBase64(file);
  onProgress?.(40);
  const parsed = await callGemini(
    apiKey,
    [
      { text: `このクレジットカード・銀行明細PDFから全取引を抽出してください。JSONのみ出力（コードブロック不要）：
{"cardName":"カード名","transactions":[{"date":"YYYY-MM-DD","label":"取引先名","amount":金額整数}]}

抽出ルール：
・dateはYYYY-MM-DD形式（例: 26年04月26日 → 2026-04-26）
・amountは正の整数（支払金額・今回お支払金額の列を使う）
・合計行・小計行・ポイント行・手数料内訳行は除外
・エポスカードの場合：「ＡＰ／」「ＱＰ／」などのプレフィックスをlabelから除去
・店舗名は日本語に変換（全角→半角）して簡潔に
・同じ日付・同じ店舗・同じ金額の重複行は1件のみ
・分割払いの場合は今回のお支払金額のみ抽出` },
      { inline_data: { mime_type: "application/pdf", data: base64 } },
    ],
    8192
  );
  onProgress?.(90);
  const transactions = (parsed.transactions || [])
    .map(t => ({
      date:  String(t.date || "").replace(/\//g, "-").trim(),
      label: String(t.label || "不明")
        .replace(/^(AP|QP|ＡＰ|ＱＰ)[\/／]/, "")  // プレフィックス除去
        .trim(),
      amount:   -Math.abs(Number(t.amount) || 0),
      type:     "expense",
      category: "その他",
      source:   "csv",
    }))
    .filter(t => t.date && t.amount < 0);
  onProgress?.(100);
  return { cardName: String(parsed.cardName || "PDF明細"), transactions };
};
