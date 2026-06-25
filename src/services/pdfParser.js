// ============================================================
// pdfParser.js
// PDF → 取引データ変換
//
// pdfjs-dist を npm ではなく CDN から動的ロードする
// → Vite のバンドル問題を完全回避
// ============================================================

const PDF_JS_URL    = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs";
const PDF_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";
const PDF_CMAP_URL   = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/cmaps/";

// CDN からの PDF.js をキャッシュ
let pdfjsPromise = null;

const loadPdfjs = () => {
  if (pdfjsPromise) return pdfjsPromise;
  pdfjsPromise = (async () => {
    // すでに読み込み済みなら即返す
    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
      return window.pdfjsLib;
    }
    // ESM dynamic import で読み込み
    try {
      const pdfjs = await import(/* @vite-ignore */ PDF_JS_URL);
      const lib = pdfjs.default || pdfjs;
      lib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
      window.pdfjsLib = lib;
      return lib;
    } catch {
      // fallback: script タグ
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = PDF_JS_URL.replace(".mjs", ".js");
        script.onload = resolve;
        script.onerror = () => reject(new Error("PDF.js の読み込みに失敗しました。"));
        document.head.appendChild(script);
      });
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
      return window.pdfjsLib;
    }
  })();
  return pdfjsPromise;
};

