export const fmtCurrency = (n) =>
  new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" }).format(Math.abs(n));

export const todayStr = () => new Date().toISOString().split("T")[0];

export const toYM = (d) => d?.slice(0, 7) ?? "";

// ③ 不正な日付への防御
export const safeDate = (str) => {
  if (!str) return todayStr();
  const d = new Date(str);
  return isNaN(d.getTime()) ? todayStr() : str;
};

// ③ NaN防御
export const safeAmount = (val) => {
  const n = parseFloat(String(val).replace(/[¥,\s]/g, ""));
  return isNaN(n) ? 0 : n;
};
