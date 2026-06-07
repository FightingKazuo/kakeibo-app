// ============================================================
// geminiOcr.js  (v6 — OAuth Bearer 対応・AQ.キー対応)
//
// AQ. で始まるキーは OAuth アクセストークンのため
// Authorization: Bearer ヘッダーで送信する必要がある
// ============================================================

// 2026年6月時点の現行モデル（gemini-2.0-flash は2026年3月廃止）
const ENDPOINTS = [
  { base: "https://generativelanguage.googleapis.com/v1beta/models", model: "gemini-2.5-flash" },
  { base: "https://generativelanguage.googleapis.com/v1beta/models", model: "gemini-2.5-flash-lite" },
  { base: "https://generativelanguage.googleapis.com/v1/models",     model: "gemini-2.5-flash" },
  { base: "https://generativelanguage.googleapis.com/v1beta/models", model: "gemini-2.5-flash-preview-05-20" },
  { base: "https://generativelanguage.googleapis.com/v1beta/models", model: "gemini-1.5-flash-latest" },
];

// ─── FileReader で base64 化（iOS 全形式対応）────────────────
const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result   = reader.result;
      const base64   = result.split(",")[1];
      const mimeType = result.split(":")[1]?.split(";")[0] || file.type || "image/jpeg";
      resolve({ base64, mimeType });
    };
    reader.onerror = () => reject(new Error("ファイルの読み込みに失敗しました"));
    reader.readAsDataURL(file);
  });

// ─── 20秒タイムアウト ────────────────────────────────────────
const fetchWithTimeout = (url, options) =>
  Promise.race([
    fetch(url, options),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("TIMEOUT")), 20000)
    ),
  ]);

// ─── API キーの種類を判定 ──────────────────────────────────────
// AQ. / ya29. → OAuth Bearer Token（Authorizationヘッダー）
// AIzaSy / その他 → API Key（URLパラメータ）
const isOAuthToken = (key) =>
  key.startsWith("AQ.") || key.startsWith("ya29.") || key.startsWith("AQ ");

// ─── Gemini API 呼び出し（認証方式を自動切替）───────────────────
const callGemini = async (apiKey, parts, maxTokens = 2048) => {
  const errors  = [];
  const isOAuth = isOAuthToken(apiKey);
  const body    = JSON.stringify({
    contents: [{ parts }],
    generationConfig: { temperature: 0.1, maxOutputTokens: maxTokens },
  });

  for (const { base, model } of ENDPOINTS) {
    const urlParam  = `${base}/${model}:generateContent?key=${apiKey}`;
    const urlBearer = `${base}/${model}:generateContent`;

    // 認証試行順: OAuth は Bearer 優先、APIキーは URLパラメータ優先
    const attempts = isOAuth
      ? [
          { url: urlBearer, headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` } },
          { url: urlParam,  headers: { "Content-Type": "application/json" } },
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
          throw new Error("⏱ タイムアウト（20秒）\nGeminiに接続できません。ネット接続を確認してください。");
        }
        throw new Error(`ネットワークエラー: ${e.message}`);
      }
    }

    if (!res) { errors.push(`${model}: 認証失敗(401)`); continue; }

    // 429 = レート上限
    if (res.status === 429) {
      throw new Error("⚠️ リクエスト上限（429）\n1〜2分待ってから再試行してください。");
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
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (!text) throw new Error("Gemini から応答が空でした");

    const clean = text
      .replace(/^```json\s*/m, "").replace(/^```\s*/m, "").replace(/```\s*$/m, "").trim();

    try {
      return JSON.parse(clean);
    } catch {
      const match = clean.match(/\{[\s\S]*\}/);
      if (match) { try { return JSON.parse(match[0]); } catch {} }
      throw new Error(`JSON解析失敗(${model}):\n${text.slice(0, 60)}`);
    }
  }

  throw new Error(
    `❌ すべてのモデルで失敗\n\n` +
    `${errors.map(e => `・${e}`).join("\n")}\n\n` +
    `キーの種類を確認してください:\n` +
    `AQ.から始まる → OAuth Token ✅ (検出済み)\n` +
    `AIzaSyから始まる → API Key`
  );
};

// ─── APIキー診断 ──────────────────────────────────────────────
export const testGeminiKey = async (apiKey) => {
  await callGemini(apiKey, [{ text: "Respond with: OK" }], 10);
  return true;
};

// ─── レシート画像解析（画像直接送信）────────────────────────
const RECEIPT_PROMPT = `このレシート画像から情報を抽出してください。JSONのみ出力（コードブロック不要）：
{
  "storeName": "店舗名（例: ウエルシア静岡川合店）",
  "date": "YYYY-MM-DD",
  "totalAmount": 合計金額の整数,
  "items": [{"name":"商品名","amount":単価整数,"quantity":数量整数}]
}
・totalAmount は税込合計
・割引はnameに「割引」を含めamountをマイナス値
・不明は null`;

export const analyzeWithGemini = async (imageFile, apiKey, onProgress) => {
  onProgress?.(10);
  const { base64, mimeType } = await fileToBase64(imageFile);
  onProgress?.(40);
  const parsed = await callGemini(apiKey, [
    { text: RECEIPT_PROMPT },
    { inline_data: { mime_type: mimeType, data: base64 } },
  ]);
  onProgress?.(100);
  return {
    storeName:   String(parsed.storeName   || "").trim(),
    date:        String(parsed.date        || "").trim(),
    totalAmount: Number(parsed.totalAmount) || 0,
    items:       Array.isArray(parsed.items) ? parsed.items : [],
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
      { text: `このクレジットカード・銀行明細PDFから全取引を抽出。JSONのみ出力：
{"cardName":"カード名","transactions":[{"date":"YYYY-MM-DD","label":"取引先名","amount":金額整数}]}
・date はYYYY-MM-DD形式・amountは正の整数・合計行除外` },
      { inline_data: { mime_type: "application/pdf", data: base64 } },
    ],
    4096
  );
  onProgress?.(90);
  const transactions = (parsed.transactions || [])
    .map(t => ({
      date: String(t.date || "").replace(/\//g, "-").trim(),
      label: String(t.label || "不明").trim(),
      amount: -Math.abs(Number(t.amount) || 0),
      type: "expense", category: "その他", source: "csv",
    }))
    .filter(t => t.date && t.amount < 0);
  onProgress?.(100);
  return { cardName: String(parsed.cardName || "PDF明細"), transactions };
};
