import { useState } from "react";
import { ManualAddForm }  from "./ManualAddForm";
import { submitPendingTransaction } from "../../utils/supabase";

// パートナーモード用申請フォーム
function PartnerSubmitForm({ categories, members, partnerShareId, partnerName, onBack }) {
  const [label,     setLabel]     = useState("");
  const [amount,    setAmount]    = useState("");
  const [date,      setDate]      = useState(new Date().toISOString().slice(0,10));
  const [category,  setCategory]  = useState("食費");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!label || !amount) { alert("内容と金額を入力してください"); return; }
    if (!partnerShareId) { alert("共有確認タブでかずおさんのIDを入力してから申請してください"); return; }
    setSubmitting(true);
    try {
      const tx = {
        id:        crypto.randomUUID(),
        label, category,
        amount:    -Math.abs(Number(amount)),
        date,
        type:      "expense",
        shareType: "shared",
        source:    "manual",
        paidBy:    members[1]?.id || "m2",
      };
      await submitPendingTransaction(partnerShareId, tx, partnerName);
      alert("✅ 申請しました！承認されると反映されます。");
      setLabel(""); setAmount(""); setCategory("食費");
      onBack();
    } catch(e) {
      alert("申請に失敗しました: " + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="pb-20 px-4 pt-6 space-y-4 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <button onClick={onBack} className="text-gray-400 text-xl">←</button>
        <h2 className="text-lg font-bold text-gray-800">共有支出を申請</h2>
      </div>
      <div className="bg-pink-50 rounded-xl p-3 border border-pink-100">
        <p className="text-xs text-pink-600">📤 かずおさんに申請します。承認されると家計簿に反映されます。</p>
      </div>
      <div className="bg-white rounded-2xl p-4 border border-gray-100 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">内容</label>
          <input type="text" value={label} onChange={e => setLabel(e.target.value)}
            placeholder="例: スーパー田子重"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-pink-400" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">金額</label>
          <div className="flex items-center border border-gray-200 rounded-xl px-3 py-2.5">
            <span className="text-gray-400 mr-2">¥</span>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="3000"
              className="flex-1 text-sm outline-none font-bold" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">日付</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-2">カテゴリ</label>
          <div className="grid grid-cols-3 gap-2">
            {(categories || []).filter(c => c.type === "expense").map(cat => (
              <button key={cat.id} onClick={() => setCategory(cat.name)}
                className={`py-2 rounded-xl text-xs border transition-all ${category === cat.name ? "bg-pink-500 text-white border-pink-500 font-semibold" : "bg-white text-gray-600 border-gray-200"}`}>
                {cat.emoji} {cat.name}
              </button>
            ))}
          </div>
        </div>
      </div>
      <button onClick={handleSubmit} disabled={!label || !amount || submitting}
        className="w-full py-3.5 bg-pink-500 text-white rounded-2xl font-bold text-sm disabled:opacity-40">
        {submitting ? "送信中..." : "📤 申請する"}
      </button>
    </div>
  );
}
import { OcrScanPage }    from "./OcrScanPage";
import { CsvImportPage }  from "./CsvImportPage";
import { STORAGE_KEYS }   from "../../constants/storage";

export function AddPage({
  categories, existingTransactions, allRules, learnedRules,
  members, pointAccounts, importHistory,
  onAdd, onDelete, onLearnRule, onImportHistoryChange,
  activeCsvSources, onActiveCsvSourcesChange,
  isPartnerMode, partnerShareId, partnerName,
}) {
  const [mode, setMode] = useState("select");

  // パートナーモード: ManualAddFormを申請フォームとして使用
  if (isPartnerMode && mode === "manual") return (
    <PartnerSubmitForm
      categories={categories}
      members={members}
      partnerShareId={partnerShareId}
      partnerName={partnerName}
      onBack={() => setMode("select")}
    />
  );

  if (mode === "manual") return (
    <ManualAddForm
      categories={categories} allRules={allRules} learnedRules={learnedRules}
      members={members} pointAccounts={pointAccounts}
      existingTransactions={existingTransactions}
      onAdd={onAdd} onLearnRule={onLearnRule}
      onBack={() => setMode("select")}
    />
  );

  if (mode === "ocr") return (
    <OcrScanPage
      categories={categories} allRules={allRules} learnedRules={learnedRules}
      members={members} pointAccounts={pointAccounts}
      existingTransactions={existingTransactions}
      onAdd={onAdd} onDelete={onDelete} onLearnRule={onLearnRule}
      onBack={() => setMode("select")}
    />
  );

  if (mode === "csv") {
    // localStorageからocrCorrectionsを読み込んでCsvImportPageに渡す
    const ocrCorrections = (() => {
      try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.OCR_CORRECTIONS) || "{}"); } catch { return {}; }
    })();
    return (
      <CsvImportPage
        categories={categories} existingTransactions={existingTransactions}
        ocrCorrections={ocrCorrections}
        learnedRules={learnedRules}
        members={members} pointAccounts={pointAccounts}
        importHistory={importHistory}
        allRules={allRules}
        onAdd={onAdd} onDelete={onDelete}
        onLearnRule={onLearnRule} onImportHistoryChange={onImportHistoryChange}
        onBack={() => setMode("select")}
      />
    );
  }

  // ─── select 画面 ──────────────────────────────────────────
  // パートナーモード: 申請専用UI
  if (isPartnerMode) return (
    <div className="pb-20">
      <div className="bg-white px-4 pt-12 pb-4 border-b border-gray-100">
        <h1 className="text-xl font-bold text-gray-900">共有支出を申請</h1>
        <p className="text-xs text-gray-400 mt-1">承認されると家計簿に反映されます</p>
      </div>
      <div className="px-4 py-6">
        <button onClick={() => setMode("manual")}
          className="w-full flex items-center gap-4 p-5 bg-white rounded-2xl border border-pink-100 shadow-sm active:bg-pink-50">
          <span className="text-4xl">📤</span>
          <div className="text-left">
            <p className="text-sm font-bold text-gray-800">支出を申請する</p>
            <p className="text-xs text-gray-400 mt-0.5">金額・カテゴリを入力してかずおさんに送る</p>
          </div>
          <span className="ml-auto text-gray-300 text-xl">›</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="pb-20">
      <div className="bg-white px-4 pt-12 pb-4 border-b border-gray-100">
        <h1 className="text-xl font-bold text-gray-900">取引を追加</h1>
      </div>
      <div className="px-4 py-6 space-y-3">
        {[
          { id: "manual", icon: "✏️", title: "手動入力",           desc: "金額・カテゴリを直接入力" },
          { id: "ocr",    icon: "📷", title: "OCRレシート読み取り", desc: "レシートを撮影して自動入力" },
          { id: "csv",    icon: "📊", title: "CSVインポート",       desc: "銀行・カードの明細ファイルを取り込む" },
        ].map(item => (
          <button key={item.id} onClick={() => setMode(item.id)}
            className="w-full p-4 bg-white rounded-2xl border border-gray-200 text-left flex items-center gap-4 hover:border-indigo-300 hover:bg-indigo-50 transition-all duration-200">
            <span className="text-3xl">{item.icon}</span>
            <div>
              <p className="text-sm font-bold text-gray-800">{item.title}</p>
              <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
            </div>
            <span className="ml-auto text-gray-300">›</span>
          </button>
        ))}
      </div>
    </div>
  );
}
