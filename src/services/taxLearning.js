// ============================================================
// services/taxLearning.js
// 消費税学習システム
//
// 店舗ごとの税率（8%/10%）を学習・記憶する
// OCRで品目合計とレシート合計の差額から自動推定
// ============================================================

const TAX_STORAGE_KEY = "kakeibo_tax_rules";

// ─── 税率の推定 ──────────────────────────────────────────────
/**
 * 品目合計とレシート合計から税率を推定する
 * @returns { rate: 0.08 | 0.10 | null, type: "inclusive" | "exclusive" | null }
 */
export const estimateTaxRate = (itemsTotal, receiptTotal) => {
  if (!itemsTotal || !receiptTotal) return { rate: null, type: null };
  const diff = receiptTotal - itemsTotal;
  if (Math.abs(diff) < 2) return { rate: null, type: "inclusive" }; // 差なし=税込み表示

  const ratio = diff / itemsTotal;
  if (Math.abs(ratio - 0.10) < 0.005) return { rate: 0.10, type: "exclusive" };
  if (Math.abs(ratio - 0.08) < 0.005) return { rate: 0.08, type: "exclusive" };

  // 混在（軽減税率あり）
  if (ratio > 0.07 && ratio < 0.11) return { rate: ratio, type: "mixed" };

  return { rate: null, type: null };
};

// ─── 学習 ────────────────────────────────────────────────────
export const learnTaxRule = (storeName, itemsTotal, receiptTotal) => {
  if (!storeName) return;
  const { rate, type } = estimateTaxRate(itemsTotal, receiptTotal);
  if (!rate && type !== "inclusive") return;

  try {
    const rules = JSON.parse(localStorage.getItem(TAX_STORAGE_KEY) || "{}");
    rules[storeName] = {
      rate:      rate || 0,
      type:      type || "inclusive",
      learnedAt: new Date().toISOString(),
      samples:   (rules[storeName]?.samples || 0) + 1,
    };
    localStorage.setItem(TAX_STORAGE_KEY, JSON.stringify(rules));
  } catch {}
};

// ─── 取得 ────────────────────────────────────────────────────
export const getTaxRule = (storeName) => {
  try {
    const rules = JSON.parse(localStorage.getItem(TAX_STORAGE_KEY) || "{}");
    return rules[storeName] || null;
  } catch { return null; }
};

export const getAllTaxRules = () => {
  try {
    return JSON.parse(localStorage.getItem(TAX_STORAGE_KEY) || "{}");
  } catch { return {}; }
};

export const removeTaxRule = (storeName) => {
  try {
    const rules = JSON.parse(localStorage.getItem(TAX_STORAGE_KEY) || "{}");
    delete rules[storeName];
    localStorage.setItem(TAX_STORAGE_KEY, JSON.stringify(rules));
  } catch {}
};

// ─── 消費税差額の説明文を生成 ─────────────────────────────────
export const describeTaxDiff = (storeName, itemsTotal, receiptTotal) => {
  const diff = receiptTotal - itemsTotal;
  if (Math.abs(diff) < 2) return null;

  const rule = getTaxRule(storeName);
  if (diff > 0) {
    const rateStr = rule?.rate ? `（${Math.round(rule.rate * 100)}%）` : "";
    return `消費税等${rateStr} +¥${diff.toLocaleString()}`;
  } else {
    return `値引き等 -¥${Math.abs(diff).toLocaleString()}`;
  }
};
