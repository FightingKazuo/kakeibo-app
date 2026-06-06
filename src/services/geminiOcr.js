// ============================================================
// geminiOcr.js  (v3)
//
// 修正:
//   ① モデル名フォールバック: gemini-2.0-flash → 1.5-flash-latest → 1.5-flash
//      → 2026年以降のモデル名変更に自動対応
//   ② AbortController → Promise.race に変更（iOS Safari 互換性向上）
//   ③ FileReader で直接 base64 化（HEIC 含む全形式対応・ハング防止）
// ============================================================

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// 試みるモデル名リスト（新しい順）
const GEMINI_MODELS = [
  "gemini-2.0-flash",
  "gemini-2.0-flash-exp",
  "gemini-1.5-flash-latest",
  "gemini-1.5-flash",
];

// ─── FileReader で base64 化（iOS 全形式対応・ハングなし）────
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

// ─── タイムアウト付き fetch（Promise.race 方式・iOS 互換）─────
const fetchWithTimeout = (url, options, timeoutMs = 30000) =>
  Promise.race([
    fetch(url, options),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`タイムアウト（${timeoutMs / 1000}秒）: ネット接続を確認してください`)), timeoutMs)
    ),
  ]);

// ─── Gemini API 呼び出し（モデル自動フォールバック）────────────
const callGemini = async (apiKey, parts, maxTokens = 2048) => {
  let lastError = null;

  for (const model of GEMINI_MODELS) {
    const url = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`;
    let res;
    try {
      res = await fetchWithTimeout(
        url,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { temperature: 0.1, maxOutputTokens: maxTokens },
          }),
        },
        30000
      );
    } catch (e) {
      lastError = e;
      continue; // ネットエラーは次のモデルへ
    }

    // 404 = このモデルは未対応 → 次を試す
    if (res.status === 404) {
      lastError = new Error(`モデル ${model} が見つかりません`);
      continue;
    }

    // その他エラー
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err.error?.message || "";
      if (res.status === 400) throw new Error(`APIキーが無効です: ${msg.slice(0, 80)}`);
      if (res.status === 429) throw new Error("リクエスト上限に達しました。しばらく待ってください");
      if (res.status === 503) throw new Error("Geminiが混雑中。少し待って再試行してください");
      throw new Error(`Geminiエラー (${res.status}): ${msg.slice(0, 80)}`);
    }

    // 成功
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (!text) throw new Error("Geminiから応答が空でした");

    // JSONを抽出
    const clean = text
      .replace(/^```json\s*/m, "").replace(/^```\s*/m, "").replace(/```\s*$/m, "").trim();
    try {
      return JSON.parse(clean);
    } catch {
      const match = clean.match(/\{[\s\S]*\}/);
      if (match) { try { return JSON.parse(match[0]); } catch {} }
      throw new Error(`JSON解析失敗 (${model}): ${text.slice(0, 60)}`);
    }
  }

  throw lastError || new Error("すべてのGeminiモデルで失敗しました");
};

// ─── レシート画像解析 ────────────────────────────────────────
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

// ─── PDF明細解析 ─────────────────────────────────────────────
const PDF_PROMPT = `このクレジットカード・銀行明細PDFから全取引を抽出してください。JSONのみ出力：
{
  "cardName": "カード名または銀行名",
  "transactions": [{"date":"YYYY-MM-DD","label":"取引先名","amount":金額整数}]
}
・date は YYYY-MM-DD形式
・label はカタカナを日本語に変換（例: シヤトレーゼ → シャトレーゼ）
・amount は正の整数（支出額）
・合計行・税額行・ポイント行は除外
・すべての取引を漏れなく抽出`;

export const analyzePDFWithGemini = async (file, apiKey, onProgress) => {
  onProgress?.(10);
  const { base64 } = await fileToBase64(file);
  onProgress?.(40);

  const parsed = await callGemini(
    apiKey,
    [
      { text: PDF_PROMPT },
      { inline_data: { mime_type: "application/pdf", data: base64 } },
    ],
    4096
  );
  onProgress?.(90);

  const transactions = (parsed.transactions || [])
    .map(t => ({
      date:     String(t.date  || "").replace(/\//g, "-").trim(),
      label:    String(t.label || "不明").trim(),
      amount:   -Math.abs(Number(t.amount) || 0),
      type:     "expense",
      category: "その他",
      source:   "csv",
    }))
    .filter(t => t.date && t.amount < 0);

  onProgress?.(100);
  return { cardName: String(parsed.cardName || "PDF明細"), transactions };
};
