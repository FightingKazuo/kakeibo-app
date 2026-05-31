// ============================================================
// services/ocrUtils.js
// OCR テキスト解析ユーティリティ
// ④ extractReceiptItems / normalizeReceiptItems を追加
// ============================================================

import { createWorker } from "tesseract.js";
import { todayStr, safeDate, safeAmount } from "../utils/format";
import { createTransactionItem } from "./transaction";

// ─── 既存: Tesseract 実行 ────────────────────────────────────
export const runTesseract = async (imageSource, onProgress) => {
  const worker = await createWorker("jpn+eng", 1, {
    logger: m => {
      if (m.status === "recognizing text" && onProgress)
        onProgress(Math.round(m.progress * 100));
    },
  });
  try {
    const { data } = await worker.recognize(imageSource);
    return { text: data.text, confidence: Math.round(data.confidence) };
  } finally {
    await worker.terminate();
  }
};

// ─── 既存: 合計金額・日付・店舗名の抽出 ─────────────────────

export const extractAmount = (text) => {
  const patterns = [
    /合[　 ]*計[^\d¥￥]*[¥￥]?\s*([\d,]+)/,
    /お会計[^\d¥￥]*[¥￥]?\s*([\d,]+)/,
    /レジっト[^\d]*[¥￥]?\s*([\d,]+)/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const num = parseInt((m[1] || m[0]).replace(/[,，]/g, "").replace(/[^\d]/g, ""));
      if (num > 0 && num < 10000000) return num;
    }
  }
  const yens = [...text.matchAll(/[¥￥]([\d,，]+)/g)]
    .map(m => parseInt(m[1].replace(/[,，]/g, "")))
    .filter(n => n > 0 && n < 10000000);
  return yens.length ? Math.max(...yens) : null;
};

export const extractDate = (text) => {
  const patterns = [
    /(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})/,
    /令和(\d+)[年\.](\d{1,2})[月\.](\d{1,2})/,
    /(\d{2})[\/\-](\d{1,2})[\/\-](\d{1,2})/,
    /(\d{1,2})月(\d{1,2})日/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (!m) continue;
    let y, mo, d;
    if (p.source.includes("令和")) {
      y = 2018 + parseInt(m[1]); mo = parseInt(m[2]); d = parseInt(m[3]);
    } else if (m[1].length === 2 && parseInt(m[1]) < 50) {
      y = 2000 + parseInt(m[1]); mo = parseInt(m[2]); d = parseInt(m[3]);
    } else if (p.source.includes("月") && m.length === 3) {
      y = new Date().getFullYear(); mo = parseInt(m[1]); d = parseInt(m[2]);
    } else {
      y = parseInt(m[1]); mo = parseInt(m[2]); d = parseInt(m[3]);
    }
    if (y >= 2020 && y <= 2035 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return safeDate(`${y}-${String(mo).padStart(2,"0")}-${String(d).padStart(2,"0")}`);
    }
  }
  return todayStr();
};

export const extractStoreName = (text) => {
  return text.split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 1 && l.length < 30)
    .filter(l => !/^[\d\s\-\*\=\/\\]+$/.test(l))
    .filter(l => !/^[A-Z0-9]{8,}$/.test(l))
    .slice(0, 2).join(" ").trim() || "";
};

// ─── ④ NEW: 商品明細の抽出 ──────────────────────────────────

/**
 * SKIP_PATTERNS: 商品行ではない行のパターン
 * レシートには多くのノイズ行が含まれる
 */
const SKIP_PATTERNS = [
  /^P\d{8,}/,                      // バーコード行 (P123456789...)
  /^(小計|合計|お会計|レジっト|レシート|領収|御)/,
  /^(外税|内税|消費税|税率|税額|非課税)/,
  /^(T\d{13})/,                    // 登録番号
  /^(\d{4}\/\d{2}\/\d{2})/,       // 日付行
  /^(\d{2}:\d{2})/,               // 時刻行
  /^(会員|ポイント|お買い上げ|ありがとう)/,
  /^\d+点$/,                       // 点数行
];

/**
 * ITEM_LINE_PATTERN: 商品行の正規表現
 *
 * 対応フォーマット例（スーパーレシート）:
 *   外8  サニーレタス              ¥158
 *   外8  絹美人３P           特   ¥78
 *   外8  日清中華 辣椒担々麺  ¥596  (2個 × @298)
 *   外8  ナチュレ恵megu     特  ¥158
 *         割引              40%   -63
 */
const ITEM_LINE_PATTERN =
  /^(?:外\d+\s+)?(.+?)\s+(?:特\s+)?[¥￥]?(-?\d[\d,]*)\s*$/;

