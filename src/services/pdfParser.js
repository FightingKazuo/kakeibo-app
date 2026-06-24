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
        .join("")
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
// pdf.jsの抽出では行が分割されるため以下の2パターンに対応:
//
// パターンA（分割形式）:
//   行i:   "#" または "B#"
//   行i+1: "26/05/01 藍屋"
//   行i+2: "4,803 １ １"
//   行i+3: "4,803"         ← 支払金額
//
// パターンB（1行形式）:
//   "B# 26/04/01 店舗名 10,000 １ １ 10,000"
const parseSMBCLines = (lines) => {
  const results = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // パターンA: "#" または "B#" のみの行
    if (/^(?:B#|#)$/.test(line.trim())) {
      const dateLine = (lines[i + 1] || "").trim();
      const mDate = dateLine.match(/^(\d{2})\/(\d{2})\/(\d{2})\s+(.+)$/);
      if (mDate) {
        const [, yy, mm, dd, rawStore] = mDate;
        // 金額行: "4,803 １ １" or "4,803 1 1"
        const amtLine = (lines[i + 2] || "").trim();
        if (/^[\d,]+\s+[１1一]/.test(amtLine)) {
          // 支払金額行（次行）
          const payLine = (lines[i + 3] || "").trim();
          const payM = payLine.match(/^([\d,]+)/);
          if (payM) {
            const amount = parseInt(payM[1].replace(/,/g, ""));
            if (amount > 0) {
              results.push({
                date:     `20${yy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`,
                label:    zen2han(rawStore.replace(/\u3000/g, " ").replace(/\s+/g, " ").trim()),
                amount:   -amount,
                type:     "expense",
                category: "その他",
                source:   "csv",
              });
              i += 4;
              continue;
            }
          }
          // 支払金額行がなければ金額行の最初の数字を使う
          const amtM = amtLine.match(/^([\d,]+)/);
          if (amtM) {
            const amount = parseInt(amtM[1].replace(/,/g, ""));
            if (amount > 0) {
              results.push({
                date:     `20${yy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`,
                label:    zen2han(rawStore.replace(/\u3000/g, " ").replace(/\s+/g, " ").trim()),
                amount:   -amount,
                type:     "expense",
                category: "その他",
                source:   "csv",
              });
              i += 3;
              continue;
            }
          }
        }
      }
    }

    // パターンB: 1行に全情報
    const mOne = line.match(
      /^(?:B#|#|B)?\s*(\d{2})\/(\d{2})\/(\d{2})\s+(.+?)\s+([\d,]+)\s+[１1一]\s+\d+\s+([\d,]+)/
    );
    if (mOne) {
      const [, yy, mm, dd, rawStore, , payAmount] = mOne;
      const amount = parseInt(payAmount.replace(/,/g, ""));
      if (amount > 0) {
        results.push({
          date:     `20${yy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`,
          label:    zen2han(rawStore.replace(/\u3000/g, " ").replace(/\s+/g, " ").trim()),
          amount:   -amount,
          type:     "expense",
          category: "その他",
          source:   "csv",
        });
      }
    }

    i++;
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
