// ============================================================
// geminiOcr.js  (v2 — iOS HEIC対応・タイムアウト付き)
//
// 修正点:
//   ① Canvas変換を廃止 → FileReader で直接base64化
//      → iOSのHEICで img.onload が無限待機するバグを解消
//   ② 全リクエストに30秒タイムアウトを追加
//   ③ エラーメッセージを日本語で詳細化
// ============================================================

const GEMINI_API =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

// ─── ファイルを base64 に変換（FileReader 使用・絶対に止まらない）────
const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result; // "data:image/heic;base64,xxxx"
      const base64   = result.split(",")[1];
      const mimeType = result.split(":")[1]?.split(";")[0] || file.type || "image/jpeg";
      resolve({ base64, mimeType });
    };
    reader.onerror = () => reject(new Error("ファイルの読み込みに失敗しました"));
    reader.readAsDataURL(file);
  });

// ─── タイムアウト付き fetch ──────────────────────────────────
const fetchWithTimeout = (url, options, timeoutMs = 30000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
};

// ─── Gemini API 共通呼び出し ─────────────────────────────────
const callGemini = async (apiKey, parts, maxTokens = 2048) => {
  let res;
  try {
    res = await fetchWithTimeout(
      `${GEMINI_API}?key=${apiKey}`,
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
    if (e.name === "AbortError") throw new Error("タイムアウト（30秒）: ネット接続を確認してください");
    throw new Error(`ネットワークエラー: ${e.message}`);
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err.error?.message || "";
    if (res.status === 400) throw new Error(`APIキーが無効です: ${msg.slice(0, 60)}`);
    if (res.status === 429) throw new Error("リクエスト上限。しばらく待ってください");
    if (res.status === 503) throw new Error("Geminiが混雑中。少し待って再試行してください");
    throw new Error(`Geminiエラー (${res.status}): ${msg.slice(0, 60)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (!text) throw new Error("Geminiから応答がありませんでした");

  // JSONブロック抽出
  const clean = text
    .replace(/^```json\s*/m, "").replace(/^```\s*/m, "").replace(/```\s*$/m, "").trim();
  try {
    return JSON.parse(clean);
  } catch {
    // もう一度 {} を探す
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch {}
    }
    throw new Error(`JSON解析失敗: ${text.slice(0, 80)}`);
  }
};

// ─── レシート画像解析 ────────────────────────────────────────
const RECEIPT_PROMPT = `このレシート画像から情報を抽出してください。JSONのみ出力（コードブロック不要）：
{
  "storeName": "店舗名（例: ウエルシア静岡川合店）",
  "date": "YYYY-MM-DD",
  "totalAmount": 合計金額の整数,
  "items": [{"name":"商品名","amount":単価整数,"quantity":数量整数}]
}
・totalAmount は税込合計金額
・割引はnameに「割引」を含めamountをマイナス値
・不明項目は null`;

export const analyzeWithGemini = async (imageFile, apiKey, onProgress) => {
  onProgress?.(10);

  // FileReader で直接 base64 化（HEIC含む全形式対応）
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
