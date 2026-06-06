// ============================================================
// geminiOcr.js
// Gemini Vision API でレシート・PDFを解析
// iPhone HEIC → JPEG 自動変換対応
// ============================================================

const GEMINI_API =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

// ─── iPhone HEIC / 大きい画像を JPEG に変換 ─────────────────
// Gemini は HEIC 非対応のため Canvas で JPEG に変換する
const toJpegBase64 = (file) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1600;
      let w = img.width, h = img.height;
      if (w > MAX || h > MAX) {
        const s = MAX / Math.max(w, h);
        w = Math.round(w * s); h = Math.round(h * s);
      }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error("画像変換失敗")); return; }
          const reader = new FileReader();
          reader.onload  = () => resolve(reader.result.split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        },
        "image/jpeg", 0.88
      );
    };
    img.onerror = () => reject(new Error("画像を読み込めませんでした"));
    img.src = url;
  });

// ─── PDF 用 base64 変換（そのまま送信）──────────────────────
const toBase64 = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve(r.result.split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

// ─── Gemini API 共通呼び出し ─────────────────────────────────
const callGemini = async (apiKey, parts, maxTokens = 2048) => {
  const res = await fetch(`${GEMINI_API}?key=${apiKey}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature: 0.1, maxOutputTokens: maxTokens },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err.error?.message || "";
    if (res.status === 400) throw new Error(`APIキーが無効か形式エラーです: ${msg}`);
    if (res.status === 429) throw new Error("リクエスト上限。しばらく待ってください");
    throw new Error(`Gemini エラー (${res.status}): ${msg}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

  // JSONブロックを抽出
  const clean = text
    .replace(/^```json\s*/m, "").replace(/^```\s*/m, "").replace(/```\s*$/m, "").trim();
  try {
    return JSON.parse(clean);
  } catch {
    throw new Error(`Gemini の応答を解析できませんでした: ${text.slice(0, 60)}`);
  }
};

// ─── レシート画像解析 ────────────────────────────────────────
const RECEIPT_PROMPT = `このレシート画像から情報を抽出してください。JSONのみ出力：
{
  "storeName": "店舗名（例: ウエルシア静岡川合店）",
  "date": "YYYY-MM-DD",
  "totalAmount": 合計金額の整数,
  "items": [{"name":"商品名","amount":単価整数,"quantity":数量整数}]
}
・totalAmount は税込合計
・割引はnameに「割引」を含めamountをマイナス値
・不明項目は null`;

export const analyzeWithGemini = async (imageFile, apiKey, onProgress) => {
  onProgress?.(10);
  const base64 = await toJpegBase64(imageFile); // HEIC → JPEG 変換
  onProgress?.(40);

  const parsed = await callGemini(apiKey, [
    { text: RECEIPT_PROMPT },
    { inline_data: { mime_type: "image/jpeg", data: base64 } },
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
・合計行・税額行・ポイント行は除外
・全取引を漏れなく抽出`;

export const analyzePDFWithGemini = async (file, apiKey, onProgress) => {
  onProgress?.(10);
  const base64 = await toBase64(file);
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
