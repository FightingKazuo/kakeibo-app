import { useState } from "react";
import { fmtCurrency } from "../../utils/format";
import { SourceBadge } from "../ui/SourceBadge";

export function TransactionItem({
  transaction: t, categories, members, pointAccounts,
  onEdit, onDelete, onUpdateSharing, onUpdateTransfer,
  learnedRules, onCatFilter, catFilters,
  // 選択モード用
  selectMode, selected, onSelect,
  csvSourceLabels}) {
  const [expanded,    setExpanded]    = useState(false);
  const [showActions, setShowActions] = useState(false);
  const isIncome  = t.type === "income";
  const cat       = categories.find(c => c.name === t.category);
  const hasItems  = Array.isArray(t.items) && t.items.length > 0;
  const paidByMember = members?.find(m => m.id === t.paidBy);
  const pointAccount = pointAccounts?.find(a => a.id === t.pointAccountId);
  const isTransfer   = t.isTransfer === true;

  // 分割表示用
  const isSplit    = !!t._splitType;
  const splitType  = t._splitType;  // "shared" | "personal" | "partner"
  const isCatSplit = !!t._catSplitCat; // 品目カテゴリー分割行
  const splitCat   = isCatSplit ? categories.find(c => c.name === t._catSplitCat) : null;
  // catFiltersがある場合は品目カテゴリーが一致する品目のみの金額を表示
  const displayAmt = (() => {
    if (!catFilters || catFilters.size === 0) return t._splitAmt ?? Math.abs(t.amount);
    const items = t.items || [];
    if (items.length > 0) {
      const matched = items.filter(item => {
        const cat = (item.category && item.category !== "その他") ? item.category : t.category;
        return catFilters.has(cat);
      });
      if (matched.length > 0) return matched.reduce((s, i) => s + Math.abs(i.amount), 0);
    }
    return catFilters.has(t.category) ? (t._splitAmt ?? Math.abs(t.amount)) : Math.abs(t.amount);
  })();

  // 学習済みチェック（store名が学習ルールのキーワードと一致）
  const isLearned = !isSplit && !!learnedRules?.some(r =>
    r.keywords?.some(kw => t.label?.toLowerCase().includes(kw.toLowerCase()) || kw.toLowerCase().includes(t.label?.toLowerCase()))
    && r.category === t.category
  );

  const handleMainClick = () => {
    if (selectMode) { onSelect?.(t.id); return; }
    if (hasItems && !isSplit) setExpanded(p => !p);
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
    <div className={`border-b border-gray-100 last:border-b-0 transition-colors ${
      isTransfer ? "opacity-50" : ""
    } ${selected ? "bg-indigo-50" :
      isSplit && splitType === "shared"   ? "bg-indigo-50/30" :
      isSplit && splitType === "personal" ? "bg-rose-50/40" :
      isSplit && splitType === "partner"  ? "bg-purple-50/40" :
      "bg-white"
    }`}>

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
          <button
            onClick={() => onCatFilter?.(t.category)}
            className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-xl flex-shrink-0 active:bg-indigo-100 transition-colors">
            {isTransfer ? "🔄" : cat?.emoji || "📦"}
          </button>
        )}

        <div className="flex-1 min-w-0 overflow-hidden" onClick={handleMainClick}>
          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
            <p className="text-sm font-medium text-gray-800 truncate">{t.label}</p>
            {!isSplit && t.source && t.source !== "manual" && <SourceBadge source={t.source} csvFormatId={t.csvFormatId} csvSourceLabels={csvSourceLabels} />}
            {isLearned && (
              <span className="text-xs bg-violet-100 text-violet-500 px-1.5 py-0.5 rounded-full">🧠学習済み</span>
            )}
            {isTransfer && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">振替</span>}
            {/* 分割バッジ */}
            {isSplit && splitType === "shared"   && <span className="text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full font-medium">🤝共有分</span>}
            {isSplit && splitType === "personal" && <span className="text-xs bg-rose-100 text-rose-500 px-1.5 py-0.5 rounded-full font-medium">👤個人分</span>}
            {isSplit && splitType === "partner"  && <span className="text-xs bg-purple-100 text-purple-500 px-1.5 py-0.5 rounded-full font-medium">👥相手分</span>}
            {/* 品目カテゴリー分割バッジ */}
            {isCatSplit && splitCat && (
              <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">
                {splitCat.emoji} {splitCat.name}
              </span>
            )}
            {/* 支払者未設定警告（非分割のみ） */}
            {!isSplit && t.type === "expense" && !t.paidBy && t.shareType !== "personal" && t.shareType !== "partner" && (
              <span className="text-xs bg-rose-100 text-rose-500 px-1.5 py-0.5 rounded-full">⚠️未設定</span>
            )}
          </div>
          {/* 1行目：カテゴリ・日付 */}
          <p className="text-xs text-gray-400 mt-0.5">{t.category} · {t.date}</p>
          {t.memo && (
            <p className="text-xs text-indigo-500 mt-0.5 truncate">📝 {t.memo}</p>
          )}
          {/* 2行目：バッジ類 */}
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {!isSplit && (
              <>
                {/* 支払者 */}
                {paidByMember ? (
                  <span className="text-xs bg-indigo-50 text-indigo-500 px-1.5 py-0.5 rounded-full font-medium">
                    👤{paidByMember.name}払い
                  </span>
                ) : t.type === "expense" && t.shareType !== "personal" && t.shareType !== "partner" && (
                  <span className="text-xs bg-rose-50 text-rose-400 px-1.5 py-0.5 rounded-full font-medium">
                    ⚠️支払者未設定
                  </span>
                )}
                {/* 支払方法（ポイント） */}
                {pointAccount && (
                  <span className="text-xs bg-amber-50 text-amber-500 px-1.5 py-0.5 rounded-full font-medium">
                    {pointAccount.icon}{pointAccount.name}払い
                  </span>
                )}
                {/* 共有区分 */}
                {t.type === "expense" && (
                  t.shareType === "personal" ? (
                    <span className="text-xs bg-rose-100 text-rose-500 px-1.5 py-0.5 rounded-full font-medium">👤個人</span>
                  ) : t.shareType === "partner" ? (
                    <span className="text-xs bg-purple-100 text-purple-500 px-1.5 py-0.5 rounded-full font-medium">👥相手</span>
                  ) : (
                    <span className="text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full font-medium">🤝共有</span>
                  )
                )}
              </>
            )}
            {/* 品目 */}
            {hasItems && !selectMode && !isSplit && (
              <span className="text-xs text-indigo-400 font-medium">品目{t.items.length}件 {expanded ? "▲" : "▼"}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0 ml-1">
          <div className="text-right">
            <p className={`text-base font-bold tabular-nums whitespace-nowrap ${isIncome ? "text-emerald-600" : "text-rose-600"}`}>
              {isIncome ? "+" : "-"}{fmtCurrency(displayAmt)}
            </p>
            {/* フィルター中かつ金額が変わっている場合は元金額をグレーで表示 */}
            {catFilters && catFilters.size > 0 && displayAmt !== (t._splitAmt ?? Math.abs(t.amount)) && (
              <p className="text-xs text-gray-400 tabular-nums line-through">
                {fmtCurrency(t._splitAmt ?? Math.abs(t.amount))}
              </p>
            )}
          </div>
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
      {expanded && hasItems && !selectMode && (() => {
        // catFiltersが設定されている場合は該当カテゴリーの品目のみ表示
        const displayItems = catFilters && catFilters.size > 0
          ? t.items.filter(item => {
              const itemCat = (item.category && item.category !== "その他") ? item.category : t.category;
              return catFilters.has(itemCat);
            })
          : t.items;
        return (
        <div className="border-t border-gray-50 bg-gray-50 px-5 pb-3">
          {catFilters && catFilters.size > 0 && displayItems.length < t.items.length && (
            <p className="text-xs text-indigo-500 font-medium pt-2 pb-1">
              🏷️ {[...catFilters].join("・")}の品目のみ表示（{displayItems.length}/{t.items.length}件）
            </p>
          )}
          <div className="divide-y divide-gray-100">
            {displayItems.map((item, i) => (
              <div key={i} className="flex items-center justify-between py-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-xs text-gray-700 truncate">{item.name || "（商品名なし）"}</p>
                    {/* 品目カテゴリーバッジ：取引カテゴリーと異なれば青、同じならグレー */}
                    {item.category && item.category !== "その他" && (
                      <button
                        onClick={() => onCatFilter?.(item.category)}
                        className={`text-xs px-1.5 py-0.5 rounded-full border flex-shrink-0 transition-colors ${
                          item.category !== t.category
                            ? "bg-indigo-50 text-indigo-600 border-indigo-200 font-medium"
                            : "bg-gray-50 text-gray-400 border-gray-200"
                        }`}>
                        {categories?.find(c => c.name === item.category)?.emoji} {item.category}
                      </button>
                    )}
                  </div>
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
            <p className="text-xs text-gray-400">
              {catFilters && catFilters.size > 0 && displayItems.length < t.items.length
                ? `${[...catFilters].join("・")}合計`
                : "品目合計"}
            </p>
            <p className="text-xs font-semibold text-gray-600">
              ¥{displayItems.reduce((s, i) => s + Math.abs(i.amount || 0), 0).toLocaleString()}
            </p>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
