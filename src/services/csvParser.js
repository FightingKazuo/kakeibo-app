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
 * detectCSVFormat
 * CSVテキストの内容からフォーマットを自動判定する。
 *
 * 判定ロジック:
 *   先頭8行のテキストから各フォーマット固有の列名・パターンを検索する。
 *   判定できない場合は "generic" を返す。
 */
export const detectCSVFormat = (text) => {
  const lines  = text.split('\n').map(l => l.trim()).filter(Boolean);
  const header = lines.slice(0, 8).join('\n');

  // PayPay: 全角括弧の「出金金額（円）」が特徴
  if (header.includes('出金金額（円）') && header.includes('取引先')) return 'paypay';

  // 住信SBIネット銀行: 残高列がある
  if (header.includes('残高(円)') || header.includes('残高（円）')) return 'sbi';

  // マネーフォワードME: 大項目・振替列がある
  if (header.includes('大項目') || (header.includes('振替') && header.includes('金額（円）'))) return 'moneyforward';

  // リクルートカード: ¥マーク付きの利用金額列
  if (header.includes('ご利用金額(￥)') || header.includes('ご利用金額(¥)')) return 'recruit';

  // エポスカード: 円表記の利用金額列
  if (header.includes('ご利用金額(円)') && header.includes('ご利用先')) return 'epos';

  // 三井住友カード:
  //   1行目がカード情報（様・VISA・****が含まれる）
  //   2行目以降が YYYY/MM/DD 形式の日付で始まる
  const first = lines[0] || '';
  const second = lines[1] || '';
  if (
    (first.includes('様') || first.includes('ＶＩＳＡ') || first.includes('VISA') || first.includes('****')) &&
    /^\d{4}\/\d{2}\/\d{2}[,，]/.test(second)
  ) return 'smbc';

  // ヘッダーなしで日付始まりのデータ行 → 三井住友可能性
  if (/^\d{4}\/\d{2}\/\d{2}[,，]/.test(first)) return 'smbc';

  return 'generic';
};

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
