// ============================================================
// services/pdfParser.js
// PDFからテキストを抽出して取引データに変換する
// 対応: エポスカード PDF / 三井住友カード PDF
//
// pdfjs-dist をCDNワーカーで動作させる（Vite設定不要）
// ============================================================
import * as pdfjsLib from "pdfjs-dist";

// WorkerをCDNから読み込む（バンドル設定不要）
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

// ─── PDFページからテキスト行を復元 ──────────────────────────
// PDFのテキストアイテムはバラバラなので、Y座標でグループ化して行に再構成する
const getPageLines = async (page) => {
  const content = await page.getTextContent();
  const lineMap = {};

  for (const item of content.items) {
    if (!item.str?.trim()) continue;
    const y = Math.round(item.transform[5] / 4) * 4; // 4px単位でグループ化
    if (!lineMap[y]) lineMap[y] = [];
    lineMap[y].push({ str: item.str, x: item.transform[4] });
  }

  // Y降順（上から下へ）、同Y内はX昇順（左から右へ）
  return Object.keys(lineMap)
    .map(Number)
    .sort((a, b) => b - a)
    .map(y =>
      lineMap[y]
        .sort((a, b) => a.x - b.x)
        .map(i => i.str)
        .join(" ")
        .trim()
    )
    .filter(Boolean);
};

// ─── PDF全ページのテキスト行を取得 ──────────────────────────
const getAllLines = async (arrayBuffer) => {
  const pdf  = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const all  = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const lines = await getPageLines(await pdf.getPage(i));
    all.push(...lines);
  }
  return all;
};

// ─── フォーマット検出 ────────────────────────────────────────
export const detectPDFFormat = (lines) => {
  const text = lines.slice(0, 30).join("\n");
  if (/エポスカード|ＥＰＯＳ|マルイ/.test(text))    return "epos_pdf";
  if (/三井住友|SMBC|ゴールドVISA|ゴールドＶＩＳＡ/.test(text)) return "smbc_pdf";
  return "unknown_pdf";
};

// ─── 全角→半角変換 ──────────────────────────────────────────
const zen2han = (str) =>
  String(str || "")
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .trim();

// ─── エポスカード PDF パーサー ───────────────────────────────
// 形式: 26 04 26 ＡＰ／シヤトレ－ゼ 302 １回 1 302
const parseEposLines = (lines) => {
  const results = [];
  for (const line of lines) {
    // 日付 YY MM DD で始まる行を取引行と判定
    const m = line.match(
      /^(\d{2})\s+(\d{2})\s+(\d{2})\s+(.+?)\s+([\d,]+)\s+(?:\d+回|[１-９一二三四五六七八九十]+回|分割|リボ|ボーナス)\s+\d+\s+([\d,]+)/
    );
    if (!m) continue;
    const [, yy, mm, dd, rawStore, , payAmount] = m;
    const amount = parseInt(payAmount.replace(/,/g, ""));
    if (!amount || amount <= 0) continue;

    // AP/ QP/ などの決済方法プレフィックスを除去
    const label = zen2han(
      rawStore
        .replace(/^[ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ]+\//, "")
        .replace(/^[A-Z]+\//, "")
        .replace(/\s+/g, " ")
    ) || rawStore.trim();

    results.push({
      date:     `20${yy}-${mm}-${dd}`,
      label,
      amount:   -amount,
      type:     "expense",
      category: "その他",
      source:   "csv",
    });
  }
  return results;
};

// ─── 三井住友カード PDF パーサー ─────────────────────────────
// 形式: B# 26/04/01 店舗名 10,000 1 1 10,000 ◎
//       # 26/04/11 店舗名 880 1 1 880 ◎
//         26/04/13 店舗名 20,000 1 1 20,000
const parseSMBCLines = (lines) => {
  const results = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // B# or # or 空白 の後に YY/MM/DD
    const m = line.match(
      /^[B#]?\s*(\d{2})\/(\d{2})\/(\d{2})\s+(.+?)\s+([\d,]+)\s+[１一]\s+\d+\s+([\d,]+)/
    );
    if (!m) continue;
    let [, yy, mm, dd, rawStore, , payAmount] = m;

    // 長い店舗名が次行に続く場合の結合
    // 「（ラ」などで終わる行は次行に続きがある
    if (/[（(]$/.test(rawStore)) {
      const nextLine = (lines[i + 1] || "").trim();
      if (nextLine && !/^\d{2}[\/\s]/.test(nextLine)) {
        rawStore += nextLine;
        i++;
      }
    }

    const amount = parseInt(payAmount.replace(/,/g, ""));
    if (!amount || amount <= 0) continue;

    const label = zen2han(rawStore.replace(/\s+/g, " ")) || rawStore.trim();
    results.push({
      date:     `20${yy}-${mm.padStart(2,"0")}-${dd.padStart(2,"0")}`,
      label,
      amount:   -amount,
      type:     "expense",
      category: "その他",
      source:   "csv",
    });
  }
  return results;
};

// ─── メイン ──────────────────────────────────────────────────
/**
 * parsePDF
 * PDFファイルを取引データの配列に変換する
 * @param {File} file
 * @returns {{ transactions, format, lineCount }}
 */
export const parsePDF = async (file) => {
  const buf    = await file.arrayBuffer();
  const lines  = await getAllLines(buf);
  const format = detectPDFFormat(lines);

  let transactions;
  switch (format) {
    case "epos_pdf": transactions = parseEposLines(lines); break;
    case "smbc_pdf": transactions = parseSMBCLines(lines); break;
    default:
      throw new Error(
        "対応していないPDFです。\nエポスカードまたは三井住友カードのPDFのみ対応しています。"
      );
  }

  return { transactions, format, lineCount: lines.length };
};

// フォーマット名
export const PDF_FORMAT_LABELS = {
  epos_pdf: "エポスカード（PDF）",
  smbc_pdf: "三井住友カード（PDF）",
};
