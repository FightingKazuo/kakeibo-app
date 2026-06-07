// ============================================================
// geminiOcr.js  (v7 — 429詳細取得・AQ.キー認証修正)
//
// 変更点:
//   - 429レスポンスのボディを取得してエラーメッセージに表示
//   - AQ.キーをAPIキー方式でも試す（両方試してどちらか成功した方を使う）
//   - 全モデル失敗時のエラーメッセージに詳細を含める
// ============================================================

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
          throw new Error("⏱ タイムアウト（20秒）\nGeminiに接続できません。ネット接続を確認してください。");
        }
        throw new Error(`ネットワークエラー: ${e.message}`);
      }
    }

    if (!res) { errors.push(`${model}: 認証失敗(401)`); continue; }

    // ─── 429: レスポンスボディを取得して詳細を表示（v7変更点）───
    if (res.status === 429) {
      let detail = "";
      try {
        const errBody = await res.json();
        const msg     = errBody?.error?.message || "";
        const status  = errBody?.error?.status  || "";
        detail = msg ? `\n詳細: ${msg.slice(0, 120)}` : "";
        // RESOURCE_EXHAUSTEDはQuota超過、RATE_LIMIT_EXCEEDEDはRPM超過
        if (status === "RESOURCE_EXHAUSTED" || msg.includes("quota") || msg.includes("Quota")) {
          throw new Error(
            `⚠️ 本日のQuota上限に達しました（429 RESOURCE_EXHAUSTED）\n` +
            `明日（太平洋時間の午前0時）にリセットされます。${detail}\n\n` +
            `対処法:\n` +
            `・明日また試す\n` +
            `・Google AI Studioで使用量を確認する\n` +
            `・有料プランにアップグレードする`
          );
        }
        if (msg.includes("rate") || msg.includes("Rate") || status === "RATE_LIMIT_EXCEEDED") {
          throw new Error(
            `⚠️ レート上限（429 RATE_LIMIT_EXCEEDED）\n` +
            `1〜2分待ってから再試行してください。${detail}`
          );
        }
      } catch (e) {
        // すでにErrorをthrowしていればそのまま再throw
        if (e.message.includes("429") || e.message.includes("Quota") || e.message.includes("レート")) throw e;
      }
      // 詳細不明の429
      throw new Error(
        `⚠️ リクエスト上限（429）${detail}\n` +
        `1〜2分待っても続く場合は本日のQuota上限の可能性があります。`
      );
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

    // コードブロック（```json ... ``` など）を除去
    const clean = text
      .replace(/```json[\s\S]*?```/g, m => m.replace(/```json\s*/g, "").replace(/```/g, ""))
      .replace(/```[\s\S]*?```/g, m => m.replace(/```\s*/g, ""))
      .trim();

    try {
      return JSON.parse(clean);
    } catch {
      // JSONブロックを直接抽出して再試行
      const match = clean.match(/\{[\s\S]*\}/);
      if (match) { try { return JSON.parse(match[0]); } catch {} }
      // テキスト全体からも試みる
      const matchRaw = text.match(/\{[\s\S]*\}/);
      if (matchRaw) { try { return JSON.parse(matchRaw[0]); } catch {} }
      throw new Error(`JSON解析失敗(${model}):\n${text.slice(0, 60)}`);
    }
  }

  throw new Error(
    `❌ すべてのモデルで失敗\n\n` +
    `${errors.map(e => `・${e}`).join("\n")}\n\n` +
    `キーの種類: ${isOAuthLike(apiKey) ? "AQ.形式（APIキーとして送信）" : "AIzaSy形式（標準APIキー）"}`
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
