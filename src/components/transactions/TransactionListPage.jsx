import { useState, useMemo } from "react";
import { toYM, fmtCurrency } from "../../utils/format";
import { MonthSelector } from "../common/MonthSelector";
import { TransactionItem } from "./TransactionItem";
import { EmptyState } from "../ui/EmptyState";

// ─── 取引を共有/個人/相手に分割した表示行を生成 ───────────────
// 品目に複数のtype（shared/personal/partner）が混在する取引を分割
const splitTransaction = (tx) => {
  const items = tx.items || [];
  if (!items.length) return [tx]; // 品目なし → そのまま

  const sharedItems   = items.filter(i => !i.type || i.type === "shared");
  const personalItems = items.filter(i => i.type === "personal");
  const partnerItems  = items.filter(i => i.type === "partner");

  // 全部同じtype → 分割不要
  const types = new Set(items.map(i => i.type || "shared"));
  if (types.size === 1) return [tx];

  const rows = [];
  if (sharedItems.length > 0) {
    const amt = sharedItems.reduce((s, i) => s + i.amount, 0);
    if (amt > 0) rows.push({ ...tx, _splitType: "shared",   _splitAmt: amt,   items: sharedItems });
  }
  if (personalItems.length > 0) {
    const amt = personalItems.reduce((s, i) => s + i.amount, 0);
    if (amt > 0) rows.push({ ...tx, _splitType: "personal", _splitAmt: amt,   items: personalItems });
  }
  if (partnerItems.length > 0) {
    const amt = partnerItems.reduce((s, i) => s + i.amount, 0);
    if (amt > 0) rows.push({ ...tx, _splitType: "partner",  _splitAmt: amt,   items: partnerItems });
  }
  return rows.length > 0 ? rows : [tx];
};

