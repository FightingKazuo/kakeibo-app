import { useState, useRef } from "react";
import { todayStr } from "../../utils/format";
import { createTransaction, findDuplicateCandidates, DUPLICATE_KEY } from "../../services/transaction";
import { predictCategory } from "../../services/categoryPredictor";
import { parseCSVText, readCSVFile, detectCSVFormat } from "../../services/csvParser";
import { parsePDF, PDF_FORMAT_LABELS } from "../../services/pdfParser";
import {
  runTesseract, runOCRSpace,
  extractAmount, extractDate, extractStoreName, extractReceiptItems,
} from "../../services/ocrUtils";
import { analyzeWithGemini, analyzePDFWithGemini, testGeminiKey } from "../../services/geminiOcr";
import { DEFAULT_CATEGORY_RULES, CSV_FORMATS, STORAGE_KEYS } from "../../constants";
import { loadStorage, saveStorage } from "../../utils/storage";
import { fmtCurrency } from "../../utils/format";
import { TransactionFormFields } from "../common/TransactionFormFields";
import { DuplicateCheckModal } from "../common/DuplicateCheckModal";
import { CategorySuggestion } from "../common/CategorySuggestion";
import { PrimaryButton } from "../ui/PrimaryButton";

// ─── 品目タイプトグルボタン ──────────────────────────────────
function ItemTypeToggle({ type, onChange }) {
  return (
    <div className="flex rounded-lg overflow-hidden border border-gray-200 flex-shrink-0">
      <button
        onClick={() => onChange("shared")}
        className={`px-2 py-1 text-xs font-medium transition-all ${
          type === "shared" ? "bg-indigo-500 text-white" : "bg-white text-gray-400"
        }`}
      >
        共有
      </button>
      <button
        onClick={() => onChange("personal")}
        className={`px-2 py-1 text-xs font-medium transition-all ${
          type === "personal" ? "bg-rose-400 text-white" : "bg-white text-gray-400"
        }`}
      >
        個人
      </button>
    </div>
  );
}

