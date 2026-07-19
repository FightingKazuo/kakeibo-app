import { useState, useRef } from "react";
import { todayStr } from "../../utils/format";
import { createTransaction, findDuplicateCandidates } from "../../services/transaction";
import { predictCategory } from "../../services/categoryPredictor";
import { DEFAULT_CATEGORY_RULES, STORAGE_KEYS } from "../../constants";
import { loadStorage, saveStorage } from "../../utils/storage";
import { runTesseract, runOCRSpace, extractAmount, extractDate, extractStoreName, extractReceiptItems } from "../../services/ocrUtils";
import { analyzeWithGemini, testGeminiKey, parseOCRTextWithGemini } from "../../services/geminiOcr";
import { learnTaxRule, describeTaxDiff, calcTaxInclusive } from "../../services/taxLearning";
import { CategorySuggestion } from "../common/CategorySuggestion";
import { DuplicateCheckModal } from "../common/DuplicateCheckModal";
import { PrimaryButton } from "../ui/PrimaryButton";
import { ItemsAccordion } from "./shared/ItemsAccordion";
import { CsvOcrDupModal } from "./shared/CsvOcrDupModal";

export function OcrScanPage({ categories, allRules, learnedRules, members, pointAccounts, existingTransactions, onAdd, onDelete, onLearnRule, onBack }) {
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
  const [ocrPaidBy,     setOcrPaidBy]     = useState("");
  const [ocrPayMethod,  setOcrPayMethod]  = useState("cash");
  const [ocrShareType,  setOcrShareType]  = useState("shared"); // デフォルト: 共有
  const [ocrMemo,       setOcrMemo]       = useState("");
  const [ocrShareAmount, setOcrShareAmount] = useState(null); // ウエルシア20日用精算金額

  // ウエルシア20日デー判定
  const isWelcia20 = (label, date) => {
    const isWelcia = /ウエルシア|welcia/i.test(label);
    const is20th   = date?.slice(8, 10) === "20";
    return isWelcia && is20th;
  };
  const [ocrResults,    setOcrResults]    = useState([]);
  const [ocrApiKey,     setOcrApiKey]     = useState(() => loadStorage("OCR_API_KEY", "") || "");
  const [ocrCorrections, setOcrCorrections] = useState(() => loadStorage(STORAGE_KEYS.OCR_CORRECTIONS, {}) || {});
  const [ocrOrigLabel,  setOcrOrigLabel]  = useState("");
  const [geminiKey,     setGeminiKey]     = useState(() => loadStorage("GEMINI_API_KEY", "") || "");
  const [pasteText,     setPasteText]     = useState("");
  const [keyTesting,    setKeyTesting]    = useState(false);
  const [dupModal,      setDupModal]      = useState(null);

  const ocrFileRef   = useRef(null);
  const ocrCameraRef = useRef(null);

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
    const updated = { ...ocrCorrections, [rawLabel]: { label: correctedLabel, category, learnedAt: new Date().toISOString() } };
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
      confidence: 99, geminiData: r,
    }));
    return runTesseract(file, onProg).then(r => ({ ...r, geminiData: null }));
  };

  const calcSplit = (items) => {
    const shared   = items.filter(i => (i.type || "shared") !== "personal").reduce((s, i) => s + i.amount, 0);
    const personal = items.filter(i => i.type === "personal").reduce((s, i) => s + i.amount, 0);
    return { shared, personal };
  };

  const toggleOcrItemType    = (idx, type) => setOcrItems(p => p.map((item, i) => i === idx ? { ...item, type } : item));
  const editOcrItemAmount    = (idx, amount, unitPrice) => setOcrItems(p => p.map((item, i) => i === idx ? { ...item, amount, unitPrice: unitPrice ?? amount } : item));
  const editOcrItemQuantity  = (idx, quantity, amount) => setOcrItems(p => p.map((item, i) => i === idx ? { ...item, quantity, amount } : item));
  const toggleMultiItemType  = (ri, ii, type) => setOcrResults(p => p.map((r, i) => i !== ri ? r : { ...r, items: r.items.map((item, j) => j === ii ? { ...item, type } : item) }));

  const findCsvDuplicates = (date, amount) => {
    const amt = Math.abs(Number(amount));
    const dateObj = new Date(date);
    return existingTransactions.filter(tx => {
      if (tx.source !== "csv") return false;
      const diffDays = Math.abs(new Date(tx.date) - dateObj) / 86400000;
      if (diffDays > 3) return false;
      const txAmt = Math.abs(tx.amount);
      if (txAmt === 0 || amt === 0) return false;
      return Math.abs(txAmt - amt) / Math.max(txAmt, amt) <= 0.10;
    });
  };

  const mergeOcrItemsIntoCSV = (csvTx, ocrTxs) => ({
    ...csvTx, items: ocrTxs.flatMap(t => t.items || []),
    source: "csv", updatedAt: new Date().toISOString(),
  });

  const registerOcr = (label, amount, date, cat, items) => {
    // 品目カテゴリー未設定のものは取引カテゴリーを引き継ぐ
    const itemsWithCat = (items || []).map(item => ({
      ...item,
      category: (item.category && item.category !== "その他") ? item.category : cat,
    }));
    if (!amount || !label) { alert("金額と内容を入力してください"); return; }
    onLearnRule?.(label, cat, "expense");
    if (ocrOrigLabel) saveCorrection(ocrOrigLabel, label, cat);

    const receiptTotal = Number(amount);
    if (items && items.length > 0) {
      learnTaxRule(label, items.reduce((s, i) => s + i.amount, 0), receiptTotal);
    }

    const hist = [{ label, amount, date, cat }, ...ocrHistory].slice(0, 5);
    setOcrHistory(hist); saveStorage(STORAGE_KEYS.OCR_HISTORY, hist);

    let finalItems = itemsWithCat;
    let remainder  = 0;
    if (finalItems.length > 0) {
      const { items: converted, remainder: rem, isTaxExclusive } = calcTaxInclusive(finalItems, receiptTotal);
      if (isTaxExclusive) { finalItems = converted; remainder = rem; }
    }

    const allItems = remainder !== 0
      ? [...finalItems, { name: remainder > 0 ? "消費税等" : "値引き等", amount: remainder, quantity: 1, unitPrice: remainder, type: "shared" }]
      : finalItems;

    const txsToAdd = [];
    if (allItems.length > 0) {
      const sharedItems   = allItems.filter(i => (i.type || "shared") !== "personal" && i.type !== "partner");
      const personalItems = allItems.filter(i => i.type === "personal");
      const partnerItems  = allItems.filter(i => i.type === "partner");
      const sharedAmt  = sharedItems.reduce((s, i) => s + i.amount, 0);
      const personAmt  = personalItems.reduce((s, i) => s + i.amount, 0);
      const partnerAmt = partnerItems.reduce((s, i) => s + i.amount, 0);
      const finalSharedAmt = sharedAmt + (receiptTotal - (sharedAmt + personAmt + partnerAmt));

      const selfId    = members?.[0]?.id || null;
      const isSelfPay = !ocrPaidBy || ocrPaidBy === selfId;
      // ウエルシア20日：自分払いのみWAONから引く（shareAmountが設定済みの場合）
      const waonConsumeAmount = (ocrShareAmount && isSelfPay) ? ocrShareAmount : null;

      const base = {
        date, label, category: cat, type: "expense", source: "ocr",
        memo: ocrMemo || "",
        paidBy: ocrPaidBy || null,
        shareType: ocrShareType || "shared",
        paymentMethod: ocrPayMethod,
        pointAccountId: ocrPayMethod !== "cash" ? ocrPayMethod : null,
        shareAmount: ocrShareAmount || null,
        ...(waonConsumeAmount ? { pointConsumeAmount: waonConsumeAmount } : {}),
      };
      if (finalSharedAmt > 0) txsToAdd.push(createTransaction({ ...base, amount: -finalSharedAmt, items: sharedItems.map(({ name, amount: a, quantity, taxRate, category }) => ({ name, amount: a, quantity, type: "shared",   taxRate, category })) }));
      if (personAmt  > 0) txsToAdd.push(createTransaction({ ...base, label: `${label}（個人）`,            amount: -personAmt,  items: personalItems.map(({ name, amount: a, quantity, taxRate, category }) => ({ name, amount: a, quantity, type: "personal", taxRate, category })) }));
      if (partnerAmt > 0) txsToAdd.push(createTransaction({ ...base, label: `${label}（パートナー負担）`, amount: -partnerAmt, items: partnerItems.map(({ name, amount: a, quantity, taxRate, category }) => ({ name, amount: a, quantity, type: "partner",  taxRate, category })) }));
    }

    if (txsToAdd.length === 0) {
      txsToAdd.push(createTransaction({ date, label, category: cat, amount: -receiptTotal, type: "expense", source: "ocr", shareType: ocrShareType || "shared", paidBy: ocrPaidBy || null, paymentMethod: ocrPayMethod, pointAccountId: ocrPayMethod !== "cash" ? ocrPayMethod : null }));
    }

    const csvDups = findCsvDuplicates(date, amount);
    if (csvDups.length > 0) { setDupModal({ txs: txsToAdd, candidates: csvDups, type: "csv-ocr" }); return; }

    const cands = findDuplicateCandidates(txsToAdd[0], existingTransactions);
    if (cands.length > 0) { setDupModal({ txs: txsToAdd, candidates: cands, type: "exact" }); }
    else { txsToAdd.forEach(tx => onAdd(tx)); setOcrStep("done"); setTimeout(() => { setOcrStep("upload"); onBack(); }, 1500); }
  };

  const handleDupModalDecide = (d) => {
    if (d === "merge" && dupModal?.txs && dupModal?.candidates) {
      const merged = mergeOcrItemsIntoCSV(dupModal.candidates[0], dupModal.txs);
      onDelete?.(dupModal.candidates[0].id); onAdd(merged);
    } else if (d === "ocr-win" && dupModal?.txs) {
      dupModal.candidates.forEach(tx => onDelete?.(tx.id)); dupModal.txs.forEach(tx => onAdd(tx));
    } else if (d === "both" && dupModal?.txs) {
      dupModal.txs.forEach(tx => onAdd(tx));
    } else if (d !== "skip" && dupModal?.txs && dupModal.type === "exact") {
      dupModal.txs.forEach(tx => onAdd(tx));
    } else { setDupModal(null); return; }
    setDupModal(null); setOcrStep("done");
    setTimeout(() => { setOcrStep("upload"); onBack(); }, 1500);
  };

  const handleTestGeminiKey = async () => {
    if (!geminiKey) { alert("Geminiキーを入力してください"); return; }
    setKeyTesting(true); setOcrError("");
    try { await testGeminiKey(geminiKey, () => {}); alert("✅ Gemini APIキーが正常に動作しています！"); }
    catch (e) { setOcrError(e.message); }
    finally { setKeyTesting(false); }
  };

  const handlePasteSubmit = (text) => {
    if (!text.trim()) return;
    const amt = extractAmount(text); const dt = extractDate(text); const store = extractStoreName(text);
    const items = extractReceiptItems(text).map(i => ({ ...i, type: "shared" }));
    const combined = [...(allRules || DEFAULT_CATEGORY_RULES), ...(learnedRules || [])];
    const res = predictCategory(store, combined);
    setOcrLabel(store); setOcrAmount(amt ? String(amt) : ""); setOcrDate(dt); setOcrItems(items);
    setOcrPreds(res.predictions); setOcrCat(res.isConfident ? res.topCategory : "食費");
    setOcrConfidence(null); setOcrStep("review");
  };

  const processOcrResult = (result, store, amt, dt, items) => {
    const correction = lookupCorrection(store);
    const finalLabel = correction?.label || store;
    const learnedCat = correction?.category || null;
    const combined   = [...(allRules || DEFAULT_CATEGORY_RULES), ...(learnedRules || [])];
    const res        = predictCategory(finalLabel, combined);
    // ルールマッチがあればそれを優先、なければ信頼度が高いGemini予測、最後に「その他」
    const ruleCat    = (() => {
      const labelLower = finalLabel.toLowerCase();
      const matched = combined.find(rule => rule.keywords?.some(kw => labelLower.includes(kw.toLowerCase())));
      return matched?.category || null;
    })();
    const autoCat    = learnedCat || ruleCat || (res.isConfident ? res.topCategory : "その他");
    return { label: finalLabel, origLabel: store, amount: amt ? String(amt) : "", date: dt, cat: autoCat, confidence: result.confidence, ok: true, items, showItems: false };
  };

  const extractFromResult = (result) => {
    const { text, geminiData } = result;
    if (geminiData) {
      return {
        store: geminiData.storeName || "", amt: geminiData.totalAmount || 0, dt: geminiData.date || todayStr(),
        items: (geminiData.items || []).map(item => ({ name: String(item.name || ""), amount: Math.abs(Number(item.amount) || 0), quantity: Number(item.quantity) || 1, isDiscount: String(item.name || "").includes("割引"), type: "shared" })),
      };
    }
    return { amt: extractAmount(text) || 0, dt: extractDate(text) || todayStr(), store: extractStoreName(text) || "", items: extractReceiptItems(text).map(i => ({ ...i, type: "shared" })) };
  };

  const startOcrMultiple = async (files) => {
    const fileArr = Array.from(files);
    if (fileArr.length > 15) { alert(`一度に選択できる枚数は15枚までです。\n（選択中: ${fileArr.length}枚）`); return; }
    setOcrQueue(fileArr); setOcrQueueIdx(1); setOcrStep("processing"); setOcrProgress(0);
    const results = [];
    for (let i = 0; i < fileArr.length; i++) {
      setOcrQueueIdx(i + 1); setOcrProgress(0);
      try {
        const result = await runOcr(fileArr[i], setOcrProgress);
        const { store, amt, dt, items } = extractFromResult(result);
        results.push(processOcrResult(result, store, amt, dt, items));
      } catch (err) {
        results.push({ label: "（読み取り失敗）", amount: "", date: todayStr(), cat: "その他", confidence: 0, ok: false, items: [], showItems: false, error: err.message });
      }
    }
    setOcrResults(results);
    if (fileArr.length === 1) {
      const r = results[0];
      if (!r.ok && r.error) { setOcrError(r.error); setOcrStep("upload"); return; }
      setOcrLabel(r.label); setOcrAmount(r.amount); setOcrDate(r.date); setOcrCat(r.cat); setOcrConfidence(r.confidence); setOcrItems(r.items);
      // ウエルシア20日自動検出
      if (isWelcia20(r.label, r.date)) {
        const waon   = (pointAccounts || []).find(a => a.name === "WAON" || a.id === "pa2");
        const selfId = members?.[0]?.id || null;
        if (waon) {
          setOcrPayMethod(waon.id);
          setOcrPaidBy(selfId);  // 自分払いとして自動設定
          setOcrShareAmount(Math.round(Number(r.amount) / 1.5));
        }
      }
      setOcrStep("review");
    } else { setOcrStep("multi-review"); }
  };

  const handleOcrFile = (e) => { const files = e.target.files; if (!files || !files.length) return; startOcrMultiple(files); };

  return (
    <div className="pb-20">
      {dupModal?.type === "csv-ocr" && <CsvOcrDupModal ocrTxs={dupModal.txs} csvCandidates={dupModal.candidates} onDecide={handleDupModalDecide} />}
      {dupModal?.type === "exact"   && <DuplicateCheckModal newTx={dupModal.txs[0]} candidates={dupModal.candidates} categories={categories} onDecide={handleDupModalDecide} />}

      <div className="bg-white px-4 pt-12 pb-4 border-b border-gray-100 flex items-center gap-3">
        <button onClick={() => { onBack(); setOcrStep("upload"); }} className="text-gray-400 text-lg">←</button>
        <h1 className="text-xl font-bold text-gray-900">OCRレシート読み取り</h1>
      </div>

      <div className="px-4 py-5 space-y-4">
        {/* ── upload ── */}
        {ocrStep === "upload" && (
          <>
            {ocrError && (
              <div className="bg-rose-50 border border-rose-300 rounded-xl p-4">
                <p className="text-sm font-semibold text-rose-700 mb-1">OCR エラー</p>
                {ocrError.split("\n").map((line, i) => <p key={i} className="text-xs text-rose-600 leading-relaxed">{line}</p>)}
                <p className="text-xs text-rose-400 mt-2">※ 上限エラーの場合は 1〜2分待ってから再試行してください</p>
              </div>
            )}
            <div className={`rounded-xl p-3 border ${geminiKey ? "bg-emerald-50 border-emerald-300" : "bg-gray-50 border-gray-200"}`}>
              <p className="text-xs font-semibold text-gray-600 mb-1.5">🤖 Gemini APIキー（最高精度・推奨）</p>
              <input type="text" value={geminiKey} onChange={e => { setGeminiKey(e.target.value); saveStorage("GEMINI_API_KEY", e.target.value); }}
                placeholder="未設定 → OCR.space/Tesseractを使用"
                className="w-full text-xs px-3 py-2 bg-white border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-emerald-300" />
              {geminiKey ? (
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-xs text-emerald-600 font-semibold flex-1">✅ Gemini OCR有効</p>
                  <button onClick={handleTestGeminiKey} disabled={keyTesting} className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg font-medium disabled:opacity-50">
                    {keyTesting ? "テスト中..." : "🔍 テスト"}
                  </button>
                </div>
              ) : (
                <p className="text-xs text-gray-400 mt-1">
                  💡 <a href="https://aistudio.google.com" target="_blank" rel="noopener noreferrer" className="text-indigo-500 underline">aistudio.google.com</a> → Get API Key（無料・1日1500回）
                </p>
              )}
            </div>
            {!geminiKey && (
              <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                <p className="text-xs font-semibold text-gray-600 mb-1.5">🔑 OCR.space APIキー（代替）</p>
                <input type="text" value={ocrApiKey} onChange={e => { setOcrApiKey(e.target.value); saveStorage("OCR_API_KEY", e.target.value); }}
                  placeholder="未設定 → Tesseract使用（精度低め）"
                  className="w-full text-xs px-3 py-2 bg-white border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-300" />
                {!ocrApiKey ? <p className="text-xs text-amber-500 mt-1">GeminiキーかOCR.spaceキーの設定を推奨します</p> : <p className="text-xs text-emerald-500 mt-1">✅ OCR.space有効</p>}
              </div>
            )}
            <input ref={ocrCameraRef} type="file" accept="image/*" capture="environment" onChange={handleOcrFile} className="hidden" />
            <button onClick={() => ocrCameraRef.current?.click()} className="w-full py-8 rounded-2xl border-2 border-dashed border-indigo-300 bg-indigo-50 flex flex-col items-center gap-3">
              <span className="text-5xl">📷</span>
              <p className="text-sm font-bold text-indigo-600">カメラでレシートを撮影</p>
              <p className="text-xs text-indigo-400">真正面から・明るい場所で</p>
            </button>
            <input ref={ocrFileRef} type="file" accept="image/*" onChange={handleOcrFile} className="hidden" />
            <button onClick={() => ocrFileRef.current?.click()} className="w-full py-4 rounded-2xl border border-gray-200 bg-white flex items-center justify-center gap-3 px-4">
              <span className="text-xl">🖼️</span>
              <div className="text-left">
                <p className="text-sm font-semibold text-gray-600">画像を選択</p>
                <p className="text-xs text-gray-400">カメラロールから1枚選択</p>
              </div>
            </button>
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 text-xs text-gray-500 space-y-1">
              <p className="font-semibold">📌 きれいに読み取るコツ</p>
              <p>・明るい場所で真正面から撮影</p><p>・レシートを平らに伸ばす</p><p>・文字が画面いっぱいに映るように</p>
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

        {/* ── paste ── */}
        {ocrStep === "paste" && (
          <div className="space-y-4">
            <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200 space-y-2">
              <p className="text-sm font-bold text-emerald-700">📋 テキスト貼り付けモード</p>
              <p className="text-xs text-emerald-600 leading-relaxed">Google Lens・iOS Live Text等でレシートのテキストをコピーして貼り付けてください。</p>
            </div>
            <textarea value={pasteText} onChange={e => setPasteText(e.target.value)}
              placeholder={"ここにテキストを貼り付け...\n\n例:\nウエルシア静岡川合店\n2026年05月20日\n合計 ¥12,162"}
              rows={10} className="w-full px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-300 font-mono leading-relaxed" />
            <PrimaryButton onClick={() => handlePasteSubmit(pasteText)} variant={pasteText.trim() ? "primary" : "disabled"}>🔍 テキストを解析する</PrimaryButton>
            <button onClick={() => setOcrStep("upload")} className="w-full text-center text-xs text-gray-400 py-2">← 戻る</button>
          </div>
        )}

        {/* ── processing ── */}
        {ocrStep === "processing" && (
          <div className="text-center space-y-4 py-8">
            <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-500 rounded-full animate-spin mx-auto" />
            <p className="text-sm font-semibold text-gray-700">文字を認識中...{ocrQueue.length > 1 && ` (${ocrQueueIdx}/${ocrQueue.length}枚目)`}</p>
            <p className="text-xs text-gray-400">{geminiKey ? "Gemini AI で解析中" : ocrApiKey ? "OCR.space で解析中" : "処理中..."}</p>
            <div className="w-full bg-gray-100 rounded-full h-2"><div className="bg-indigo-500 h-2 rounded-full transition-all" style={{ width: `${ocrProgress}%` }} /></div>
            {ocrQueue.length > 1 && <p className="text-xs text-gray-400">全体: {Math.round(Math.max(0, ocrQueueIdx - 1) / ocrQueue.length * 100)}%（残り約{Math.max(0, ocrQueue.length - ocrQueueIdx + 1) * 5}秒）</p>}
          </div>
        )}

        {/* ── review（1枚）── */}
        {ocrStep === "review" && (
          <div className="space-y-4">
            {/* ウエルシア20日バナー */}
            {ocrShareAmount && (
              <div className="bg-blue-50 rounded-xl p-3 border border-blue-200">
                <p className="text-xs font-bold text-blue-700 mb-1">🛒 ウエルシア20日ポイント1.5倍デー</p>
                <p className="text-xs text-blue-600 leading-relaxed">
                  WAON払いを検出しました。精算時の共有費用は実質消費額
                  <span className="font-bold"> ¥{ocrShareAmount.toLocaleString()}</span>（合計÷1.5）で計算します。
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <button onClick={() => setOcrShareAmount(null)}
                    className="text-xs text-blue-400 underline">解除する</button>
                </div>
              </div>
            )}
            {ocrConfidence !== null && (
              <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
                <p className="text-xs text-amber-700 font-semibold">
                  ⚠️ OCR結果を確認・修正してから登録してください（精度:
                  <span className={`font-bold ${ocrConfidence >= 70 ? "text-emerald-600" : ocrConfidence >= 50 ? "text-amber-600" : "text-rose-600"}`}>{ocrConfidence}%</span>）
                </p>
              </div>
            )}
            {/* 品目が空で切れた場合の警告 */}
            {ocrItems.length === 0 && ocrAmount && (
              <div className="bg-orange-50 rounded-xl p-3 border border-orange-200">
                <p className="text-xs font-semibold text-orange-700">📋 品目が読み取れませんでした</p>
                <p className="text-xs text-orange-500 mt-0.5">品目数が多すぎてレスポンスが途中で切れた可能性があります。金額・店舗名を確認して登録してください。</p>
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
                <label className="block text-xs font-semibold text-gray-500 mb-2">品目（共有/個人・カテゴリを選択）</label>
                <ItemsAccordion
                  items={ocrItems}
                  onToggleType={toggleOcrItemType}
                  onEditAmount={editOcrItemAmount}
                  onEditQuantity={editOcrItemQuantity}
                  totalAmount={Number(ocrAmount)}
                  categories={categories}
                  onToggleCategory={(idx, cat) => setOcrItems(p => p.map((item, i) => i === idx ? { ...item, category: cat } : item))}
                />
              </div>
            )}
            {/* shareType選択 */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-2">種別</label>
              <div className="flex gap-2">
                {[
                  { type: "shared",   label: "🤝 共有",  cls: "bg-indigo-500" },
                  { type: "personal", label: "👤 個人",  cls: "bg-gray-500"   },
                  { type: "partner",  label: "👥 相手",  cls: "bg-purple-500" },
                ].map(({ type, label, cls }) => (
                  <button key={type} onClick={() => setOcrShareType(type)}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                      ocrShareType === type ? `${cls} text-white border-transparent` : "bg-white text-gray-500 border-gray-200"
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {members && members.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-2">支払者</label>
                <div className="flex gap-2">
                  {members.map(m => (
                    <button key={m.id} onClick={() => setOcrPaidBy(ocrPaidBy === m.id ? "" : m.id)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${ocrPaidBy === m.id ? "bg-indigo-500 text-white border-indigo-500" : "bg-white text-gray-600 border-gray-200"}`}>
                      👤 {m.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
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
                    {a.icon} {a.name}<span className="ml-1 opacity-70">({a.balance.toLocaleString()}{a.unit})</span>
                  </button>
                ))}
              </div>
            </div>
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
            {/* 備考欄 */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-2">📝 備考（任意）</label>
              <textarea
                value={ocrMemo}
                onChange={e => setOcrMemo(e.target.value)}
                placeholder="例: ガソリン代（車通勤用）、家族旅行のホテル代 など"
                rows={2}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
              />
            </div>
            <PrimaryButton onClick={() => registerOcr(ocrLabel, ocrAmount, ocrDate, ocrCat, ocrItems)}>
              {ocrItems.length > 0 && calcSplit(ocrItems).personal > 0 ? "✅ 2件に分けて登録（共有+個人）" : "✅ この内容で登録する"}
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
                    <input type="text" value={r.label} onChange={e => setOcrResults(p => p.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                      className="w-full text-sm font-medium text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-indigo-300" />
                  </div>
                  <div className="px-4 pb-2 flex gap-2">
                    <div className="flex-1">
                      <p className="text-xs text-gray-400 mb-1">金額</p>
                      <div className="flex items-center gap-1">
                        <span className="text-sm text-rose-400 font-bold">¥</span>
                        <input type="number" value={r.amount} onChange={e => setOcrResults(p => p.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))}
                          className="w-full text-base font-bold text-rose-500 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 outline-none" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-gray-400 mb-1">日付</p>
                      <input type="date" value={r.date} onChange={e => setOcrResults(p => p.map((x, j) => j === i ? { ...x, date: e.target.value } : x))}
                        className="w-full text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-2 py-2 outline-none" />
                    </div>
                  </div>
                  <div className="px-4 pb-2">
                    <div className="flex flex-wrap gap-1.5">
                      {categories.filter(c => c.type === "expense").map(cat => (
                        <button key={cat.id} onClick={() => setOcrResults(p => p.map((x, j) => j === i ? { ...x, cat: cat.name } : x))}
                          className={`px-2.5 py-1 rounded-lg text-xs border transition-all ${r.cat === cat.name ? "bg-indigo-500 text-white border-indigo-500 font-semibold" : "bg-white text-gray-500 border-gray-200"}`}>
                          {cat.emoji} {cat.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  {r.items && r.items.length > 0 && (
                    <div className="px-4 pb-3">
                      <ItemsAccordion items={r.items} onToggleType={(ii, type) => toggleMultiItemType(i, ii, type)} totalAmount={Number(r.amount)} />
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
                  if (shared   > 0) onAdd(createTransaction({ date: r.date, label: r.label, category: r.cat, amount: -shared, type: "expense", source: "ocr", items: si.map(({ name, amount: a, quantity }) => ({ name, amount: a, quantity, type: "shared" })) }));
                  if (personal > 0) onAdd(createTransaction({ date: r.date, label: `${r.label}（個人）`, category: r.cat, amount: -personal, type: "expense", source: "ocr", items: pi.map(({ name, amount: a, quantity }) => ({ name, amount: a, quantity, type: "personal" })) }));
                } else {
                  onAdd(createTransaction({ date: r.date, label: r.label, category: r.cat, amount: -Number(r.amount), type: "expense", source: "ocr" }));
                }
              });
              const hist = [...ocrResults.filter(r => r.label && r.amount).map(r => ({ label: r.label, amount: r.amount, date: r.date, cat: r.cat })), ...ocrHistory].slice(0, 5);
              setOcrHistory(hist); saveStorage(STORAGE_KEYS.OCR_HISTORY, hist);
              setOcrStep("done"); setTimeout(() => { setOcrStep("upload"); onBack(); }, 1500);
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
}