const QUANTITY_LINE_PATTERN =
  /\((\d+)個?\s*[×x]\s*@?(\d[\d,]*)\)/;

const DISCOUNT_LINE_PATTERN =
  /割引.*?(-\d[\d,]+)/;

/**
 * extractReceiptItems
 * OCR テキストからレシートの商品明細一覧を抽出する。
 *
 * @param {string} text - OCR生テキスト
 * @returns {Array<{name, amount, quantity, unitPrice, isDiscount}>}
 *
 * 【精度について】
 * OCRの認識精度に依存するため、必ずユーザー確認を挟むこと。
 * 完全自動登録はせず「候補として提示 → ユーザーが選択・修正」の設計を維持する。
 */
export const extractReceiptItems = (text) => {
  if (!text) return [];

  const lines   = text.split("\n").map(l => l.trim()).filter(Boolean);
  const results = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // スキップ対象
    if (SKIP_PATTERNS.some(p => p.test(line))) { i++; continue; }

    // 割引行
    const discountMatch = DISCOUNT_LINE_PATTERN.exec(line);
    if (discountMatch) {
      const amount = parseInt(discountMatch[1].replace(/,/g, ""));
      if (amount < 0 && results.length > 0) {
        results.push({
          name:      "割引",
          amount,
          quantity:  1,
          unitPrice: amount,
          isDiscount: true,
        });
      }
      i++; continue;
    }

    // 商品行
    const itemMatch = ITEM_LINE_PATTERN.exec(line);
    if (itemMatch) {
      let name      = itemMatch[1]
        .replace(/^外\d+\s*/, "")        // 税区分を除去
        .replace(/\s+特$/, "")           // 特売マークを除去
        .replace(/P\d{8,}/, "")         // バーコードを除去
        .trim();
      let amount    = parseInt(itemMatch[2].replace(/,/g, ""));
      let quantity  = 1;
      let unitPrice = amount;

      if (!name || name.length < 1 || name.length > 40) { i++; continue; }
      if (isNaN(amount) || amount === 0)                  { i++; continue; }

      // 次の行が数量行かチェック（例: "(2個 × @298)"）
      const nextLine = lines[i + 1] || "";
      const qtyMatch = QUANTITY_LINE_PATTERN.exec(line) || QUANTITY_LINE_PATTERN.exec(nextLine);
      if (qtyMatch) {
        quantity  = parseInt(qtyMatch[1]);
        unitPrice = parseInt(qtyMatch[2].replace(/,/g, ""));
        if (nextLine && QUANTITY_LINE_PATTERN.test(nextLine)) i++; // 次行をスキップ
      }

      results.push({ name, amount: Math.abs(amount), quantity, unitPrice, isDiscount: false });
    }

    i++;
  }

  return results;
};

/**
 * normalizeReceiptItems
 * extractReceiptItems の結果を TransactionItem 配列に変換する。
 * 商品名の正規化・重複集約・カテゴリ推定を行う。
 *
 * @param {Array}  rawItems  - extractReceiptItems の結果
 * @param {Array}  allRules  - カテゴリ推定ルール
 * @param {Function} predict - predictCategory 関数
 * @returns {Array<TransactionItem>}
 */
export const normalizeReceiptItems = (rawItems, allRules = [], predict = null) => {
  if (!rawItems?.length) return [];

  // 商品名の正規化
  const normalize = (name) =>
    String(name).trim()
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/\s+/g, " ")
      .trim();

  // 重複集約: 同じ商品名が連続する場合は合算
  const aggregated = rawItems.reduce((acc, item) => {
    if (item.isDiscount) {
      acc.push({ ...item, name: "割引" });
      return acc;
    }
    const normName = normalize(item.name);
    const last     = acc[acc.length - 1];
    if (last && normalize(last.name) === normName && !last.isDiscount) {
      last.amount   += item.amount;
      last.quantity += item.quantity;
    } else {
      acc.push({ ...item, name: normName });
    }
    return acc;
  }, []);

  // TransactionItem に変換
  return aggregated.map(item => {
    const category = predict
      ? predict(item.name, allRules)?.topCategory || "その他"
      : "その他";

    return createTransactionItem({
      name:      item.name,
      amount:    item.amount,
      quantity:  item.quantity,
      unitPrice: item.unitPrice || (item.quantity > 1 ? Math.round(item.amount / item.quantity) : item.amount),
      type:      "personal",
      category,
      memo:      item.isDiscount ? "割引" : "",
    });
  });
};
