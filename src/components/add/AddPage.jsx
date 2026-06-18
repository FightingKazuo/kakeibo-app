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
import { analyzeWithGemini, analyzePDFWithGemini, testGeminiKey, parseOCRTextWithGemini } from "../../services/geminiOcr";
import { DEFAULT_CATEGORY_RULES, CSV_FORMATS, STORAGE_KEYS } from "../../constants";
import { loadStorage, saveStorage } from "../../utils/storage";
import { fmtCurrency } from "../../utils/format";
import { TransactionFormFields } from "../common/TransactionFormFields";
import { DuplicateCheckModal } from "../common/DuplicateCheckModal";
import { CategorySuggestion } from "../common/CategorySuggestion";
import { PrimaryButton } from "../ui/PrimaryButton";
import { learnTaxRule, describeTaxDiff, calcTaxInclusive } from "../../services/taxLearning";

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
      <button
        onClick={() => onChange("partner")}
        className={`px-2 py-1 text-xs font-medium transition-all ${
          type === "partner" ? "bg-purple-400 text-white" : "bg-white text-gray-400"
        }`}
      >
        相手
      </button>
    </div>
  );
}

// ─── 品目リスト（アコーディオン）────────────────────────────
function ItemsAccordion({ items, onToggleType, onEditAmount, onEditQuantity, totalAmount }) {
  const [open, setOpen] = useState(false);
  if (!items || items.length === 0) return null;

  const sharedTotal   = items.filter(i => (i.type || "shared") === "shared").reduce((s, i) => s + i.amount, 0);
  const personalTotal = items.filter(i => i.type === "personal").reduce((s, i) => s + i.amount, 0);
  const partnerTotal  = items.filter(i => i.type === "partner").reduce((s, i) => s + i.amount, 0);
  const hasPersonal   = personalTotal > 0;
  const hasPartner    = partnerTotal > 0;
  const itemsSum      = items.reduce((s, i) => s + i.amount, 0);
  const diff          = totalAmount ? Math.round(totalAmount - itemsSum) : 0;
  const hasDiff       = Math.abs(diff) >= 2;

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(p => !p)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 text-sm"
      >
        <span className="font-medium text-gray-700">品目 {items.length}件</span>
        <div className="flex items-center gap-3">
          {hasPersonal && <span className="text-xs text-rose-500 font-medium">個人 {fmtCurrency(personalTotal)}</span>}
          {hasPartner  && <span className="text-xs text-purple-500 font-medium">相手 {fmtCurrency(partnerTotal)}</span>}
          <span className="text-xs text-indigo-500 font-medium">共有 {fmtCurrency(sharedTotal)}</span>
          {hasDiff && <span className="text-xs text-amber-500 font-medium">差額 ¥{Math.abs(diff)}</span>}
          <span className="text-gray-400">{open ? "▲" : "▼"}</span>
        </div>
      </button>
      {open && (
        <div className="divide-y divide-gray-50">
          {items.map((item, i) => (
            <div key={i} className={`px-4 py-2.5 ${
              item.type === "personal" ? "bg-rose-50" :
              item.type === "partner"  ? "bg-purple-50" : "bg-white"
            }`}>
              <div className="flex items-center gap-2 mb-1.5">
                <p className="text-xs font-medium text-gray-800 flex-1 truncate">{item.name}</p>
                <ItemTypeToggle type={item.type || "shared"} onChange={t => onToggleType(i, t)} />
              </div>
              {/* 単価×数量編集 */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-400">単価</span>
                <input
                  type="number"
                  value={item.unitPrice || item.amount}
                  onChange={e => {
                    const newUnitPrice = Number(e.target.value);
                    const newAmount    = newUnitPrice * (item.quantity || 1);
                    onEditAmount?.(i, newAmount, newUnitPrice);
                  }}
                  className="w-16 text-xs font-bold text-gray-700 text-right bg-gray-50 border border-gray-200 rounded-lg px-1.5 py-1 outline-none focus:ring-1 focus:ring-indigo-300"
                />
                <span className="text-xs text-gray-400">×</span>
                <input
                  type="number"
                  value={item.quantity || 1}
                  min={1}
                  onChange={e => {
                    const newQty    = Math.max(1, Number(e.target.value));
                    const newAmount = (item.unitPrice || item.amount) * newQty;
                    onEditQuantity?.(i, newQty, newAmount);
                  }}
                  className="w-12 text-xs font-bold text-gray-700 text-center bg-gray-50 border border-gray-200 rounded-lg px-1.5 py-1 outline-none focus:ring-1 focus:ring-indigo-300"
                />
                <span className="text-xs text-gray-400">=</span>
                <span className="text-xs font-bold text-gray-700">¥{item.amount.toLocaleString()}</span>
              </div>
            </div>
          ))}
          {/* 消費税等の差額表示 */}
          {hasDiff && (
            <div className={`flex items-center justify-between px-4 py-2.5 ${diff > 0 ? "bg-amber-50" : "bg-emerald-50"}`}>
              <p className="text-xs font-medium text-gray-600">
                {diff > 0 ? "🧾 消費税等" : "💰 値引き等"}
              </p>
              <p className={`text-xs font-bold ${diff > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                {diff > 0 ? `+¥${diff.toLocaleString()}` : `-¥${Math.abs(diff).toLocaleString()}`}
              </p>
            </div>
          )}
        </div>
      )}
      {(hasPersonal || hasPartner) && (
        <div className="px-4 py-2.5 bg-indigo-50 border-t border-indigo-100 text-xs">
          <div className="flex justify-between">
            <span className="text-indigo-600 font-medium">登録内訳</span>
            <span className="text-indigo-600">
              共有 {fmtCurrency(sharedTotal)}
              {hasPersonal && ` ＋ 個人 ${fmtCurrency(personalTotal)}`}
              {hasPartner  && ` ＋ 相手 ${fmtCurrency(partnerTotal)}`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CSV-OCR重複確認モーダル ─────────────────────────────────
function CsvOcrDupModal({ ocrTxs, csvCandidates, onDecide }) {
  const ocrAmt  = Math.abs(ocrTxs[0]?.amount || 0);
  const csvAmt  = Math.abs(csvCandidates[0]?.amount || 0);
  const ocrDate = ocrTxs[0]?.date || "";
  const ocrLabel = ocrTxs[0]?.label || "";
  const csvLabel = csvCandidates[0]?.label || "";
  const csvDate  = csvCandidates[0]?.date || "";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
      <div className="bg-white rounded-t-2xl w-full p-5 space-y-4 max-h-[85vh] overflow-y-auto">
        <div>
          <p className="text-sm font-bold text-gray-900">🔍 同じ支出かもしれません</p>
          <p className="text-xs text-gray-500 mt-1">日付と金額が近いCSVデータが見つかりました。どうしますか？</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-200">
            <p className="text-xs font-bold text-indigo-600 mb-1">📷 OCR（品目あり）</p>
            <p className="text-xs font-semibold text-gray-800 truncate">{ocrLabel}</p>
            <p className="text-xs text-gray-500">{ocrDate}</p>
            <p className="text-sm font-bold text-rose-500 mt-1">¥{ocrAmt.toLocaleString()}</p>
            {ocrTxs[0]?.items?.length > 0 && (
              <p className="text-xs text-indigo-500 mt-1">品目 {ocrTxs[0].items.length}件</p>
            )}
          </div>
          <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
            <p className="text-xs font-bold text-gray-500 mb-1">📊 CSV（品目なし）</p>
            <p className="text-xs font-semibold text-gray-800 truncate">{csvLabel}</p>
            <p className="text-xs text-gray-500">{csvDate}</p>
            <p className="text-sm font-bold text-rose-500 mt-1">¥{csvAmt.toLocaleString()}</p>
          </div>
        </div>
        <div className="space-y-2">
          <button
            onClick={() => onDecide("merge")}
            className="w-full py-3 bg-indigo-500 text-white rounded-xl text-sm font-bold"
          >
            ✅ CSVデータ＋品目情報をマージ（推奨）
          </button>
          <button
            onClick={() => onDecide("ocr-win")}
            className="w-full py-3 bg-white border border-gray-300 text-gray-700 rounded-xl text-sm font-medium"
          >
            📷 OCRを残してCSVを削除
          </button>
          <button
            onClick={() => onDecide("both")}
            className="w-full py-3 bg-white border border-gray-200 text-gray-500 rounded-xl text-sm font-medium"
          >
            両方残す
          </button>
          <button
            onClick={() => onDecide("skip")}
            className="w-full py-2 text-gray-400 text-xs"
          >
            キャンセル（登録しない）
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── メインコンポーネント ────────────────────────────────────
export function AddPage({ categories, existingTransactions, allRules, learnedRules, members, pointAccounts, onAdd, onDelete, onLearnRule }) {
  const [mode, setMode] = useState("select");

  // manual
  const [type,             setType]           = useState("expense");
  const [amount,           setAmount]         = useState("");
  const [label,            setLabel]          = useState("");
  const [manualPayMethod,  setManualPayMethod] = useState("cash"); // 支払方法
  const [date,          setDate]         = useState(todayStr());
  const [category,      setCategory]     = useState("");
  const [pendingTx,     setPendingTx]    = useState(null);
  const [dupCandidates, setDupCandidates]= useState([]);
  const [done,          setDone]         = useState(false);

  // csv
  const [csvFormat,        setCsvFormat]       = useState("generic");
  const [csvDetected,      setCsvDetected]     = useState(null);
  const [csvShowOverride,  setCsvShowOverride] = useState(false);
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
  const [ocrItems,      setOcrItems]      = useState([]);
  const [ocrQueue,      setOcrQueue]      = useState([]);
  const [ocrQueueIdx,   setOcrQueueIdx]   = useState(0);
  const [ocrWaitSec,    setOcrWaitSec]    = useState(0);
  const [ocrPaidBy,     setOcrPaidBy]     = useState(""); // 誰が払ったか
  const [ocrPayMethod,  setOcrPayMethod]  = useState("cash"); // 支払方法
  const [ocrResults,    setOcrResults]    = useState([]);
  const [ocrApiKey,     setOcrApiKey]     = useState(() => loadStorage("OCR_API_KEY", "") || "");
  const [ocrCorrections, setOcrCorrections] = useState(
    () => loadStorage(STORAGE_KEYS.OCR_CORRECTIONS, {}) || {}
  );
  const [ocrOrigLabel,   setOcrOrigLabel]   = useState("");
  const [geminiKey,     setGeminiKey]     = useState(() => loadStorage("GEMINI_API_KEY", "") || "");
  const [pasteText,     setPasteText]     = useState("");
  const [keyTesting,    setKeyTesting]    = useState(false);
  const [dupModal,      setDupModal]      = useState(null);
  const ocrFileRef   = useRef(null);
  const ocrCameraRef = useRef(null);

  // ─── helpers ───
  const lookupCorrection = (rawLabel) => {
    if (!rawLabel || !ocrCorrections) return null;
    const lower = rawLabel.toLowerCase().trim();
    if (ocrCorrections[rawLabel]) return ocrCorrections[rawLabel];
    for (const [k, v] of Object.entries(ocrCorrections)) {
      if (k.toLowerCase().trim() === lower) return v;
    }
    for (const [k, v] of Object.entries(ocrCorrections)) {
      const kl = k.toLowerCase().trim();
      if (kl.length >= 3 && (lower.includes(kl) || kl.includes(lower))) return v;
    }
    return null;
  };

  const saveCorrection = (rawLabel, correctedLabel, category) => {
    if (!rawLabel || rawLabel.trim() === "") return;
    const updated = {
      ...ocrCorrections,
      [rawLabel]: { label: correctedLabel, category, learnedAt: new Date().toISOString() },
    };
    setOcrCorrections(updated);
    saveStorage(STORAGE_KEYS.OCR_CORRECTIONS, updated);
  };

  const runOcr = (file, onProg) => {
    if (ocrApiKey && geminiKey) {
      return (async () => {
        onProg?.(5);
        const { text } = await runOCRSpace(file, ocrApiKey, (p) => onProg?.(5 + p * 0.5));
        onProg?.(55);
        const geminiData = await parseOCRTextWithGemini(text, geminiKey, (p) => onProg?.(55 + p * 0.45));
        onProg?.(100);
        return { text, confidence: 92, geminiData };
      })();
    }
    if (ocrApiKey) return runOCRSpace(file, ocrApiKey, onProg).then(r => ({ ...r, geminiData: null }));
    if (geminiKey) return analyzeWithGemini(file, geminiKey, onProg).then(r => ({
      text: `${r.storeName}\n${r.date}\n合計 ${r.totalAmount}`,
      confidence: 99,
      geminiData: r,
    }));
    return runTesseract(file, onProg).then(r => ({ ...r, geminiData: null }));
  };

  const calcSplit = (items) => {
    const shared   = items.filter(i => (i.type || "shared") !== "personal").reduce((s, i) => s + i.amount, 0);
    const personal = items.filter(i => i.type === "personal").reduce((s, i) => s + i.amount, 0);
    return { shared, personal };
  };

  const toggleOcrItemType = (idx, type) =>
    setOcrItems(p => p.map((item, i) => i === idx ? { ...item, type } : item));

  const editOcrItemAmount = (idx, amount, unitPrice) =>
    setOcrItems(p => p.map((item, i) => i === idx ? { ...item, amount, unitPrice: unitPrice ?? amount } : item));

  const editOcrItemQuantity = (idx, quantity, amount) =>
    setOcrItems(p => p.map((item, i) => i === idx ? { ...item, quantity, amount } : item));

  const toggleMultiItemType = (resultIdx, itemIdx, type) =>
    setOcrResults(p => p.map((r, ri) =>
      ri !== resultIdx ? r : {
        ...r,
        items: r.items.map((item, ii) => ii === itemIdx ? { ...item, type } : item),
      }
    ));

  const [manualPaidBy, setManualPaidBy] = useState("");

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
    const tx = createTransaction({
      date, label, category,
      amount: type === "expense" ? -Number(amount) : Number(amount),
      type, source: "manual",
      paidBy: manualPaidBy || null,
      paymentMethod: manualPayMethod,
      pointAccountId: manualPayMethod !== "cash" ? manualPayMethod : null,
    });
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
          if (geminiKey) {
            try {
              setCsvPdfLoading(true);
              const { cardName, transactions } = await analyzePDFWithGemini(file, geminiKey, () => {});
              detectedLabels.add(`${cardName}（PDF・Gemini）`);
              allRows = [...allRows, ...transactions];
            } catch (err) {
              errors.push(`${file.name}: ${err.message}`);
            }
          } else {
            try {
              const { transactions, format } = await parsePDF(file);
              detectedLabels.add(PDF_FORMAT_LABELS[format] || format);
              allRows = [...allRows, ...transactions];
            } catch {
              errors.push(`${file.name}: PDFの読み込みにはGeminiキーの設定を推奨します（設定 → OCRレシート画面）`);
            }
          }
        } else if (isCSV) {
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

      const seenKeys = new Set();
      allRows = allRows.filter(r => {
        const k = DUPLICATE_KEY(r);
        if (seenKeys.has(k)) return false;
        seenKeys.add(k); return true;
      });

      const detectedLabel = [...detectedLabels].join(" / ") || "generic";
      setCsvDetected(detectedLabel);

      const existKeys  = new Set(existingTransactions.map(DUPLICATE_KEY));
      // CSV-OCR重複検出（日付±3日・金額±10%）
      const findOcrDup = (row) => {
        const amt     = Math.abs(row.amount);
        const dateObj = new Date(row.date);
        return existingTransactions.find(tx => {
          if (tx.source !== "ocr") return false;
          const diffDays = Math.abs(new Date(tx.date) - dateObj) / 86400000;
          if (diffDays > 3) return false;
          const txAmt = Math.abs(tx.amount);
          if (txAmt === 0 || amt === 0) return false;
          const diff = Math.abs(txAmt - amt) / Math.max(txAmt, amt);
          return diff <= 0.10;
        });
      };
      const withDup = allRows.map(r => {
        const exactDup = existKeys.has(DUPLICATE_KEY(r));
        const ocrDup   = !exactDup ? findOcrDup(r) : null;
        return {
          ...r,
          isDuplicate:    exactDup,
          ocrDuplicate:   ocrDup || null,  // OCRとの重複候補
        };
      });
      // 重複 or カード引き落とし行は初期チェックOFF
      // カテゴリ設定済み（その他以外）は初期チェックON
      const init = {};
      withDup.forEach((r, i) => {
        const isDup = r.isDuplicate || r.isCardWithdrawal || !!r.ocrDuplicate;
        init[i] = !isDup; // 重複以外はデフォルトON
      });
      setCsvRows(withDup); setCsvChecked(init);
      setCsvStep(allRows.length === 0 ? "empty" : "preview");
    } catch {
      alert("ファイルの読み込みに失敗しました。");
    } finally {
      setCsvPdfLoading(false);
    }
  };

  const handleCSVFile = handleFileInput;

  // 重複行判定
  const isDupRow = (r) => r.isDuplicate || r.isCardWithdrawal || !!r.ocrDuplicate;

  // CSVリスト行レンダリング
  const renderCsvRow = (r, i) => {
    const isDup = isDupRow(r);
    const isCategorized = r.category !== "その他";
    return (
      <div key={i} className={`border-b border-gray-50 last:border-b-0 ${
        isDup ? "bg-gray-50 opacity-60" :
        isCategorized ? "bg-emerald-50" : "bg-white"
      }`}>
        <div className="flex items-center gap-3 px-4 py-3">
          <input type="checkbox"
            checked={!!csvChecked[i]}
            onChange={() => !isDup && setCsvChecked(p => ({ ...p, [i]: !p[i] }))}
            className="accent-indigo-500 flex-shrink-0"
            disabled={isDup}
          />
          <div className="flex-1 min-w-0" onClick={() => !isDup && setCsvEditIdx(csvEditIdx === i ? null : i)}>
            <div className="flex items-center gap-1 flex-wrap">
              <p className={`text-sm font-medium truncate ${isDup ? "text-gray-400" : "text-gray-800"}`}>{r.label}</p>
              {isCategorized && !isDup && (
                <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full flex-shrink-0">
                  {categories.find(c => c.name === r.category)?.emoji} {r.category}
                </span>
              )}
              {r.isDuplicate     && <span className="text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full flex-shrink-0">重複</span>}
              {r.isCardWithdrawal && <span className="text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full flex-shrink-0">💳 引落</span>}
              {r.ocrDuplicate    && <span className="text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full flex-shrink-0">📷 OCR重複</span>}
            </div>
            {r.ocrDuplicate && (
              <p className="text-xs text-gray-400 mt-0.5">
                OCR:「{r.ocrDuplicate.label}」と重複の可能性
              </p>
            )}
            <p className="text-xs text-gray-400">{r.date}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <p className={`text-sm font-bold ${isDup ? "text-gray-400" : r.type === "income" ? "text-emerald-500" : "text-rose-500"}`}>
              {r.type === "income" ? "+" : "-"}{fmtCurrency(r.amount)}
            </p>
            {!isDup && (
              <button onClick={() => setCsvEditIdx(csvEditIdx === i ? null : i)} className="text-gray-300 text-xs">✏️</button>
            )}
          </div>
        </div>
        {csvEditIdx === i && !isDup && (
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
    );
  };

  const execCSVImport = () => {
    const toImport = csvRows.filter((_, i) => csvChecked[i]);
    const expTotal = toImport.filter(r => r.type === "expense").reduce((s, r) => s + Math.abs(r.amount), 0);
    const incTotal = toImport.filter(r => r.type === "income").reduce((s, r) => s + r.amount, 0);
    // 自分のメンバーID（デフォルト: members[0]）
    const selfId = members?.[0]?.id || null;

    toImport.forEach(r => {
      // PayPayのCSVはPayPay口座から自動差し引き
      const payPayAccount = (pointAccounts || []).find(a => a.name === "PayPay");
      const isPayPay = csvDetected?.includes("PayPay") || csvDetected?.includes("paypay");
      const enriched = isPayPay && payPayAccount && r.type === "expense"
        ? { ...r, pointAccountId: payPayAccount.id, paymentMethod: payPayAccount.id }
        : r;

      // CSV取込の支出は「自分払い」「共有」を自動設定
      // 個人/相手が手動設定されている場合はそちらを優先
      const withPayer = enriched.type === "expense" ? {
        ...enriched,
        paidBy:    enriched.paidBy    || selfId,
        shareType: enriched.shareType || "shared",
      } : enriched;

      // OCR重複がある場合はマージ（CSVデータ主体＋OCRの品目を引き継ぐ）
      if (r.ocrDuplicate) {
        const ocrTx  = r.ocrDuplicate;
        const merged = {
          ...withPayer,
          items:  ocrTx.items || [],
          source: "csv",
        };
        onDelete?.(ocrTx.id);
        onAdd(createTransaction({ ...merged, source: "csv" }));
      } else {
        onAdd(createTransaction({ ...withPayer, source: "csv" }));
      }
      if (r.label && r.category) onLearnRule?.(r.label, r.category, r.type || "expense");
    });
    setCsvSummary({ count: toImport.length, skipped: csvRows.length - toImport.length, expTotal, incTotal });
    setCsvStep("done");
  };

  const updateCsvRow = (i, key, val) =>
    setCsvRows(p => p.map((r, j) => j === i ? { ...r, [key]: val } : r));

  // ─── ocr ───

  /** CSV重複候補を検索（日付±3日 ＋ 金額±10%以内） */
  const findCsvDuplicates = (date, amount) => {
    const amt     = Math.abs(Number(amount));
    const dateObj = new Date(date);
    return existingTransactions.filter(tx => {
      if (tx.source !== "csv") return false;
      // 日付±3日以内
      const diffDays = Math.abs(new Date(tx.date) - dateObj) / 86400000;
      if (diffDays > 3) return false;
      const txAmt = Math.abs(tx.amount);
      if (txAmt === 0 || amt === 0) return false;
      // 金額±10%以内（PayPayは手数料で多少ズレる）
      const diff = Math.abs(txAmt - amt) / Math.max(txAmt, amt);
      return diff <= 0.10;
    });
  };

  /** OCR品目をCSV取引にマージして更新する */
  const mergeOcrItemsIntoCSV = (csvTx, ocrTxs) => {
    const allItems = ocrTxs.flatMap(t => t.items || []);
    return {
      ...csvTx,
      items:     allItems,
      source:    "csv",            // CSV主体を維持
      updatedAt: new Date().toISOString(),
    };
  };

  const registerOcr = (label, amount, date, cat, items) => {
    if (!amount || !label) { alert("金額と内容を入力してください"); return; }
    onLearnRule?.(label, cat, "expense");
    if (ocrOrigLabel && (ocrOrigLabel !== label || true)) {
      saveCorrection(ocrOrigLabel, label, cat);
    }

    const receiptTotal = Number(amount);

    // ── 消費税学習＆8%税込み変換 ──
    if (items && items.length > 0) {
      const itemsTotal = items.reduce((s, i) => s + i.amount, 0);
      learnTaxRule(label, itemsTotal, receiptTotal);
    }

    const hist = [{ label, amount, date, cat }, ...ocrHistory].slice(0, 5);
    setOcrHistory(hist); saveStorage(STORAGE_KEYS.OCR_HISTORY, hist);

    // ── 8%税込み変換処理 ──
    let finalItems  = items || [];
    let remainder   = 0;
    if (finalItems.length > 0) {
      const { items: converted, remainder: rem, isTaxExclusive } = calcTaxInclusive(finalItems, receiptTotal);
      if (isTaxExclusive) {
        finalItems = converted;
        remainder  = rem;
      }
    }

    const txsToAdd = [];

    if (finalItems.length > 0) {
      // 残差（消費税等）を品目に追加
      const allItems = remainder !== 0
        ? [...finalItems, {
            name:      remainder > 0 ? "消費税等" : "値引き等",
            amount:    remainder,
            quantity:  1,
            unitPrice: remainder,
            type:      "shared",
          }]
        : finalItems;

      const itemsTotal2   = allItems.reduce((s, i) => s + i.amount, 0);
      const sharedItems   = allItems.filter(i => (i.type || "shared") !== "personal" && i.type !== "partner");
      const personalItems = allItems.filter(i => i.type === "personal");
      const partnerItems  = allItems.filter(i => i.type === "partner");

      const sharedAmt  = sharedItems.reduce((s, i) => s + i.amount, 0);
      const personAmt  = personalItems.reduce((s, i) => s + i.amount, 0);
      const partnerAmt = partnerItems.reduce((s, i) => s + i.amount, 0);

      // 合計をreceiptTotalに合わせる調整
      const totalCalc   = sharedAmt + personAmt + partnerAmt;
      const adjustment  = receiptTotal - totalCalc;

      // 調整分をsharedに加算
      const finalSharedAmt = sharedAmt + adjustment;

      if (finalSharedAmt > 0) txsToAdd.push(createTransaction({
        date, label, category: cat, amount: -finalSharedAmt, type: "expense", source: "ocr",
        paidBy: ocrPaidBy || null,
        paymentMethod: ocrPayMethod,
        pointAccountId: ocrPayMethod !== "cash" ? ocrPayMethod : null,
        items: sharedItems.map(({ name, amount: a, quantity, taxRate }) => ({ name, amount: a, quantity, type: "shared", taxRate })),
      }));
      if (personAmt > 0) txsToAdd.push(createTransaction({
        date, label: `${label}（個人）`, category: cat, amount: -personAmt, type: "expense", source: "ocr",
        paidBy: ocrPaidBy || null,
        paymentMethod: ocrPayMethod,
        pointAccountId: ocrPayMethod !== "cash" ? ocrPayMethod : null,
        items: personalItems.map(({ name, amount: a, quantity, taxRate }) => ({ name, amount: a, quantity, type: "personal", taxRate })),
      }));
      if (partnerAmt > 0) txsToAdd.push(createTransaction({
        date, label: `${label}（パートナー負担）`, category: cat, amount: -partnerAmt, type: "expense", source: "ocr",
        paidBy: ocrPaidBy || null,
        paymentMethod: ocrPayMethod,
        pointAccountId: ocrPayMethod !== "cash" ? ocrPayMethod : null,
        items: partnerItems.map(({ name, amount: a, quantity, taxRate }) => ({ name, amount: a, quantity, type: "partner", taxRate })),
      }));
    }

    if (txsToAdd.length === 0) {
      txsToAdd.push(createTransaction({
        date, label, category: cat, amount: -receiptTotal, type: "expense", source: "ocr",
        paidBy: ocrPaidBy || null,
        paymentMethod: ocrPayMethod,
        pointAccountId: ocrPayMethod !== "cash" ? ocrPayMethod : null,
      }));
    }

    // ── CSV重複チェック（日付＋金額±5%）──
    const csvDups = findCsvDuplicates(date, amount);
    if (csvDups.length > 0) {
      setDupModal({ txs: txsToAdd, candidates: csvDups, type: "csv-ocr" });
      return;
    }

    // ── 完全重複チェック ──
    const firstTx = txsToAdd[0];
    const cands = findDuplicateCandidates(firstTx, existingTransactions);
    if (cands.length > 0) {
      setDupModal({ txs: txsToAdd, candidates: cands, type: "exact" });
    } else {
      txsToAdd.forEach(tx => onAdd(tx));
      setOcrStep("done");
      setTimeout(() => { setOcrStep("upload"); setMode("select"); }, 1500);
    }
  };

  const handleDupModalDecide = (d) => {
    if (d === "merge" && dupModal?.txs && dupModal?.candidates) {
      // CSVデータ主体＋OCR品目を引き継ぐマージ
      const csvTx   = dupModal.candidates[0];
      const merged  = mergeOcrItemsIntoCSV(csvTx, dupModal.txs);
      onDelete?.(csvTx.id);      // 元のCSV取引を削除
      onAdd(merged);             // マージ済み取引を追加
      setOcrStep("done");
      setTimeout(() => { setOcrStep("upload"); setMode("select"); }, 1500);
    } else if (d === "ocr-win" && dupModal?.txs) {
      // OCRを残してCSVを削除
      dupModal.candidates.forEach(tx => onDelete?.(tx.id));
      dupModal.txs.forEach(tx => onAdd(tx));
      setOcrStep("done");
      setTimeout(() => { setOcrStep("upload"); setMode("select"); }, 1500);
    } else if (d === "both" && dupModal?.txs) {
      // 両方残す
      dupModal.txs.forEach(tx => onAdd(tx));
      setOcrStep("done");
      setTimeout(() => { setOcrStep("upload"); setMode("select"); }, 1500);
    } else if (d !== "skip" && dupModal?.txs && dupModal.type === "exact") {
      dupModal.txs.forEach(tx => onAdd(tx));
      setOcrStep("done");
      setTimeout(() => { setOcrStep("upload"); setMode("select"); }, 1500);
    } else {
      setOcrStep("upload");
    }
    setDupModal(null);
  };

  const handleTestGeminiKey = async () => {
    if (!geminiKey) { alert("Geminiキーを入力してください"); return; }
    setKeyTesting(true);
    setOcrError("");
    try {
      await testGeminiKey(geminiKey, () => {});
      alert("✅ Gemini APIキーが正常に動作しています！\nレシートの撮影を試してください。");
    } catch (e) {
      setOcrError(e.message);
    } finally {
      setKeyTesting(false);
    }
  };

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

  const startOcrMultiple = async (files) => {
    const fileArr = Array.from(files);

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

      const correction = lookupCorrection(store);
      const finalLabel = correction?.label    || store;
      const learnedCat = correction?.category || null;
      setOcrOrigLabel(store);
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
        {members && members.length > 0 && (
          <div className="mt-4">
            <label className="block text-xs font-semibold text-gray-500 mb-2">支払者</label>
            <div className="flex gap-2">
              {members.map(m => (
                <button key={m.id} onClick={() => setManualPaidBy(manualPaidBy === m.id ? "" : m.id)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                    manualPaidBy === m.id ? "bg-indigo-500 text-white border-indigo-500" : "bg-white text-gray-600 border-gray-200"
                  }`}>
                  👤 {m.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {/* 支払方法 */}
        <div className="mt-4">
          <label className="block text-xs font-semibold text-gray-500 mb-2">支払方法</label>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setManualPayMethod("cash")}
              className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${manualPayMethod === "cash" ? "bg-indigo-500 text-white border-indigo-500" : "bg-white text-gray-600 border-gray-200"}`}>
              💳 現金/カード
            </button>
            {(pointAccounts || []).map(a => (
              <button key={a.id} onClick={() => setManualPayMethod(a.id)}
                className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${manualPayMethod === a.id ? "bg-amber-500 text-white border-amber-500" : "bg-white text-gray-600 border-gray-200"}`}>
                {a.icon} {a.name}
                <span className="ml-1 opacity-70">({a.balance.toLocaleString()}{a.unit})</span>
              </button>
            ))}
          </div>
        </div>
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
      {/* CSV-OCR重複モーダル */}
      {dupModal?.type === "csv-ocr" && (
        <CsvOcrDupModal
          ocrTxs={dupModal.txs}
          csvCandidates={dupModal.candidates}
          onDecide={handleDupModalDecide}
        />
      )}
      {/* 通常重複モーダル */}
      {dupModal?.type === "exact" && (
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
            {ocrItems.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-2">
                  品目（共有/個人を選択）
                </label>
                <ItemsAccordion
                  items={ocrItems}
                  onToggleType={toggleOcrItemType}
                  onEditAmount={editOcrItemAmount}
                  onEditQuantity={editOcrItemQuantity}
                  totalAmount={Number(ocrAmount)}
                />
              </div>
            )}
            {/* 支払者選択 */}
            {members && members.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-2">支払者</label>
                <div className="flex gap-2">
                  {members.map(m => (
                    <button key={m.id} onClick={() => setOcrPaidBy(ocrPaidBy === m.id ? "" : m.id)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                        ocrPaidBy === m.id ? "bg-indigo-500 text-white border-indigo-500" : "bg-white text-gray-600 border-gray-200"
                      }`}>
                      👤 {m.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* 支払方法 */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-2">支払方法</label>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setOcrPayMethod("cash")}
                  className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${ocrPayMethod === "cash" ? "bg-indigo-500 text-white border-indigo-500" : "bg-white text-gray-600 border-gray-200"}`}>
                  💳 現金/カード
                </button>
                {(pointAccounts || []).map(a => (
                  <button key={a.id} onClick={() => setOcrPayMethod(a.id)}
                    className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${ocrPayMethod === a.id ? "bg-amber-500 text-white border-amber-500" : "bg-white text-gray-600 border-gray-200"}`}>
                    {a.icon} {a.name}
                    <span className="ml-1 opacity-70">({a.balance.toLocaleString()}{a.unit})</span>
                  </button>
                ))}
              </div>
            </div>
            {/* 消費税差額表示 */}
            {ocrItems.length > 0 && (() => {
              const itemsTotal = ocrItems.reduce((s, i) => s + i.amount, 0);
              const desc = describeTaxDiff(ocrLabel, itemsTotal, Number(ocrAmount));
              return desc ? (
                <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
                  <p className="text-xs font-semibold text-amber-600">🧾 {desc}</p>
                  <p className="text-xs text-amber-400 mt-0.5">この差額を学習して次回から自動表示します</p>
                </div>
              ) : null;
            })()}
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
            {csvDetected && (
              <div className={`rounded-xl px-3 py-2 border flex items-center gap-2 ${csvDetected !== "generic" ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
                <span className="text-sm">{csvDetected !== "generic" ? "✅" : "⚠️"}</span>
                <p className="text-xs font-semibold text-gray-700">
                  {csvDetected !== "generic"
                    ? `自動判定: ${CSV_FORMATS[csvDetected]?.label || csvDetected}`
                    : "フォーマット不明（汎用モードで処理）"
                  }
                </p>
              </div>
            )}

            {/* カウンター */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-gray-50 rounded-xl p-2.5 text-center border border-gray-100">
                <p className="text-lg font-bold text-gray-800">
                  {csvRows.filter((r, i) => csvChecked[i] && r.category === "その他" && !isDupRow(r)).length}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">未分類</p>
              </div>
              <div className="bg-emerald-50 rounded-xl p-2.5 text-center border border-emerald-100">
                <p className="text-lg font-bold text-emerald-600">
                  {csvRows.filter((r, i) => csvChecked[i] && r.category !== "その他" && !isDupRow(r)).length}
                </p>
                <p className="text-xs text-emerald-400 mt-0.5">適用済み</p>
              </div>
              <div className="bg-gray-100 rounded-xl p-2.5 text-center border border-gray-200">
                <p className="text-lg font-bold text-gray-400">
                  {csvRows.filter(r => isDupRow(r)).length}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">重複</p>
              </div>
            </div>

            {/* 一括カテゴリ変更 */}
            <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-100">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-indigo-600">🏷️ カテゴリを選択して消し込み</p>
                <div className="flex gap-2">
                  <button onClick={() => { const n = {}; csvRows.forEach((r, i) => n[i] = !isDupRow(r)); setCsvChecked(n); }}
                    className="text-xs text-indigo-500 font-semibold bg-white px-2 py-1 rounded-lg border border-indigo-200">全ON</button>
                  <button onClick={() => { const n = {}; csvRows.forEach((_, i) => n[i] = false); setCsvChecked(n); }}
                    className="text-xs text-gray-500 font-semibold bg-white px-2 py-1 rounded-lg border border-gray-200">全OFF</button>
                </div>
              </div>
              {/* 支出カテゴリ */}
              <p className="text-xs text-gray-500 font-semibold mb-1">💸 支出</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {categories.filter(c => c.type === "expense").map(cat => (
                  <button key={cat.id}
                    onClick={() => {
                      setCsvRows(p => p.map((r, i) => csvChecked[i] && !isDupRow(r) ? { ...r, category: cat.name } : r));
                      // カテゴリ適用後はチェックを解除
                      setCsvChecked(p => { const n = {...p}; csvRows.forEach((r, i) => { if (p[i] && !isDupRow(r)) n[i] = false; }); return n; });
                    }}
                    className="px-2.5 py-1 bg-white rounded-lg text-xs border border-indigo-200 text-gray-600 hover:bg-indigo-500 hover:text-white hover:border-indigo-500 transition-all">
                    {cat.emoji} {cat.name}
                  </button>
                ))}
              </div>
              {/* 収入カテゴリ */}
              <p className="text-xs text-gray-500 font-semibold mb-1">💰 収入（PayPay戻り等）</p>
              <div className="flex flex-wrap gap-1.5">
                {categories.filter(c => c.type === "income").map(cat => (
                  <button key={cat.id}
                    onClick={() => {
                      setCsvRows(p => p.map((r, i) => {
                        if (!csvChecked[i] || isDupRow(r)) return r;
                        return { ...r, category: cat.name, type: "income", amount: Math.abs(r.amount) };
                      }));
                      setCsvChecked(p => { const n = {...p}; csvRows.forEach((r, i) => { if (p[i] && !isDupRow(r)) n[i] = false; }); return n; });
                    }}
                    className="px-2.5 py-1 bg-white rounded-lg text-xs border border-emerald-200 text-gray-600 hover:bg-emerald-500 hover:text-white hover:border-emerald-500 transition-all">
                    {cat.emoji} {cat.name}
                  </button>
                ))}
                {/* 割り勘戻りショートカット */}
                <button
                  onClick={() => {
                    setCsvRows(p => p.map((r, i) => {
                      if (!csvChecked[i] || isDupRow(r)) return r;
                      return { ...r, category: "割り勘戻り", type: "income", amount: Math.abs(r.amount) };
                    }));
                    setCsvChecked(p => { const n = {...p}; csvRows.forEach((r, i) => { if (p[i] && !isDupRow(r)) n[i] = false; }); return n; });
                  }}
                  className="px-2.5 py-1 bg-white rounded-lg text-xs border border-emerald-200 text-gray-600 hover:bg-emerald-500 hover:text-white hover:border-emerald-500 transition-all">
                  🔄 割り勘戻り
                </button>
              </div>
              <p className="text-xs text-indigo-400 mt-1.5">チェックした件を選択→カテゴリボタンで変更</p>
            </div>

            {/* リスト：未分類 → 適用済み → 重複 の順 */}
            <div className="bg-white rounded-xl overflow-hidden border border-gray-100">
              {/* ① 未分類 */}
              {csvRows.filter((r, i) => csvChecked[i] && r.category === "その他" && !isDupRow(r)).length > 0 && (
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-500">📋 未分類</p>
                </div>
              )}
              {csvRows.map((r, i) => {
                if (isDupRow(r) || r.category !== "その他") return null;
                return renderCsvRow(r, i);
              })}

              {/* ② 適用済み */}
              {csvRows.filter((r, i) => csvChecked[i] && r.category !== "その他" && !isDupRow(r)).length > 0 && (
                <div className="px-4 py-2 bg-emerald-50 border-b border-emerald-100 border-t border-gray-100">
                  <p className="text-xs font-semibold text-emerald-600">✅ 適用済み</p>
                </div>
              )}
              {csvRows.map((r, i) => {
                if (isDupRow(r) || r.category === "その他") return null;
                return renderCsvRow(r, i);
              })}

              {/* ③ 重複（一番下・灰色） */}
              {csvRows.filter(r => isDupRow(r)).length > 0 && (
                <div className="px-4 py-2 bg-gray-100 border-t border-gray-200">
                  <p className="text-xs font-semibold text-gray-400">⊘ 重複（スキップ予定）</p>
                </div>
              )}
              {csvRows.map((r, i) => {
                if (!isDupRow(r)) return null;
                return renderCsvRow(r, i);
              })}
            </div>

            <PrimaryButton onClick={execCSVImport}>
              ✅ {csvRows.filter((r, i) => csvChecked[i]).length}件をインポート
            </PrimaryButton>
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
