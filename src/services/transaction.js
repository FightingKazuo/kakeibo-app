// ============================================================
// services/transaction.js
// Transaction データモデル v2 — items / store / paymentMethod 対応
//
// 【設計方針】
// ・createTransaction は全フィールドを optional で受け取り fallback を設定
// ・既存コードの呼び出し箇所は一切変更不要
// ・normalizeTransaction で旧データを安全に新構造へ変換
// ============================================================

import { safeDate, safeAmount } from "../utils/format";

// ============================================================
// 型定義（JSDoc / TypeScript 参照用コメント）
//
// interface TransactionItem {
//   id:        string
//   name:      string       // 商品名
//   amount:    number       // 明細合計（unitPrice × quantity）
//   quantity:  number       // 数量
//   unitPrice: number       // 単価
//   type:      'personal' | 'shared'   // 個人 / 共有
//   category:  string
//   memo:      string
// }
//
// interface Transaction {
//   id:                  string
//   date:                string        // YYYY-MM-DD
//   label:               string        // 店舗名・取引名（表示用）
//   amount:              number        // 負=支出 / 正=収入
//   category:            string
//   type:                'income' | 'expense'
//   source:              'manual' | 'ocr' | 'csv' | 'import'
//   paymentMethod:       'cash' | 'credit' | 'debit' | 'qr' | 'ic' | 'other' | null
//   store:               { name: string; branch: string } | null
//   items:               TransactionItem[]
//   tags:                string[]
//   linkedTransactionId: string | null   // 分割払いなどで関連取引を紐付け
//   receiptText:         string | null   // OCR生テキスト
//   matched:             MatchInfo | null
//   accountId:           string | null   // Day8: 口座・カード紐付け
//   createdAt:           string
//   updatedAt:           string
// }
// ============================================================

