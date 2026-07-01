// ============================================================
// services/csvParser.js
// CSV インポートのパーサー
// Shift-JIS / UTF-8 / UTF-8 BOM に対応
// ============================================================
import Papa from "papaparse";
import { CSV_FORMATS, BANK_CARD_MAPPING } from "../constants";
import { safeAmount, safeDate } from "../utils/format";

// ─── カード引き落とし系のキーワード（銀行明細の重複判定用）──
const CARD_WITHDRAWAL_KEYWORDS = [
  "口座振替", "カード引き落とし", "クレジット",
  ...BANK_CARD_MAPPING.map(m => m.bankKeyword),
];

// 銀行明細の行がカード引き落としかどうか判定
const isCardWithdrawal = (label) => {
  const lower = label.toLowerCase();
  return CARD_WITHDRAWAL_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()));
};

// カード引き落とし行が「取り込み済み」かどうかをimportHistoryで判定
// importHistory: { "smbc_2026-06": true, "epos_2026-05": true, ... }
export const isCardAlreadyImported = (label, date, importHistory) => {
  if (!importHistory || !date) return false;
  const ym = date.slice(0, 7); // "2026-06"
  const mapping = BANK_CARD_MAPPING.find(m => label.includes(m.bankKeyword));
  if (!mapping) return false;
  const key = `${mapping.formatId}_${ym}`;
  return !!importHistory[key];
};

// 銀行明細の引き落とし行に対応するカードフォーマットIDを返す
export const getCardFormatId = (label) => {
  const mapping = BANK_CARD_MAPPING.find(m => label.includes(m.bankKeyword));
  return mapping?.formatId || null;
};

// ─── 振替キーワード管理 ──────────────────────────────────────
const TRANSFER_STORAGE_KEY = "kakeibo_transfer_keywords";

const DEFAULT_TRANSFER_KEYWORDS = [
  "SBIハイブリッド預金", "振替", "ことら送金",
  "振込＊コバヤシ", "振込手数料",
  "フリカエ　ＰＡＹＰＡＹ", "フリカエ PAYPAY",  // PayPayチャージ
  "ＳＢＩハイブリッド",
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

  // Amazon注文履歴: ASINとOrder Dateヘッダーが特徴
  if (header.includes('ASIN') && header.includes('Order Date') && header.includes('Product Name')) return 'amazon';

  return 'generic';
};

/**
 * CSV テキストをパースして取引配列に変換する
 * @param {string} text - CSVテキスト
 * @param {string} formatId - フォーマットID
 * @param {object} importHistory - 取り込み済みカード履歴 { "smbc_2026-06": true, ... }
 * @param {Array}  activeCsvSources - 管理対象CSVソースID配列（OFFのものは振替扱いしない）
 */
export const parseCSVText = (text, formatId, importHistory = {}, activeCsvSources = null, catRules = []) => {
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

        const tx = { ...n, date: safeDate(n.date), amount: amt, _i: i, csvFormatId: formatId };

        // ── カテゴリルール自動適用 ──────────────────────────
        // category="その他"の場合のみルールを適用（手動設定を上書きしない）
        if (catRules.length > 0 && (!tx.category || tx.category === "その他") && tx.label) {
          // ハイフン・長音記号・中点等の表記ゆれを除去してから比較
          const stripSym = s => s.toLowerCase().replace(/[　\s\-－ー・./（）()「」]/g, "");
          const labelLow = stripSym(tx.label);
          const matched = catRules
            .filter(r => r.type === (tx.type || "expense") || !r.type)
            .sort((a, b) => (b.priority || 50) - (a.priority || 50))
            .find(r => r.keywords?.some(kw => {
              const kl = stripSym(kw);
              return labelLow.includes(kl) || kl.includes(labelLow.slice(0, Math.min(labelLow.length, 4)));
            }));
          if (matched) tx.category = matched.category;
        }

        // ── 住信SBI銀行：PayPayチャージ（フリカエ ＰＡＹＰＡＹ）──
        // 銀行→PayPayの振替なので収支には計上しない（isTransfer扱い）
        // ただしPayPay残高増加として記録するため pointTransfer フラグを立てる
        if (formatId === "sbi" && /ＰＡＹＰＡＹ|PAYPAY/i.test(tx.label) && tx.label.includes("フリカエ")) {
          tx.isTransfer    = true;
          tx.isPointCharge = true; // PayPay残高増加フラグ
        }

        // ── 住信SBI銀行のカード引き落とし行にフラグ ──────
        if (formatId === "sbi" && amt < 0 && isCardWithdrawal(tx.label) && !tx.isTransfer) {
          const cardFormatId    = getCardFormatId(tx.label);
          const alreadyImported = isCardAlreadyImported(tx.label, tx.date, importHistory);
          // activeCsvSourcesでOFFになっているカードは振替・警告なし（通常支出として取り込む）
          const isInactive = activeCsvSources && cardFormatId && !activeCsvSources.includes(cardFormatId);
          if (isInactive) {
            // OFFのカード → 通常支出として処理（フラグなし）
            tx.isCardWithdrawal = false;
            tx.isCardWarning    = false;
          } else if (alreadyImported) {
            tx.isCardWithdrawal = true;
            tx.cardImportStatus = "imported";
          } else {
            tx.isCardWithdrawal = false;
            tx.cardImportStatus = "unknown";
            tx.isCardWarning    = true;
          }
          tx.cardFormatId = cardFormatId;
        }

        // ── 振替フラグ（SBI銀行の振替行を自動検出）──────
        // 入金（amt>0）は振替にしない（例: 振込＊コバヤシ　カズシ の入金は収入として計上）
        if (formatId === "sbi" && !tx.isTransfer && amt < 0 && isTransferLabel(tx.label)) {
          tx.isTransfer = true;
        }

        // ── Amazon注文履歴：同一Order IDの重複行を1件にまとめる ──
        if (formatId === "amazon" && r["Order ID"]) {
          tx._orderId = r["Order ID"].trim();
        }

        return tx;
      } catch { return null; }
    })
    .filter(Boolean)
    .filter((tx, idx, arr) => {
      // Amazon: 同一Order IDは最初の1件のみ（同一注文の複数商品は別々に取り込む）
      // ※ Order IDが同じでも商品名が違う場合は別行として扱う
      if (!tx._orderId) return true;
      return arr.findIndex(t => t._orderId === tx._orderId && t.label === tx.label) === idx;
    });
};

export { default as Papa } from "papaparse";