export function TransactionListPage({ transactions, categories, members, pointAccounts, learnedRules, onEdit, onDelete, onUpdate, onNavigate }) {
  const [q,             setQ]             = useState("");
  const [selMonth,      setSelMonth]      = useState("all");
  const [srcFilter,     setSrcFilter]     = useState("all");
  const [shareFilter,   setShareFilter]   = useState("all");
  const [errFilter,     setErrFilter]     = useState(false);
  const [catFilters,    setCatFilters]    = useState(new Set()); // 複数選択対応
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [sortBy,        setSortBy]        = useState("registered");

  // 選択モード
  const [selectMode,  setSelectMode]  = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showBulkCat, setShowBulkCat] = useState(false);

  const months = useMemo(
    () => [...new Set(transactions.map(t => toYM(t.date)))].sort().reverse(),
    [transactions]
  );

  // フィルター適用後の取引
  const filtered = useMemo(() =>
    transactions
      .filter(t => selMonth === "all" || toYM(t.date) === selMonth)
      .filter(t => srcFilter === "all" || t.source === srcFilter)
      .filter(t => !q || t.label.includes(q) || t.category.includes(q) || t.items?.some(i => i.name?.includes(q)))
      // catFilters: 選択カテゴリーのどれかに一致
      .filter(t => catFilters.size === 0 || catFilters.has(t.category) || t.items?.some(i => catFilters.has(i.category)))
      .filter(t => !errFilter || (t.type === "expense" && !t.paidBy && t.shareType !== "personal" && t.shareType !== "partner")),
    [transactions, selMonth, srcFilter, q, catFilters, errFilter]
  );

  // 分割表示行を生成してからshareFilter・ソートを適用
  const displayRows = useMemo(() => {
    const rows = filtered.flatMap(t => splitTransaction(t));
    const shared = shareFilter === "all" ? rows : rows.filter(r => {
      const effectiveType = r._splitType || r.shareType || "shared";
      return effectiveType === shareFilter;
    });
    // ソート
    return [...shared].sort((a, b) => {
      if (sortBy === "date")       return b.date?.localeCompare(a.date ?? "") ?? 0;
      if (sortBy === "label")      return (a.label ?? "").localeCompare(b.label ?? "");
      if (sortBy === "amount")     return Math.abs(b._splitAmt ?? b.amount) - Math.abs(a._splitAmt ?? a.amount);
      return 0; // registered: 元の順番（登録順）
    });
  }, [filtered, shareFilter, sortBy]);

  // 合計（catFiltersがある場合は品目カテゴリーフィルター後の金額）
  const totals = useMemo(() => {
    const calcAmt = (t) => {
      if (catFilters.size === 0) return Math.abs(t._splitAmt ?? t.amount);
      // catFiltersがある場合：品目カテゴリーが一致する品目のみ合算
      const items = t.items || [];
      if (items.length > 0) {
        const filtered = items.filter(item => {
          const cat = (item.category && item.category !== "その他") ? item.category : t.category;
          return catFilters.has(cat);
        });
        // 取引カテゴリー自体がマッチする場合は品目なし分も含む
        if (filtered.length > 0) return filtered.reduce((s, i) => s + Math.abs(i.amount), 0);
        if (catFilters.has(t.category)) return Math.abs(t._splitAmt ?? t.amount);
        return 0;
      }
      return catFilters.has(t.category) ? Math.abs(t._splitAmt ?? t.amount) : 0;
    };
    return {
      income:  displayRows.filter(t => t.type === "income").reduce((s, t) => s + calcAmt(t), 0),
      expense: displayRows.filter(t => t.type === "expense").reduce((s, t) => s + calcAmt(t), 0),
    };
  }, [displayRows, catFilters]);

  // 支払者未設定件数
  const unsetCount = useMemo(() =>
    transactions.filter(t => t.type === "expense" && !t.paidBy && t.shareType !== "personal" && t.shareType !== "partner").length,
    [transactions]
  );

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

  const selectAll = () => setSelectedIds(new Set(displayRows.map(t => t.id)));
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

  // 一括共有区分変更
  const handleBulkShareType = (shareType) => {
    selectedIds.forEach(id => {
      const tx = transactions.find(t => t.id === id);
      if (tx) onUpdate?.({ ...tx, shareType, updatedAt: new Date().toISOString() });
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
            {/* ソース・エラーフィルター */}
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
            {/* 共有区分フィルター */}
            <div className="flex gap-2 overflow-x-auto scrollbar-none">
              {[
                ["all",      "すべて",   "bg-gray-700 text-white",   "bg-white text-gray-500 border-gray-200"],
                ["shared",   "🤝 共有",  "bg-indigo-500 text-white", "bg-white text-indigo-500 border-indigo-200"],
                ["personal", "👤 個人",  "bg-rose-400 text-white",   "bg-white text-rose-400 border-rose-200"],
                ["partner",  "👥 相手",  "bg-purple-400 text-white", "bg-white text-purple-400 border-purple-200"],
              ].map(([id, lb, activeClass, inactiveClass]) => (
                <button key={id} onClick={() => setShareFilter(id)}
                  className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold border transition-all duration-200 ${
                    shareFilter === id ? activeClass : inactiveClass
                  }`}>
                  {lb}
                </button>
              ))}
            </div>

            {/* カテゴリーフィルターボタン */}
            <div className="flex gap-2 items-center">
              <button
                onClick={() => setShowCatPicker(true)}
                className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                  catFilters.size > 0 ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-gray-500 border-gray-200"
                }`}>
                🏷️ カテゴリー{catFilters.size > 0 ? `（${catFilters.size}件）` : ""}
              </button>
              {catFilters.size > 0 && (
                <button onClick={() => setCatFilters(new Set())}
                  className="text-xs text-gray-400 border border-gray-200 bg-white px-2.5 py-1 rounded-full">
                  解除
                </button>
              )}
            </div>

            {/* カテゴリー選択モーダル */}
            {showCatPicker && (
              <div className="fixed inset-0 bg-black/40 z-50 flex items-end" onClick={() => setShowCatPicker(false)}>
                <div className="bg-white rounded-t-2xl w-full p-5 space-y-4 max-h-[75vh] overflow-y-auto"
                  onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-gray-900">カテゴリーを選択</p>
                    <button onClick={() => setShowCatPicker(false)} className="text-gray-400 text-2xl leading-none">×</button>
                  </div>
                  <button
                    onClick={() => setCatFilters(new Set())}
                    className={`w-full py-2.5 rounded-xl text-sm font-semibold border ${
                      catFilters.size === 0 ? "bg-gray-700 text-white border-gray-700" : "bg-white text-gray-500 border-gray-200"
                    }`}>
                    すべて（フィルター解除）
                  </button>
                  <div>
                    <p className="text-xs font-semibold text-rose-400 mb-2">💸 支出</p>
                    <div className="grid grid-cols-3 gap-2">
                      {categories.filter(c => c.type === "expense").map(cat => (
                        <button key={cat.id}
                          onClick={() => setCatFilters(p => { const n = new Set(p); n.has(cat.name) ? n.delete(cat.name) : n.add(cat.name); return n; })}
                          className={`py-3 rounded-xl text-xs font-semibold border transition-all ${
                            catFilters.has(cat.name) ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-gray-600 border-gray-200"
                          }`}>
                          {cat.emoji}<br/>{cat.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-emerald-500 mb-2">💰 収入</p>
                    <div className="grid grid-cols-3 gap-2">
                      {categories.filter(c => c.type === "income").map(cat => (
                        <button key={cat.id}
                          onClick={() => setCatFilters(p => { const n = new Set(p); n.has(cat.name) ? n.delete(cat.name) : n.add(cat.name); return n; })}
                          className={`py-3 rounded-xl text-xs font-semibold border transition-all ${
                            catFilters.has(cat.name) ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-gray-600 border-gray-200"
                          }`}>
                          {cat.emoji}<br/>{cat.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 並び替えボタン */}
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
              {[
                ["registered", "登録順"],
                ["date",       "日付順"],
                ["label",      "項目順"],
                ["amount",     "金額順"],
              ].map(([id, lb]) => (
                <button key={id} onClick={() => setSortBy(id)}
                  className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                    sortBy === id
                      ? "bg-gray-700 text-white border-gray-700"
                      : "bg-white text-gray-500 border-gray-200"
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
          </>
        )}
      </div>

      {/* 件数・合計 */}
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex justify-between text-xs text-gray-500">
        <span>
          {displayRows.length}件
          {catFilters.size > 0 && <span className="text-emerald-600 ml-1">（{[...catFilters].join("・")}のみ）</span>}
        </span>
        <span>
          <span className="text-emerald-500 font-semibold">+{fmtCurrency(totals.income)}</span>
          {" / "}
          <span className="text-rose-500 font-semibold">-{fmtCurrency(totals.expense)}</span>
        </span>
      </div>

      {/* ── 選択モードの操作バー ── */}
      {selectMode && selectedIds.size > 0 && (
        <div className="bg-white border-b border-gray-100 px-4 py-3 space-y-2">
          {/* 共有区分 */}
          <div className="flex gap-2">
            <button onClick={() => handleBulkShareType("shared")}
              className="flex-1 py-2 bg-indigo-500 text-white rounded-xl text-xs font-semibold">
              🤝 共有
            </button>
            <button onClick={() => handleBulkShareType("personal")}
              className="flex-1 py-2 bg-rose-400 text-white rounded-xl text-xs font-semibold">
              👤 個人
            </button>
            <button onClick={() => handleBulkShareType("partner")}
              className="flex-1 py-2 bg-purple-400 text-white rounded-xl text-xs font-semibold">
              👥 相手
            </button>
          </div>
          {/* カテゴリ変更・削除 */}
          <div className="flex gap-2">
            <button onClick={() => setShowBulkCat(p => !p)}
              className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-xl text-xs font-semibold">
              🏷️ カテゴリ変更
            </button>
            <button onClick={handleBulkDelete}
              className="flex-1 py-2 bg-rose-500 text-white rounded-xl text-xs font-semibold">
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
        {displayRows.length === 0 && transactions.length === 0 ? (
          <EmptyState emoji="🗂️" title="まだ取引がありません" desc="「追加」から最初の取引を登録しましょう"
            actionLabel="➕ 取引を追加する" onAction={() => onNavigate?.("add")} />
        ) : displayRows.length === 0 ? (
          <EmptyState emoji="🔍" title="該当する取引がありません" desc="検索条件やフィルターを変えてみてください" />
        ) : (
          displayRows.map((t, idx) => (
            <TransactionItem
              key={`${t.id}_${t._splitType || "all"}_${idx}`}
              transaction={t}
              categories={categories}
              members={members}
              pointAccounts={pointAccounts}
              learnedRules={learnedRules}
              onEdit={selectMode ? undefined : onEdit}
              onDelete={selectMode ? undefined : onDelete}
              onUpdateSharing={handleUpdateSharing}
              onUpdateTransfer={handleUpdateTransfer}
              onCatFilter={(cat) => setCatFilters(p => { const n = new Set(p); n.has(cat) ? n.delete(cat) : n.add(cat); return n; })}
              catFilters={catFilters}
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
