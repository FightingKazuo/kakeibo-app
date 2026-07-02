// ============================================================
// services/transaction.js  — v2 + paidBy/shareType/paymentMethod対応
// ============================================================

import { safeDate, safeAmount } from "../utils/format";

const genId = () =>
  `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

export const createTransactionItem = ({
  name      = "（商品名なし）",
  amount    = 0,
  quantity  = 1,
  unitPrice = null,
  type      = "personal",
  category  = "その他",
  memo      = "",
} = {}) => ({
  id:        genId(),
  name:      String(name).trim() || "（商品名なし）",
  amount:    safeAmount(amount),
  quantity:  Math.max(1, Number(quantity) || 1),
  unitPrice: unitPrice !== null ? safeAmount(unitPrice) : safeAmount(amount),
  type:      ["shared","personal","partner"].includes(type) ? type : "shared",
  category:  String(category || "その他"),
  memo:      String(memo || ""),
});

export const createTransaction = ({
  date,
  label,
  amount,
  type,
  category          = "その他",
  source            = "manual",
  receiptText       = null,
  matched           = null,
  // 支払者・共有区分
  paidBy            = null,
  shareType         = null,
  paymentMethod     = null,
  pointAccountId    = null,
  // 品目
  store             = null,
  items             = [],
  tags              = [],
  linkedTransactionId = null,
  accountId         = null,
  // 振替フラグ
  isTransfer        = false,
  isCardWithdrawal  = false,
  // ウエルシア20日等：精算時に使う実質金額（÷1.5など）
  shareAmount       = null,
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

    paidBy:           paidBy            || null,
    shareType:        shareType         || null,
    paymentMethod:    paymentMethod     || null,
    pointAccountId:   pointAccountId    || null,
    isTransfer:       isTransfer        || false,
    isCardWithdrawal: isCardWithdrawal  || false,
    shareAmount:      shareAmount !== null ? safeAmount(shareAmount) : null,

    store:  store
      ? { name: String(store.name || "").trim(), branch: String(store.branch || "") }
      : null,
    items: Array.isArray(items) ? items.map(i => createTransactionItem(i)) : [],
    tags:  Array.isArray(tags)  ? tags.filter(Boolean) : [],
    linkedTransactionId: linkedTransactionId || null,

    receiptText,
    matched,
    accountId,
    createdAt: now,
    updatedAt: now,
  };
};

// ─── 旧データ互換 normalizer ─────────────────────────────────
export const normalizeTransaction = (raw) => {
  if (!raw || typeof raw !== "object") return null;
  const now = new Date().toISOString();

  const store = raw.store
    ? { name: String(raw.store.name || "").trim(), branch: String(raw.store.branch || "") }
    : raw.label
      ? { name: String(raw.label).trim(), branch: "" }
      : null;

  const items = Array.isArray(raw.items)
    ? raw.items.map(i => ({
        id:           i.id        || genId(),
        name:         String(i.name      || "").trim() || "（商品名なし）",
        amount:       safeAmount(i.amount),
        quantity:     Number(i.quantity)  || 1,
        unitPrice:    safeAmount(i.unitPrice || i.amount),
        amountExclTax: i.amountExclTax != null ? safeAmount(i.amountExclTax) : undefined,
        taxRate:      i.taxRate || null,
        type:         ["shared","personal","partner"].includes(i.type) ? i.type : "shared",
        category:     String(i.category  || "その他"),
        memo:         String(i.memo      || ""),
      }))
    : [];

  return {
    id:               raw.id || genId(),
    date:             safeDate(raw.date),
    label:            String(raw.label || "").trim() || "（内容なし）",
    amount:           safeAmount(raw.amount),
    category:         String(raw.category || "その他"),
    type:             raw.type === "income" ? "income" : "expense",
    source:           raw.source || "manual",

    // ★ 支払者・共有区分・支払方法（旧データにも対応）
    paidBy:           raw.paidBy          || null,
    shareType:        raw.shareType       || null,
    paymentMethod:    raw.paymentMethod   || null,
    pointAccountId:   raw.pointAccountId  || null,
    isTransfer:       raw.isTransfer      || false,
    isCardWithdrawal: raw.isCardWithdrawal || false,
    shareAmount:      raw.shareAmount != null ? safeAmount(raw.shareAmount) : null,
    csvFormatId:      raw.csvFormatId      || null,

    store,
    items,
    tags:             Array.isArray(raw.tags) ? raw.tags : [],
    linkedTransactionId: raw.linkedTransactionId || null,
    receiptText:      raw.receiptText     || null,
    matched:          raw.matched         || null,
    accountId:        raw.accountId       || null,
    createdAt:        raw.createdAt       || now,
    updatedAt:        raw.updatedAt       || raw.createdAt || now,
  };
};

// ─── items 合計検証 ───────────────────────────────────────────
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

// ─── 店舗名正規化 ─────────────────────────────────────────────
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

