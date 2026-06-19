import { useState, useRef } from "react";

export function BackupTab({ transactions, categories, learnedRules, onAdd }) {
  const [restoreMsg, setRestoreMsg] = useState("");
  const backupFileRef = useRef(null);

  const storageUsed = (() => {
    try {
      let total = 0;
      for (const key of Object.keys(localStorage)) total += (localStorage.getItem(key) || "").length * 2;
      return (total / 1024 / 1024).toFixed(2);
    } catch { return "?"; }
  })();
  const storageRatio = Math.min(100, Math.round((parseFloat(storageUsed) / 5) * 100));

  const exportJSON = () => {
    if (!transactions?.length) { alert("エクスポートするデータがありません"); return; }
    const backup = { version: "2.0", exportedAt: new Date().toISOString(), count: transactions.length, transactions, categories, learnedRules };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `kakeibo_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(url);
  };

  const importJSON = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.transactions || !Array.isArray(data.transactions)) { alert("バックアップファイルの形式が正しくありません"); return; }
        const ok = window.confirm(`バックアップを復元します。\n\n取引: ${data.transactions.length}件\nバックアップ日時: ${(data.exportedAt || "").slice(0, 10) || "不明"}\n\n⚠️ 現在のデータは上書きされます。続けますか？`);
        if (!ok) return;
        data.transactions.forEach(tx => onAdd?.(tx));
        setRestoreMsg(`✅ ${data.transactions.length}件を復元しました`);
        setTimeout(() => setRestoreMsg(""), 4000);
      } catch { alert("ファイルの読み込みに失敗しました"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const exportCSV = () => {
    if (!transactions?.length) { alert("エクスポートするデータがありません"); return; }
    const header = "日付,種別,カテゴリ,内容,金額,登録元,支払者,支払方法";
    const rows = transactions.map(t => [
      t.date, t.type === "income" ? "収入" : "支出", t.category,
      `"${(t.label || "").replace(/"/g, '""')}"`,
      t.amount, t.source || "manual", t.paidBy || "", t.paymentMethod || "cash",
    ].join(","));
    const csv  = "\uFEFF" + [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `kakeibo_${new Date().toISOString().split("T")[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="bg-white rounded-2xl p-4 border border-gray-100">
        <p className="text-xs font-semibold text-gray-500 mb-3">📊 ストレージ使用量</p>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-bold text-gray-800">{storageUsed} MB / 5 MB</span>
          <span className={`text-xs font-semibold ${storageRatio > 70 ? "text-rose-500" : storageRatio > 40 ? "text-amber-500" : "text-emerald-500"}`}>{storageRatio}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div className={`h-2 rounded-full ${storageRatio > 70 ? "bg-rose-400" : storageRatio > 40 ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${storageRatio}%` }} />
        </div>
      </div>

      <div className="bg-white rounded-2xl overflow-hidden border border-gray-100">
        <div className="px-4 py-3 border-b border-gray-50">
          <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">💾 JSONバックアップ（推奨）</p>
        </div>
        <div className="p-4 space-y-3">
          <button onClick={exportJSON} className="w-full py-3 bg-indigo-500 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2">
            📥 JSONでバックアップ（{transactions?.length || 0}件）
          </button>
          <input ref={backupFileRef} type="file" accept=".json" onChange={importJSON} className="hidden" />
          <button onClick={() => backupFileRef.current?.click()} className="w-full py-3 bg-white border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold flex items-center justify-center gap-2">
            📤 JSONから復元
          </button>
          {restoreMsg && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
              <p className="text-sm font-semibold text-emerald-700">{restoreMsg}</p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl overflow-hidden border border-gray-100">
        <div className="px-4 py-3 border-b border-gray-50">
          <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">📄 CSVエクスポート</p>
        </div>
        <div className="p-4">
          <button onClick={exportCSV} className="w-full py-3 bg-white border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold flex items-center justify-center gap-2">
            📊 CSVでダウンロード
          </button>
        </div>
      </div>
    </div>
  );
}
