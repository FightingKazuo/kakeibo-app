// ============================================================
// constants.js
// 後方互換のためのre-exportファイル
// 実体は constants/ フォルダ以下に分割済み
// ============================================================

export { STORAGE_KEYS }                                              from "./constants/storage";
export { DEFAULT_MEMBERS, DEFAULT_POINT_ACCOUNTS, PAYMENT_METHODS } from "./constants/members";
export { DEFAULT_CATS, PIE_COLORS, SOURCE_CFG }                     from "./constants/categories";
export { DEFAULT_CATEGORY_RULES, BANK_CARD_MAPPING }                from "./constants/categoryRules";
export { CSV_FORMATS }                                               from "./constants/csvFormats";

// CSV取り込みソース定義（インライン定義でcsvSources.jsファイル不要）
export const CSV_SOURCES_ALL = [
  { id: "sbi",     label: "住信SBI銀行",     short: "SBI",  icon: "🏦" },
  { id: "epos",    label: "エポスカード",     short: "EPOS", icon: "💳" },
  { id: "smbc",    label: "三井住友カード",   short: "三井", icon: "💳" },
  { id: "paypay",  label: "PayPay",           short: "PPay", icon: "💛" },
  { id: "recruit", label: "リクルートカード", short: "RC",   icon: "💳" },
  { id: "mufg",    label: "三菱UFJ銀行",      short: "UFJ",  icon: "🏦" },
  { id: "amazon",  label: "Amazon",           short: "AMZ",  icon: "📦" },
  { id: "rakuten", label: "楽天カード",       short: "楽天", icon: "💳" },
];
