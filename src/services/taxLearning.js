// ============================================================
// services/taxLearning.js
// 消費税計算システム v2
//
// 方針：
//   差額がある（税抜き表示）→ 全品目8%で税込計算
//   残差は「消費税等」にまとめる（最小化）
//   差額なし（税込み表示）→ そのまま
// ============================================================

const TAX_STORAGE_KEY = "kakeibo_tax_rules";

// ─── 税込み変換 ──────────────────────────────────────────────
/**
 * 品目合計とレシート合計の差から税抜き表示か判定し、
 * 税込み価格に変換した品目リストと残差を返す
 *
 * @returns {{
 *   items: Array,           // 税込み価格に変換された品目
 *   tax8: number,           // 8%消費税合計
 *   remainder: number,      // 残差（消費税等）
 *   isTaxExclusive: boolean // 税抜き表示かどうか
 * }}
 */
export const calcTaxInclusive = (items, receiptTotal) => {
  if (!items || items.length === 0) {
    return { items, tax8: 0, remainder: 0, isTaxExclusive: false };
  }

  const itemsTotal = items.reduce((s, i) => s + i.amount, 0);
  const diff       = receiptTotal - itemsTotal;
  const diffRatio  = itemsTotal > 0 ? diff / itemsTotal : 0;

  // 差額が3%未満 → 税込み表示
  if (Math.abs(diffRatio) < 0.03) {
    return { items, tax8: 0, remainder: 0, isTaxExclusive: false };
  }

  // 差額が7〜11% → 税抜き表示と判断（8%または10%）
  if (diffRatio >= 0.07 && diffRatio <= 0.11) {
    const tax8      = Math.floor(itemsTotal * 0.08);
    const tax8Total = itemsTotal + tax8;
    const remainder = Math.round(receiptTotal - tax8Total);

    const convertedItems = items.map(item => ({
      ...item,
      amountExclTax: item.amount,                    // 税抜き価格を保存
      amount:        Math.round(item.amount * 1.08), // 8%税込みに変換
      taxRate:       8,
    }));
    return { items: convertedItems, tax8, remainder, isTaxExclusive: true };
  }

  // それ以外（値引き等）→ 残差だけ記録
  return { items, tax8: 0, remainder: Math.round(diff), isTaxExclusive: false };
};

// ─── 学習 ────────────────────────────────────────────────────
export const learnTaxRule = (storeName, itemsTotal, receiptTotal) => {
  if (!storeName || !itemsTotal || !receiptTotal) return;
  const diff      = receiptTotal - itemsTotal;
  const diffRatio = diff / itemsTotal;
  const type      = Math.abs(diffRatio) < 0.03 ? "inclusive" : "exclusive";

  try {
    const rules = JSON.parse(localStorage.getItem(TAX_STORAGE_KEY) || "{}");
    rules[storeName] = {
      type,
      diffRatio: Math.round(diffRatio * 1000) / 1000,
      learnedAt: new Date().toISOString(),
      samples:   (rules[storeName]?.samples || 0) + 1,
    };
    localStorage.setItem(TAX_STORAGE_KEY, JSON.stringify(rules));
  } catch {}
};

export const getTaxRule     = (storeName) => {
  try { return JSON.parse(localStorage.getItem(TAX_STORAGE_KEY) || "{}")[storeName] || null; }
  catch { return null; }
};

export const getAllTaxRules = () => {
  try { return JSON.parse(localStorage.getItem(TAX_STORAGE_KEY) || "{}"); }
  catch { return {}; }
};

export const removeTaxRule  = (storeName) => {
  try {
    const rules = JSON.parse(localStorage.getItem(TAX_STORAGE_KEY) || "{}");
    delete rules[storeName];
    localStorage.setItem(TAX_STORAGE_KEY, JSON.stringify(rules));
  } catch {}
};

// ─── 差額の説明文 ────────────────────────────────────────────
export const describeTaxDiff = (storeName, itemsTotal, receiptTotal) => {
  const diff = receiptTotal - itemsTotal;
  if (Math.abs(diff) < 2) return null;
  const ratio = diff / itemsTotal;
  if (diff > 0) return `消費税等 +¥${diff.toLocaleString()}（差額率${Math.round(ratio*100)}%）`;
  return `値引き等 -¥${Math.abs(diff).toLocaleString()}`;
};
