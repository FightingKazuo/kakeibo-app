// ============================================================
// geminiOcr.js  (v5 — 診断機能付き・API v1/v1beta 両対応)
// ============================================================

// v1beta と v1 の両方、複数モデルを試す
// 2026年6月時点の現行モデル
// gemini-2.0-flash は2026年3月3日に廃止済み
// gemini-2.5-flash が現在の標準モデル
const ENDPOINTS = [
  { base: "https://generativelanguage.googleapis.com/v1beta/models", model: "gemini-2.5-flash" },
  { base: "https://generativelanguage.googleapis.com/v1beta/models", model: "gemini-2.5-flash-lite" },
  { base: "https://generativelanguage.googleapis.com/v1/models",     model: "gemini-2.5-flash" },
  { base: "https://generativelanguage.googleapis.com/v1beta/models", model: "gemini-2.5-flash-preview-05-20" },
  { base: "https://generativelanguage.googleapis.com/v1beta/models", model: "gemini-2.0-flash" },
  { base: "https://generativelanguage.googleapis.com/v1beta/models", model: "gemini-1.5-flash-latest" },
];

// ─── 20秒タイムアウト（Promise.race 方式）────────────────────
const fetchWithTimeout = (url, options) =>
  Promise.race([
    fetch(url, options),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("TIMEOUT")), 20000)
    ),
  ]);

// ─── FileReader で base64 化（HEIC 含む全形式・確実動作）───────
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

// ─── 共通 API 呼び出し ────────────────────────────────────────
const callGemini = async (apiKey, parts, maxTokens = 2048) => {
  const errors = [];

  for (const { base, model } of ENDPOINTS) {
    const url = `${base}/${model}:generateContent?key=${apiKey}`;
    let res;

    try {
      res = await fetchWithTimeout(url, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { temperature: 0.1, maxOutputTokens: maxTokens },
        }),
      });
    } catch (e) {
      if (e.message === "TIMEOUT") {
        // タイムアウトはすぐ終了（次モデルを待ち続けない）
        throw new Error(
          "⏱ タイムアウト（20秒）\n" +
          "ネットワークが不安定か Gemini に問題があります。\n" +
          "しばらく待って再試行してください。"
        );
      }
      throw new Error(`ネットワークエラー: ${e.message}`);
    }

    // 429 = レート上限 → すぐ終了
    if (res.status === 429) {
      throw new Error(
        "⚠️ リクエスト上限（429）\n" +
        "Gemini 無料プランは 1分15回まで。\n" +
        "1〜2分待ってから再試行してください。"
      );
    }

    // 400 = APIキーエラー → すぐ終了
    if (res.status === 400) {
      const err = await res.json().catch(() => ({}));
      const msg = err.error?.message || "";
      if (msg.includes("API_KEY") || msg.includes("key")) {
        throw new Error(`❌ APIキーが無効です\n設定画面でキーを確認してください。\n(${msg.slice(0, 60)})`);
      }
      errors.push(`${model}(400): ${msg.slice(0, 40)}`);
      continue;
    }

    // 404 = このモデル未対応 → 次を試す
    if (res.status === 404) {
      errors.push(`${model}(404): not found`);
      continue;
    }

    // 503 = 混雑 → すぐ終了
    if (res.status === 503) {
      throw new Error("⚠️ Gemini サーバーが混雑中。しばらく待って再試行してください。");
    }

    // その他エラー
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      errors.push(`${model}(${res.status}): ${(err.error?.message || "").slice(0, 40)}`);
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
      throw new Error(`JSON 解析失敗: ${text.slice(0, 60)}`);
    }
  }

  // 全エンドポイントが失敗
  throw new Error(
    `❌ すべての Gemini モデルで失敗しました\n\n` +
    `試行結果:\n${errors.map(e => `・${e}`).join("\n")}\n\n` +
    `APIキーが有効か Google AI Studio で確認してください。`
  );
};

// ─── APIキー診断（テキストのみで疎通確認）────────────────────
export const testGeminiKey = async (apiKey, onProgress) => {
  onProgress?.(10);
  const result = await callGemini(
    apiKey,
    [{ text: "Respond with exactly: OK" }],
    10
  );
  onProgress?.(100);
  // 成功すれば何らかの応答が返る
  return true;
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
・label はカタカナを可能な範囲で日本語に変換
・amount は正の整数（支出額）
・合計行・税額行・ポイント行は除外`;

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