// ─── 品目リスト（アコーディオン）────────────────────────────
function ItemsAccordion({ items, onToggleType, totalAmount }) {
  const [open, setOpen] = useState(false);
  if (!items || items.length === 0) return null;

  const sharedTotal   = items.filter(i => i.type === "personal" ? false : true)
                             .reduce((s, i) => s + i.amount, 0);
  const personalTotal = items.filter(i => i.type === "personal")
                             .reduce((s, i) => s + i.amount, 0);
  const hasPersonal = personalTotal > 0;

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      {/* ヘッダー */}
      <button
        onClick={() => setOpen(p => !p)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 text-sm"
      >
        <span className="font-medium text-gray-700">品目 {items.length}件</span>
        <div className="flex items-center gap-3">
          {hasPersonal && (
            <span className="text-xs text-rose-500 font-medium">個人 {fmtCurrency(personalTotal)}</span>
          )}
          <span className="text-xs text-indigo-500 font-medium">共有 {fmtCurrency(sharedTotal)}</span>
          <span className="text-gray-400">{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {/* 品目リスト */}
      {open && (
        <div className="divide-y divide-gray-50">
          {items.map((item, i) => (
            <div key={i} className={`flex items-center gap-2 px-4 py-2.5 ${item.type === "personal" ? "bg-rose-50" : "bg-white"}`}>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-800 truncate">{item.name}</p>
                {item.quantity > 1 && (
                  <p className="text-xs text-gray-400">×{item.quantity} @¥{item.unitPrice?.toLocaleString()}</p>
                )}
              </div>
              <p className="text-xs font-bold text-gray-700 flex-shrink-0">
                ¥{item.amount.toLocaleString()}
              </p>
              <ItemTypeToggle type={item.type || "shared"} onChange={t => onToggleType(i, t)} />
            </div>
          ))}
        </div>
      )}

      {/* サマリー */}
      {hasPersonal && (
        <div className="px-4 py-2.5 bg-indigo-50 border-t border-indigo-100 flex justify-between text-xs">
          <span className="text-indigo-600 font-medium">登録内訳</span>
          <span className="text-indigo-600">
            共有 {fmtCurrency(sharedTotal)} ＋ 個人 {fmtCurrency(personalTotal)} → 2件登録
          </span>
        </div>
      )}
    </div>
  );
}

// ─── メインコンポーネント ────────────────────────────────────
export function AddPage({ categories, existingTransactions, allRules, learnedRules, onAdd, onLearnRule }) {
  const [mode, setMode] = useState("select");

  // manual
  const [type,          setType]         = useState("expense");
  const [amount,        setAmount]       = useState("");
  const [label,         setLabel]        = useState("");
  const [date,          setDate]         = useState(todayStr());
  const [category,      setCategory]     = useState("");
  const [pendingTx,     setPendingTx]    = useState(null);
  const [dupCandidates, setDupCandidates]= useState([]);
  const [done,          setDone]         = useState(false);

  // csv
  const [csvFormat,        setCsvFormat]       = useState("generic");
  const [csvDetected,      setCsvDetected]     = useState(null);   // 自動判定結果
  const [csvShowOverride,  setCsvShowOverride] = useState(false);  // 手動選択を表示
  const [csvRows,    setCsvRows]    = useState([]);
  const [csvChecked, setCsvChecked] = useState({});
  const [csvStep,    setCsvStep]    = useState("upload");
  const [csvSummary, setCsvSummary] = useState(null);
  const [csvEditIdx, setCsvEditIdx] = useState(null);
  const fileRef = useRef(null);

  // ocr
  const [ocrStep,       setOcrStep]       = useState("upload");
  const [ocrProgress,   setOcrProgress]   = useState(0);
  const [ocrLabel,      setOcrLabel]      = useState("");
  const [ocrAmount,     setOcrAmount]     = useState("");
  const [ocrDate,       setOcrDate]       = useState(todayStr());
  const [ocrCat,        setOcrCat]        = useState("食費");
  const [ocrPreds,      setOcrPreds]      = useState([]);
  const [ocrConfidence, setOcrConfidence] = useState(null);
  const [ocrError,      setOcrError]      = useState("");
  const [ocrHistory,    setOcrHistory]    = useState(() => loadStorage(STORAGE_KEYS.OCR_HISTORY, []));
  const [ocrItems,      setOcrItems]      = useState([]); // 品目（画面表示のみ・保存しない）
  const [ocrQueue,      setOcrQueue]      = useState([]);
  const [ocrQueueIdx,   setOcrQueueIdx]   = useState(0);
  const [ocrResults,    setOcrResults]    = useState([]);
  const [ocrApiKey,     setOcrApiKey]     = useState(() => loadStorage("OCR_API_KEY", "") || "");
  // ── OCR学習: 修正内容を記憶して次回に自動適用 ────────────
  const [ocrCorrections, setOcrCorrections] = useState(
    () => loadStorage(STORAGE_KEYS.OCR_CORRECTIONS, {}) || {}
  );
  const [ocrOrigLabel,   setOcrOrigLabel]   = useState(""); // OCRが最初に検出した店名（学習用）
  const [geminiKey,     setGeminiKey]     = useState(() => loadStorage("GEMINI_API_KEY", "") || "");
  const [pasteText,     setPasteText]     = useState("");  // テキスト貼り付けモード
  const [keyTesting,    setKeyTesting]    = useState(false); // APIキーテスト中
  const [dupModal,      setDupModal]      = useState(null); // {txs, candidates}
  const ocrFileRef   = useRef(null);
  const ocrCameraRef = useRef(null);

  // ─── helpers ───
  /** OCR補正マップから店名・カテゴリを検索（曖昧マッチ対応）*/
  const lookupCorrection = (rawLabel) => {
    if (!rawLabel || !ocrCorrections) return null;
    const lower = rawLabel.toLowerCase().trim();
    // 完全一致
    if (ocrCorrections[rawLabel]) return ocrCorrections[rawLabel];
    // 大文字小文字無視
    for (const [k, v] of Object.entries(ocrCorrections)) {
      if (k.toLowerCase().trim() === lower) return v;
    }
    // 部分一致（どちらかが他方を含む）
    for (const [k, v] of Object.entries(ocrCorrections)) {
      const kl = k.toLowerCase().trim();
      if (kl.length >= 3 && (lower.includes(kl) || kl.includes(lower))) return v;
    }
    return null;
  };

  /** 修正内容を学習して保存 */
  const saveCorrection = (rawLabel, correctedLabel, category) => {
    if (!rawLabel || rawLabel.trim() === "") return;
    const updated = {
      ...ocrCorrections,
      [rawLabel]: { label: correctedLabel, category, learnedAt: new Date().toISOString() },
    };
    setOcrCorrections(updated);
    saveStorage(STORAGE_KEYS.OCR_CORRECTIONS, updated);
  };
  // Gemini → OCR.space → Tesseract の優先順で使用
  const runOcr = (file, onProg) => {
    if (geminiKey) return analyzeWithGemini(file, geminiKey, onProg).then(r => ({
      text: `${r.storeName}\n${r.date}\n合計 ${r.totalAmount}`,
      confidence: 99,
      geminiData: r,   // 構造化データをそのまま渡す
    }));
    if (ocrApiKey) return runOCRSpace(file, ocrApiKey, onProg).then(r => ({ ...r, geminiData: null }));
    return runTesseract(file, onProg).then(r => ({ ...r, geminiData: null }));
  };

  /** 品目から共有/個人の合計を計算 */
  const calcSplit = (items) => {
    const shared   = items.filter(i => (i.type || "shared") !== "personal").reduce((s, i) => s + i.amount, 0);
    const personal = items.filter(i => i.type === "personal").reduce((s, i) => s + i.amount, 0);
    return { shared, personal };
  };

  /** 品目リストの type を切り替え（単一レビュー用）*/
  const toggleOcrItemType = (idx, type) =>
    setOcrItems(p => p.map((item, i) => i === idx ? { ...item, type } : item));

  /** 品目リストの type を切り替え（複数レビュー用）*/
  const toggleMultiItemType = (resultIdx, itemIdx, type) =>
    setOcrResults(p => p.map((r, ri) =>
      ri !== resultIdx ? r : {
        ...r,
        items: r.items.map((item, ii) => ii === itemIdx ? { ...item, type } : item),
      }
    ));

  // ─── manual ───
  const checkAndAdd = (tx) => {
    const cands = findDuplicateCandidates(tx, existingTransactions);
    if (cands.length > 0) { setPendingTx(tx); setDupCandidates(cands); }
    else finalAdd(tx);
  };
  const finalAdd = (tx) => {
    onAdd(tx);
    setDone(true);
    setTimeout(() => { setDone(false); setLabel(""); setAmount(""); setCategory(""); setMode("select"); }, 1500);
  };
  const handleDupDecide = (d) => {
    if (d !== "skip" && pendingTx) finalAdd(pendingTx);
    else setMode("select");
    setDupCandidates([]); setPendingTx(null);
  };

  const handleManualSubmit = () => {
    if (!amount || !category || !label) { alert("すべて入力してください"); return; }
    const tx = createTransaction({ date, label, category, amount: type === "expense" ? -Number(amount) : Number(amount), type, source: "manual" });
    checkAndAdd(tx);
  };

  // ─── csv ───
  const [csvPdfLoading, setCsvPdfLoading] = useState(false);

  const handleFileInput = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setCsvPdfLoading(true);
    try {
      let allRows = [];
      const detectedLabels = new Set();
      const errors = [];

      for (const file of files) {
        const isPDF = file.name.toLowerCase().endsWith(".pdf");
        const isCSV = file.name.toLowerCase().endsWith(".csv");

        if (isPDF) {
          // ── PDF ──
          if (geminiKey) {
            // Gemini で PDF を直接解析（pdfjs不要・高精度）
            try {
              setCsvPdfLoading(true);
              const { cardName, transactions } = await analyzePDFWithGemini(file, geminiKey, () => {});
              detectedLabels.add(`${cardName}（PDF・Gemini）`);
              allRows = [...allRows, ...transactions];
            } catch (err) {
              errors.push(`${file.name}: ${err.message}`);
            }
          } else {
            // pdfjs フォールバック（Geminiキーなしの場合）
            try {
              const { transactions, format } = await parsePDF(file);
              detectedLabels.add(PDF_FORMAT_LABELS[format] || format);
              allRows = [...allRows, ...transactions];
            } catch {
              errors.push(`${file.name}: PDFの読み込みにはGeminiキーの設定を推奨します（設定 → OCRレシート画面）`);
            }
          }
        } else if (isCSV) {
          // ── CSV ──
          const text        = await readCSVFile(file);
          const detected    = detectCSVFormat(text);
          const formatToUse = detected !== "generic" ? detected : csvFormat;
          if (detected !== "generic") {
            detectedLabels.add(CSV_FORMATS[detected]?.label || detected);
          }
          allRows = [...allRows, ...parseCSVText(text, formatToUse)];
        }
      }

      if (errors.length) alert(errors.join("\n"));

      // ファイル内重複を除去
      const seenKeys = new Set();
      allRows = allRows.filter(r => {
        const k = DUPLICATE_KEY(r);
        if (seenKeys.has(k)) return false;
        seenKeys.add(k); return true;
      });

      const detectedLabel = [...detectedLabels].join(" / ") || "generic";
      setCsvDetected(detectedLabel);

      const existKeys = new Set(existingTransactions.map(DUPLICATE_KEY));
      const withDup   = allRows.map(r => ({ ...r, isDuplicate: existKeys.has(DUPLICATE_KEY(r)) }));
      const init      = {}; withDup.forEach((_, i) => init[i] = !withDup[i].isDuplicate);
      setCsvRows(withDup); setCsvChecked(init);
      setCsvStep(allRows.length === 0 ? "empty" : "preview");
    } catch {
      alert("ファイルの読み込みに失敗しました。");
    } finally {
      setCsvPdfLoading(false);
    }
  };

  const handleCSVFile = handleFileInput; // 後方互換

  const execCSVImport = () => {
    const toImport = csvRows.filter((_, i) => csvChecked[i]);
    const expTotal = toImport.filter(r => r.type === "expense").reduce((s, r) => s + Math.abs(r.amount), 0);
    const incTotal = toImport.filter(r => r.type === "income").reduce((s, r) => s + r.amount, 0);
    toImport.forEach(r => {
      onAdd(createTransaction({ ...r, source: "csv" }));
      if (r.label && r.category) onLearnRule?.(r.label, r.category, r.type || "expense");
    });
    setCsvSummary({ count: toImport.length, skipped: csvRows.length - toImport.length, expTotal, incTotal });
    setCsvStep("done");
  };

  const updateCsvRow = (i, key, val) =>
    setCsvRows(p => p.map((r, j) => j === i ? { ...r, [key]: val } : r));

  // ─── ocr ───

  /** OCR登録（重複チェック付き・2件登録対応）*/
  const registerOcr = (label, amount, date, cat, items) => {
    if (!amount || !label) { alert("金額と内容を入力してください"); return; }
    onLearnRule?.(label, cat, "expense");
    // OCR補正を学習: 元の検出名 → ユーザーが確定した名前・カテゴリ
    if (ocrOrigLabel && (ocrOrigLabel !== label || true)) {
      saveCorrection(ocrOrigLabel, label, cat);
    }
    const hist = [{ label, amount, date, cat }, ...ocrHistory].slice(0, 5);
    setOcrHistory(hist); saveStorage(STORAGE_KEYS.OCR_HISTORY, hist);

    const txsToAdd = [];

    if (items && items.length > 0) {
      const { shared, personal } = calcSplit(items);
      const sharedItems   = items.filter(i => (i.type || "shared") !== "personal");
      const personalItems = items.filter(i => i.type === "personal");
      if (shared   > 0) txsToAdd.push(createTransaction({
        date, label, category: cat, amount: -shared, type: "expense", source: "ocr",
        items: sharedItems.map(({ name, amount: a, quantity }) => ({ name, amount: a, quantity, type: "shared" })),
      }));
      if (personal > 0) txsToAdd.push(createTransaction({
        date, label: `${label}（個人）`, category: cat, amount: -personal, type: "expense", source: "ocr",
        items: personalItems.map(({ name, amount: a, quantity }) => ({ name, amount: a, quantity, type: "personal" })),
      }));
    }

    if (txsToAdd.length === 0) {
      txsToAdd.push(createTransaction({ date, label, category: cat, amount: -Number(amount), type: "expense", source: "ocr" }));
    }

    // 重複チェック（登録ボタン押下時）
    const firstTx = txsToAdd[0];
    const cands = findDuplicateCandidates(firstTx, existingTransactions);
    if (cands.length > 0) {
      setDupModal({ txs: txsToAdd, candidates: cands });
    } else {
      txsToAdd.forEach(tx => onAdd(tx));
      setOcrStep("done");
      setTimeout(() => { setOcrStep("upload"); setMode("select"); }, 1500);
    }
  };

  const handleDupModalDecide = (d) => {
    if (d !== "skip" && dupModal?.txs) {
      dupModal.txs.forEach(tx => onAdd(tx));
      setOcrStep("done");
      setTimeout(() => { setOcrStep("upload"); setMode("select"); }, 1500);
    } else {
      setOcrStep("upload");
    }
    setDupModal(null);
  };

  /** Gemini APIキーの疎通テスト */
  const handleTestGeminiKey = async () => {
    if (!geminiKey) { alert("Geminiキーを入力してください"); return; }
    setKeyTesting(true);
    setOcrError("");
    try {
      await testGeminiKey(geminiKey, () => {});
      alert("✅ Gemini APIキーが正常に動作しています！
レシートの撮影を試してください。");
    } catch (e) {
      setOcrError(e.message);
    } finally {
      setKeyTesting(false);
    }
  };

  /** テキスト貼り付けモード（Google Lens等からコピペして解析） */
  const handlePasteSubmit = (text) => {
    if (!text.trim()) return;
    const amt   = extractAmount(text);
    const dt    = extractDate(text);
    const store = extractStoreName(text);
    const items = extractReceiptItems(text).map(i => ({ ...i, type: "shared" }));
    const combined = [...(allRules || DEFAULT_CATEGORY_RULES), ...(learnedRules || [])];
    const res   = predictCategory(store, combined);
    setOcrLabel(store);
    setOcrAmount(amt ? String(amt) : "");
    setOcrDate(dt);
    setOcrItems(items);
    setOcrPreds(res.predictions);
    setOcrCat(res.isConfident ? res.topCategory : "食費");
    setOcrConfidence(null);
    setOcrStep("review");
  };

  /** 複数枚 OCR */

  const startOcrMultiple = async (files) => {
    const fileArr = Array.from(files);

    // ── 15枚制限チェック ──
    if (fileArr.length > 15) {
      alert(
        `一度に選択できる枚数は15枚までです。\n` +
        `（選択中: ${fileArr.length}枚）\n\n` +
        `15枚以下に減らして再選択してください。`
      );
      return;
    }

    setOcrQueue(fileArr); setOcrQueueIdx(1);
    setOcrStep("processing"); setOcrProgress(0);

    const results = [];
    for (let i = 0; i < fileArr.length; i++) {
      setOcrQueueIdx(i + 1); setOcrProgress(0); setOcrWaitSec(0);

      try {
        const result = await runOcr(fileArr[i], setOcrProgress);
        const { text, confidence, geminiData } = result;

        let store, amt, dt, items;
        if (geminiData) {
          // Gemini: 構造化データを直接使用（高精度）
          store = geminiData.storeName || "";
          amt   = geminiData.totalAmount || 0;
          dt    = geminiData.date || todayStr();
          items = (geminiData.items || []).map(item => ({
            name:      String(item.name  || ""),
            amount:    Math.abs(Number(item.amount) || 0),
            quantity:  Number(item.quantity) || 1,
            isDiscount: String(item.name || "").includes("割引"),
            type: "shared",
          }));
        } else {
          // OCR.space / Tesseract: テキストから抽出
          amt   = extractAmount(text)    || 0;
          dt    = extractDate(text)      || todayStr();
          store = extractStoreName(text) || "";
          items = extractReceiptItems(text).map(item => ({ ...item, type: "shared" }));
        }

        const correction = lookupCorrection(store);
        const finalLabel = correction?.label    || store;
        const learnedCat = correction?.category || null;
        const combined   = [...(allRules || DEFAULT_CATEGORY_RULES), ...(learnedRules || [])];
        const res        = predictCategory(finalLabel, combined);
        results.push({
          label: finalLabel, origLabel: store,
          amount: amt ? String(amt) : "", date: dt,
          cat: learnedCat || (res.isConfident ? res.topCategory : "食費"),
          confidence, ok: true, items, showItems: false,
        });
      } catch (err) {
        results.push({
          label: "（読み取り失敗）", amount: "", date: todayStr(),
          cat: "その他", confidence: 0, ok: false, items: [], showItems: false,
          error: err.message,
        });
      }

    }
    setOcrResults(results);
    if (fileArr.length === 1) {
      const r = results[0];
      // エラーの場合は upload 画面に戻して明確に表示
      if (!r.ok && r.error) {
        setOcrError(r.error);
        setOcrStep("upload");
        return;
      }
      setOcrLabel(r.label); setOcrAmount(r.amount); setOcrDate(r.date);
      setOcrCat(r.cat); setOcrConfidence(r.confidence); setOcrItems(r.items);
      setOcrStep("review");
    } else {
      setOcrStep("multi-review");
    }
  };

  /** 1枚 OCR */
  const startOcr = async (imageFile) => {
    setOcrStep("processing"); setOcrProgress(0); setOcrError("");
    try {
      const result = await runOcr(imageFile, setOcrProgress);
      const { text, confidence, geminiData } = result;
      setOcrConfidence(confidence);

      let store, amt, dt, items;
      if (geminiData) {
        store = geminiData.storeName || "";
        amt   = geminiData.totalAmount || 0;
        dt    = geminiData.date || todayStr();
        items = (geminiData.items || []).map(item => ({
          name:      String(item.name  || ""),
          amount:    Math.abs(Number(item.amount) || 0),
          quantity:  Number(item.quantity) || 1,
          isDiscount: String(item.name || "").includes("割引"),
          type: "shared",
        }));
      } else {
        amt   = extractAmount(text)    || 0;
        dt    = extractDate(text)      || todayStr();
        store = extractStoreName(text) || "";
        items = extractReceiptItems(text).map(item => ({ ...item, type: "shared" }));
      }

      // 学習補正を適用
      const correction = lookupCorrection(store);
      const finalLabel = correction?.label    || store;
      const learnedCat = correction?.category || null;
      setOcrOrigLabel(store);  // 元のGemini検出名を保存
      setOcrAmount(amt ? String(amt) : "");
      setOcrDate(dt);
      setOcrLabel(finalLabel);
      setOcrItems(items);
      const combined = [...(allRules || DEFAULT_CATEGORY_RULES), ...(learnedRules || [])];
      const res = predictCategory(finalLabel, combined);
      setOcrPreds(res.predictions);
      setOcrCat(learnedCat || (res.isConfident ? res.topCategory : "食費"));
      setOcrStep("review");
    } catch (e) {
      setOcrError(e.message || "OCR処理に失敗しました。もう一度お試しください。");
      setOcrStep("upload");
    }
  };

  const handleOcrFile = (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    startOcrMultiple(files);
  };

  // ─── select 画面 ──────────────────────────────────────────
  if (mode === "select") return (
    <div className="pb-20">
      <div className="bg-white px-4 pt-12 pb-4 border-b border-gray-100">
        <h1 className="text-xl font-bold text-gray-900">取引を追加</h1>
      </div>
      <div className="px-4 py-6 space-y-3">
        {[
          { id: "manual", icon: "✏️", title: "手動入力",           desc: "金額・カテゴリを直接入力" },
          { id: "ocr",    icon: "📷", title: "OCRレシート読み取り", desc: "レシートを撮影して自動入力" },
          { id: "csv",    icon: "📊", title: "CSVインポート",        desc: "銀行・カードの明細ファイルを取り込む" },
        ].map(item => (
          <button key={item.id} onClick={() => setMode(item.id)}
            className="w-full p-4 bg-white rounded-2xl border border-gray-200 text-left flex items-center gap-4 hover:border-indigo-300 hover:bg-indigo-50 transition-all duration-200">
            <span className="text-3xl">{item.icon}</span>
            <div><p className="text-sm font-bold text-gray-800">{item.title}</p><p className="text-xs text-gray-400 mt-0.5">{item.desc}</p></div>
            <span className="ml-auto text-gray-300">›</span>
          </button>
        ))}
      </div>
    </div>
  );

  // ─── manual 画面 ──────────────────────────────────────────
  if (mode === "manual") return (
    <div className="pb-20">
      {dupCandidates.length > 0 && pendingTx && (
        <DuplicateCheckModal newTx={pendingTx} candidates={dupCandidates} categories={categories} onDecide={handleDupDecide} />
      )}
      <div className="bg-white px-4 pt-12 pb-4 border-b border-gray-100 flex items-center gap-3">
        <button onClick={() => setMode("select")} className="text-gray-400 text-lg">←</button>
        <h1 className="text-xl font-bold text-gray-900">手動入力</h1>
      </div>
      <div className="px-4 py-5">
        <TransactionFormFields
          type={type} setType={setType} amount={amount} setAmount={setAmount}
          label={label} setLabel={setLabel} date={date} setDate={setDate}
          category={category} setCategory={setCategory}
          categories={categories}
          allRules={allRules || DEFAULT_CATEGORY_RULES} learnedRules={learnedRules || []}
        />
        <div className="mt-5">
          <PrimaryButton onClick={handleManualSubmit} variant={done ? "success" : "primary"}>
            {done ? "✅ 保存しました！" : "追加して保存"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );

  // ─── OCR 画面 ────────────────────────────────────────────
  if (mode === "ocr") return (
    <div className="pb-20">
      {/* 重複確認モーダル */}
      {dupModal && (
        <DuplicateCheckModal
          newTx={dupModal.txs[0]} candidates={dupModal.candidates}
          categories={categories} onDecide={handleDupModalDecide}
        />
      )}
      <div className="bg-white px-4 pt-12 pb-4 border-b border-gray-100 flex items-center gap-3">
        <button onClick={() => { setMode("select"); setOcrStep("upload"); }} className="text-gray-400 text-lg">←</button>
        <h1 className="text-xl font-bold text-gray-900">OCRレシート読み取り</h1>
      </div>
      <div className="px-4 py-5 space-y-4">

        {/* ── upload ── */}
        {ocrStep === "upload" && (
          <>
            {ocrError && (
              <div className="bg-rose-50 border border-rose-300 rounded-xl p-4">
                <p className="text-sm font-semibold text-rose-700 mb-1">OCR エラー</p>
                {ocrError.split("\n").map((line, i) => (
                  <p key={i} className="text-xs text-rose-600 leading-relaxed">{line}</p>
                ))}
                <p className="text-xs text-rose-400 mt-2">
                  ※ 上限エラーの場合は 1〜2分待ってから再試行してください
                </p>
              </div>
            )}
            {/* Gemini APIキー（最優先） */}
            <div className={`rounded-xl p-3 border ${geminiKey ? "bg-emerald-50 border-emerald-300" : "bg-gray-50 border-gray-200"}`}>
              <p className="text-xs font-semibold text-gray-600 mb-1.5">🤖 Gemini APIキー（最高精度・推奨）</p>
              <input type="text" value={geminiKey}
                onChange={e => { setGeminiKey(e.target.value); saveStorage("GEMINI_API_KEY", e.target.value); }}
                placeholder="未設定 → OCR.space/Tesseractを使用"
                className="w-full text-xs px-3 py-2 bg-white border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-emerald-300" />
              {geminiKey
                ? (
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-xs text-emerald-600 font-semibold flex-1">✅ Gemini OCR有効</p>
                    <button
                      onClick={handleTestGeminiKey}
                      disabled={keyTesting}
                      className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg font-medium disabled:opacity-50"
                    >
                      {keyTesting ? "テスト中..." : "🔍 テスト"}
                    </button>
                  </div>
                )
                : <p className="text-xs text-gray-400 mt-1">
                    💡 <a href="https://aistudio.google.com" target="_blank" rel="noopener noreferrer" className="text-indigo-500 underline">aistudio.google.com</a>
                    {" "}→ Get API Key（無料・1日1500回）
                  </p>
              }
            </div>
            {/* OCR.space APIキー（Geminiなし時のフォールバック） */}
            {!geminiKey && (
              <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                <p className="text-xs font-semibold text-gray-600 mb-1.5">🔑 OCR.space APIキー（代替）</p>
                <input type="text" value={ocrApiKey}
                  onChange={e => { setOcrApiKey(e.target.value); saveStorage("OCR_API_KEY", e.target.value); }}
                  placeholder="未設定 → Tesseract使用（精度低め）"
                  className="w-full text-xs px-3 py-2 bg-white border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-300" />
                {!ocrApiKey
                  ? <p className="text-xs text-amber-500 mt-1">GeminiキーかOCR.spaceキーの設定を推奨します</p>
                  : <p className="text-xs text-emerald-500 mt-1">✅ OCR.space有効</p>}
              </div>
            )}
            <input ref={ocrCameraRef} type="file" accept="image/*" capture="environment" onChange={handleOcrFile} className="hidden" />
            <button onClick={() => ocrCameraRef.current?.click()}
              className="w-full py-8 rounded-2xl border-2 border-dashed border-indigo-300 bg-indigo-50 flex flex-col items-center gap-3">
              <span className="text-5xl">📷</span>
              <p className="text-sm font-bold text-indigo-600">カメラでレシートを撮影</p>
              <p className="text-xs text-indigo-400">真正面から・明るい場所で</p>
            </button>
            <input ref={ocrFileRef} type="file" accept="image/*" multiple onChange={handleOcrFile} className="hidden" />
            <button onClick={() => ocrFileRef.current?.click()}
              className="w-full py-4 rounded-2xl border border-gray-200 bg-white flex items-center justify-center gap-3 px-4">
              <span className="text-xl">🖼️</span>
              <div className="text-left">
                <p className="text-sm font-semibold text-gray-600">画像を選択（複数枚OK）</p>
                <p className="text-xs text-gray-400">最大15枚まで · Gemini使用時は自動調整</p>
              </div>
            </button>

            {/* ── テキスト貼り付けボタン（推奨） ── */}
            <button onClick={() => { setPasteText(""); setOcrStep("paste"); }}
              className="w-full py-4 rounded-2xl border-2 border-emerald-300 bg-emerald-50 flex items-center gap-4 px-5">
              <span className="text-3xl">📋</span>
              <div className="text-left">
                <p className="text-sm font-bold text-emerald-700">テキストを貼り付け（おすすめ）</p>
                <p className="text-xs text-emerald-500">Google Lens等でコピーしたテキストを使う</p>
              </div>
            </button>

            <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 text-xs text-gray-500 space-y-1">
              <p className="font-semibold">📌 きれいに読み取るコツ</p>
              <p>・明るい場所で真正面から撮影</p>
              <p>・レシートを平らに伸ばす</p>
              <p>・文字が画面いっぱいに映るように</p>
            </div>
            {ocrHistory.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">🕐 最近のOCR登録</p>
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  {ocrHistory.map((h, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-2.5 border-b border-gray-50 last:border-b-0">
                      <div><p className="text-xs font-medium text-gray-700">{h.label || "（店舗名なし）"}</p><p className="text-xs text-gray-400">{h.date}</p></div>
                      <p className="text-xs font-bold text-rose-500">-¥{Number(h.amount).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── テキスト貼り付けモード ── */}
        {ocrStep === "paste" && (
          <div className="space-y-4">
            <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200 space-y-2">
              <p className="text-sm font-bold text-emerald-700">📋 テキスト貼り付けモード</p>
              <p className="text-xs text-emerald-600 leading-relaxed">
                Google Lens・iOS Live Text等でレシートのテキストをコピーして貼り付けてください。<br/>
                PDFは「テキスト選択 → コピー」でそのまま使えます。
              </p>
            </div>
            <div className="bg-blue-50 rounded-xl p-3 border border-blue-100 text-xs text-blue-600 space-y-1">
              <p className="font-semibold">おすすめツール</p>
              <p>📱 Google Lens → レシートを写真で撮る → テキストをコピー</p>
              <p>📱 iOSカメラ → 写真でLive Text → 全選択コピー</p>
              <p>📄 PDF → 文字を選択してコピー（そのまま貼り付けOK）</p>
            </div>
            <textarea
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              placeholder={"ここにテキストを貼り付け...\n\n例:\nウエルシア静岡川合店\n2026年05月20日\n合計 ¥12,162"}
              rows={10}
              className="w-full px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-300 font-mono leading-relaxed"
            />
            <PrimaryButton
              onClick={() => handlePasteSubmit(pasteText)}
              variant={pasteText.trim() ? "primary" : "disabled"}
            >
              🔍 テキストを解析する
            </PrimaryButton>
            <button onClick={() => setOcrStep("upload")} className="w-full text-center text-xs text-gray-400 py-2">
              ← 戻る
            </button>
          </div>
        )}

        {/* ── processing ── */}
        {ocrStep === "processing" && (
          <div className="text-center space-y-4 py-8">
            <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-500 rounded-full animate-spin mx-auto" />
            <p className="text-sm font-semibold text-gray-700">
              文字を認識中...{ocrQueue.length > 1 && ` (${ocrQueueIdx}/${ocrQueue.length}枚目)`}
            </p>
            <p className="text-xs text-gray-400">{geminiKey ? "Gemini AI で解析中" : ocrApiKey ? "OCR.space で解析中" : "処理中..."}</p>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div className="bg-indigo-500 h-2 rounded-full transition-all" style={{ width: `${ocrProgress}%` }} />
            </div>
            {ocrQueue.length > 1 && (
              <p className="text-xs text-gray-400">
                全体: {Math.round(Math.max(0, ocrQueueIdx - 1) / ocrQueue.length * 100)}%
                （残り約{Math.max(0, ocrQueue.length - ocrQueueIdx + 1) * 5}秒）
              </p>
            )}
          </div>
        )}

        {/* ── review（1枚）── */}
        {ocrStep === "review" && (
          <div className="space-y-4">
            {ocrConfidence !== null && (
              <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
                <p className="text-xs text-amber-700 font-semibold">
                  ⚠️ OCR結果を確認・修正してから登録してください（精度:
                  <span className={`font-bold ${ocrConfidence >= 70 ? "text-emerald-600" : ocrConfidence >= 50 ? "text-amber-600" : "text-rose-600"}`}>
                    {ocrConfidence}%
                  </span>）
                </p>
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-2">店舗名</label>
              <input type="text" value={ocrLabel}
                onChange={e => { setOcrLabel(e.target.value); const combined = [...(allRules || DEFAULT_CATEGORY_RULES), ...(learnedRules || [])]; const res = predictCategory(e.target.value, combined); setOcrPreds(res.predictions); if (res.isConfident) setOcrCat(res.topCategory); }}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
              {ocrPreds.length > 0 && <CategorySuggestion predictions={ocrPreds} selectedCategory={ocrCat} onSelect={cat => setOcrCat(cat)} />}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-2">金額</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">¥</span>
                <input type="number" value={ocrAmount} onChange={e => setOcrAmount(e.target.value)}
                  className="w-full pl-8 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-2xl font-bold outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-2">日付</label>
              <input type="date" value={ocrDate} onChange={e => setOcrDate(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-2">カテゴリ</label>
              <div className="grid grid-cols-3 gap-2">
                {categories.filter(c => c.type === "expense").map(cat => (
                  <button key={cat.id} onClick={() => setOcrCat(cat.name)}
                    className={`py-2 rounded-xl text-xs border transition-all ${ocrCat === cat.name ? "bg-indigo-500 text-white border-indigo-500 font-semibold" : "bg-white text-gray-600 border-gray-200"}`}>
                    {cat.emoji} {cat.name}
                  </button>
                ))}
              </div>
            </div>

            {/* 品目アコーディオン */}
            {ocrItems.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-2">
                  品目（共有/個人を選択）
                </label>
                <ItemsAccordion
                  items={ocrItems}
                  onToggleType={toggleOcrItemType}
                  totalAmount={Number(ocrAmount)}
                />
              </div>
            )}

            <PrimaryButton onClick={() => registerOcr(ocrLabel, ocrAmount, ocrDate, ocrCat, ocrItems)}>
              {ocrItems.length > 0 && calcSplit(ocrItems).personal > 0
                ? `✅ 2件に分けて登録（共有+個人）`
                : "✅ この内容で登録する"
              }
            </PrimaryButton>
          </div>
        )}

        {/* ── multi-review（複数枚）── */}
        {ocrStep === "multi-review" && (
          <div className="space-y-4">
            <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-100">
              <p className="text-sm font-bold text-indigo-700">📷 {ocrResults.length}枚の読み取りが完了</p>
              <p className="text-xs text-indigo-500 mt-0.5">品目の共有/個人を設定して一括登録できます</p>
            </div>
            <div className="space-y-3">
              {ocrResults.map((r, i) => (
                <div key={i} className={`bg-white rounded-xl border ${r.confidence < 60 ? "border-amber-200" : "border-gray-100"}`}>
                  <div className="flex items-center justify-between px-4 pt-3 pb-1">
                    <span className="text-xs text-gray-400">{i + 1}枚目</span>
                    {r.confidence < 60 && !geminiKey && <span className="text-xs text-amber-500">⚠️ 精度低（{r.confidence}%）</span>}
                  {r.error && <span className="text-xs text-rose-500">⚠️ {r.error.slice(0, 30)}</span>}
                  </div>
                  <div className="px-4 pb-2">
                    <input type="text" value={r.label}
                      onChange={e => setOcrResults(p => p.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                      className="w-full text-sm font-medium text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-indigo-300" />
                  </div>
                  <div className="px-4 pb-2 flex gap-2">
                    <div className="flex-1">
                      <p className="text-xs text-gray-400 mb-1">金額</p>
                      <div className="flex items-center gap-1">
                        <span className="text-sm text-rose-400 font-bold">¥</span>
                        <input type="number" value={r.amount}
                          onChange={e => setOcrResults(p => p.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))}
                          className="w-full text-base font-bold text-rose-500 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 outline-none" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-gray-400 mb-1">日付</p>
                      <input type="date" value={r.date}
                        onChange={e => setOcrResults(p => p.map((x, j) => j === i ? { ...x, date: e.target.value } : x))}
                        className="w-full text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-2 py-2 outline-none" />
                    </div>
                  </div>
                  <div className="px-4 pb-2">
                    <div className="flex flex-wrap gap-1.5">
                      {categories.filter(c => c.type === "expense").map(cat => (
                        <button key={cat.id}
                          onClick={() => setOcrResults(p => p.map((x, j) => j === i ? { ...x, cat: cat.name } : x))}
                          className={`px-2.5 py-1 rounded-lg text-xs border transition-all ${r.cat === cat.name ? "bg-indigo-500 text-white border-indigo-500 font-semibold" : "bg-white text-gray-500 border-gray-200"}`}>
                          {cat.emoji} {cat.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* 品目アコーディオン（複数枚） */}
                  {r.items && r.items.length > 0 && (
                    <div className="px-4 pb-3">
                      <ItemsAccordion
                        items={r.items}
                        onToggleType={(itemIdx, type) => toggleMultiItemType(i, itemIdx, type)}
                        totalAmount={Number(r.amount)}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
            <PrimaryButton onClick={() => {
              ocrResults.forEach(r => {
                if (!r.amount || !r.label) return;
                onLearnRule?.(r.label, r.cat, "expense");
                // 元の検出名と確定名が異なれば学習
                if (r.origLabel) saveCorrection(r.origLabel, r.label, r.cat);
                if (r.items && r.items.length > 0) {
                  const { shared, personal } = calcSplit(r.items);
                  const si = r.items.filter(i => (i.type || "shared") !== "personal");
                  const pi = r.items.filter(i => i.type === "personal");
                  if (shared   > 0) onAdd(createTransaction({
                    date: r.date, label: r.label, category: r.cat, amount: -shared, type: "expense", source: "ocr",
                    items: si.map(({ name, amount: a, quantity }) => ({ name, amount: a, quantity, type: "shared" })),
                  }));
                  if (personal > 0) onAdd(createTransaction({
                    date: r.date, label: `${r.label}（個人）`, category: r.cat, amount: -personal, type: "expense", source: "ocr",
                    items: pi.map(({ name, amount: a, quantity }) => ({ name, amount: a, quantity, type: "personal" })),
                  }));
                } else {
                  onAdd(createTransaction({ date: r.date, label: r.label, category: r.cat, amount: -Number(r.amount), type: "expense", source: "ocr" }));
                }
              });
              const hist = [...ocrResults.filter(r => r.label && r.amount).map(r => ({ label: r.label, amount: r.amount, date: r.date, cat: r.cat })), ...ocrHistory].slice(0, 5);
              setOcrHistory(hist); saveStorage(STORAGE_KEYS.OCR_HISTORY, hist);
              setOcrStep("done");
              setTimeout(() => { setOcrStep("upload"); setMode("select"); }, 1500);
            }}>
              ✅ {ocrResults.filter(r => r.amount).length}件をまとめて登録
            </PrimaryButton>
          </div>
        )}

        {/* ── done ── */}
        {ocrStep === "done" && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-xl font-bold text-gray-900">登録完了！</h2>
          </div>
        )}
      </div>
    </div>
  );

  // ─── CSV 画面 ────────────────────────────────────────────
  if (mode === "csv") return (
    <div className="pb-20">
      <div className="bg-white px-4 pt-12 pb-4 border-b border-gray-100 flex items-center gap-3">
        <button onClick={() => { setMode("select"); setCsvStep("upload"); }} className="text-gray-400 text-lg">←</button>
        <h1 className="text-xl font-bold text-gray-900">CSV / PDFインポート</h1>
      </div>
      <div className="px-4 py-5">

        {csvStep === "upload" && (
          <div className="space-y-4">
            {/* ファイル選択（メイン） */}
            <input ref={fileRef} type="file" accept=".csv,.pdf" multiple onChange={handleFileInput} className="hidden" />
            {csvPdfLoading ? (
              <div className="w-full py-10 rounded-2xl border-2 border-indigo-200 bg-indigo-50 flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
                <p className="text-sm font-bold text-indigo-600">読み込み中...</p>
                <p className="text-xs text-indigo-400">PDFは少し時間がかかります</p>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()}
                className="w-full py-10 rounded-2xl border-2 border-dashed border-indigo-300 bg-indigo-50 flex flex-col items-center gap-3">
                <span className="text-5xl">📂</span>
                <p className="text-sm font-bold text-indigo-600">CSV / PDFを選択（複数同時OK）</p>
                <div className="flex gap-2">
                  <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-medium">CSV</span>
                  <span className="text-xs bg-rose-100 text-rose-600 px-2 py-0.5 rounded-full font-medium">PDF</span>
                </div>
                <p className="text-xs text-indigo-400">フォーマットは自動で判定します</p>
              </button>
            )}

            {/* 手動選択（折りたたみ） */}
            <button onClick={() => setCsvShowOverride(p => !p)}
              className="w-full text-xs text-gray-400 flex items-center justify-center gap-1 py-1">
              ⚙️ フォーマットを手動で選ぶ {csvShowOverride ? "▲" : "▼"}
            </button>
            {csvShowOverride && (
              <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 space-y-2">
                {Object.entries(CSV_FORMATS).map(([id, f]) => (
                  <button key={id} onClick={() => setCsvFormat(id)}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${csvFormat===id ? "border-indigo-400 bg-indigo-50" : "border-gray-200 bg-white"}`}>
                    <p className="text-sm font-semibold text-gray-800">{f.label}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {f.sampleColumns.map(c => <span key={c} className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-mono">{c}</span>)}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* 対応フォーマット一覧 */}
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 space-y-2">
              <p className="text-xs font-semibold text-gray-500">✅ CSV自動対応</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.values(CSV_FORMATS).map(f => (
                  <span key={f.label} className="text-xs bg-white border border-gray-200 text-gray-600 px-2 py-1 rounded-full">{f.label}</span>
                ))}
              </div>
              <p className="text-xs font-semibold text-gray-500 mt-2">
                {geminiKey ? "✅ PDF対応（Gemini）" : "⚠️ PDF: Geminiキーで対応可"}
              </p>
              {!geminiKey && (
                <p className="text-xs text-gray-400">OCRレシート画面でGeminiキーを設定するとPDFも読み込めます</p>
              )}
            </div>
          </div>
        )}

        {csvStep === "empty" && (
          <div className="space-y-4">
            <div className="bg-amber-50 rounded-2xl p-5 border border-amber-200 text-center">
              <p className="text-3xl mb-3">🔍</p>
              <p className="text-sm font-bold text-amber-700 mb-2">0件でした</p>
              <p className="text-xs text-amber-600 leading-relaxed">選択したフォーマットがCSVと合っていない可能性があります。</p>
            </div>
            <PrimaryButton onClick={() => setCsvStep("upload")} variant="ghost">← 戻る</PrimaryButton>
          </div>
        )}

        {csvStep === "preview" && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <p className="text-sm font-bold text-gray-700">{csvRows.length}件を読み込みました</p>
              <button onClick={() => { setCsvStep("upload"); setCsvDetected(null); }} className="text-xs text-gray-400 underline">← 戻る</button>
            </div>
            {/* 自動判定バッジ */}
            {csvDetected && (
              <div className={`rounded-xl px-3 py-2 border flex items-center gap-2 ${csvDetected !== "generic" ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
                <span className="text-sm">{csvDetected !== "generic" ? "✅" : "⚠️"}</span>
                <div>
                  <p className="text-xs font-semibold text-gray-700">
                    {csvDetected !== "generic"
                      ? `自動判定: ${CSV_FORMATS[csvDetected]?.label || csvDetected}`
                      : "フォーマット不明（汎用モードで処理）"
                    }
                  </p>
                  {csvDetected === "generic" && (
                    <p className="text-xs text-amber-600">正しく読み込めない場合は手動選択してください</p>
                  )}
                </div>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-gray-50 rounded-xl p-2.5 text-center border border-gray-100">
                <p className="text-lg font-bold text-gray-800">{Object.values(csvChecked).filter(Boolean).length}</p>
                <p className="text-xs text-gray-400 mt-0.5">選択中</p>
              </div>
              <div className="bg-amber-50 rounded-xl p-2.5 text-center border border-amber-100">
                <p className="text-lg font-bold text-amber-600">{csvRows.filter(r => r.isDuplicate).length}</p>
                <p className="text-xs text-amber-400 mt-0.5">重複</p>
              </div>
              <div className="bg-indigo-50 rounded-xl p-2.5 text-center border border-indigo-100">
                <p className="text-xs font-bold text-indigo-600 leading-tight mt-1">
                  {fmtCurrency(csvRows.filter((_, i) => csvChecked[i] && csvRows[i]?.type === "expense").reduce((s, r) => s + Math.abs(r.amount), 0))}
                </p>
                <p className="text-xs text-indigo-400 mt-0.5">支出合計</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { const n = {}; csvRows.forEach((_, i) => n[i] = true); setCsvChecked(n); }} className="text-xs text-indigo-500 font-semibold">すべて選択</button>
              <span className="text-xs text-gray-300">|</span>
              <button onClick={() => { const n = {}; csvRows.forEach((r, i) => n[i] = !r.isDuplicate); setCsvChecked(n); }} className="text-xs text-indigo-500 font-semibold">重複以外</button>
            </div>
            <div className="bg-white rounded-xl overflow-hidden border border-gray-100">
              {csvRows.map((r, i) => (
                <div key={i} className={`border-b border-gray-50 last:border-b-0 ${r.isDuplicate ? "bg-amber-50" : ""}`}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <input type="checkbox" checked={!!csvChecked[i]} onChange={() => setCsvChecked(p => ({ ...p, [i]: !p[i] }))} className="accent-indigo-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0" onClick={() => setCsvEditIdx(csvEditIdx === i ? null : i)}>
                      <div className="flex items-center gap-1">
                        <p className="text-sm font-medium text-gray-800 truncate">{r.label}</p>
                        {r.isDuplicate && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full flex-shrink-0">重複</span>}
                      </div>
                      <p className="text-xs text-gray-400">{r.category} · {r.date}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <p className={`text-sm font-bold ${r.type === "income" ? "text-emerald-500" : "text-rose-500"}`}>
                        {r.type === "income" ? "+" : "-"}{fmtCurrency(r.amount)}
                      </p>
                      <button onClick={() => setCsvEditIdx(csvEditIdx === i ? null : i)} className="text-gray-300 text-xs">✏️</button>
                    </div>
                  </div>
                  {csvEditIdx === i && (
                    <div className="px-4 pb-3 space-y-2 bg-gray-50 border-t border-gray-100">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-xs text-gray-400 mb-1">店舗名</p>
                          <input type="text" value={r.label} onChange={e => updateCsvRow(i, "label", e.target.value)}
                            className="w-full text-xs px-2 py-1.5 bg-white border border-gray-200 rounded-lg outline-none" />
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 mb-1">金額</p>
                          <input type="number" value={Math.abs(r.amount)}
                            onChange={e => updateCsvRow(i, "amount", r.type === "expense" ? -Number(e.target.value) : Number(e.target.value))}
                            className="w-full text-xs px-2 py-1.5 bg-white border border-gray-200 rounded-lg outline-none" />
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 mb-1">日付</p>
                          <input type="date" value={r.date} onChange={e => updateCsvRow(i, "date", e.target.value)}
                            className="w-full text-xs px-2 py-1.5 bg-white border border-gray-200 rounded-lg outline-none" />
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 mb-1">カテゴリ</p>
                          <select value={r.category} onChange={e => updateCsvRow(i, "category", e.target.value)}
                            className="w-full text-xs px-2 py-1.5 bg-white border border-gray-200 rounded-lg outline-none">
                            {categories.map(c => <option key={c.id} value={c.name}>{c.emoji}{c.name}</option>)}
                          </select>
                        </div>
                      </div>
                      <button onClick={() => setCsvEditIdx(null)} className="text-xs text-indigo-500 font-semibold">完了 ✓</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <PrimaryButton onClick={execCSVImport}>✅ {Object.values(csvChecked).filter(Boolean).length}件をインポート</PrimaryButton>
          </div>
        )}

        {csvStep === "done" && csvSummary && (
          <div className="space-y-4 py-6">
            <div className="text-center"><div className="text-5xl mb-3">✅</div><h2 className="text-xl font-bold text-gray-900">インポート完了！</h2></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-indigo-50 rounded-2xl p-3 border border-indigo-100 text-center"><p className="text-2xl font-bold text-indigo-600">{csvSummary.count}</p><p className="text-xs text-indigo-400 mt-1">インポート件数</p></div>
              <div className="bg-gray-50 rounded-2xl p-3 border border-gray-200 text-center"><p className="text-2xl font-bold text-gray-500">{csvSummary.skipped}</p><p className="text-xs text-gray-400 mt-1">スキップ（重複）</p></div>
              <div className="bg-rose-50 rounded-2xl p-3 border border-rose-100 text-center"><p className="text-sm font-bold text-rose-600">{fmtCurrency(csvSummary.expTotal)}</p><p className="text-xs text-rose-400 mt-1">支出合計</p></div>
              <div className="bg-emerald-50 rounded-2xl p-3 border border-emerald-100 text-center"><p className="text-sm font-bold text-emerald-600">{fmtCurrency(csvSummary.incTotal)}</p><p className="text-xs text-emerald-400 mt-1">収入合計</p></div>
            </div>
            <PrimaryButton onClick={() => { setCsvStep("upload"); setMode("select"); }}>ホームに戻る</PrimaryButton>
          </div>
        )}
      </div>
    </div>
  );

  return null;
}
