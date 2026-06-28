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
    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
      return window.pdfjsLib;
    }
    try {
      const pdfjs = await import(/* @vite-ignore */ PDF_JS_URL);
      const lib = pdfjs.default || pdfjs;
      lib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
      window.pdfjsLib = lib;
      return lib;
    } catch {
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
const getPageLines = async (pdfjsLib, page) => {
  const content = await page.getTextContent({ includeMarkedContent: false });
  const lineMap = {};

  for (const item of content.items) {
    const str = item.str ?? "";
    const y = Math.round(item.transform[5] / 2) * 2;
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
  if (/楽天カード|楽天Edy|Rakuten/.test(head))               return "rakuten_pdf";
  return "unknown_pdf";
};

// ─── 全角→半角 ───────────────────────────────────────────────
const zen2han = (str) =>
  String(str || "")
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .trim();

// ─── 店舗名クリーニング ───────────────────────────────────────
const cleanLabel = (str) =>
  str
    .replace(/\s*[（(][ァ-ンｦ-ﾝ]*\s*$/, "")
    .replace(/\s*[（(]\s*$/, "")
    .replace(/　/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// ─── エポスカード PDF パーサー ───────────────────────────────
// 行形式: 26 04 26 ＡＰ／シヤトレ－ゼ 302 １回 1 302
const parseEposLines = (lines) => {
  const results = [];
  for (const line of lines) {
    const m = line.match(
      /^(\d{2})\s+(\d{2})\s+(\d{2})\s+(.+?)\s+([\d,]+)\s+[０-９一-十\d]+回?\s+\d+\s+([\d,]+)/
    );
    if (!m) continue;
    const [, yy, mm, dd, rawStore, , payAmount] = m;
    const amount = parseInt(payAmount.replace(/,/g, ""));
    if (!amount || amount <= 0) continue;

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

// ─── 楽天カード PDF パーサー ─────────────────────────────────
// 行形式: 2026/04/28 楽天スーパーＤＥＡＬＳＨＯＰ 本人* 1回払い 23,737 0 23,737 ...
const parseRakutenLines = (lines) => {
  const results = [];
  const pattern = /^(\d{4})\/(\d{2})\/(\d{2})\s+(.+?)\s+(?:本人|家族)\*?\s+\S+払い\s+([\d,]+)/;

  for (const line of lines) {
    const m = line.match(pattern);
    if (!m) continue;
    const [, y, mo, d, rawStore, amtStr] = m;
    const amount = parseInt(amtStr.replace(/,/g, ""));
    if (!amount || amount <= 0) continue;

    const label = cleanLabel(zen2han(rawStore.trim()));
    if (!label) continue;

    results.push({
      date:     `${y}-${mo}-${d}`,
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
// 対応形式:
//   1行完結型(pdf.js): "B# 26/04/01 店舗名 10,000 １ １ 10,000 ◎"
//   分割型(pdfminer): B#→日付行→金額行→支払金額 が別行で来る
// 検証済み: 3月(17件✅) 5月(16件✅) 6月(53件✅)
const parseSMBCLines = (lines) => {
  // ── 前処理: PDF折り返しゴミの除去 ──────────────────────────
  // 「Ｃ 1,925 １ １ 1,925 ◎」のような「全角1文字 + スペース + 数字...」行は
  // 店名が途中で折り返されたもの。先頭の1文字を前行末尾に結合し、残りは別行として追加。
  const merged = [];
  for (const ln of lines) {
    const s = ln.trim();
    const m = s.match(/^([ァ-ンｦ-ﾝＡ-Ｚａ-ｚ])\s+([\d,].+)$/);
    if (m && merged.length > 0) {
      // 全角1文字 + 数字行 → 前行に1文字追加、残りを別行として挿入
      merged[merged.length - 1] = merged[merged.length - 1] + m[1];
      merged.push(m[2]);
    } else if (merged.length > 0 && /^[ァ-ンｦ-ﾝＡ-Ｚａ-ｚ]$/.test(s)) {
      // 全角1文字のみの行 → 前行末尾に結合
      merged[merged.length - 1] = merged[merged.length - 1] + s;
    } else {
      merged.push(s);
    }
  }

  const isAmt  = s => /^[\d,]+\s*[１1一]/.test(s);
  const isPure = s => /^[\d,]+$/.test(s);
  const isDate = s => /^(?:B#|#|\s)*?\d{2}\/\d{2}\/\d{2}/.test(s);
  const skip   = s => !s || s.startsWith("＜") || s.startsWith("◎") ||
                      s.startsWith("備") || s.startsWith("考") ||
                      /^小林.*様/.test(s);

  const pending = [];
  let i = 0;

  while (i < merged.length) {
    const line = (merged[i] || "").trim();
    if (skip(line) || /^(?:B#|#)+$/.test(line)) { i++; continue; }

    const mDate = line.match(/^(?:B#|#|\s)*?(\d{2})\/(\d{2})\/(\d{2})\s*(.*)/);
    if (mDate) {
      const [, yy, mm, dd, rest] = mDate;

      // ── 1行完結型（pdf.js形式）
      const mFull = rest.match(/^(.+?)\s+([\d,]+)\s+[１1一]\s+[１0-9０-９]+\s+([\d,]+)(?:\s+.*)?$/);
      if (mFull) {
        const [, store, , payAmt] = mFull;
        const amount = parseInt(payAmt.replace(/,/g, ""));
        const label  = cleanLabel(zen2han(store));
        if (amount > 0 && label) {
          pending.push({ yy, mm, dd, storeParts: [store], useAmt: amount, payAmt: amount });
        }
        i++; continue;
      }

      // ── 分割型: 店舗名・金額が別行
      const storeParts = rest.trim() ? [rest.trim()] : [];
      let j = i + 1;
      let found = false;

      while (j < merged.length) {
        const nxt = (merged[j] || "").trim();
        if (skip(nxt) || /^(?:B#|#)+$/.test(nxt)) { j++; continue; }
        if (nxt.startsWith("＜")) break;

        if (isAmt(nxt)) {
          const useAmt = parseInt(nxt.match(/^([\d,]+)/)[1].replace(/,/g, ""));
          let payAmt = 0;
          const nextLine = (merged[j + 1] || "").trim();
          if (isPure(nextLine) && parseInt(nextLine.replace(/,/g, "")) === useAmt) {
            payAmt = useAmt; j++;
          }
          pending.push({ yy, mm, dd, storeParts: [...storeParts], useAmt, payAmt });
          i = j + 1; found = true; break;
        }

        if (isDate(nxt)) {
          pending.push({ yy, mm, dd, storeParts: [...storeParts], useAmt: 0, payAmt: 0 });
          i = j; found = true; break;
        }

        if (!isPure(nxt) && !/^[◎○●]/.test(nxt)) storeParts.push(nxt);
        j++;
      }
      if (!found) i = j;
      continue;
    }

    if (isAmt(line)) {
      const useAmt = parseInt(line.match(/^([\d,]+)/)[1].replace(/,/g, ""));
      const match  = pending.find(p => p.useAmt === 0);
      if (match) {
        const nextLine = (merged[i + 1] || "").trim();
        let payAmt = 0;
        if (isPure(nextLine) && parseInt(nextLine.replace(/,/g, "")) === useAmt) {
          payAmt = useAmt; i++;
        }
        match.useAmt = useAmt;
        match.payAmt = payAmt;
      }
      i++; continue;
    }

    if (isPure(line)) {
      const payAmt = parseInt(line.replace(/,/g, ""));
      const match  = pending.find(p => !p.payAmt && p.useAmt === payAmt);
      if (match) match.payAmt = payAmt;
    }
    i++;
  }

  return pending
    .map(p => {
      const amount = p.payAmt || p.useAmt;
      const label  = cleanLabel(zen2han(p.storeParts.join(" ")));
      if (!amount || !label) return null;
      return {
        date:     `20${p.yy}-${p.mm.padStart(2, "0")}-${p.dd.padStart(2, "0")}`,
        label,
        amount:   -amount,
        type:     "expense",
        category: "その他",
        source:   "csv",
      };
    })
    .filter(Boolean);
};

export const PDF_FORMAT_LABELS = {
  epos_pdf:    "エポスカード（PDF）",
  smbc_pdf:    "三井住友カード（PDF）",
  rakuten_pdf: "楽天カード（PDF）",
};

export const parsePDF = async (file) => {
  const pdfjsLib = await loadPdfjs();
  const buf      = await file.arrayBuffer();

  const tryTextDecode = (buf) => {
    const decoder = new TextDecoder("utf-8", { fatal: false });
    const rawText = decoder.decode(buf);
    const textLines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const smbc = parseSMBCLines(textLines);
    if (smbc.length > 0) return { transactions: smbc, format: "smbc_pdf", lineCount: textLines.length };
    const epos = parseEposLines(textLines);
    if (epos.length > 0) return { transactions: epos, format: "epos_pdf", lineCount: textLines.length };
    const rakuten = parseRakutenLines(textLines);
    if (rakuten.length > 0) return { transactions: rakuten, format: "rakuten_pdf", lineCount: textLines.length };
    return null;
  };

  let lines;
  try {
    lines = await getAllLines(pdfjsLib, buf);
  } catch (e) {
    const decoded = tryTextDecode(buf);
    if (decoded) return decoded;
    throw e;
  }

  if (!lines || lines.length === 0) {
    const decoded = tryTextDecode(buf);
    if (decoded) return decoded;
    throw new Error("PDFからテキストを抽出できませんでした。");
  }

  const format = detectPDFFormat(lines);

  let transactions;
  switch (format) {
    case "epos_pdf":    transactions = parseEposLines(lines);    break;
    case "smbc_pdf":    transactions = parseSMBCLines(lines);    break;
    case "rakuten_pdf": transactions = parseRakutenLines(lines); break;
    default:
      throw new Error(
        "対応していないPDFです。\nエポスカード・三井住友カード・楽天カードのPDFのみ対応しています。"
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
export const parsePDFText = (text) => {
  if (!text || typeof text !== "string") return null;

  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  const isSMBC    = lines.some(l => l.includes("三井住友") || l.includes("SMBC") || l.includes("smbc-card"));
  const isEpos    = lines.some(l => l.includes("エポスカード") || l.includes("eposcard"));
  const isRakuten = lines.some(l => l.includes("楽天カード") || l.includes("Rakuten"));

  if (isSMBC) {
    const transactions = parseSMBCLines(lines);
    if (transactions.length > 0) return { format: "smbc_pdf", transactions };
  }
  if (isEpos) {
    const transactions = parseEposLines(lines);
    if (transactions.length > 0) return { format: "epos_pdf", transactions };
  }
  if (isRakuten) {
    const transactions = parseRakutenLines(lines);
    if (transactions.length > 0) return { format: "rakuten_pdf", transactions };
  }

  const fallback = parseSMBCLines(lines);
  if (fallback.length > 0) return { format: "smbc_pdf", transactions: fallback };

  return null;
};

