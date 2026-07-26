import { useState } from "react";
import { ManualAddForm }  from "./ManualAddForm";
import { OcrScanPage }   from "./OcrScanPage";
import { CsvImportPage } from "./CsvImportPage";
import { STORAGE_KEYS }  from "../../constants/storage";
import { submitPendingTransaction } from "../../utils/supabase";

const TABS = [
  { id: "manual", icon: "✏️", label: "手動入力" },
  { id: "ocr",    icon: "📷", label: "OCR撮影"  },
  { id: "csv",    icon: "📊", label: "CSV取込"  },
];

export function AddPage({
  categories, existingTransactions, allRules, learnedRules,
  members, pointAccounts, importHistory,
  onAdd, onDelete, onLearnRule, onImportHistoryChange,
  activeCsvSources, onActiveCsvSourcesChange,
  isPartnerMode, partnerShareId, partnerName,
}) {
  const [tab, setTab] = useState("manual");

  const ocrCorrections = (() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.OCR_CORRECTIONS) || "{}"); } catch { return {}; }
  })();

  return (
    <div className="pb-20 min-h-screen bg-gray-50">
      {/* ヘッダー＋タブ */}
      <div className="bg-white px-4 pt-12 pb-0 border-b border-gray-100">
        <h1 className="text-xl font-bold text-gray-900 mb-3">取引を追加</h1>
        <div className="flex gap-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 py-2.5 text-xs font-bold rounded-t-xl transition-all ${
                tab === t.id
                  ? "bg-indigo-500 text-white"
                  : "bg-gray-100 text-gray-500"
              }`}>
              <span className="block text-base mb-0.5">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* タブコンテンツ */}
      <div className="bg-white">
        {tab === "manual" && (
          <ManualAddForm
            categories={categories} allRules={allRules} learnedRules={learnedRules}
            members={members} pointAccounts={pointAccounts}
            existingTransactions={existingTransactions}
            onAdd={onAdd} onLearnRule={onLearnRule}
            onBack={() => {}}
            isPartnerMode={isPartnerMode}
            partnerShareId={partnerShareId}
          />
        )}

        {tab === "ocr" && (
          <OcrScanPage
            categories={categories} allRules={allRules} learnedRules={learnedRules}
            members={members} pointAccounts={pointAccounts}
            existingTransactions={existingTransactions}
            onAdd={onAdd} onDelete={onDelete} onLearnRule={onLearnRule}
            onBack={() => {}}
          />
        )}

        {tab === "csv" && (
          <CsvImportPage
            categories={categories} existingTransactions={existingTransactions}
            ocrCorrections={ocrCorrections}
            learnedRules={learnedRules}
            members={members} pointAccounts={pointAccounts}
            importHistory={importHistory}
            allRules={allRules}
            onAdd={onAdd} onDelete={onDelete}
            onLearnRule={onLearnRule} onImportHistoryChange={onImportHistoryChange}
            activeCsvSources={activeCsvSources}
            onActiveCsvSourcesChange={onActiveCsvSourcesChange}
            onBack={() => {}}
          />
        )}
      </div>
    </div>
  );
}
