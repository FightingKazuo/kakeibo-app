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

// ─── 店舗名クリーニング ───────────────────────────────────────
// pdf.jsの行分割で末尾に中途半端な括弧・カタカナが残る場合に除去
const cleanLabel = (str) =>
  str
    .replace(/\s*[（(][ァ-ンｦ-ﾝ]*\s*$/, "")  // 末尾の未閉じ括弧+カタカナ
    .replace(/\s*[（(]\s*$/, "")               // 末尾の括弧のみ
    .replace(/　/g, " ")                   // 全角スペース→半角
    .replace(/\s+/g, " ")
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
// 全4ヶ月のPDFで検証済み（3月17件✅ 4月16件✅ 5月53件✅ 6月53件✅）
// 構造パターン:
//   A) 日付行 → 金額行 → [支払金額]（1件ずつ完結）
//   B) B#/# → 日付行 → 金額行（B#が単独行）
//   C) 複数の日付行が連続 → 複数の金額行が後続（まとめ形式）
//   D) 純粋数字が後ろにまとまって来る（支払金額の後払い形式）
const parseSMBCLines = (lines) => {
  const isAmt  = s => /^[\d,]+\s*[１1一]/.test(s);
  const isPure = s => /^[\d,]+$/.test(s);
  const isDate = s => /^(?:B#|#|\s)*?\d{2}\/\d{2}\/\d{2}/.test(s);
  const skip   = s => !s || s.startsWith("＜") || s.startsWith("◎") ||
                      s.startsWith("備") || s.startsWith("考") ||
                      /^小林.*様/.test(s);

  const pending = [];
  let i = 0;

  while (i < lines.length) {
    const line = (lines[i] || "").trim();
    if (skip(line) || /^(?:B#|#)+$/.test(line)) { i++; continue; }

    // 日付行を検出
    const mDate = line.match(/^(?:B#|#|\s)*?(\d{2})\/(\d{2})\/(\d{2})\s*(.*)/);
    if (mDate) {
      const [, yy, mm, dd, rest] = mDate;
      const storeParts = rest.trim() ? [rest.trim()] : [];
      let j = i + 1;
      let found = false;

      while (j < lines.length) {
        const nxt = (lines[j] || "").trim();
        if (skip(nxt) || /^(?:B#|#)+$/.test(nxt)) { j++; continue; }
        if (nxt.startsWith("＜")) break;

        if (isAmt(nxt)) {
          // 金額行 → この取引完了
          const useAmt = parseInt(nxt.match(/^([\d,]+)/)[1].replace(/,/g, ""));
          let payAmt = 0;
          const nextLine = (lines[j + 1] || "").trim();
          if (isPure(nextLine) && parseInt(nextLine.replace(/,/g, "")) === useAmt) {
            payAmt = useAmt; j++;
          }
          pending.push({ yy, mm, dd, storeParts: [...storeParts], useAmt, payAmt });
          i = j + 1; found = true; break;
        }

        if (isDate(nxt)) {
          // 次の日付行が先に来た → 金額未確定でpendingに追加（後で割り当て）
          pending.push({ yy, mm, dd, storeParts: [...storeParts], useAmt: 0, payAmt: 0 });
          i = j; found = true; break;
        }

        if (!isPure(nxt) && !/^[◎○●]/.test(nxt)) storeParts.push(nxt);
        j++;
      }
      if (!found) i = j;
      continue;
    }

    // 金額行（日付行の後ではなく単独で出現） → use==0のpendingに順番に割り当て
    if (isAmt(line)) {
      const useAmt = parseInt(line.match(/^([\d,]+)/)[1].replace(/,/g, ""));
      const match  = pending.find(p => p.useAmt === 0);
      if (match) {
        const nextLine = (lines[i + 1] || "").trim();
        let payAmt = 0;
        if (isPure(nextLine) && parseInt(nextLine.replace(/,/g, "")) === useAmt) {
          payAmt = useAmt; i++;
        }
        match.useAmt  = useAmt;
        match.payAmt  = payAmt;
      }
      i++; continue;
    }

    // 純粋数字 → 利用金額が一致する最初の未解決pendingに支払金額として割り当て
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

