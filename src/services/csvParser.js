import Papa from "papaparse";
import { CSV_FORMATS } from "../constants";
import { safeAmount, safeDate } from "../utils/format";
import { DUPLICATE_KEY } from "./transaction";

export const parseCSVText = (text, formatId) => {
  let result;
  try {
    result = Papa.parse(text, { header:true, skipEmptyLines:true });
  } catch {
    return [];
  }
  const fmt = CSV_FORMATS[formatId] || CSV_FORMATS.generic;
  return result.data
    .map((r, i) => {
      try {
        const n = fmt.normalize(r);
        // ③ 不正データ除外
        if (!n.date || !n.label) return null;
        const amt = safeAmount(n.amount);
        if (amt === 0) return null;
        return {
          ...n,
          date:   safeDate(n.date),
          amount: amt,
          _i: i,
        };
      } catch { return null; }
    })
    .filter(Boolean);
};

export { DUPLICATE_KEY };