// ─── ページからテキスト行を復元 ──────────────────────────────
// PDF は文字がバラバラなので Y 座標でグループ化して行に再構成する
const getPageLines = async (pdfjsLib, page) => {
  const content = await page.getTextContent({ includeMarkedContent: false });
  const lineMap = {};

  for (const item of content.items) {
    const str = item.str ?? "";
    // 空白のみの行でも座標情報として使う
    const y = Math.round(item.transform[5] / 2) * 2; // 精度を2pxに向上
    if (!lineMap[y]) lineMap[y] = [];
    lineMap[y].push({ str, x: item.transform[4] });
  }

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

// ─── 全ページのテキスト行を取得 ──────────────────────────────
const getAllLines = async (pdfjsLib, arrayBuffer) => {
  // iOSのSafari「PDFを作成」で生成したPDFに対応するオプション
  const loadingTask = pdfjsLib.getDocument({
    data: arrayBuffer,
    isEvalSupported: false,
    useSystemFonts: true,
    disableFontFace: false,
    verbosity: 0,
    cMapUrl: PDF_CMAP_URL,
    cMapPacked: true,
  });
  const pdf = await loadingTask.promise;
  const all = [];
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
  if (/三井住友|SMBC|smbc-card|ゴールドVISA|ゴールドＶＩＳＡ|ｺﾞｰﾙﾄﾞ|Vpass|vpass/.test(head)) return "smbc_pdf";
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
// 実機のpdf.js出力で検証済み（4月PDF 16件・合計60,221円 一致）
// 主形式: "B# 26/04/01 店舗名 利用額 １ 回数 支払額 ◎"（1行完結）
// 例外1: 店舗名が長いと前行に分離（"ウツワヤユウユウ（" → "# 26/04/11 880 １ １ 880"）
// 例外2: SBI証券のように末尾◎なしの行もある
const parseSMBCLines = (lines) => {
  const results = [];
  const isAmountLine = (s) => /^[\d,]+\s*[１1一]/.test(s);
  const isPureNumber = (s) => /^[\d,]+$/.test(s);

  let i = 0;
  while (i < lines.length) {
    const line = (lines[i] || "").trim();
    if (!line || line.startsWith("＜") || line.startsWith("※") || line.startsWith("登録")) { i++; continue; }

    const mDate = line.match(/^(?:B#|#|\s)*?(\d{2})\/(\d{2})\/(\d{2})\s*(.*)/);
    if (!mDate) { i++; continue; }
    const [, yy, mm, dd, rest] = mDate;

    // メイン形式: "店舗名 利用金額 １ 回数 支払金額 [備考◎等]"
    const mFull = rest.match(/^(.+?)\s+([\d,]+)\s+[１1一]\s+[１0-9０-９]+\s+([\d,]+)(?:\s+.*)?$/);
    if (mFull) {
      const amount = parseInt(mFull[3].replace(/,/g, ""));
      const label = zen2han(mFull[1].replace(/\u3000/g, " ").replace(/\s+/g, " ").trim());
      if (amount > 0 && label) {
        results.push({ date: `20${yy}-${mm.padStart(2,"0")}-${dd.padStart(2,"0")}`, label, amount: -amount, type: "expense", category: "その他", source: "csv" });
      }
      i++; continue;
    }

    // 店舗名なし形式: "金額 １ 回数 支払金額"（店舗名は前行に分離）
    const mNoStore = rest.match(/^([\d,]+)\s+[１1一]\s+[１0-9０-９]+\s+([\d,]+)(?:\s+.*)?$/);
    if (mNoStore) {
      const amount = parseInt(mNoStore[2].replace(/,/g, ""));
      const prevLine = (lines[i - 1] || "").trim();
      let label = "";
      if (prevLine && !/^\d/.test(prevLine) && !/^(?:B#|#)/.test(prevLine)) {
        label = zen2han(prevLine.replace(/\u3000/g, " ").replace(/[（(]$/, "").replace(/\s+/g, " ").trim());
      }
      if (amount > 0) {
        results.push({ date: `20${yy}-${mm.padStart(2,"0")}-${dd.padStart(2,"0")}`, label: label || "（店舗名不明）", amount: -amount, type: "expense", category: "その他", source: "csv" });
      }
      i++; continue;
    }

    // restに金額がない → 後続行から金額行を探す
    const storeParts = rest.trim() ? [rest.trim()] : [];
    let j = i + 1;
    let found = false;
    while (j < lines.length) {
      const nxt = (lines[j] || "").trim();
      if (/^(?:B#|#|\s)*?\d{2}\/\d{2}\/\d{2}/.test(nxt) || nxt.startsWith("＜")) { i = j; found = true; break; }
      if (isAmountLine(nxt)) {
        const mAmt = nxt.match(/^([\d,]+)\s+[１1一]\s+[１0-9０-９]+\s+([\d,]+)/) || nxt.match(/^([\d,]+)/);
        const amount = parseInt((mAmt[2] || mAmt[1]).replace(/,/g, ""));
        const label = zen2han(storeParts.join(" ").replace(/\u3000/g, " ").replace(/\s+/g, " ").trim());
        if (amount > 0 && label) {
          results.push({ date: `20${yy}-${mm.padStart(2,"0")}-${dd.padStart(2,"0")}`, label, amount: -amount, type: "expense", category: "その他", source: "csv" });
        }
        i = j + 1; found = true; break;
      }
      if (nxt && !/^[◎○●]$/.test(nxt) && !isPureNumber(nxt)) storeParts.push(nxt);
      j++;
    }
    if (!found) i = j;
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

  // TextDecoderフォールバック共通関数
  const tryTextDecode = (buf) => {
    const decoder = new TextDecoder("utf-8", { fatal: false });
    const rawText = decoder.decode(buf);
    const textLines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const smbc = parseSMBCLines(textLines);
    if (smbc.length > 0) return { transactions: smbc, format: "smbc_pdf", lineCount: textLines.length };
    const epos = parseEposLines(textLines);
    if (epos.length > 0) return { transactions: epos, format: "epos_pdf", lineCount: textLines.length };
    return null;
  };

  let lines;
  try {
    lines = await getAllLines(pdfjsLib, buf);
  } catch (e) {
    // pdf.js例外 → TextDecoderで再試行
    const decoded = tryTextDecode(buf);
    if (decoded) return decoded;
    throw e;
  }

  // pdf.jsは成功したが0行 → TextDecoderで再試行
  if (!lines || lines.length === 0) {
    const decoded = tryTextDecode(buf);
    if (decoded) return decoded;
    throw new Error("PDFからテキストを抽出できませんでした。");
  }

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

