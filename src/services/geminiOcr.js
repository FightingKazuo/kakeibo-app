// ============================================================
// geminiOcr.js  (v4 — 確定版)
//
// 修正:
//   ① タイムアウトは即座に throw（次モデルは試さない → 最大ハング時間を20秒に）
//   ② 429(上限)も即座に throw（全モデル共通の制限のため再試行不要）
//   ③ 404のみ次モデルへ fallback
//   ④ タイムアウト 20秒（旧: 30秒）
// ============================================================

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// 試みるモデル名（404の場合のみ次を試す）
const GEMINI_MODELS = [
  "gemini-2.0-flash",
  "gemini-2.0-flash-exp",
  "gemini-1.5-flash-latest",
  "gemini-1.5-flash",
];

// ─── FileReader で base64 化（iOS HEIC 含む全形式・ハングなし）──
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

// ─── 20秒タイムアウト付き fetch ──────────────────────────────
const fetchWithTimeout = (url, options) =>
  Promise.race([
    fetch(url, options),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("TIMEOUT: 接続タイムアウト（20秒）。ネットワークを確認してください")),
        20000
      )
    ),
  ]);

// ─── Gemini API 呼び出し ──────────────────────────────────────
// 404 のみ次モデルへ。タイムアウト・429 は即座に throw。
const callGemini = async (apiKey, parts, maxTokens = 2048) => {
  let last404Error = null;

  for (const model of GEMINI_MODELS) {
    const url = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`;
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
      // タイムアウトは即座に throw（ハングを防ぐ）
      if (e.message.startsWith("TIMEOUT:")) {
        throw new Error("⏱ タイムアウト（20秒）\nネットワークが不安定か Gemini に問題があります。しばらく待って再試行してください");
      }
      // その他ネットエラー
      throw new Error(`ネットワークエラー: ${e.message}`);
    }

    // 404 = このモデル未対応 → 次を試す
    if (res.status === 404) {
      last404Error = new Error(`モデル ${model} が見つかりません (404)`);
      continue;
    }

    // 429 = レート上限 → 即座に throw（全モデル共通の制限）
    if (res.status === 429) {
      throw new Error(
        "⚠️ リクエスト上限に達しました（429）\n" +
        "Gemini 無料プランは 1分15回まで。\n" +
        "1〜2分待ってから再試行してください。"
      );
    }

    // 400 = APIキー無効
    if (res.status === 400) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`❌ APIキーエラー: ${(err.error?.message || "").slice(0, 80)}`);
    }

    // 503 = サーバー混雑
    if (res.status === 503) {
      throw new Error("⚠️ Gemini サーバーが混雑中。しばらく待って再試行してください");
    }

    // その他エラー
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Gemini エラー (${res.status}): ${(err.error?.message || "").slice(0, 80)}`);
    }

    // ─ 成功 ─────────────────────────────────────────────────
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
      throw new Error(`JSON 解析失敗 (${model}):\n${text.slice(0, 80)}`);
    }
  }

  // 全モデルが 404 だった場合
  throw last404Error || new Error("すべての Gemini モデルで失敗しました");
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
・label はカタカナを日本語に変換
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
