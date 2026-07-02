import { useState, useMemo } from "react";
import { toYM, fmtCurrency } from "../../utils/format";
import { MonthSelector } from "../common/MonthSelector";
import { TransactionItem } from "./TransactionItem";
import { CSV_SOURCES_ALL }  from "../../constants";
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

// catFiltersで品目カテゴリーごとに分割
const splitByCatFilter = (tx, catFilters) => {
  if (!catFilters || catFilters.size === 0) return [tx];
  const items = tx.items || [];
  if (items.length === 0) return catFilters.has(tx.category) ? [tx] : [];
  const groups = {};
  items.forEach(item => {
    const cat = (item.category && item.category !== "その他") ? item.category : tx.category;
    if (!catFilters.has(cat)) return;
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  });
  if (Object.keys(groups).length === 0) return [];
  return Object.entries(groups).map(([cat, catItems]) => ({
    ...tx,
    _catSplit:    true,
    _catSplitCat: cat,
    _splitAmt:    catItems.reduce((s, i) => s + Math.abs(i.amount), 0),
    items:        catItems,
  }));
};

export function TransactionListPage({ transactions, categories, members, pointAccounts, learnedRules, onEdit, onDelete, onUpdate, onNavigate, csvSourceLabels }) {
  const [q,             setQ]             = useState("");
  const [selMonth,      setSelMonth]      = useState("all");
  const [srcFilter,     setSrcFilter]     = useState("all");
  const [csvSrcFilter,  setCsvSrcFilter]  = useState("all"); // CSV内カード絞り込み
  const [shareFilter,   setShareFilter]   = useState("all");
  const [errFilter,     setErrFilter]     = useState(false);
  const [catFilters,    setCatFilters]    = useState(new Set());
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [sortBy,        setSortBy]        = useState("date");
  const [sortAsc,       setSortAsc]       = useState(true); // true=古い順

  // カレンダービュー
  const [calView,    setCalView]    = useState(false);
  const [calSelDay,  setCalSelDay]  = useState(null);
  const [calNavYM,   setCalNavYM]   = useState(null); // カレンダー独自の表示月（null=selMonthに従う）

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
      .filter(t => srcFilter !== "csv" || csvSrcFilter === "all" || t.csvFormatId === csvSrcFilter)
      .filter(t => !q || t.label.includes(q) || t.category.includes(q) || t.items?.some(i => i.name?.includes(q)))
      .filter(t => catFilters.size === 0 || catFilters.has(t.category) || t.items?.some(i => catFilters.has(i.category)))
      .filter(t => !errFilter || (t.type === "expense" && !t.paidBy && t.shareType !== "personal" && t.shareType !== "partner")),
    [transactions, selMonth, srcFilter, csvSrcFilter, q, catFilters, errFilter]
  );

  // 分割表示行を生成してからshareFilter・ソートを適用
  const displayRows = useMemo(() => {
    const rows = filtered.flatMap(t => splitTransaction(t));
    const shared = shareFilter === "all" ? rows : rows.filter(r => {
      const effectiveType = r._splitType || r.shareType || "shared";
      return effectiveType === shareFilter;
    });
    // catFiltersがある場合は品目カテゴリーごとに分割
    const catSplit = catFilters.size > 0
      ? shared.flatMap(t => splitByCatFilter(t, catFilters))
      : shared;
    return [...catSplit].sort((a, b) => {
      if (sortBy === "date") {
        const cmp = a.date?.localeCompare(b.date ?? "") ?? 0;
        return sortAsc ? cmp : -cmp;
      }
      if (sortBy === "label")  return (a.label ?? "").localeCompare(b.label ?? "");
      if (sortBy === "amount") return Math.abs(b._splitAmt ?? b.amount) - Math.abs(a._splitAmt ?? a.amount);
      return 0;
    });
  }, [filtered, shareFilter, sortBy, sortAsc, catFilters]);

  // 合計（分割行の場合は_splitAmtを使用）
  const totals = useMemo(() => ({
    income:  displayRows.filter(t => t.type === "income").reduce((s, t) => s + Math.abs(t._splitAmt ?? t.amount), 0),
    expense: displayRows.filter(t => t.type === "expense").reduce((s, t) => s + Math.abs(t._splitAmt ?? t.amount), 0),
  }), [displayRows]);

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
              <div className="flex items-center gap-2">
                {!calView && (
                  <button onClick={() => setSelectMode(true)}
                    className="text-xs text-gray-500 font-semibold px-3 py-1.5 bg-gray-100 rounded-lg">
                    選択
                  </button>
                )}
                <button onClick={() => { setCalView(p => !p); setSelectMode(false); setCalSelDay(null); setCalNavYM(null); }}
                  className={`text-sm font-bold px-2.5 py-1.5 rounded-lg transition-all ${
                    calView ? "bg-indigo-500 text-white" : "bg-gray-100 text-gray-500"
                  }`}>
                  📅
                </button>
              </div>
            </div>
            <MonthSelector months={months} selected={selMonth} onChange={(m) => { setSelMonth(m); setCalSelDay(null); }} />
            {/* ソース・エラーフィルター */}
            <div className="flex gap-2 overflow-x-auto scrollbar-none">
              {[["all","すべて"],["manual","✏️手動"],["csv","📊CSV"],["ocr","📷OCR"]].map(([id, lb]) => (
                <button key={id} onClick={() => { setSrcFilter(id); if (id !== "csv") setCsvSrcFilter("all"); }}
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

            {/* CSV カード別サブフィルター（📊CSVフィルター選択時のみ表示） */}
            {srcFilter === "csv" && (() => {
              // 現在表示中のCSV取引に含まれるcsvFormatIdを収集
              const activeFmtIds = [...new Set(
                transactions
                  .filter(t => t.source === "csv" && t.csvFormatId)
                  .map(t => t.csvFormatId)
              )];
              if (activeFmtIds.length === 0) return null;
              const srcOptions = [
                { id: "all", short: "すべて", icon: "" },
                ...CSV_SOURCES_ALL
                  .filter(s => activeFmtIds.includes(s.id))
                  .map(s => ({ id: s.id, short: s.short, icon: s.icon })),
              ];
              return (
                <div className="flex gap-2 overflow-x-auto scrollbar-none pb-0.5">
                  {srcOptions.map(({ id, short, icon }) => (
                    <button key={id} onClick={() => setCsvSrcFilter(id)}
                      className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold border transition-all duration-200 ${
                        csvSrcFilter === id
                          ? "bg-indigo-500 text-white border-indigo-500"
                          : "bg-white text-gray-500 border-gray-200"
                      }`}>
                      {icon} {short}
                    </button>
                  ))}
                </div>
              );
            })()}

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
            <div className="flex gap-2 items-center flex-wrap">
              <button onClick={() => setShowCatPicker(p => !p)}
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
              {[...catFilters].map(name => (
                <span key={name} className="flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                  {categories.find(c => c.name === name)?.emoji} {name}
                  <button onClick={() => setCatFilters(p => { const n = new Set(p); n.delete(name); return n; })} className="text-emerald-400">×</button>
                </span>
              ))}
            </div>

            {/* カテゴリー選択モーダル */}
            {showCatPicker && (
              <div className="fixed inset-0 bg-black/40 z-50 flex flex-col justify-end" onClick={() => setShowCatPicker(false)}>
                <div className="bg-white rounded-t-2xl w-full flex flex-col" style={{ maxHeight: "75vh" }}
                  onClick={e => e.stopPropagation()}>
                  <div className="p-5 pb-3 border-b border-gray-100 flex-shrink-0">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-sm font-bold text-gray-900">カテゴリーを選択</p>
                        <p className="text-xs text-gray-400">複数選択可</p>
                      </div>
                      <button onClick={() => setShowCatPicker(false)} className="text-gray-400 text-2xl leading-none">×</button>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setCatFilters(new Set())}
                        className={`flex-1 py-2 rounded-xl text-xs font-semibold border ${
                          catFilters.size === 0 ? "bg-gray-700 text-white border-gray-700" : "bg-white text-gray-500 border-gray-200"
                        }`}>
                        すべて解除
                      </button>
                      {catFilters.size > 0 && (
                        <button onClick={() => setShowCatPicker(false)}
                          className="flex-1 py-2 rounded-xl text-xs font-semibold bg-emerald-500 text-white border border-emerald-500">
                          ✅ {catFilters.size}件で絞り込む
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="overflow-y-auto flex-1 p-5 space-y-4">
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
                <button key={id}
                  onClick={() => {
                    if (id === "date" && sortBy === "date") {
                      setSortAsc(v => !v);
                    } else {
                      setSortBy(id);
                    }
                  }}
                  className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                    sortBy === id
                      ? "bg-gray-700 text-white border-gray-700"
                      : "bg-white text-gray-500 border-gray-200"
                  }`}>
                  {lb}{id === "date" && sortBy === "date" ? (sortAsc ? " ↑" : " ↓") : ""}
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
        <span>{displayRows.length}件{catFilters.size > 0 && <span className="text-emerald-600 ml-1">（{[...catFilters].join("・")}のみ）</span>}</span>
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

      {/* ── カレンダービュー ── */}
      {calView && (() => {
        // フィルター済みの取引を月×日でマップ化
        const fmt = (n) => {
          const a = Math.abs(n);
          if (a >= 10000) {
            const man = a / 10000;
            return man % 1 === 0 ? `${man}万` : `${man.toFixed(1)}万`;
          }
          return a.toLocaleString(); // 9,999以下はそのまま（カンマあり）
        };
        // カレンダー表示中の月（selMonthが"all"のときはcalNavYMで独自管理）
        const allYMs = months.filter(m => m !== "all"); // MonthSelectorのmonths（降順）
        const defaultYM = allYMs[0] || (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}`; })();
        const calYM = calNavYM || ((selMonth && selMonth !== "all") ? selMonth : defaultYM);
        const [calY, calM] = calYM.split("-").map(Number);

        // その月のフィルター済み取引（selMonth="all"のときは全期間から当月分を抽出）
        const calTxs = (selMonth === "all" ? transactions : displayRows)
          .filter(t => (t.date || "").startsWith(calYM));

        // 日→{inc,exp,txs}のマップ
        const dayMap = {};
        calTxs.forEach(t => {
          const d = parseInt((t.date || "").slice(8, 10), 10);
          if (!dayMap[d]) dayMap[d] = { inc: 0, exp: 0, txs: [] };
          if (t.type === "income") dayMap[d].inc += t.amount;
          else dayMap[d].exp += Math.abs(t._splitAmt ?? t.amount);
          dayMap[d].txs.push(t);
        });

        const firstDow  = new Date(calY, calM - 1, 1).getDay();
        const daysInMon = new Date(calY, calM, 0).getDate();
        const cells = [...Array(firstDow).fill(null), ...Array.from({length: daysInMon}, (_, i) => i + 1)];
        const DOW = ["日","月","火","水","木","金","土"];

        // 選択日はコンポーネント外stateでもよいが、ローカルstateは使えないので
        // 簡易実装として選択日をURLハッシュで管理する代わりに、
        // 同じレベルで管理できるよう、stateを上に移動済み（calSelDay）
        return (
          <div className="bg-white">
            {/* 月ナビゲーション（全期間フィルター時 or selMonthに関係なく月移動可能） */}
            {(() => {
              const prevYM = (() => { const d = new Date(calY, calM - 2, 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; })();
              const nextYM = (() => { const d = new Date(calY, calM, 1);     return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; })();
              const hasPrev = allYMs.includes(prevYM) || (selMonth === "all" && displayRows.some(t => t.date?.startsWith(prevYM)));
              const hasNext = allYMs.includes(nextYM) || (selMonth === "all" && displayRows.some(t => t.date?.startsWith(nextYM)));
              return (
                <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
                  <button onClick={() => { setCalNavYM(prevYM); setCalSelDay(null); }}
                    disabled={!hasPrev}
                    className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold transition-all ${hasPrev ? "text-indigo-500 hover:bg-indigo-50 active:bg-indigo-100" : "text-gray-200"}`}>
                    ‹
                  </button>
                  <span className="text-sm font-bold text-gray-800">{calY}年{calM}月</span>
                  <button onClick={() => { setCalNavYM(nextYM); setCalSelDay(null); }}
                    disabled={!hasNext}
                    className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold transition-all ${hasNext ? "text-indigo-500 hover:bg-indigo-50 active:bg-indigo-100" : "text-gray-200"}`}>
                    ›
                  </button>
                </div>
              );
            })()}

            {/* 曜日ヘッダー */}
            <div className="grid grid-cols-7 border-b border-gray-100">
              {DOW.map((d, i) => (
                <div key={d} className={`text-center py-2 text-xs font-bold ${i===0?"text-rose-400":i===6?"text-indigo-400":"text-gray-400"}`}>{d}</div>
              ))}
            </div>
            {/* グリッド */}
            <div className="grid grid-cols-7">
              {cells.map((day, idx) => {
                if (!day) return <div key={`e-${idx}`} className="h-16 border-b border-r border-gray-50 bg-gray-50/30" />;
                const data = dayMap[day];
                const isSelected = calSelDay === day;
                const dow = idx % 7;
                return (
                  <button key={day} onClick={() => setCalSelDay(isSelected ? null : day)}
                    className={`h-16 flex flex-col items-center pt-1 border-b border-r border-gray-50 transition-all active:bg-indigo-50 ${isSelected ? "bg-indigo-50" : ""}`}>
                    <span className={`text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center ${dow===0?"text-rose-400":dow===6?"text-indigo-400":"text-gray-700"}`}>{day}</span>
                    {data && (
                      <div className="flex flex-col items-center mt-0.5 gap-0.5">
                        {data.inc > 0 && <span className="text-emerald-500 font-bold leading-none" style={{fontSize:"9px"}}>+{fmt(data.inc)}</span>}
                        {data.exp > 0 && <span className="text-rose-500 font-bold leading-none" style={{fontSize:"9px"}}>-{fmt(data.exp)}</span>}
                      </div>
                    )}
                    {isSelected && <div className="mt-auto w-3 h-0.5 bg-indigo-400 rounded-full mb-0.5" />}
                  </button>
                );
              })}
            </div>
            {/* 選択日の取引詳細パネル */}
            {calSelDay && (() => {
              const dayTxs = (dayMap[calSelDay]?.txs || []);
              return (
                <div className="border-t-2 border-indigo-100">
                  <div className="flex items-center justify-between px-4 py-2 bg-indigo-50">
                    <span className="text-xs font-bold text-indigo-600">
                      {calM}/{calSelDay}（{DOW[new Date(calY, calM-1, calSelDay).getDay()]}）· {dayTxs.length}件
                    </span>
                    <button onClick={() => setCalSelDay(null)} className="text-gray-400 text-sm w-6 h-6">✕</button>
                  </div>
                  {dayTxs.length === 0
                    ? <p className="text-xs text-gray-400 text-center py-6">取引なし</p>
                    : dayTxs.map((t, i) => (
                      <TransactionItem
                        key={`cal-${t.id}_${i}`}
                        transaction={t}
                        categories={categories}
                        members={members}
                        pointAccounts={pointAccounts}
                        learnedRules={learnedRules}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        onUpdateSharing={handleUpdateSharing}
                        onUpdateTransfer={handleUpdateTransfer}
                        onCatFilter={(cat) => setCatFilters(p => { const n = new Set(p); n.has(cat) ? n.delete(cat) : n.add(cat); return n; })}
                        catFilters={catFilters}
                        csvSourceLabels={csvSourceLabels}
                      />
                    ))
                  }
                </div>
              );
            })()}
          </div>
        );
      })()}

      {/* ── リスト ── */}
      {!calView && <div className="bg-white">
        {displayRows.length === 0 && transactions.length === 0 ? (
          <EmptyState emoji="🗂️" title="まだ取引がありません" desc="「追加」から最初の取引を登録しましょう"
            actionLabel="➕ 取引を追加する" onAction={() => onNavigate?.("add")} />
        ) : displayRows.length === 0 ? (
          <EmptyState emoji="🔍" title="該当する取引がありません" desc="検索条件やフィルターを変えてみてください" />
        ) : (
          displayRows.map((t, idx) => (
            <TransactionItem
              key={`${t.id}_${t._splitType || "all"}_${t._catSplitCat || ""}_${idx}`}
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
              csvSourceLabels={csvSourceLabels}
            />
          ))
        )}
      </div>}
    </div>
  );
}
