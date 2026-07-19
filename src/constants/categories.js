// ============================================================
// constants/categories.js
// カテゴリ定義・表示用定数
// ============================================================

export const DEFAULT_CATS = [
  // ── 支出（マネーフォワード準拠）──────────────────────────────
  { id: "c1",  name: "食費",         emoji: "🍱", type: "expense" },
  { id: "c2",  name: "外食",         emoji: "🍜", type: "expense" },
  { id: "c13", name: "日用品",       emoji: "🧴", type: "expense" },
  { id: "c5",  name: "趣味・娯楽",   emoji: "🎬", type: "expense" },
  { id: "c18", name: "交際費",       emoji: "👥", type: "expense" },
  { id: "c3",  name: "交通費",       emoji: "🚃", type: "expense" },
  { id: "c19", name: "衣服・美容",   emoji: "👕", type: "expense" },
  { id: "c8",  name: "健康・医療",   emoji: "🏥", type: "expense" },
  { id: "c7",  name: "自動車",       emoji: "🚗", type: "expense" },
  { id: "c20", name: "教養・教育",   emoji: "📚", type: "expense" },
  { id: "c21", name: "特別な支出",   emoji: "🎪", type: "expense" },
  { id: "c4",  name: "水道・光熱費", emoji: "💡", type: "expense" },
  { id: "c6",  name: "通信費",       emoji: "📱", type: "expense" },
  { id: "c22", name: "住宅",         emoji: "🏡", type: "expense" },
  { id: "c23", name: "税・社会保障", emoji: "🏛", type: "expense" },
  { id: "c24", name: "保険",         emoji: "🛡", type: "expense" },
  { id: "c14", name: "投資",         emoji: "📈", type: "expense" },
  { id: "c9",  name: "その他",       emoji: "📦", type: "expense" },
  // ── 収入 ─────────────────────────────────────────────────────
  { id: "c10", name: "給料",         emoji: "💴", type: "income" },
  { id: "c11", name: "副業",         emoji: "💻", type: "income" },
  { id: "c12", name: "ボーナス",     emoji: "🎁", type: "income" },
  { id: "c16", name: "割り勘戻り",   emoji: "🔄", type: "income" },
  { id: "c17", name: "その他収入",   emoji: "💰", type: "income" },
];

export const PIE_COLORS = [
  "#6366f1", "#10b981", "#f43f5e", "#f59e0b",
  "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16",
];

export const SOURCE_CFG = {
  ocr:     { label: "📷 OCR",    cls: "bg-purple-100 text-purple-700"  },
  csv:     { label: "📊 CSV",    cls: "bg-emerald-100 text-emerald-700" },
  manual:  { label: "✏️ 手動",   cls: "bg-gray-100 text-gray-600"      },
  partner: { label: "👤 M申請",  cls: "bg-pink-100 text-pink-700"      },
};
