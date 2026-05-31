import { fmtCurrency } from "../../utils/format";
import { SourceBadge } from "../ui/SourceBadge";

export function TransactionItem({ transaction: t, categories, onEdit, onDelete }) {
  const isIncome = t.type === "income";
  const cat = categories.find(c => c.name === t.category);
  return (
    <div className="flex items-center gap-3 px-5 py-4 bg-white border-b border-gray-100 last:border-b-0 transition-all duration-200">
      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-xl flex-shrink-0">
        {cat?.emoji || "📦"}
      </div>
      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate">{t.label}</p>
          {t.source && t.source !== "manual" && <SourceBadge source={t.source} />}
        </div>
        <p className="text-xs text-gray-400 truncate">{t.category} · {t.date}</p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
        <p className={`text-base font-bold tabular-nums whitespace-nowrap ${isIncome?"text-emerald-600":"text-rose-600"}`}>
          {isIncome?"+":"-"}{fmtCurrency(t.amount)}
        </p>
        {onEdit && (
          <button onClick={() => onEdit(t)} className="text-gray-300 hover:text-indigo-400 text-sm px-1 transition-colors duration-200">✏️</button>
        )}
        {onDelete && (
          <button onClick={() => window.confirm(`「${t.label}」を削除しますか？`) && onDelete(t.id)}
            className="text-gray-300 hover:text-rose-400 text-lg px-0.5 transition-colors duration-200">×</button>
        )}
      </div>
    </div>
  );
}
