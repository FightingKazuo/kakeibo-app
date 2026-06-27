import { useState } from "react";
import { ManualAddForm }  from "./ManualAddForm";
import { OcrScanPage }    from "./OcrScanPage";
import { CsvImportPage }  from "./CsvImportPage";

export function AddPage({
  categories, existingTransactions, allRules, learnedRules,
  members, pointAccounts, importHistory,
  onAdd, onDelete, onLearnRule, onImportHistoryChange,
}) {
  const [mode, setMode] = useState("select");

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

  if (mode === "csv") return (
    <CsvImportPage
      categories={categories} existingTransactions={existingTransactions}
      members={members} pointAccounts={pointAccounts}
      importHistory={importHistory}
      allRules={allRules} learnedRules={learnedRules}
      onAdd={onAdd} onDelete={onDelete}
      onLearnRule={onLearnRule} onImportHistoryChange={onImportHistoryChange}
      onBack={() => setMode("select")}
    />
  );

  // ─── select 画面 ──────────────────────────────────────────
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
