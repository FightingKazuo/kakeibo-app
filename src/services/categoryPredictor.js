// ============================================================
// categoryPredictor.js
// ============================================================

// ─── ラベル正規化 ────────────────────────────────────────────
// エポスカードのAP/ QP/ などのプレフィックスも除去
const normLabel = s => s
  ? s.toLowerCase()
      .replace(/^(ap|qp|ap\/|qp\/)/, "")        // エポスのプレフィックス除去
      .replace(/^[a-z]{1,3}\//, "")              // 汎用プレフィックス除去（例: QP/）
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/[（(].*$/, "")                    // 括弧以降を除去（店舗名の末尾ノイズ）
      .replace(/\s+/g, "").trim()
  : "";

export const predictCategory = (label, allRules) => {
  if (!label || label.length < 2)
    return { predictions: [], topCategory: "", topConfidence: 0, isConfident: false };
  const nl = normLabel(label);
  const bycat = {};
  for (const rule of allRules) {
    for (const kw of rule.keywords) {
      const nk = normLabel(kw);
      if (!nk) continue;
      let score = 0;
      if (nl === nk) score = rule.priority;
      else if (nl.includes(nk) || nk.includes(nl))
        score = Math.round(rule.priority * (nk.length / Math.max(nl.length, 1) < 0.3 ? 0.8 : 1));
      if (score > 0 && (!bycat[rule.category] || bycat[rule.category].score < score))
        bycat[rule.category] = { score, type: rule.type };
    }
  }
  const preds = Object.entries(bycat)
    .sort((a, b) => b[1].score - a[1].score).slice(0, 4)
    .map(([cat, v]) => ({ category: cat, type: v.type, confidence: Math.min(v.score, 99) }));
  const top = preds[0];
  return top
    ? { predictions: preds, topCategory: top.category, topConfidence: top.confidence, isConfident: top.confidence >= 75 }
    : { predictions: [], topCategory: "", topConfidence: 0, isConfident: false };
};

export const learnCategoryRule = (label, category, type, existingRules) => {
  if (!label || !category) return existingRules;
  const filtered = existingRules.filter(r => !r.keywords.includes(label));
  return [...filtered, {
    id:        `l_${Date.now()}`,
    keywords:  [label],
    category,
    type,
    priority:  100,
    learnedAt: new Date().toISOString(),
    source:    "user_correction",
  }];
};
