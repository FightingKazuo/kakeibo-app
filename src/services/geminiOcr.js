// ============================================================
// geminiOcr.js  (v8 — maxTokens増加・バージョン管理追加)
//
import { parsePDF } from "./pdfParser.js";
//
// 変更点:
//   v8: analyzeWithGemini を4096、analyzePDFWithGemini を8192に増加
//       GEMINI_OCR_VERSION をエクスポート（設定画面での確認用）
//   v7: 429詳細取得・AQ.キー認証修正
// ============================================================

export const GEMINI_OCR_VERSION = "v8";

const ENDPOINTS = [
  { base: "https://generativelanguage.googleapis.com/v1beta/models", model: "gemini-2.5-flash"      }, // ① 最高精度（GA）
  { base: "https://generativelanguage.googleapis.com/v1beta/models", model: "gemini-2.5-flash-lite" }, // ② 軽量・高速（GA・無料枠あり）
  { base: "https://generativelanguage.googleapis.com/v1/models",     model: "gemini-2.5-flash"      }, // ③ v1でのリトライ
  { base: "https://generativelanguage.googleapis.com/v1/models",     model: "gemini-2.5-flash-lite" }, // ④ v1フォールバック
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
const callGemini = async (apiKey, parts, maxTokens = 8192) => {
  const errors  = [];
  const body    = JSON.stringify({
    contents: [{ parts }],
    generationConfig: { temperature: 0.1, maxOutputTokens: maxTokens, responseMimeType: "application/json" },
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

    // レスポンスが途中で切れた場合：storeName・date・totalAmountだけでも取り出す
    if (jsonStart !== -1) {
      const partial = text.slice(jsonStart);
      const storeMatch = partial.match(/"storeName"\s*:\s*"([^"]+)"/);
      const dateMatch  = partial.match(/"date"\s*:\s*"([^"]+)"/);
      const totalMatch = partial.match(/"totalAmount"\s*:\s*(\d+)/);
      if (storeMatch || totalMatch) {
        return {
          storeName:   storeMatch?.[1]  || "",
          date:        dateMatch?.[1]?.slice(0, 10) || "",
          totalAmount: totalMatch ? Number(totalMatch[1]) : 0,
          items:       [],  // 品目は空（途中で切れたため）
          _truncated:  true,
        };
      }
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
// PDF専用Gemini呼び出し（responseMimeTypeを除外）
const callGeminiPDF = async (apiKey, parts, maxTokens = 8192) => {
  const errors = [];
  const body   = JSON.stringify({
    contents: [{ parts }],
    generationConfig: { temperature: 0.1, maxOutputTokens: maxTokens },
  });

  for (const { base, model } of ENDPOINTS) {
    const urlParam  = `${base}/${model}:generateContent?key=${apiKey}`;
    const urlBearer = `${base}/${model}:generateContent`;
    const attempts  = [
      { url: urlParam,  headers: { "Content-Type": "application/json" } },
      { url: urlBearer, headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` } },
    ];

    let res = null;
    for (const attempt of attempts) {
      try {
        const r = await fetchWithTimeout(attempt.url, { method: "POST", headers: attempt.headers, body });
        if (r.status === 401) continue;
        res = r;
        break;
      } catch (e) {
        if (e.message === "TIMEOUT") throw new Error("⏱ タイムアウト（40秒）");
        throw new Error(`ネットワークエラー: ${e.message}`);
      }
    }

    if (!res) { errors.push(`${model}: 認証失敗(401)`); continue; }

    if (res.status === 400) {
      let msg = "";
      try { msg = (await res.json())?.error?.message || ""; } catch {}
      errors.push(`${model}(400): ${msg.slice(0, 80)}`);
      continue;
    }
    if (!res.ok) {
      errors.push(`${model}(${res.status}): エラー`);
      continue;
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const clean = text.replace(/```json|```/g, "").trim();
    try {
      return JSON.parse(clean);
    } catch {
      // JSON解析失敗でも次モデルへ
      errors.push(`${model}: JSON解析失敗`);
      continue;
    }
  }
  // エラー内容をわかりやすく日本語で説明
  const errSummary = errors.map(e => {
    if (e.includes("429") || e.includes("quota")) return `・レート制限（しばらく待ってから再試行）`;
    if (e.includes("400") && e.includes("no pages")) return `・PDFが読み込めませんでした（SafariのPDFは非対応の場合あり）`;
    if (e.includes("400")) return `・APIリクエストエラー（${e.split(":").slice(-1)[0].trim().slice(0,40)}）`;
    if (e.includes("401") || e.includes("403")) return `・APIキーエラー（キーを確認してください）`;
    if (e.includes("404")) return `・モデルが見つかりません`;
    if (e.includes("TIMEOUT")) return `・タイムアウト（接続を確認してください）`;
    return `・${e.slice(0,60)}`;
  });
  throw new Error(`読み込みに失敗しました\n\n${errSummary.join("\n")}`);
};

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
// プロンプト1：ヘッダー情報のみ（軽量）
const RECEIPT_HEADER_PROMPT = `レシート画像から店舗名・日付・合計金額を抽出。必ずJSONのみ出力しMarkdownコードブロック不使用：
{"storeName":"店舗名","date":"YYYY-MM-DD","totalAmount":税込合計整数}
totalAmountは最下部の「合計」の税込金額（外税なら小計＋消費税）。`;

// プロンプト2：品目リストのみ（専用）
const RECEIPT_ITEMS_PROMPT = `レシート画像の品目リストを抽出。必ずJSONのみ出力しMarkdownコードブロック不使用：
{"items":[{"name":"商品名","unitPrice":単価整数,"quantity":数量整数,"amount":合計整数}]}

ルール：
・「NコX単価」「@価格×N」→ unitPrice・quantityを分解する（例:「@118×3個」→unitPrice:118,quantity:3）
・マイナス金額（割引・値引き）→ amountをマイナス値にする（例:-38）
・「¥○○から¥○○に致します」→ 差額をマイナスで1品目追加
・小計・合計・消費税・お預り・お釣り・クレジット・ポイント行は除外
・バーコード番号（長い数字列）は除外
・数量が明示されていない場合はquantity:1`;

export const analyzeWithGemini = async (imageFile, apiKey, onProgress) => {
  onProgress?.(10);
  const { base64, mimeType } = await fileToBase64(imageFile);
  onProgress?.(30);

  // 第1段階：ヘッダー情報（軽量・確実）
  const header = await callGemini(apiKey, [
    { text: RECEIPT_HEADER_PROMPT },
    { inline_data: { mime_type: mimeType, data: base64 } },
  ], 512);
  onProgress?.(55);

  // 第2段階：品目リスト（専用プロンプト・大きめトークン）
  let itemsParsed = { items: [] };
  try {
    itemsParsed = await callGemini(apiKey, [
      { text: RECEIPT_ITEMS_PROMPT },
      { inline_data: { mime_type: mimeType, data: base64 } },
    ], 8192);
  } catch (e) {
    console.warn("品目取得失敗（ヘッダーのみで続行）:", e.message);
  }
  onProgress?.(100);

  const items = Array.isArray(itemsParsed.items) ? itemsParsed.items.map(item => {
    const unitPrice = Math.abs(Number(item.unitPrice) || Math.abs(Number(item.amount)) || 0);
    const quantity  = Math.max(1, Number(item.quantity) || 1);
    let   amount    = Number(item.amount) !== 0 ? Number(item.amount) : (unitPrice * quantity);
    // 割引・値引き判定：名前に割引キーワードがあるのにamountが正の場合は強制マイナス
    const name = String(item.name || "");
    const isDiscount = name.includes("割引") || name.includes("値引") || name.includes("から") ||
                       name.includes("に致します") || name.includes("まとめ値引") || name.startsWith("-");
    if (isDiscount && amount > 0) amount = -amount;
    return { ...item, unitPrice, quantity, amount, isDiscount };
  }) : [];

  return {
    storeName:   String(header.storeName   || "").trim(),
    date:        String(header.date        || "").trim(),
    totalAmount: Number(header.totalAmount) || 0,
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

  // ① pdf.jsでパース試行（静的import版）
  try {
    const result = await parsePDF(file);
    if (result?.transactions?.length > 0) {
      onProgress?.(100);
      return {
        cardName: result.format === "smbc_pdf" ? "三井住友カード（PDF）"
                : result.format === "epos_pdf" ? "エポスカード（PDF）"
                : "PDF明細",
        transactions: result.transactions,
      };
    }
    // pdf.js成功だが0件 → エラーとして返す（Geminiに落とさない）
    throw new Error(`PDFの読み込みに失敗しました\n形式: ${result?.format || "不明"} / 行数: ${result?.lineCount || 0}\n\n三井住友カードのPDFは「データ取得 → Chromeで開く」からPDFを作成してください。`);
  } catch (e) {
    // Geminiには落とさずエラーをそのまま投げる
    throw e;
  }

  // ② GeminiにPDFを直接渡す（responseMimeTypeなし）
  onProgress?.(40);
  const { base64 } = await fileToBase64(file);
  onProgress?.(60);

  const errors = [];
  for (const { base, model } of ENDPOINTS) {
    const body = JSON.stringify({
      contents: [{ parts: [
        { text: `このクレジットカード・銀行明細PDFから全取引を抽出。JSONのみ出力（コードブロック不要）:
{"cardName":"カード名","transactions":[{"date":"YYYY-MM-DD","label":"店舗名","amount":-1234,"type":"expense","category":"その他"}]}
日付はYYYY-MM-DD。金額は支出を負の整数。` },
        { inline_data: { mime_type: "application/pdf", data: base64 } },
      ]}],
      generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
    });

    const attempts = [
      { url: `${base}/${model}:generateContent?key=${apiKey}`, headers: { "Content-Type": "application/json" } },
      { url: `${base}/${model}:generateContent`, headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` } },
    ];

    for (const attempt of attempts) {
      try {
        const res = await fetchWithTimeout(attempt.url, { method: "POST", headers: attempt.headers, body });
        if (res.status === 401) continue;
        if (!res.ok) {
          let msg = "";
          try { msg = (await res.json())?.error?.message || ""; } catch {}
          errors.push(`${model}(${res.status}): ${msg.slice(0,80)}`);
          break;
        }
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const clean = text.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(clean);
        const transactions = (parsed?.transactions || []).map(t => ({
          ...t,
          amount: typeof t.amount === "number" ? t.amount : -Math.abs(parseFloat(String(t.amount).replace(/[^0-9.]/g,""))||0),
          type: t.type || "expense",
          category: t.category || "その他",
          source: "csv",
        })).filter(t => t.date && t.label && t.amount !== 0);
        onProgress?.(100);
        return { cardName: String(parsed?.cardName || "PDF明細"), transactions };
      } catch (e) {
        if (e.message === "TIMEOUT") throw new Error("⏱ タイムアウト（40秒）");
        continue;
      }
    }
  }
  // エラー内容をわかりやすく日本語で説明
  const errSummary = errors.map(e => {
    if (e.includes("429") || e.includes("quota")) return `・レート制限（しばらく待ってから再試行）`;
    if (e.includes("400") && e.includes("no pages")) return `・PDFが読み込めませんでした（SafariのPDFは非対応の場合あり）`;
    if (e.includes("400")) return `・APIリクエストエラー（${e.split(":").slice(-1)[0].trim().slice(0,40)}）`;
    if (e.includes("401") || e.includes("403")) return `・APIキーエラー（キーを確認してください）`;
    if (e.includes("404")) return `・モデルが見つかりません`;
    if (e.includes("TIMEOUT")) return `・タイムアウト（接続を確認してください）`;
    return `・${e.slice(0,60)}`;
  });
  throw new Error(`読み込みに失敗しました\n\n${errSummary.join("\n")}`);
};
