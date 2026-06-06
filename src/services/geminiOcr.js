// ============================================================
// geminiOcr.js
// Gemini Vision API でレシートを解析し構造化データを返す
//
// 無料枠: 1日1,500リクエスト (個人利用で実質無制限)
// APIキー取得: https://aistudio.google.com → Get API Key
// ============================================================

const GEMINI_API =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

const PROMPT = `このレシート画像から情報を抽出してください。
必ずJSONのみを出力してください（コードブロック・説明文不要）。

{
  "storeName": "店舗名（例: ウエルシア静岡川合店）",
  "date": "YYYY-MM-DD形式の日付",
  "totalAmount": 合計金額の整数,
  "items": [
    { "name": "商品名", "amount": 単価の整数, "quantity": 数量の整数 }
  ]
}

ルール:
- storeName は看板・ヘッダーから正確に取得
- totalAmount は「合計」「お会計」の金額（税込）
- items の amount はすべて正の整数（割引は name に「割引」を含めマイナス値）
- 読み取れない項目は null`;

// ─── 画像を base64 に変換 ──────────────────────────────────
const toBase64 = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve(r.result.split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

// ─── メイン ──────────────────────────────────────────────────
/**
 * analyzeWithGemini
 * レシート画像を Gemini Vision API で解析し構造化データを返す
 *
 * @param {File}     imageFile  レシート画像
 * @param {string}   apiKey     Gemini API キー
 * @param {function} onProgress 進捗コールバック (0-100)
 * @returns {{ storeName, date, totalAmount, items[] }}
 */
export const analyzeWithGemini = async (imageFile, apiKey, onProgress) => {
  onProgress?.(10);

  const base64   = await toBase64(imageFile);
  const mimeType = imageFile.type || "image/jpeg";
  onProgress?.(30);

  const res = await fetch(`${GEMINI_API}?key=${apiKey}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: PROMPT },
          { inline_data: { mime_type: mimeType, data: base64 } },
        ],
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
    }),
  });
  onProgress?.(80);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err.error?.message || "";
    if (res.status === 400) throw new Error("APIキーが無効です。Google AI Studioで確認してください。");
    if (res.status === 429) throw new Error("リクエスト数の上限に達しました。しばらく待ってください。");
    throw new Error(`Gemini API エラー (${res.status}): ${msg}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  onProgress?.(100);

  // JSON を取り出す（コードブロックが含まれていても対応）
  const clean = text
    .replace(/^```json\s*/m, "")
    .replace(/^```\s*/m, "")
    .replace(/```\s*$/m, "")
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch {
    throw new Error(
      `Geminiの応答をパースできませんでした。\n応答: ${text.slice(0, 100)}`
    );
  }

  // 正規化
  return {
    storeName:   String(parsed.storeName   || "").trim(),
    date:        String(parsed.date        || "").trim(),
    totalAmount: Number(parsed.totalAmount) || 0,
    items:       Array.isArray(parsed.items) ? parsed.items : [],
  };
};


// ─── PDF解析（クレジットカード・銀行明細）────────────────────
const PDF_PROMPT = `このクレジットカード・銀行の明細書PDFから全取引を抽出してください。
JSONのみ出力（コードブロック不要）：
{
  "cardName": "カード名または銀行名",
  "transactions": [
    { "date": "YYYY-MM-DD", "label": "取引先名（日本語で）", "amount": 金額の整数 }
  ]
}
ルール:
- date は YYYY-MM-DD形式（例: 2026-04-01）
- label はカタカナを極力日本語に変換（例: セブンーイレブン → セブン-イレブン）
- amount は正の整数（支出額）
- 合計行・ポイント行・税額行は除外
- すべての取引を漏れなく抽出`;

/**
 * analyzePDFWithGemini
 * PDFをGemini APIで直接解析し全取引を返す
 * pdfjs不要・100%ブラウザで動作
 *
 * @param {File}     file       PDFファイル
 * @param {string}   apiKey     Gemini API キー
 * @param {function} onProgress 進捗コールバック
 * @returns {{ cardName, transactions[] }}
 */
export const analyzePDFWithGemini = async (file, apiKey, onProgress) => {
  onProgress?.(10);

  const base64 = await toBase64(file);
  onProgress?.(40);

  const res = await fetch(`${GEMINI_API}?key=${apiKey}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: PDF_PROMPT },
          { inline_data: { mime_type: "application/pdf", data: base64 } },
        ],
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
    }),
  });
  onProgress?.(80);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err.error?.message || "";
    if (res.status === 400) throw new Error("APIキーが無効か、PDFのサイズが大きすぎます");
    if (res.status === 429) throw new Error("リクエスト数の上限に達しました。しばらく待ってください");
    throw new Error(`Gemini API エラー (${res.status}): ${msg}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  onProgress?.(100);

  const clean = text
    .replace(/^```json\s*/m, "")
    .replace(/^```\s*/m, "")
    .replace(/```\s*$/m, "")
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch {
    throw new Error(`PDF解析失敗。応答: ${text.slice(0, 80)}`);
  }

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

  return { cardName: String(parsed.cardName || "PDF明細"), transactions };
};
