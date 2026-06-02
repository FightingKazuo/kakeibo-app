import { useState, useRef } from "react";
import { todayStr } from "../../utils/format";
import { createTransaction, findDuplicateCandidates, DUPLICATE_KEY } from "../../services/transaction";
import { predictCategory } from "../../services/categoryPredictor";
import { parseCSVText, readCSVFile } from "../../services/csvParser";
import { runTesseract, runOCRSpace, extractAmount, extractDate, extractStoreName } from "../../services/ocrUtils";
import { DEFAULT_CATEGORY_RULES, CSV_FORMATS, STORAGE_KEYS } from "../../constants";
import { loadStorage, saveStorage } from "../../utils/storage";
import { fmtCurrency } from "../../utils/format";
import { TransactionFormFields } from "../common/TransactionFormFields";
import { DuplicateCheckModal } from "../common/DuplicateCheckModal";
import { CategorySuggestion } from "../common/CategorySuggestion";
import { PrimaryButton } from "../ui/PrimaryButton";

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
  const [csvFormat,   setCsvFormat]   = useState("generic");
  const [csvRows,     setCsvRows]     = useState([]);
  const [csvChecked,  setCsvChecked]  = useState({});
  const [csvStep,     setCsvStep]     = useState("upload");
  const [csvSummary,  setCsvSummary]  = useState(null);
  const [csvEditIdx,  setCsvEditIdx]  = useState(null); // 編集中の行インデックス
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
  const [ocrQueue,      setOcrQueue]      = useState([]);
  const [ocrQueueIdx,   setOcrQueueIdx]   = useState(0);
  const [ocrResults,    setOcrResults]    = useState([]);
  const [ocrApiKey,     setOcrApiKey]     = useState(() => loadStorage("OCR_API_KEY", "") || "");
  const ocrFileRef   = useRef(null);
  const ocrCameraRef = useRef(null);

  // ─── helpers ───
  const runOcr = (file, onProg) =>
    ocrApiKey
      ? runOCRSpace(file, ocrApiKey, onProg)
      : runTesseract(file, onProg);

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
    if (d === "skip") { setMode("select"); setPendingTx(null); }
    else finalAdd(pendingTx);
    setDupCandidates([]); setPendingTx(null);
  };

  // ─── manual ───
  const handleManualSubmit = () => {
    if (!amount || !category || !label) { alert("すべて入力してください"); return; }
    const tx = createTransaction({ date, label, category, amount: type==="expense" ? -Number(amount) : Number(amount), type, source:"manual" });
    checkAndAdd(tx);
  };

  // ─── csv ───
  const handleCSVFile = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const text    = await readCSVFile(file);
      const rows    = parseCSVText(text, csvFormat);
      const existKeys = new Set(existingTransactions.map(DUPLICATE_KEY));
      const withDup = rows.map(r => ({ ...r, isDuplicate: existKeys.has(DUPLICATE_KEY(r)) }));
      const init = {}; withDup.forEach((_, i) => init[i] = !withDup[i].isDuplicate);
      setCsvRows(withDup); setCsvChecked(init);
      setCsvStep(rows.length === 0 ? "empty" : "preview");
    } catch {
      alert("CSVの読み込みに失敗しました。ファイルを確認してください。");
    }
  };

  const execCSVImport = () => {
    const toImport = csvRows.filter((_, i) => csvChecked[i]);
    const skipped  = csvRows.length - toImport.length;
    const expTotal = toImport.filter(r => r.type==="expense").reduce((s, r) => s + Math.abs(r.amount), 0);
    const incTotal = toImport.filter(r => r.type==="income").reduce((s, r) => s + r.amount, 0);
    toImport.forEach(r => {
      onAdd(createTransaction({ ...r, source:"csv" }));
      if (r.label && r.category) onLearnRule?.(r.label, r.category, r.type || "expense");
    });
    setCsvSummary({ count: toImport.length, skipped, expTotal, incTotal });
    setCsvStep("done");
  };

  // CSVの行を編集
  const updateCsvRow = (i, key, val) =>
    setCsvRows(p => p.map((r, j) => j === i ? { ...r, [key]: val } : r));

  // ─── ocr ───
  const handleOcrAdd = (tx) => {
    onAdd(tx); setOcrStep("done");
    setTimeout(() => { setOcrStep("upload"); setMode("select"); }, 1500);
  };
  const handleOcrDupDecide = (d) => {
    if (d === "skip") { setPendingTx(null); setDupCandidates([]); }
    else { handleOcrAdd(pendingTx); setPendingTx(null); setDupCandidates([]); }
  };

  // 複数枚OCR処理
  const startOcrMultiple = async (files) => {
    const fileArr = Array.from(files);
    setOcrQueue(fileArr); setOcrQueueIdx(0);
    setOcrStep("processing"); setOcrProgress(0);
    const results = [];
    for (let i = 0; i < fileArr.length; i++) {
      setOcrQueueIdx(i + 1); setOcrProgress(0);
      try {
        const { text, confidence } = await runOcr(fileArr[i], setOcrProgress);
        const amt   = extractAmount(text);
        const dt    = extractDate(text);
        const store = extractStoreName(text);
        const combined = [...(allRules || DEFAULT_CATEGORY_RULES), ...(learnedRules || [])];
        const res   = predictCategory(store, combined);
        results.push({ label: store, amount: amt ? String(amt) : "", date: dt, cat: res.isConfident ? res.topCategory : "食費", confidence, ok: true });
      } catch {
        results.push({ label:"（読み取り失敗）", amount:"", date: todayStr(), cat:"その他", confidence: 0, ok: false });
      }
    }
    setOcrResults(results);
    if (fileArr.length === 1) {
      const r = results[0];
      setOcrLabel(r.label); setOcrAmount(r.amount); setOcrDate(r.date); setOcrCat(r.cat); setOcrConfidence(r.confidence);
      setOcrStep("review");
    } else {
      setOcrStep("multi-review");
    }
  };

  const startOcr = async (imageFile) => {
    setOcrStep("processing"); setOcrProgress(0); setOcrError("");
    try {
      const { text, confidence } = await runOcr(imageFile, setOcrProgress);
      setOcrConfidence(confidence);
      const amt   = extractAmount(text);
      const dt    = extractDate(text);
      const store = extractStoreName(text);
      setOcrAmount(amt ? String(amt) : "");
      setOcrDate(dt); setOcrLabel(store);
      const combined = [...(allRules || DEFAULT_CATEGORY_RULES), ...(learnedRules || [])];
      const res = predictCategory(store, combined);
      setOcrPreds(res.predictions);
      setOcrCat(res.isConfident ? res.topCategory : "食費");
      setOcrStep("review");
    } catch {
      setOcrError("OCR処理に失敗しました。もう一度お試しください。");
      setOcrStep("upload");
    }
  };

  const handleOcrFile = (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    startOcrMultiple(files);
  };

  const submitOcr = () => {
    if (!ocrAmount || !ocrLabel) { alert("金額と内容を入力してください"); return; }
    if (ocrLabel && ocrCat) onLearnRule?.(ocrLabel, ocrCat, "expense");
    const hist = [{ label: ocrLabel, amount: ocrAmount, date: ocrDate, cat: ocrCat }, ...ocrHistory].slice(0, 5);
    setOcrHistory(hist); saveStorage(STORAGE_KEYS.OCR_HISTORY, hist);
    const tx = createTransaction({ date: ocrDate, label: ocrLabel, category: ocrCat, amount: -Number(ocrAmount), type:"expense", source:"ocr" });
    const cands = findDuplicateCandidates(tx, existingTransactions);
    if (cands.length > 0) { setPendingTx(tx); setDupCandidates(cands); }
    else handleOcrAdd(tx);
  };

  // ─── renders ───
  if (mode === "select") return (
    <div className="pb-20">
      <div className="bg-white px-4 pt-12 pb-4 border-b border-gray-100">
        <h1 className="text-xl font-bold text-gray-900">取引を追加</h1>
      </div>
      <div className="px-4 py-6 space-y-3">
        {[
          { id:"manual", icon:"✏️", title:"手動入力",           desc:"金額・カテゴリを直接入力" },
          { id:"ocr",    icon:"📷", title:"OCRレシート読み取り", desc:"レシートを撮影して自動入力" },
          { id:"csv",    icon:"📊", title:"CSVインポート",        desc:"銀行・カードの明細ファイルを取り込む" },
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

  if (mode === "ocr") return (
    <div className="pb-20">
      {dupCandidates.length > 0 && pendingTx && (
        <DuplicateCheckModal newTx={pendingTx} candidates={dupCandidates} categories={categories} onDecide={handleOcrDupDecide} />
      )}
      <div className="bg-white px-4 pt-12 pb-4 border-b border-gray-100 flex items-center gap-3">
        <button onClick={() => { setMode("select"); setOcrStep("upload"); }} className="text-gray-400 text-lg">←</button>
        <h1 className="text-xl font-bold text-gray-900">OCRレシート読み取り</h1>
      </div>
      <div className="px-4 py-5">

        {/* ── upload ── */}
        {ocrStep === "upload" && (
          <div className="space-y-4">
            {ocrError && <div className="bg-rose-50 border border-rose-200 rounded-xl p-3"><p className="text-sm text-rose-600">⚠️ {ocrError}</p></div>}

            {/* APIキー設定 */}
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
              <p className="text-xs font-semibold text-gray-600 mb-1.5">🔑 OCR.space APIキー（高精度）</p>
              <input type="text" value={ocrApiKey}
                onChange={e => { setOcrApiKey(e.target.value); saveStorage("OCR_API_KEY", e.target.value); }}
                placeholder="未設定 → Tesseract使用（精度低め）"
                className="w-full text-xs px-3 py-2 bg-white border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-300" />
              {!ocrApiKey
                ? <p className="text-xs text-amber-500 mt-1">💡 ocr.space で無料APIキーを取得すると精度が大幅に上がります</p>
                : <p className="text-xs text-emerald-500 mt-1">✅ 高精度OCR有効</p>
              }
            </div>

            <input ref={ocrCameraRef} type="file" accept="image/*" capture="environment" onChange={handleOcrFile} className="hidden" />
            <button onClick={() => ocrCameraRef.current?.click()}
              className="w-full py-8 rounded-2xl border-2 border-dashed border-indigo-300 bg-indigo-50 flex flex-col items-center gap-3 transition-all duration-200 active:scale-98">
              <span className="text-5xl">📷</span>
              <p className="text-sm font-bold text-indigo-600">カメラでレシートを撮影</p>
              <p className="text-xs text-indigo-400">真正面から・明るい場所で</p>
            </button>

            <input ref={ocrFileRef} type="file" accept="image/*" multiple onChange={handleOcrFile} className="hidden" />
            <button onClick={() => ocrFileRef.current?.click()}
              className="w-full py-4 rounded-2xl border border-gray-200 bg-white flex items-center justify-center gap-2 transition-all duration-200 active:scale-98">
              <span className="text-xl">🖼️</span>
              <span className="text-sm font-semibold text-gray-600">画像を選択（複数枚OK）</span>
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
                      <div>
                        <p className="text-xs font-medium text-gray-700">{h.label || "（店舗名なし）"}</p>
                        <p className="text-xs text-gray-400">{h.date}</p>
                      </div>
                      <p className="text-xs font-bold text-rose-500">-¥{Number(h.amount).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── processing ── */}
        {ocrStep === "processing" && (
          <div className="text-center space-y-4 py-8">
            <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-500 rounded-full animate-spin mx-auto" />
            <p className="text-sm font-semibold text-gray-700">
              文字を認識中...
              {ocrQueue.length > 1 && ` (${ocrQueueIdx}/${ocrQueue.length}枚目)`}
            </p>
            <p className="text-xs text-gray-400">
              {ocrApiKey ? "OCR.space で解析中" : "初回は30秒ほどかかる場合があります"}
            </p>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div className="bg-indigo-500 h-2 rounded-full transition-all" style={{ width:`${ocrProgress}%` }} />
            </div>
            <p className="text-xs text-gray-400">{ocrProgress}%</p>
          </div>
        )}

        {/* ── review（1枚）── */}
        {ocrStep === "review" && (
          <div className="space-y-4">
            <div className="bg-amber-50 rounded-xl p-3 border border-amber-100 space-y-1">
              <p className="text-xs text-amber-700 font-semibold">⚠️ OCR結果を確認・修正してから登録してください</p>
              {ocrConfidence !== null && (
                <>
                  <p className="text-xs text-amber-600">
                    認識精度：
                    <span className={`font-bold ${ocrConfidence>=70?"text-emerald-600":ocrConfidence>=50?"text-amber-600":"text-rose-600"}`}>
                      {ocrConfidence}%
                    </span>
                  </p>
                  {ocrConfidence < 60 && (
                    <div className="mt-2 p-2 bg-rose-50 rounded-lg border border-rose-200 space-y-1">
                      <p className="text-xs font-bold text-rose-600">⚠️ 読み取り精度が低めです</p>
                      <p className="text-xs text-rose-500">• 金額・店舗名を必ず確認してください</p>
                    </div>
                  )}
                </>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">店舗名</label>
              <input type="text" value={ocrLabel}
                onChange={e => {
                  setOcrLabel(e.target.value);
                  const combined = [...(allRules || DEFAULT_CATEGORY_RULES), ...(learnedRules || [])];
                  const res = predictCategory(e.target.value, combined);
                  setOcrPreds(res.predictions);
                  if (res.isConfident) setOcrCat(res.topCategory);
                }}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
              {ocrPreds.length > 0 && <CategorySuggestion predictions={ocrPreds} selectedCategory={ocrCat} onSelect={cat => setOcrCat(cat)} />}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">金額</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">¥</span>
                <input type="number" value={ocrAmount} onChange={e => setOcrAmount(e.target.value)}
                  className="w-full pl-8 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-2xl font-bold outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">日付</label>
              <input type="date" value={ocrDate} onChange={e => setOcrDate(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">カテゴリ</label>
              <div className="grid grid-cols-3 gap-2">
                {categories.filter(c => c.type === "expense").map(cat => (
                  <button key={cat.id} onClick={() => setOcrCat(cat.name)}
                    className={`py-2 rounded-xl text-xs border transition-all duration-200 ${ocrCat===cat.name?"bg-indigo-500 text-white border-indigo-500 font-semibold":"bg-white text-gray-600 border-gray-200"}`}>
                    {cat.emoji} {cat.name}
                  </button>
                ))}
              </div>
            </div>
            <PrimaryButton onClick={submitOcr}>✅ この内容で登録する</PrimaryButton>
          </div>
        )}

        {/* ── multi-review（複数枚）── */}
        {ocrStep === "multi-review" && (
          <div className="space-y-4">
            <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-100">
              <p className="text-sm font-bold text-indigo-700">📷 {ocrResults.length}枚の読み取りが完了</p>
              <p className="text-xs text-indigo-500 mt-0.5">内容を修正して一括登録できます</p>
            </div>

            <div className="space-y-3">
              {ocrResults.map((r, i) => (
                <div key={i} className={`bg-white rounded-xl border ${r.confidence < 60 ? "border-amber-200" : "border-gray-100"}`}>
                  {/* ヘッダー行 */}
                  <div className="flex items-center justify-between px-4 pt-3 pb-1">
                    <span className="text-xs text-gray-400">{i + 1}枚目</span>
                    {r.confidence < 60 && <span className="text-xs text-amber-500">⚠️ 精度低（{r.confidence}%）</span>}
                  </div>
                  {/* 店舗名 */}
                  <div className="px-4 pb-2">
                    <input type="text" value={r.label}
                      onChange={e => setOcrResults(p => p.map((x, j) => j===i ? {...x, label:e.target.value} : x))}
                      placeholder="店舗名"
                      className="w-full text-sm font-medium text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-indigo-300" />
                  </div>
                  {/* 金額・日付 */}
                  <div className="px-4 pb-2 flex gap-2">
                    <div className="flex-1">
                      <p className="text-xs text-gray-400 mb-1">金額</p>
                      <div className="flex items-center gap-1">
                        <span className="text-sm text-rose-400 font-bold">¥</span>
                        <input type="number" value={r.amount}
                          onChange={e => setOcrResults(p => p.map((x, j) => j===i ? {...x, amount:e.target.value} : x))}
                          className="w-full text-base font-bold text-rose-500 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-300" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-gray-400 mb-1">日付</p>
                      <input type="date" value={r.date}
                        onChange={e => setOcrResults(p => p.map((x, j) => j===i ? {...x, date:e.target.value} : x))}
                        className="w-full text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-2 py-2 outline-none focus:ring-1 focus:ring-indigo-300" />
                    </div>
                  </div>
                  {/* カテゴリ */}
                  <div className="px-4 pb-3">
                    <p className="text-xs text-gray-400 mb-1">カテゴリ</p>
                    <div className="flex flex-wrap gap-1.5">
                      {categories.filter(c => c.type==="expense").map(cat => (
                        <button key={cat.id}
                          onClick={() => setOcrResults(p => p.map((x, j) => j===i ? {...x, cat:cat.name} : x))}
                          className={`px-2.5 py-1 rounded-lg text-xs border transition-all ${r.cat===cat.name?"bg-indigo-500 text-white border-indigo-500 font-semibold":"bg-white text-gray-500 border-gray-200"}`}>
                          {cat.emoji} {cat.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <PrimaryButton onClick={() => {
              ocrResults.forEach(r => {
                if (!r.amount || !r.label) return;
                onLearnRule?.(r.label, r.cat, "expense");
                const tx = createTransaction({ date:r.date, label:r.label, category:r.cat, amount:-Number(r.amount), type:"expense", source:"ocr" });
                onAdd(tx);
              });
              const hist = [...ocrResults.filter(r => r.label && r.amount).map(r => ({ label:r.label, amount:r.amount, date:r.date, cat:r.cat })), ...ocrHistory].slice(0, 5);
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

  if (mode === "csv") return (
    <div className="pb-20">
      <div className="bg-white px-4 pt-12 pb-4 border-b border-gray-100 flex items-center gap-3">
        <button onClick={() => { setMode("select"); setCsvStep("upload"); }} className="text-gray-400 text-lg">←</button>
        <h1 className="text-xl font-bold text-gray-900">CSVインポート</h1>
      </div>
      <div className="px-4 py-5">

        {/* ── upload ── */}
        {csvStep === "upload" && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">フォーマット</label>
              {Object.entries(CSV_FORMATS).map(([id, f]) => (
                <button key={id} onClick={() => setCsvFormat(id)}
                  className={`w-full text-left p-3 rounded-xl border mb-2 transition-all duration-200 ${csvFormat===id?"border-indigo-400 bg-indigo-50":"border-gray-200 bg-white"}`}>
                  <p className="text-sm font-semibold text-gray-800">{f.label}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {f.sampleColumns.map(c => <span key={c} className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-mono">{c}</span>)}
                  </div>
                </button>
              ))}
            </div>
            <input ref={fileRef} type="file" accept=".csv" onChange={handleCSVFile} className="hidden" />
            <PrimaryButton onClick={() => fileRef.current?.click()}>📂 CSVファイルを選択</PrimaryButton>
          </div>
        )}

        {/* ── empty ── */}
        {csvStep === "empty" && (
          <div className="space-y-4">
            <div className="bg-amber-50 rounded-2xl p-5 border border-amber-200 text-center">
              <p className="text-3xl mb-3">🔍</p>
              <p className="text-sm font-bold text-amber-700 mb-2">0件でした</p>
              <p className="text-xs text-amber-600 leading-relaxed">
                選択したフォーマットがCSVと合っていない可能性があります。<br/>
                別のフォーマットを試してみてください。
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
              <p className="text-xs font-semibold text-gray-600 mb-2">💡 ヒント</p>
              <p className="text-xs text-gray-500 leading-relaxed">
                三井住友カードは「三井住友カード」<br/>
                PayPayは「PayPay」<br/>
                住信SBIは「住信SBIネット銀行」<br/>
                リクルートカードは「リクルートカード」
              </p>
            </div>
            <PrimaryButton onClick={() => setCsvStep("upload")} variant="ghost">← 戻る</PrimaryButton>
          </div>
        )}

        {/* ── preview（編集付き）── */}
        {csvStep === "preview" && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <p className="text-sm font-bold text-gray-700">{csvRows.length}件を読み込みました</p>
              <button onClick={() => setCsvStep("upload")} className="text-xs text-gray-400 underline">← 戻る</button>
            </div>
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
                  {fmtCurrency(csvRows.filter((_, i) => csvChecked[i] && csvRows[i]?.type==="expense").reduce((s, r) => s + Math.abs(r.amount), 0))}
                </p>
                <p className="text-xs text-indigo-400 mt-0.5">支出合計</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { const n={}; csvRows.forEach((_,i)=>n[i]=true); setCsvChecked(n); }} className="text-xs text-indigo-500 font-semibold">すべて選択</button>
              <span className="text-xs text-gray-300">|</span>
              <button onClick={() => { const n={}; csvRows.forEach((r,i)=>n[i]=!r.isDuplicate); setCsvChecked(n); }} className="text-xs text-indigo-500 font-semibold">重複以外</button>
            </div>

            <div className="bg-white rounded-xl overflow-hidden border border-gray-100">
              {csvRows.map((r, i) => (
                <div key={i} className={`border-b border-gray-50 last:border-b-0 ${r.isDuplicate?"bg-amber-50":""}`}>
                  {/* 通常表示行 */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <input type="checkbox" checked={!!csvChecked[i]} onChange={() => setCsvChecked(p => ({...p, [i]:!p[i]}))} className="accent-indigo-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0" onClick={() => setCsvEditIdx(csvEditIdx===i ? null : i)}>
                      <div className="flex items-center gap-1">
                        <p className="text-sm font-medium text-gray-800 truncate">{r.label}</p>
                        {r.isDuplicate && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full flex-shrink-0">重複</span>}
                      </div>
                      <p className="text-xs text-gray-400">{r.category} · {r.date}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <p className={`text-sm font-bold ${r.type==="income"?"text-emerald-500":"text-rose-500"}`}>
                        {r.type==="income"?"+":"-"}{fmtCurrency(r.amount)}
                      </p>
                      <button onClick={() => setCsvEditIdx(csvEditIdx===i ? null : i)} className="text-gray-300 text-xs">✏️</button>
                    </div>
                  </div>
                  {/* 展開編集フォーム */}
                  {csvEditIdx === i && (
                    <div className="px-4 pb-3 space-y-2 bg-gray-50 border-t border-gray-100">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-xs text-gray-400 mb-1">店舗名</p>
                          <input type="text" value={r.label} onChange={e => updateCsvRow(i, "label", e.target.value)}
                            className="w-full text-xs px-2 py-1.5 bg-white border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-300" />
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 mb-1">金額</p>
                          <input type="number" value={Math.abs(r.amount)}
                            onChange={e => updateCsvRow(i, "amount", r.type==="expense" ? -Number(e.target.value) : Number(e.target.value))}
                            className="w-full text-xs px-2 py-1.5 bg-white border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-300" />
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 mb-1">日付</p>
                          <input type="date" value={r.date} onChange={e => updateCsvRow(i, "date", e.target.value)}
                            className="w-full text-xs px-2 py-1.5 bg-white border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-300" />
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 mb-1">カテゴリ</p>
                          <select value={r.category} onChange={e => updateCsvRow(i, "category", e.target.value)}
                            className="w-full text-xs px-2 py-1.5 bg-white border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-300">
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

            <PrimaryButton onClick={execCSVImport}>
              ✅ {Object.values(csvChecked).filter(Boolean).length}件をインポート
            </PrimaryButton>
          </div>
        )}

        {/* ── done ── */}
        {csvStep === "done" && (
          <div className="space-y-4 py-6">
            <div className="text-center"><div className="text-5xl mb-3">✅</div><h2 className="text-xl font-bold text-gray-900">インポート完了！</h2></div>
            {csvSummary && (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-indigo-50 rounded-2xl p-3 border border-indigo-100 text-center">
                  <p className="text-2xl font-bold text-indigo-600">{csvSummary.count}</p>
                  <p className="text-xs text-indigo-400 mt-1">インポート件数</p>
                </div>
                <div className="bg-gray-50 rounded-2xl p-3 border border-gray-200 text-center">
                  <p className="text-2xl font-bold text-gray-500">{csvSummary.skipped}</p>
                  <p className="text-xs text-gray-400 mt-1">スキップ（重複）</p>
                </div>
                <div className="bg-rose-50 rounded-2xl p-3 border border-rose-100 text-center">
                  <p className="text-sm font-bold text-rose-600">{fmtCurrency(csvSummary.expTotal)}</p>
                  <p className="text-xs text-rose-400 mt-1">支出合計</p>
                </div>
                <div className="bg-emerald-50 rounded-2xl p-3 border border-emerald-100 text-center">
                  <p className="text-sm font-bold text-emerald-600">{fmtCurrency(csvSummary.incTotal)}</p>
                  <p className="text-xs text-emerald-400 mt-1">収入合計</p>
                </div>
              </div>
            )}
            <PrimaryButton onClick={() => { setCsvStep("upload"); setMode("select"); }}>ホームに戻る</PrimaryButton>
          </div>
        )}
      </div>
    </div>
  );

  return null;
}
