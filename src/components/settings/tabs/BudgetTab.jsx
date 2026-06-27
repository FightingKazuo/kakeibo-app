import { useState, useMemo } from "react";
import { fmtCurrency } from "../../../utils/format";

const DEFAULT_CATS = [
  "食費","外食","日用品","趣味・娯楽","交際費","交通費","衣服・美容",
  "健康・医療","自動車","教養・教育","特別な支出","電力費","ガス,水道費",
  "通信費","税・社会保障","保険","投資","その他",
];

export function BudgetTab({ transactions, categories, budgets = {}, onBudgetsChange }) {
  const [editing, setEditing] = useState(null);
  const [editVal, setEditVal] = useState("");

  const now = new Date();
  const ym  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const monthExpenses = useMemo(() => {
    const map = {};
    transactions
      .filter(t => t.type === "expense" && t.date?.startsWith(ym))
      .forEach(t => {
        const cat = t.category || "その他";
        map[cat] = (map[cat] || 0) + Math.abs(t.amount);
      });
    return map;
  }, [transactions, ym]);

  const allCats      = [...new Set([...DEFAULT_CATS, ...(categories?.map(c => c.name) || [])])];
  const budgetedCats = allCats.filter(c => budgets[c]);
  const freeCats     = allCats.filter(c => !budgets[c]);

  const totalBudget = Object.values(budgets).reduce((s, v) => s + v, 0);
  const totalSpent  = budgetedCats.reduce((s, c) => s + (monthExpenses[c] || 0), 0);
  const totalPct    = totalBudget > 0 ? Math.min(totalSpent / totalBudget * 100, 100) : 0;

  const saveBudget = (cat, val) => {
    const amt = parseInt(String(val).replace(/[^0-9]/g, ""));
    const next = { ...budgets };
    if (!amt || amt <= 0) delete next[cat];
    else next[cat] = amt;
    onBudgetsChange?.(next);
    setEditing(null);
  };

  return (
    <div className="px-4 py-4 space-y-4">
      {/* 合計 */}
      {budgetedCats.length > 0 && (
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl p-4 border border-indigo-100">
          <p className="text-xs text-indigo-600 font-semibold mb-1">今月の予算合計</p>
          <div className="flex items-end justify-between mb-2">
            <span className="text-xl font-bold text-indigo-700">{fmtCurrency(totalSpent)}</span>
            <span className="text-xs text-gray-500">/ {fmtCurrency(totalBudget)}</span>
          </div>
          <div className="w-full bg-indigo-100 rounded-full h-2">
            <div className={`h-2 rounded-full transition-all ${totalPct >= 100 ? "bg-rose-500" : totalPct >= 80 ? "bg-amber-400" : "bg-indigo-500"}`}
              style={{ width: `${totalPct}%` }} />
          </div>
          <p className="text-xs text-right text-gray-400 mt-1">{totalPct.toFixed(0)}%</p>
        </div>
      )}

      {/* 設定済み */}
      {budgetedCats.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <p className="text-xs font-semibold text-gray-500 px-4 py-2 border-b border-gray-50">予算設定中</p>
          {budgetedCats.map(cat => {
            const budget = budgets[cat] || 0;
            const spent  = monthExpenses[cat] || 0;
            const pct    = budget > 0 ? Math.min(spent / budget * 100, 100) : 0;
            const over   = spent > budget;
            const isEdit = editing === cat;
            return (
              <div key={cat} className="px-4 py-3 border-b border-gray-50 last:border-b-0">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-semibold text-gray-700">{cat}</span>
                  {isEdit ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-400">¥</span>
                      <input value={editVal} onChange={e => setEditVal(e.target.value)}
                        className="w-24 text-xs border border-indigo-300 rounded px-1.5 py-0.5 text-right"
                        type="number" autoFocus />
                      <button onClick={() => saveBudget(cat, editVal)} className="text-xs text-indigo-500 font-semibold">保存</button>
                      <button onClick={() => setEditing(null)} className="text-xs text-gray-400">×</button>
                    </div>
                  ) : (
                    <button onClick={() => { setEditing(cat); setEditVal(String(budget)); }}
                      className="text-xs text-gray-400 underline">{fmtCurrency(budget)}</button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full transition-all ${over ? "bg-rose-500" : pct >= 80 ? "bg-amber-400" : "bg-emerald-500"}`}
                      style={{ width: `${pct}%` }} />
                  </div>
                  <span className={`text-xs font-semibold flex-shrink-0 ${over ? "text-rose-500" : pct >= 80 ? "text-amber-500" : "text-gray-500"}`}>
                    {over && "⚠️ "}{fmtCurrency(spent)}
                    {over && <span className="text-rose-400"> (+{fmtCurrency(spent - budget)})</span>}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 未設定 */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <p className="text-xs font-semibold text-gray-500 px-4 py-2 border-b border-gray-50">予算を追加</p>
        {freeCats.map(cat => {
          const isEdit = editing === cat;
          return (
            <div key={cat} className="flex items-center justify-between px-4 py-2.5 border-b border-gray-50 last:border-b-0">
              <span className="text-sm text-gray-500">{cat}</span>
              {isEdit ? (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-400">¥</span>
                  <input value={editVal} onChange={e => setEditVal(e.target.value)}
                    className="w-24 text-xs border border-indigo-300 rounded px-1.5 py-0.5 text-right"
                    type="number" autoFocus />
                  <button onClick={() => saveBudget(cat, editVal)} className="text-xs text-indigo-500 font-semibold">設定</button>
                  <button onClick={() => setEditing(null)} className="text-xs text-gray-400">×</button>
                </div>
              ) : (
                <button onClick={() => { setEditing(cat); setEditVal(""); }}
                  className="text-xs text-indigo-400 font-semibold">+ 設定</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
