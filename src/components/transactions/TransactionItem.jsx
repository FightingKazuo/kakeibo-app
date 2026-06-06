import { useState } from "react";
import { fmtCurrency } from "../../utils/format";
import { SourceBadge } from "../ui/SourceBadge";

export function TransactionItem({ transaction: t, categories, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const isIncome = t.type === "income";
  const cat      = categories.find(c => c.name === t.category);
  const hasItems = Array.isArray(t.items) && t.items.length > 0;

  return (
    <div className="bg-white border-b border-gray-100 last:border-b-0">
      {/* ── メイン行 ── */}
      <div className="flex items-center gap-3 px-5 py-4">
        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-xl flex-shrink-0">
          {cat?.emoji || "📦"}
        </div>

        <div
          className="flex-1 min-w-0 overflow-hidden"
          onClick={() => hasItems && setExpanded(p => !p)}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{t.label}</p>
            {t.source && t.source !== "manual" && <SourceBadge source={t.source} />}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-xs text-gray-400">{t.category} · {t.date}</p>
            {hasItems && (
              <span className="text-xs text-indigo-400 font-medium">
                品目{t.items.length}件 {expanded ? "▲" : "▼"}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
          <p className={`text-base font-bold tabular-nums whitespace-nowrap ${isIncome ? "text-emerald-600" : "text-rose-600"}`}>
            {isIncome ? "+" : "-"}{fmtCurrency(t.amount)}
          </p>
          {onEdit && (
            <button
              onClick={() => onEdit(t)}
              className="text-gray-300 hover:text-indigo-400 text-sm px-1 transition-colors duration-200"
            >✏️</button>
          )}
          {onDelete && (
            <button
              onClick={() => window.confirm(`「${t.label}」を削除しますか？`) && onDelete(t.id)}
              className="text-gray-300 hover:text-rose-400 text-lg px-0.5 transition-colors duration-200"
            >×</button>
          )}
        </div>
      </div>

      {/* ── 品目リスト（展開時）── */}
      {expanded && hasItems && (
        <div className="border-t border-gray-50 bg-gray-50 px-5 pb-3">
          <div className="divide-y divide-gray-100">
            {t.items.map((item, i) => (
              <div key={i} className="flex items-center justify-between py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-700 truncate">{item.name || "（商品名なし）"}</p>
                  {item.quantity > 1 && (
                    <p className="text-xs text-gray-400">
                      ×{item.quantity}
                      {item.unitPrice ? ` @¥${item.unitPrice.toLocaleString()}` : ""}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  {item.type === "personal" && (
                    <span className="text-xs bg-rose-100 text-rose-500 px-1.5 py-0.5 rounded-full">個人</span>
                  )}
                  <p className={`text-xs font-semibold tabular-nums ${
                    item.isDiscount || item.amount < 0 ? "text-emerald-600" : "text-gray-700"
                  }`}>
                    {item.amount < 0 ? "-" : ""}¥{Math.abs(item.amount).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
          {/* 合計チェック */}
          <div className="flex justify-between pt-2 border-t border-gray-200 mt-1">
            <p className="text-xs text-gray-400">品目合計</p>
            <p className="text-xs font-semibold text-gray-600">
              ¥{t.items.reduce((s, i) => s + Math.abs(i.amount || 0), 0).toLocaleString()}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
