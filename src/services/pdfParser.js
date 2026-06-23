// ============================================================
// pdfParser.js
// PDF → 取引データ変換
//
// pdfjs-dist を npm ではなく CDN から動的ロードする
// → Vite のバンドル問題を完全回避
// ============================================================

const PDF_JS_URL    = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDF_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

// CDN からの PDF.js をキャッシュ
let pdfjsPromise = null;

const loadPdfjs = () => {
  if (pdfjsPromise) return pdfjsPromise;
  pdfjsPromise = new Promise((resolve, reject) => {
    // すでに読み込み済みなら即返す
    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
      resolve(window.pdfjsLib);
      return;
    }
    const script = document.createElement("script");
    script.src = PDF_JS_URL;
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
      resolve(window.pdfjsLib);
    };
    script.onerror = () => {
      pdfjsPromise = null; // 失敗時はリセットして再試行可能に
      reject(new Error("PDF.js の読み込みに失敗しました。ネット接続を確認してください。"));
    };
    document.head.appendChild(script);
  });
  return pdfjsPromise;
};

// ─── ページからテキスト行を復元 ──────────────────────────────
// PDF は文字がバラバラなので Y 座標でグループ化して行に再構成する
const getPageLines = async (pdfjsLib, page) => {
  const content = await page.getTextContent();
  const lineMap = {};

  for (const item of content.items) {
    if (!item.str?.trim()) continue;
    const y = Math.round(item.transform[5] / 4) * 4;
    if (!lineMap[y]) lineMap[y] = [];
    lineMap[y].push({ str: item.str, x: item.transform[4] });
  }

  return Object.keys(lineMap)
    .map(Number)
    .sort((a, b) => b - a)          // Y 降順（上から下）
    .map(y =>
      lineMap[y]
        .sort((a, b) => a.x - b.x) // X 昇順（左から右）
        .map(i => i.str)
        .join(" ")
        .trim()
    )
    .filter(Boolean);
};

// ─── 全ページのテキスト行を取得 ──────────────────────────────
const getAllLines = async (pdfjsLib, arrayBuffer) => {
  const pdf  = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const all  = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page  = await pdf.getPage(i);
    const lines = await getPageLines(pdfjsLib, page);
    all.push(...lines);
  }
  return all;
};

// ─── フォーマット検出 ────────────────────────────────────────
const detectPDFFormat = (lines) => {
  const head = lines.slice(0, 40).join("\n");
  if (/エポスカード|ＥＰＯＳ|マルイ/.test(head))           return "epos_pdf";
  if (/三井住友|SMBC|ゴールドVISA|ゴールドＶＩＳＡ/.test(head)) return "smbc_pdf";
  return "unknown_pdf";
};

// ─── 全角→半角 ───────────────────────────────────────────────
const zen2han = (str) =>
  String(str || "")
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .trim();

// ─── エポスカード PDF パーサー ───────────────────────────────
// 行形式: 26 04 26 ＡＰ／シヤトレ－ゼ 302 １回 1 302
const parseEposLines = (lines) => {
  const results = [];
  for (const line of lines) {
    // YY MM DD + 店名 + 金額 + 支払区分 + 回数 + 支払金額
    const m = line.match(
      /^(\d{2})\s+(\d{2})\s+(\d{2})\s+(.+?)\s+([\d,]+)\s+[０-９一-十\d]+回?\s+\d+\s+([\d,]+)/
    );
    if (!m) continue;
    const [, yy, mm, dd, rawStore, , payAmount] = m;
    const amount = parseInt(payAmount.replace(/,/g, ""));
    if (!amount || amount <= 0) continue;

    // AP/ QP/ などの決済プレフィックスを除去
    const label = zen2han(
      rawStore.replace(/^[Ａ-ＺA-Z]+\//, "").replace(/\s+/g, " ")
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
// 行形式: B# 26/04/01 店舗名 10,000 １ １ 10,000 ◎
//         #  26/05/01 藍屋   4,803  １ １  4,803 ◎
const parseSMBCLines = (lines) => {
  const results = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // B#・#・B・なし いずれも対応、支払区分は全角１・半角1・一 を許容
    const m = line.match(
      /^(?:B#|#|B)?\s*(\d{2})\/(\d{2})\/(\d{2})\s+(.+?)\s+([\d,]+)\s+[１1一]\s+\d+\s+([\d,]+)/
    );
    if (!m) continue;
    let [, yy, mm, dd, rawStore, , payAmount] = m;

    // 長い店舗名が次行に続く場合の結合（末尾がＣ・ラ・／・NF等）
    const nextLine = (lines[i + 1] || "").trim();
    if (nextLine
        && !/^(?:B#|#|B)?\s*\d{2}\/\d{2}\/\d{2}/.test(nextLine)
        && !/^(?:小林|＜|合計|1\/|2\/|3\/)/.test(nextLine)
        && nextLine.length < 25
        && !/^\d{1,3}(,\d{3})*$/.test(nextLine)) {
      rawStore += nextLine;
      i++;
    }

    const amount = parseInt(payAmount.replace(/,/g, ""));
    if (!amount || amount <= 0) continue;

    results.push({
      date:     `20${yy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`,
      label:    zen2han(rawStore.replace(/\s+/g, " ").trim()) || rawStore.trim(),
      amount:   -amount,
      type:     "expense",
      category: "その他",
      source:   "csv",
    });
  }
  return results;
};

// ─── メイン ──────────────────────────────────────────────────
export const PDF_FORMAT_LABELS = {
  epos_pdf: "エポスカード（PDF）",
  smbc_pdf: "三井住友カード（PDF）",
};

export const parsePDF = async (file) => {
  const pdfjsLib = await loadPdfjs();
  const buf      = await file.arrayBuffer();
  const lines    = await getAllLines(pdfjsLib, buf);
  const format   = detectPDFFormat(lines);

  let transactions;
  switch (format) {
    case "epos_pdf": transactions = parseEposLines(lines); break;
    case "smbc_pdf": transactions = parseSMBCLines(lines); break;
    default:
      throw new Error(
        "対応していないPDFです。\nエポスカードまたは三井住友カードのPDFのみ対応しています。"
      );
  }

  if (transactions.length === 0) {
    throw new Error(
      "取引データを抽出できませんでした。\nPDFのフォーマットが想定と異なる可能性があります。"
    );
  }

  return { transactions, format, lineCount: lines.length };
};

// ─── テキスト直接パース（SafariのPDF生成対応）────────────────
// FileReaderでテキストとして読み込んだ内容をパースする
export const parsePDFText = (text) => {
  if (!text || typeof text !== "string") return null;

  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // 三井住友カード判定
  const isSMBC = lines.some(l =>
    l.includes("三井住友") || l.includes("SMBC") || l.includes("smbc-card")
  );

  // エポスカード判定
  const isEpos = lines.some(l =>
    l.includes("エポスカード") || l.includes("eposcard")
  );

  if (isSMBC) {
    const transactions = parseSMBCLines(lines);
    if (transactions.length > 0) return { format: "smbc_pdf", transactions };
  }

  if (isEpos) {
    const transactions = parseEposLines(lines);
    if (transactions.length > 0) return { format: "epos_pdf", transactions };
  }

  // どちらでもない場合は全行でSMBC形式を試す
  const fallback = parseSMBCLines(lines);
  if (fallback.length > 0) return { format: "smbc_pdf", transactions: fallback };

  return null;
};
