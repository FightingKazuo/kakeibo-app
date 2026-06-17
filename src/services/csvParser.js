// ============================================================
// services/csvParser.js
// CSV インポートのパーサー
// Shift-JIS / UTF-8 / UTF-8 BOM に対応
// ============================================================
import Papa from "papaparse";
import { CSV_FORMATS } from "../constants";
import { safeAmount, safeDate } from "../utils/format";

// ─── カード引き落とし系のキーワード（銀行明細の重複判定用）──
const CARD_WITHDRAWAL_KEYWORDS = [
  "口座振替", "カード引き落とし", "クレジット", "エポス", "三井住友",
  "イデミツクレジット", "jcb", "ＪＣＢ", "ポケットカード",
  "アマゾン", "amazon", "AMAZON",
];

const isCardWithdrawal = (label) => {
  const lower = label.toLowerCase();
  return CARD_WITHDRAWAL_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()));
};

// ─── 振替キーワード管理 ──────────────────────────────────────
const TRANSFER_STORAGE_KEY = "kakeibo_transfer_keywords";

const DEFAULT_TRANSFER_KEYWORDS = [
  "SBIハイブリッド預金", "振替", "ことら送金",
  "振込＊コバヤシ", "振込手数料",
];

export const getTransferKeywords = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(TRANSFER_STORAGE_KEY) || "[]");
    return [...DEFAULT_TRANSFER_KEYWORDS, ...stored];
  } catch { return DEFAULT_TRANSFER_KEYWORDS; }
};

export const learnTransferKeyword = (keyword) => {
  try {
    const stored = JSON.parse(localStorage.getItem(TRANSFER_STORAGE_KEY) || "[]");
    if (!stored.includes(keyword)) {
      stored.push(keyword);
      localStorage.setItem(TRANSFER_STORAGE_KEY, JSON.stringify(stored));
    }
  } catch {}
};

export const removeTransferKeyword = (keyword) => {
  try {
    const stored = JSON.parse(localStorage.getItem(TRANSFER_STORAGE_KEY) || "[]");
    const updated = stored.filter(k => k !== keyword);
    localStorage.setItem(TRANSFER_STORAGE_KEY, JSON.stringify(updated));
  } catch {}
};

const isTransferLabel = (label) => {
  const keywords = getTransferKeywords();
  return keywords.some(kw => label.includes(kw));
};

/**
 * Shift-JIS バイト列を判定する簡易チェック
 */
const looksLikeShiftJIS = (text) => {
  return (text.match(/\uFFFD/g) || []).length > 5;
};

/**
 * ファイルを読み込み、適切なエンコードでデコードする
 */
export const readCSVFile = (file) => new Promise((resolve, reject) => {
  const readerUTF8 = new FileReader();
  readerUTF8.onload = (e) => {
    const utf8Text = e.target.result;
    if (looksLikeShiftJIS(utf8Text)) {
      const readerSJIS = new FileReader();
      readerSJIS.onload = (e2) => {
        const decoder = new TextDecoder("shift-jis");
        resolve(decoder.decode(e2.target.result));
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
 * CSVテキストの内容からフォーマットを自動判定する
 */
export const detectCSVFormat = (text) => {
  const lines  = text.split('\n').map(l => l.trim()).filter(Boolean);
  const header = lines.slice(0, 8).join('\n');

  // PayPay: 全角括弧の「出金金額（円）」が特徴
  if (header.includes('出金金額（円）') && header.includes('取引先')) return 'paypay';

  // 住信SBIネット銀行: 残高列がある
  if (header.includes('残高(円)') || header.includes('残高（円）')) return 'sbi';

  // リクルートカード: ¥マーク付きの利用金額列
  if (header.includes('ご利用金額(￥)') || header.includes('ご利用金額(¥)')) return 'recruit';

  // エポスカード: 円表記の利用金額列
  if (header.includes('ご利用金額(円)') && header.includes('ご利用先')) return 'epos';

  // 三井住友カード / Amazonマスター:
  // 1行目がカード情報（様・VISA・****・アマゾンが含まれる）
  // 2行目以降が YYYY/MM/DD 形式の日付で始まる
  const first  = lines[0] || '';
  const second = lines[1] || '';
  if (
    (first.includes('様') || first.includes('ＶＩＳＡ') || first.includes('VISA') ||
     first.includes('****') || first.includes('マスター') || first.includes('アマゾン')) &&
    /^\d{4}\/\d{2}\/\d{2}[,，]/.test(second)
  ) return 'smbc';

  // ヘッダーなしで日付始まりのデータ行
  if (/^\d{4}\/\d{2}\/\d{2}[,，]/.test(first)) return 'smbc';

  return 'generic';
};

/**
 * CSV テキストをパースして取引配列に変換する
 */
export const parseCSVText = (text, formatId) => {
  let processText = text;

  // ── リクルートカード専用前処理 ──────────────────────────
  if (formatId === "recruit") {
    const lines = text.split("\n");
    const hi = lines.findIndex(
      l => l.includes("ご利用日") && l.includes("ご利用先")
    );
    if (hi > 0) processText = lines.slice(hi).join("\n");
  }

  // ── 三井住友 / Amazonマスター専用前処理 ────────────────
  // 1行目はカード名（ヘッダーなし）→ スキップしてヘッダーなしでパース
  if (formatId === "smbc") {
    const lines = text.split("\n").filter(l => l.trim());
    // 1行目（カード名行）をスキップ
    processText = lines.slice(1).join("\n");
  }

  let result;
  try {
    // smbcはヘッダーなし（数値インデックス）
    const hasHeader = formatId !== "smbc";
    result = Papa.parse(processText, {
      header: hasHeader,
      skipEmptyLines: true,
    });
  } catch {
    return [];
  }

  const fmt = CSV_FORMATS[formatId] || CSV_FORMATS.generic;

  return result.data
    .map((r, i) => {
      try {
        const n = fmt.normalize(r);
        if (!n) return null;
        if (!n.date) return null;
        const amt = safeAmount(n.amount);
        if (amt === 0) return null;

        const tx = { ...n, date: safeDate(n.date), amount: amt, _i: i };

        // ── 住信SBI銀行のカード引き落とし行にフラグ ──────
        // 「口座振替」「カード」などのキーワードを含む支出は
        // カード明細と重複する可能性があるためフラグを立てる
        if (formatId === "sbi" && amt < 0 && isCardWithdrawal(tx.label)) {
          tx.isCardWithdrawal = true;
        }

        // ── 振替フラグ（SBI銀行の振替行を自動検出）──────
        if (formatId === "sbi" && isTransferLabel(tx.label)) {
          tx.isTransfer = true;
        }

        return tx;
      } catch { return null; }
    })
    .filter(Boolean);
};

export { default as Papa } from "papaparse";
