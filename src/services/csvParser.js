// ============================================================
// services/csvParser.js
// CSV インポートのパーサー
// Shift-JIS / UTF-8 / UTF-8 BOM に対応
// ============================================================
import Papa from "papaparse";
import { CSV_FORMATS } from "../constants";
import { safeAmount, safeDate } from "../utils/format";

/**
 * Shift-JIS バイト列を判定する簡易チェック
 * UTF-8 としてデコードした際に文字化けが多ければ Shift-JIS と判断
 */
const looksLikeShiftJIS = (text) => {
  // 文字化け記号（UTF-8 で Shift-JIS を読むと出やすい文字）の割合を確認
  const mojibake = (text.match(/[ï¿½Â¿Â½]/g) || []).length;
  return mojibake > 3;
};

/**
 * ファイルを読み込み、適切なエンコードでデコードする
 * UTF-8 → Shift-JIS の順で試みる
 */
export const readCSVFile = (file) => new Promise((resolve, reject) => {
  const readerUTF8 = new FileReader();
  readerUTF8.onload = (e) => {
    const utf8Text = e.target.result;
    if (looksLikeShiftJIS(utf8Text)) {
      // Shift-JIS で再読み込み
      const readerSJIS = new FileReader();
      readerSJIS.onload = (e2) => {
        const decoder = new TextDecoder("shift-jis");
        const buffer  = e2.target.result;
        resolve(decoder.decode(buffer));
      };
      readerSJIS.onerror = reject;
      readerSJIS.readAsArrayBuffer(file);
    } else {
      resolve(utf8Text);
    }
  };
  readerUTF8.onerror = reject;
  readerUTF8.readAsText(file, "UTF-8");
});

/**
 * CSV テキストをパースして取引配列に変換する
 * ③ 不正データ（日付なし・金額0・空行）を自動除外
 */
export const parseCSVText = (text, formatId) => {
  let result;
  try {
    result = Papa.parse(text, { header: true, skipEmptyLines: true });
  } catch {
    return [];
  }
  const fmt = CSV_FORMATS[formatId] || CSV_FORMATS.generic;
  return result.data
    .map((r, i) => {
      try {
        const n = fmt.normalize(r);
        if (!n) return null;                            // フォーマット側でスキップ
        if (!n.date) return null;                       // 日付なし
        const amt = safeAmount(n.amount);
        if (amt === 0) return null;                     // 金額0
        return { ...n, date: safeDate(n.date), amount: amt, _i: i };
      } catch { return null; }
    })
    .filter(Boolean);
};

export { default as Papa } from "papaparse";
