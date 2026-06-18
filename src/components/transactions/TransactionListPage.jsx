import { useState, useMemo } from "react";
import { toYM, fmtCurrency } from "../../utils/format";
import { MonthSelector } from "../common/MonthSelector";
import { TransactionItem } from "./TransactionItem";
import { EmptyState } from "../ui/EmptyState";

export function TransactionListPage({ transactions, categories, members, pointAccounts, onEdit, onDelete, onUpdate, onNavigate }) {
  const [q,          setQ]          = useState("");
  const [selMonth,   setSelMonth]   = useState("all");
  const [srcFilter,  setSrcFilter]  = useState("all");
  const [errFilter,  setErrFilter]  = useState(false); // 支払者未設定フィルター

  // 選択モード
  const [selectMode,   setSelectMode]   = useState(false);
  const [selectedIds,  setSelectedIds]  = useState(new Set());
  const [showBulkCat,  setShowBulkCat]  = useState(false);

  const months = useMemo(
    () => [...new Set(transactions.map(t => toYM(t.date)))].sort().reverse(),
    [transactions]
  );

  const filtered = useMemo(() =>
    transactions
      .filter(t => selMonth === "all" || toYM(t.date) === selMonth)
      .filter(t => srcFilter === "all" || t.source === srcFilter)
      .filter(t => t.label.includes(q) || t.category.includes(q))
      .filter(t => !errFilter || (t.type === "expense" && !t.paidBy && t.shareType !== "personal" && t.shareType !== "partner")),
    [transactions, selMonth, srcFilter, q, errFilter]
  );

  // 支払者未設定件数
  const unsetCount = useMemo(() =>
    transactions.filter(t => t.type === "expense" && !t.paidBy && t.shareType !== "personal" && t.shareType !== "partner").length,
    [transactions]
  );

  const totals = useMemo(() => ({
    income:  filtered.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0),
    expense: filtered.filter(t => t.type === "expense").reduce((s, t) => s + Math.abs(t.amount), 0),
  }), [filtered]);

  // 選択操作
  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const enterSelectMode = (id) => {
    setSelectMode(true);
    setSelectedIds(new Set([id]));
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
    setShowBulkCat(false);
  };

  const selectAll = () => setSelectedIds(new Set(filtered.map(t => t.id)));
  const deselectAll = () => setSelectedIds(new Set());

  // 一括削除
  const handleBulkDelete = () => {
    if (!selectedIds.size) return;
    if (!window.confirm(`選択中の${selectedIds.size}件を削除しますか？`)) return;
    selectedIds.forEach(id => onDelete?.(id));
    exitSelectMode();
  };

  // 一括カテゴリ変更
  const handleBulkCategory = (catName) => {
    selectedIds.forEach(id => {
      const tx = transactions.find(t => t.id === id);
      if (tx) onUpdate?.({ ...tx, category: catName, updatedAt: new Date().toISOString() });
    });
    exitSelectMode();
  };

  // 共有/個人の更新
  const handleUpdateSharing = (id, shareType) => {
    const tx = transactions.find(t => t.id === id);
    if (tx) onUpdate?.({ ...tx, shareType, updatedAt: new Date().toISOString() });
  };

  const handleUpdateTransfer = (id, isTransfer) => {
    const tx = transactions.find(t => t.id === id);
    if (!tx) return;
    onUpdate?.({ ...tx, isTransfer, updatedAt: new Date().toISOString() });
  };

  const expCats = categories.filter(c => c.type === "expense");

  return (
    <div className="pb-20">
      {/* ── ヘッダー ── */}
      <div className="bg-white px-4 pt-12 pb-3 border-b border-gray-100 sticky top-0 z-10 space-y-2">
        {selectMode ? (
          /* 選択モードヘッダー */
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={exitSelectMode} className="text-gray-400 text-lg">←</button>
              <p className="text-sm font-bold text-gray-900">{selectedIds.size}件選択中</p>
            </div>
            <div className="flex gap-2">
              <button onClick={selectAll}   className="text-xs text-indigo-500 font-semibold px-2 py-1 bg-indigo-50 rounded-lg">全選択</button>
              <button onClick={deselectAll} className="text-xs text-gray-500 font-semibold px-2 py-1 bg-gray-100 rounded-lg">解除</button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold text-gray-900">取引一覧</h1>
              <button onClick={() => setSelectMode(true)}
                className="text-xs text-gray-500 font-semibold px-3 py-1.5 bg-gray-100 rounded-lg">
                選択
              </button>
            </div>
            <MonthSelector months={months} selected={selMonth} onChange={setSelMonth} />
            <div className="flex gap-2 overflow-x-auto scrollbar-none">
              {[["all","すべて"],["manual","✏️手動"],["csv","📊CSV"],["ocr","📷OCR"]].map(([id, lb]) => (
                <button key={id} onClick={() => setSrcFilter(id)}
                  className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold border transition-all duration-200 ${
                    srcFilter === id ? "bg-gray-700 text-white border-gray-700" : "bg-white text-gray-500 border-gray-200"
                  }`}>
                  {lb}
                </button>
              ))}
              {unsetCount > 0 && (
                <button onClick={() => setErrFilter(p => !p)}
                  className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold border transition-all duration-200 ${
                    errFilter ? "bg-rose-500 text-white border-rose-500" : "bg-rose-50 text-rose-500 border-rose-200"
                  }`}>
                  ⚠️ 未設定{unsetCount}件
                </button>
              )}
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
              <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="カテゴリや内容で検索..."
                className="w-full pl-9 pr-4 py-2.5 bg-gray-100 rounded-xl text-sm outline-none" />
            </div>
          </>
        )}
      </div>

      {/* 件数・合計 */}
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex justify-between text-xs text-gray-500">
        <span>{filtered.length}件</span>
        <span>
          <span className="text-emerald-500 font-semibold">+{fmtCurrency(totals.income)}</span>
          {" / "}
          <span className="text-rose-500 font-semibold">-{fmtCurrency(totals.expense)}</span>
        </span>
      </div>

      {/* ── 選択モードの操作バー ── */}
      {selectMode && selectedIds.size > 0 && (
        <div className="bg-white border-b border-gray-100 px-4 py-3 space-y-2">
          <div className="flex gap-2">
            <button onClick={() => setShowBulkCat(p => !p)}
              className="flex-1 py-2 bg-indigo-500 text-white rounded-xl text-sm font-semibold">
              🏷️ カテゴリ変更
            </button>
            <button onClick={handleBulkDelete}
              className="flex-1 py-2 bg-rose-500 text-white rounded-xl text-sm font-semibold">
              🗑️ 削除
            </button>
          </div>
          {showBulkCat && (
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
              <p className="text-xs font-semibold text-gray-500 mb-2">カテゴリを選択</p>
              <div className="grid grid-cols-4 gap-1.5">
                {expCats.map(cat => (
                  <button key={cat.id} onClick={() => handleBulkCategory(cat.name)}
                    className="py-2 px-1 rounded-xl text-xs border border-gray-200 bg-white text-gray-600 hover:bg-indigo-500 hover:text-white transition-all flex flex-col items-center gap-0.5">
                    <span className="text-base">{cat.emoji}</span>
                    <span className="leading-tight text-center">{cat.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── リスト ── */}
      <div className="bg-white">
        {filtered.length === 0 && transactions.length === 0 ? (
          <EmptyState emoji="🗂️" title="まだ取引がありません" desc="「追加」から最初の取引を登録しましょう"
            actionLabel="➕ 取引を追加する" onAction={() => onNavigate?.("add")} />
        ) : filtered.length === 0 ? (
          <EmptyState emoji="🔍" title="該当する取引がありません" desc="検索条件やフィルターを変えてみてください" />
        ) : (
          filtered.map(t => (
            <TransactionItem
              key={t.id}
              transaction={t}
              categories={categories}
              members={members}
              pointAccounts={pointAccounts}
              onEdit={selectMode ? undefined : onEdit}
              onDelete={selectMode ? undefined : onDelete}
              onUpdateSharing={handleUpdateSharing}
              onUpdateTransfer={handleUpdateTransfer}
              selectMode={selectMode}
              selected={selectedIds.has(t.id)}
              onSelect={selectMode ? toggleSelect : enterSelectMode}
            />
          ))
        )}
      </div>
    </div>
  );
}
