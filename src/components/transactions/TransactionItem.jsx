import { useState } from "react";
import { fmtCurrency } from "../../utils/format";
import { SourceBadge } from "../ui/SourceBadge";

export function TransactionItem({
  transaction: t, categories, members, pointAccounts,
  onEdit, onDelete, onUpdateSharing, onUpdateTransfer,
  // 選択モード用
  selectMode, selected, onSelect,
}) {
  const [expanded,    setExpanded]    = useState(false);
  const [showActions, setShowActions] = useState(false);
  const isIncome  = t.type === "income";
  const cat       = categories.find(c => c.name === t.category);
  const hasItems  = Array.isArray(t.items) && t.items.length > 0;
  const paidByMember = members?.find(m => m.id === t.paidBy);
  const pointAccount = pointAccounts?.find(a => a.id === t.pointAccountId);
  const isTransfer   = t.isTransfer === true;

  const handleMainClick = () => {
    if (selectMode) { onSelect?.(t.id); return; }
    if (hasItems) setExpanded(p => !p);
  };

  const handleLongPress = (() => {
    let timer;
    return {
      onTouchStart: () => { timer = setTimeout(() => onSelect?.(t.id), 500); },
      onTouchEnd:   () => clearTimeout(timer),
      onTouchMove:  () => clearTimeout(timer),
    };
  })();

  return (
    <div className={`bg-white border-b border-gray-100 last:border-b-0 transition-colors ${
      isTransfer ? "opacity-50" : ""
    } ${selected ? "bg-indigo-50" : ""}`}>

      {/* ── メイン行 ── */}
      <div className="flex items-center gap-3 px-4 py-4"
        {...handleLongPress}
      >
        {/* 選択モード: チェックボックス */}
        {selectMode ? (
          <button onClick={() => onSelect?.(t.id)}
            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
              selected ? "bg-indigo-500 border-indigo-500" : "border-gray-300 bg-white"
            }`}>
            {selected && <span className="text-white text-xs">✓</span>}
          </button>
        ) : (
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-xl flex-shrink-0">
            {isTransfer ? "🔄" : cat?.emoji || "📦"}
          </div>
        )}

        <div className="flex-1 min-w-0 overflow-hidden" onClick={handleMainClick}>
          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
            <p className="text-sm font-medium text-gray-800 truncate">{t.label}</p>
            {t.source && t.source !== "manual" && <SourceBadge source={t.source} />}
            {isTransfer && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">振替</span>}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <p className="text-xs text-gray-400">{t.category} · {t.date}</p>
            {paidByMember && <span className="text-xs text-indigo-400">👤{paidByMember.name}</span>}
            {pointAccount  && <span className="text-xs text-amber-500">{pointAccount.icon}{pointAccount.name}</span>}
            {t.shareType === "personal" && <span className="text-xs bg-rose-100 text-rose-500 px-1.5 py-0.5 rounded-full">個人</span>}
            {t.shareType === "shared"   && <span className="text-xs bg-indigo-100 text-indigo-500 px-1.5 py-0.5 rounded-full">共有</span>}
            {hasItems && !selectMode && (
              <span className="text-xs text-indigo-400 font-medium">品目{t.items.length}件 {expanded ? "▲" : "▼"}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0 ml-1">
          <p className={`text-base font-bold tabular-nums whitespace-nowrap ${isIncome ? "text-emerald-600" : "text-rose-600"}`}>
            {isIncome ? "+" : "-"}{fmtCurrency(t.amount)}
          </p>
          {!selectMode && (
            <>
              {onEdit && (
                <button onClick={() => onEdit(t)} className="text-gray-300 hover:text-indigo-400 text-sm px-1 transition-colors">✏️</button>
              )}
              <button onClick={() => setShowActions(p => !p)} className="text-gray-300 hover:text-gray-500 text-sm px-1">⋮</button>
              {onDelete && (
                <button onClick={() => window.confirm(`「${t.label}」を削除しますか？`) && onDelete(t.id)}
                  className="text-gray-300 hover:text-rose-400 text-lg px-0.5 transition-colors">×</button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── クイックアクション ── */}
      {showActions && !selectMode && (
        <div className="px-5 pb-3 bg-gray-50 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-500 mb-2 pt-2">クイック編集</p>
          <div className="flex flex-wrap gap-2">
            <div className="flex rounded-lg overflow-hidden border border-gray-200">
              {["shared","personal",""].map((type, i) => (
                <button key={i}
                  onClick={() => { onUpdateSharing?.(t.id, type || null); setShowActions(false); }}
                  className={`px-2.5 py-1.5 text-xs font-medium transition-all ${
                    (t.shareType || "") === type
                      ? type === "shared" ? "bg-indigo-500 text-white"
                      : type === "personal" ? "bg-rose-400 text-white"
                      : "bg-gray-200 text-gray-600"
                      : "bg-white text-gray-400"
                  }`}>
                  {type === "shared" ? "共有" : type === "personal" ? "個人" : "未設定"}
                </button>
              ))}
            </div>
            <button
              onClick={() => { onUpdateTransfer?.(t.id, !isTransfer); setShowActions(false); }}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                isTransfer ? "bg-gray-500 text-white border-gray-500" : "bg-white text-gray-500 border-gray-200"
              }`}>
              🔄 {isTransfer ? "振替解除" : "振替とする"}
            </button>
          </div>
        </div>
      )}

      {/* ── 品目リスト（展開時）── */}
      {expanded && hasItems && !selectMode && (
        <div className="border-t border-gray-50 bg-gray-50 px-5 pb-3">
          <div className="divide-y divide-gray-100">
            {t.items.map((item, i) => (
              <div key={i} className="flex items-center justify-between py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-700 truncate">{item.name || "（商品名なし）"}</p>
                  {item.quantity > 1 && (
                    <p className="text-xs text-gray-400">×{item.quantity}{item.unitPrice ? ` @¥${item.unitPrice.toLocaleString()}` : ""}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  {item.type === "personal" && <span className="text-xs bg-rose-100 text-rose-500 px-1.5 py-0.5 rounded-full">個人</span>}
                  {item.type === "partner"  && <span className="text-xs bg-purple-100 text-purple-500 px-1.5 py-0.5 rounded-full">相手</span>}
                  <p className={`text-xs font-semibold tabular-nums ${item.isDiscount || item.amount < 0 ? "text-emerald-600" : "text-gray-700"}`}>
                    {item.amount < 0 ? "-" : ""}¥{Math.abs(item.amount).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
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
