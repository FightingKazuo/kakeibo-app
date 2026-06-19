// ============================================================
// constants/members.js
// メンバー・ポイント口座・支払方法のデフォルト値
// ============================================================

export const DEFAULT_MEMBERS = [
  { id: "m1", name: "自分" },
  { id: "m2", name: "パートナー" },
];

export const DEFAULT_POINT_ACCOUNTS = [
  { id: "pa1", name: "Tポイント",   icon: "🟡", unit: "円", balance: 0 },
  { id: "pa2", name: "WAON",        icon: "🔵", unit: "円", balance: 0 },
  { id: "pa3", name: "楽天ポイント", icon: "🔴", unit: "円", balance: 0 },
  { id: "pa4", name: "PayPay",      icon: "💛", unit: "円", balance: 0 },
];

export const PAYMENT_METHODS = {
  cash: { id: "cash", name: "現金/カード", icon: "💳" },
};