const genId = () =>
  `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

// ─── TransactionItem ファクトリ ──────────────────────────────
export const createTransactionItem = ({
  name        = "（商品名なし）",
  amount      = 0,
  quantity    = 1,
  unitPrice   = null,
  type        = "personal",
  category    = "その他",
  memo        = "",
} = {}) => ({
  id:        genId(),
  name:      String(name).trim() || "（商品名なし）",
  amount:    safeAmount(amount),
  quantity:  Math.max(1, Number(quantity) || 1),
  unitPrice: unitPrice !== null ? safeAmount(unitPrice) : safeAmount(amount),
  type:      type === "shared" ? "shared" : "personal",
  category:  String(category || "その他"),
  memo:      String(memo || ""),
});

// ─── Transaction ファクトリ ───────────────────────────────────
// 【後方互換保証】
// 既存の createTransaction({ date, label, amount, type, source }) は
// そのまま動作する。新フィールドはすべて省略可能。
export const createTransaction = ({
  // 既存フィールド（必須）
  date,
  label,
  amount,
  type,
  category    = "その他",
  // 既存 optional
  source      = "manual",
  receiptText = null,
  matched     = null,
  // ★新規フィールド（すべて optional）
  paymentMethod       = null,   // 'cash' | 'credit' | 'debit' | 'qr' | 'ic' | 'other'
  store               = null,   // { name, branch }
  items               = [],     // TransactionItem[]
  tags                = [],     // string[]
  linkedTransactionId = null,   // 関連取引ID
  accountId           = null,   // Day8用
} = {}) => {
  const now = new Date().toISOString();
  return {
    id:       genId(),
    date:     safeDate(date),
    label:    String(label || "").trim() || "（内容なし）",
    amount:   safeAmount(amount),
    category: String(category || "その他"),
    type:     type === "income" ? "income" : "expense",
    source:   ["manual","ocr","csv","import"].includes(source) ? source : "manual",

    paymentMethod:       paymentMethod || null,
    store:               store
      ? { name: String(store.name || "").trim(), branch: String(store.branch || "") }
      : null,
    items:               Array.isArray(items)
      ? items.map(i => createTransactionItem(i))
      : [],
    tags:                Array.isArray(tags) ? tags.filter(Boolean) : [],
    linkedTransactionId: linkedTransactionId || null,

    receiptText,
    matched,
    accountId,
    createdAt: now,
    updatedAt: now,
  };
};

// ─── 旧データ互換 normalizer ─────────────────────────────────
/**
 * normalizeTransaction
 * localStorage に保存された旧フォーマットのデータを新構造に変換する。
 * 存在しないフィールドには安全なデフォルト値を補完する。
 *
 * 【使用場所】: App.jsx の useState 初期化時
 *   loadStorage(STORAGE_KEYS.TRANSACTIONS, SAMPLE_TX).map(normalizeTransaction)
 */
export const normalizeTransaction = (raw) => {
  if (!raw || typeof raw !== "object") return null;
  const now = new Date().toISOString();

  // store: 旧データは label を store.name として使用
  const store = raw.store
    ? { name: String(raw.store.name || "").trim(), branch: String(raw.store.branch || "") }
    : raw.label
      ? { name: String(raw.label).trim(), branch: "" }
      : null;

  // items: 旧データには存在しないので空配列
  const items = Array.isArray(raw.items)
    ? raw.items.map(i => ({
        id:        i.id        || genId(),
        name:      String(i.name      || "").trim() || "（商品名なし）",
        amount:    safeAmount(i.amount),
        quantity:  Number(i.quantity)  || 1,
        unitPrice: safeAmount(i.unitPrice || i.amount),
        type:      i.type === "shared" ? "shared" : "personal",
        category:  String(i.category  || "その他"),
        memo:      String(i.memo      || ""),
      }))
    : [];

  return {
    id:                  raw.id || genId(),
    date:                safeDate(raw.date),
    label:               String(raw.label || "").trim() || "（内容なし）",
    amount:              safeAmount(raw.amount),
    category:            String(raw.category || "その他"),
    type:                raw.type === "income" ? "income" : "expense",
    source:              raw.source || "manual",

    paymentMethod:       raw.paymentMethod       || null,
    store,
    items,
    tags:                Array.isArray(raw.tags) ? raw.tags : [],
    linkedTransactionId: raw.linkedTransactionId || null,

    receiptText:         raw.receiptText         || null,
    matched:             raw.matched             || null,
    accountId:           raw.accountId           || null,

    createdAt:           raw.createdAt || now,
    updatedAt:           raw.updatedAt || raw.createdAt || now,
  };
};

// ─── items 合計検証 ───────────────────────────────────────────
/**
 * validateItemsTotal
 * items.amount の合計が transaction.amount（絶対値）と一致するか検証する。
 *
 * @returns {{ valid: boolean, diff: number, warning?: string }}
 *
 * 【誤差の許容範囲】
 * 1円以下の誤差は消費税の端数計算などで発生しうるため許容。
 * 2円以上の差異は警告対象とする。
 */
export const validateItemsTotal = (transaction) => {
  const { items = [], amount } = transaction;
  if (!items.length) return { valid: true, diff: 0 };

  const itemsTotal = items.reduce((s, item) => s + safeAmount(item.amount), 0);
  const txAbsAmt   = Math.abs(safeAmount(amount));
  const diff       = Math.abs(itemsTotal - txAbsAmt);

  if (diff <= 1) return { valid: true, diff };

  return {
    valid:   false,
    diff,
    warning: `明細合計（¥${itemsTotal.toLocaleString()}）と取引金額（¥${txAbsAmt.toLocaleString()}）が ¥${diff} ずれています`,
  };
};

// ─── 既存ロジック（重複チェック・正規化）────────────────────────

const HAN_ZEN = {
  'ｦ':'ヲ','ｧ':'ァ','ｨ':'ィ','ｩ':'ゥ','ｪ':'ェ','ｫ':'ォ','ｬ':'ャ','ｭ':'ュ','ｮ':'ョ',
  'ｯ':'ッ','ｰ':'ー','ｱ':'ア','ｲ':'イ','ｳ':'ウ','ｴ':'エ','ｵ':'オ','ｶ':'カ','ｷ':'キ',
  'ｸ':'ク','ｹ':'ケ','ｺ':'コ','ｻ':'サ','ｼ':'シ','ｽ':'ス','ｾ':'セ','ｿ':'ソ','ﾀ':'タ',
  'ﾁ':'チ','ﾂ':'ツ','ﾃ':'テ','ﾄ':'ト','ﾅ':'ナ','ﾆ':'ニ','ﾇ':'ヌ','ﾈ':'ネ','ﾉ':'ノ',
  'ﾊ':'ハ','ﾋ':'ヒ','ﾌ':'フ','ﾍ':'ヘ','ﾎ':'ホ','ﾏ':'マ','ﾐ':'ミ','ﾑ':'ム','ﾒ':'メ',
  'ﾓ':'モ','ﾔ':'ヤ','ﾕ':'ユ','ﾖ':'ヨ','ﾗ':'ラ','ﾘ':'リ','ﾙ':'ル','ﾚ':'レ','ﾛ':'ロ',
  'ﾜ':'ワ','ﾝ':'ン',
};

export const normalizeStoreName = (name) => {
  if (!name) return "";
  return String(name).trim()
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[ｦ-ﾟ]/g, c => HAN_ZEN[c] || c)
    .toLowerCase()
    .replace(/株式会社|有限会社|合同会社|㈱|㈲/g, "")
    .replace(/ストア100|ストアー?|コンビニエンスストア/g, "")
    .replace(/[　 \-－・]/g, "")
    .replace(/\d+/g, "")
    .replace(/(号店|支店|店舗|店)$/g, "");
};

const levenshteinSim = (a, b) => {
  if (!a && !b) return 1; if (!a || !b) return 0; if (a === b) return 1;
  const la = a.length, lb = b.length;
  const dp = Array.from({length:la+1},(_,i) =>
    Array.from({length:lb+1},(_,j) => i===0?j:j===0?i:0));
  for (let i=1;i<=la;i++) for (let j=1;j<=lb;j++)
    dp[i][j] = a[i-1]===b[j-1] ? dp[i-1][j-1]
      : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return 1 - dp[la][lb] / Math.max(la, lb);
};

export const compareTransactions = (txA, txB) => {
  const normA = normalizeStoreName(txA.label), normB = normalizeStoreName(txB.label);
  const storeScore = normA===normB ? 1
    : Math.max(levenshteinSim(normA,normB), (normA.includes(normB)||normB.includes(normA))?0.8:0);
  const absA = Math.abs(txA.amount), absB = Math.abs(txB.amount);
  const r = absA && absB ? Math.min(absA,absB)/Math.max(absA,absB) : 0;
  const amountScore = absA===absB ? 1 : r>=0.95 ? 0.8 : r>=0.9 ? 0.5 : 0;
  const diffDays = Math.abs(new Date(txA.date)-new Date(txB.date))/86400000;
  const dateScore = diffDays===0?1:diffDays<=1?0.7:diffDays<=3?0.3:diffDays<=7?0.1:0;
  const totalScore = Math.round(amountScore*50+dateScore*30+storeScore*20);
  const reasons = [];
  if (amountScore>=1) reasons.push("金額が完全一致"); else if(amountScore>=0.8) reasons.push("金額がほぼ一致");
  if (dateScore>=1)   reasons.push("同じ日付");       else if(dateScore>=0.7)   reasons.push("日付が1日以内");
  if (storeScore>=1)  reasons.push("店舗名が一致");    else if(storeScore>=0.7)  reasons.push("店舗名が類似");
  return { totalScore, amountScore:Math.round(amountScore*100), dateScore:Math.round(dateScore*100), storeScore:Math.round(storeScore*100), reasons };
};

export const findDuplicateCandidates = (newTx, existingTxs, threshold=60) => {
  const newDate = new Date(newTx.date);
  return existingTxs
    .filter(tx => Math.abs(newDate-new Date(tx.date))/86400000 <= 14)
    .map(tx => ({ transaction:tx, comparison:compareTransactions(newTx,tx) }))
    .filter(s => s.comparison.totalScore >= threshold)
    .sort((a,b) => b.comparison.totalScore-a.comparison.totalScore);
};

export const DUPLICATE_KEY = (t) => `${t.date}|${t.amount}|${t.label}`;
