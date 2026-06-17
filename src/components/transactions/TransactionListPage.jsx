import { useState, useMemo } from "react";
import { toYM, fmtCurrency } from "../../utils/format";
import { MonthSelector } from "../common/MonthSelector";
import { TransactionItem } from "./TransactionItem";
import { EmptyState } from "../ui/EmptyState";

export function TransactionListPage({ transactions, categories, members, pointAccounts, onEdit, onDelete, onUpdate, onNavigate }) {
  const [q,         setQ]         = useState("");
  const [selMonth,  setSelMonth]  = useState("all");
  const [srcFilter, setSrcFilter] = useState("all");

  const months = useMemo(
    () => [...new Set(transactions.map(t => toYM(t.date)))].sort().reverse(),
    [transactions]
  );

  const filtered = useMemo(() =>
    transactions
      .filter(t => selMonth === "all" || toYM(t.date) === selMonth)
      .filter(t => srcFilter === "all" || t.source === srcFilter)
      .filter(t => t.label.includes(q) || t.category.includes(q)),
    [transactions, selMonth, srcFilter, q]
  );

  const totals = useMemo(() => ({
    income:  filtered.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0),
    expense: filtered.filter(t => t.type === "expense").reduce((s, t) => s + Math.abs(t.amount), 0),
  }), [filtered]);

  // 共有/個人の更新
  const handleUpdateSharing = (id, shareType) => {
    const tx = transactions.find(t => t.id === id);
    if (tx) onUpdate?.({ ...tx, shareType, updatedAt: new Date().toISOString() });
  };

  // 振替フラグの更新（学習付き）
  const handleUpdateTransfer = (id, isTransfer) => {
    const tx = transactions.find(t => t.id === id);
    if (!tx) return;
    onUpdate?.({ ...tx, isTransfer, updatedAt: new Date().toISOString() });
  };

  return (
    <div className="pb-20">
      <div className="bg-white px-4 pt-12 pb-3 border-b border-gray-100 sticky top-0 z-10 space-y-2">
        <h1 className="text-xl font-bold text-gray-900">取引一覧</h1>
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
        </div>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
          <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="カテゴリや内容で検索..."
            className="w-full pl-9 pr-4 py-2.5 bg-gray-100 rounded-xl text-sm outline-none" />
        </div>
      </div>

      <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex justify-between text-xs text-gray-500">
        <span>{filtered.length}件</span>
        <span>
          <span className="text-emerald-500 font-semibold">+{fmtCurrency(totals.income)}</span>
          {" / "}
          <span className="text-rose-500 font-semibold">-{fmtCurrency(totals.expense)}</span>
        </span>
      </div>

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
              onEdit={onEdit}
              onDelete={onDelete}
              onUpdateSharing={handleUpdateSharing}
              onUpdateTransfer={handleUpdateTransfer}
            />
          ))
        )}
      </div>
    </div>
  );
}
