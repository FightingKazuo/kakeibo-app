import { useState, useMemo } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, BarChart, Bar } from "recharts";
import { toYM, fmtCurrency } from "../../utils/format";
import { PIE_COLORS } from "../../constants";
import { MonthSelector } from "../common/MonthSelector";
import { EmptyState } from "../ui/EmptyState";

export function AnalysisPage({ transactions, categories, members, pointAccounts, onUpdate , csvSourceLabels}) {
  const [tab,          setTab]          = useState("analysis");
  const [showSettleTxs, setShowSettleTxs] = useState(false);
  const [selMonth, setSelMonth] = useState("all");

  // ── 精算用 期間指定 ──
  const today = new Date().toISOString().split("T")[0];
  const firstDay = useMemo(() => {
    if (!transactions.length) return today.slice(0, 7) + "-01";
    const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
    return sorted[0].date.slice(0, 7) + "-01";
  }, [transactions]);
  const [settleDateFrom, setSettleDateFrom] = useState(today.slice(0, 7) + "-01");
  const [settleDateTo,   setSettleDateTo]   = useState(today);

  // ── 支払者未設定の一括設定 ──
  const [selectedUnset,  setSelectedUnset]  = useState(new Set());
  const [showUnsetPanel, setShowUnsetPanel] = useState(false);

  // ── 精算対象取引の並び替え・選択 ──
  const [settleSortAsc, setSettleSortAsc] = useState(true); // true=昇順(古い順)
  const [selectedSettle, setSelectedSettle] = useState(new Set());
  const [showSettleEditPanel, setShowSettleEditPanel] = useState(false);

  const months = useMemo(
    () => [...new Set(transactions.map(t => toYM(t.date)))].sort().reverse(),
    [transactions]
  );

  const filtered = useMemo(
    () => selMonth === "all" ? transactions : transactions.filter(t => toYM(t.date) === selMonth),
    [transactions, selMonth]
  );

  const totalIncome  = useMemo(() => filtered.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0), [filtered]);
  const totalExpense = useMemo(() => filtered.filter(t => t.type === "expense").reduce((s, t) => s + Math.abs(t.amount), 0), [filtered]);

  const catData = useMemo(() => {
    const bycat = filtered.filter(t => t.type === "expense")
      .reduce((acc, t) => { acc[t.category] = (acc[t.category] || 0) + Math.abs(t.amount); return acc; }, {});
    return Object.entries(bycat)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value, emoji: categories.find(c => c.name === name)?.emoji || "📦" }));
  }, [filtered, categories]);

  const chartData = useMemo(() => {
    const ms = [...new Set(transactions.map(t => toYM(t.date)))].sort();
    return ms.map(m => {
      const mt  = transactions.filter(t => toYM(t.date) === m);
      const inc = mt.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
      const exp = mt.filter(t => t.type === "expense").reduce((s, t) => s + Math.abs(t.amount), 0);
      return { month: m.slice(5) + "月", income: inc, expense: exp };
    });
  }, [transactions]);

  const dailyAvg = useMemo(() => {
    if (!totalExpense) return 0;
    const days = selMonth === "all" ? 30
      : new Date(parseInt(selMonth.slice(0, 4)), parseInt(selMonth.slice(5, 7)), 0).getDate();
    return Math.floor(totalExpense / days);
  }, [totalExpense, selMonth]);

  const prevMonthComparison = useMemo(() => {
    if (selMonth === "all") return null;
    const [y, m] = selMonth.split("-").map(Number);
    const prev   = new Date(y, m - 2, 1);
    const prevYM = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
    const prevExp = transactions
      .filter(t => t.date.slice(0, 7) === prevYM && t.type === "expense")
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    const diff    = totalExpense - prevExp;
    const diffPct = prevExp > 0 ? Math.round((diff / prevExp) * 100) : null;
    return { prevExp, diff, diffPct };
  }, [transactions, selMonth, totalExpense]);

  // ── 精算計算 ──────────────────────────────────────────────
  const settlementData = useMemo(() => {
    if (!members || members.length < 2) return null;

    const target = transactions.filter(t =>
      t.type === "expense" &&
      t.shareType !== "personal" &&
      t.shareType !== "partner" &&
      t.date >= settleDateFrom &&
      t.date <= settleDateTo
    );

    if (target.length === 0) return { balances: members.map(m => ({ ...m, paid: 0, balance: 0 })), totalShared: 0, perPerson: 0, settlements: [], txCount: 0 };

    const defaultPayer = members[0]?.id;
    const paidMap = {};
    members.forEach(m => { paidMap[m.id] = 0; });

    target.forEach(t => {
      const payerId = t.paidBy || defaultPayer;
      const settleAmt = t.shareAmount != null ? Math.abs(t.shareAmount) : Math.abs(t.amount);
      if (paidMap[payerId] !== undefined) {
        paidMap[payerId] += settleAmt;
      } else {
        paidMap[defaultPayer] += settleAmt;
      }
    });

    const totalShared = Object.values(paidMap).reduce((s, v) => s + v, 0);
    const perPerson   = totalShared / members.length;

    const balances = members.map(m => ({
      ...m,
      paid:    paidMap[m.id] || 0,
      balance: (paidMap[m.id] || 0) - perPerson,
    }));

    const payers         = balances.filter(b => b.balance < -1).sort((a, b) => a.balance - b.balance);
    const receivers      = balances.filter(b => b.balance >  1).sort((a, b) => b.balance - a.balance);
    const settlements    = [];
    const payersClone    = payers.map(p => ({ ...p, remaining: Math.abs(p.balance) }));
    const receiversClone = receivers.map(r => ({ ...r, remaining: r.balance }));

    let pi = 0, ri = 0;
    while (pi < payersClone.length && ri < receiversClone.length) {
      const amount = Math.min(payersClone[pi].remaining, receiversClone[ri].remaining);
      if (amount > 1) {
        settlements.push({
          from:   payersClone[pi].name,
          to:     receiversClone[ri].name,
          amount: Math.round(amount),
        });
      }
      payersClone[pi].remaining    -= amount;
      receiversClone[ri].remaining -= amount;
      if (payersClone[pi].remaining    < 1) pi++;
      if (receiversClone[ri].remaining < 1) ri++;
    }

    return { balances, totalShared, perPerson, settlements, txCount: target.length, target };
  }, [transactions, members, settleDateFrom, settleDateTo]);

  // ── 精算対象取引（ソート済み）──
  const sortedSettleTarget = useMemo(() => {
    if (!settlementData?.target) return [];
    return [...settlementData.target].sort((a, b) => {
      const cmp = a.date.localeCompare(b.date);
      return settleSortAsc ? cmp : -cmp;
    });
  }, [settlementData, settleSortAsc]);

  // ── 支払者未設定の取引 ──────────────────────────────────────
  const unsetPayerTxs = useMemo(() =>
    transactions.filter(t =>
      t.type === "expense" &&
      !t.paidBy &&
      t.shareType !== "personal" &&
      t.shareType !== "partner" &&
      t.date >= settleDateFrom &&
      t.date <= settleDateTo
    ),
    [transactions, settleDateFrom, settleDateTo]
  );

  // ── 精算取引リストの選択操作 ──
  const toggleSettleSelect = (id) => {
    setSelectedSettle(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAllSettle = () => setSelectedSettle(new Set(sortedSettleTarget.map(t => t.id)));
  const clearSettleSelect = () => setSelectedSettle(new Set());

  const applySettleChange = async (changes) => {
    if (!window.confirm(`選択中の${selectedSettle.size}件を変更しますか？`)) return;
    const snap = [...transactions];
    for (const id of [...selectedSettle]) {
      const tx = snap.find(t => t.id === id);
      if (tx) await onUpdate?.({ ...tx, ...changes, updatedAt: new Date().toISOString() });
    }
    setSelectedSettle(new Set());
    setShowSettleEditPanel(false);
  };

  if (transactions.length === 0) return (
    <div className="pb-20">
      <div className="bg-white px-4 pt-12 pb-3 border-b border-gray-100">
        <h1 className="text-xl font-bold text-gray-900">分析</h1>
      </div>
      <EmptyState emoji="📊" title="分析データがありません" desc="取引を追加すると分析が表示されます" />
    </div>
  );

  // ── 月次レポート用データ ──────────────────────────────────
  const monthlyReport = useMemo(() => {
    const months = [...new Set(transactions.map(t => toYM(t.date)))].sort().reverse().slice(0, 6);
    return months.map(m => {
      const mt    = transactions.filter(t => toYM(t.date) === m);
      const inc   = mt.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
      const exp   = mt.filter(t => t.type === "expense").reduce((s, t) => s + Math.abs(t.amount), 0);
      const days  = new Date(parseInt(m.slice(0,4)), parseInt(m.slice(5,7)), 0).getDate();
      const bycat = mt.filter(t => t.type === "expense")
        .reduce((acc, t) => { acc[t.category] = (acc[t.category]||0) + Math.abs(t.amount); return acc; }, {});
      const topCat = Object.entries(bycat).sort((a,b) => b[1]-a[1])[0];
      return { ym: m, label: m.slice(5)+"月", inc, exp, bal: inc-exp, days, dailyAvg: Math.round(exp/days), topCat };
    });
  }, [transactions]);

  const catTrendData = useMemo(() => {
    const months = [...new Set(transactions.map(t => toYM(t.date)))].sort().slice(-6);
    const topCats = Object.entries(
      transactions.filter(t => t.type === "expense")
        .reduce((acc, t) => { acc[t.category] = (acc[t.category]||0)+Math.abs(t.amount); return acc; }, {})
    ).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([n])=>n);

    return months.map(m => {
      const row = { month: m.slice(5)+"月" };
      const mt  = transactions.filter(t => toYM(t.date) === m && t.type === "expense");
      topCats.forEach(cat => {
        row[cat] = mt.filter(t => t.category === cat).reduce((s,t) => s+Math.abs(t.amount), 0);
      });
      return { ...row, _cats: topCats };
    });
  }, [transactions]);

  const catTrendCats = catTrendData[0]?._cats || [];
  const CAT_COLORS   = ["#6366f1","#f43f5e","#10b981","#f59e0b","#8b5cf6"];


  return (
    <div className="pb-20">
      <div className="bg-white px-4 pt-12 pb-3 border-b border-gray-100">
        <h1 className="text-xl font-bold text-gray-900 mb-3">分析</h1>
        <div className="flex gap-2 mb-3">
          {[
            { id: "analysis",   label: "📊 分析"   },
            { id: "report",     label: "📈 月次"   },
            { id: "settlement", label: "💸 精算"   },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                tab === t.id ? "bg-indigo-500 text-white" : "bg-gray-100 text-gray-500"
              }`}>
              {t.label}
            </button>
          ))}
        </div>
        {tab === "analysis" && (
          <MonthSelector months={months} selected={selMonth} onChange={setSelMonth} />
        )}
      </div>

      {/* ── 分析タブ ── */}
      {tab === "analysis" && (
        <div className="px-4 py-5 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100">
              <p className="text-xs text-emerald-600 font-semibold">収入</p>
              <p className="text-xl font-bold text-emerald-700 mt-1">{fmtCurrency(totalIncome)}</p>
            </div>
            <div className="bg-rose-50 rounded-2xl p-4 border border-rose-100">
              <p className="text-xs text-rose-600 font-semibold">支出</p>
              <p className="text-xl font-bold text-rose-700 mt-1">{fmtCurrency(totalExpense)}</p>
            </div>
          </div>

          {totalExpense > 0 && (
            <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-blue-500 uppercase tracking-wide">1日平均支出</p>
                <p className="text-xl font-bold text-blue-700 mt-1">{fmtCurrency(dailyAvg)}</p>
              </div>
              <span className="text-3xl">📉</span>
            </div>
          )}

          {prevMonthComparison && (
            <div className="bg-white rounded-2xl p-4 border border-gray-100">
              <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">前月比較（支出）</p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-400">今月</p>
                  <p className="text-sm font-bold text-gray-800 mt-1">{fmtCurrency(totalExpense)}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-400">前月</p>
                  <p className="text-sm font-bold text-gray-800 mt-1">{fmtCurrency(prevMonthComparison.prevExp)}</p>
                </div>
              </div>
              <div className={`rounded-xl p-3 text-center ${prevMonthComparison.diff > 0 ? "bg-rose-50" : "bg-emerald-50"}`}>
                <p className="text-xs text-gray-400 mb-1">増減</p>
                <p className={`text-lg font-bold ${prevMonthComparison.diff > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                  {prevMonthComparison.diff > 0 ? "+" : ""}{fmtCurrency(prevMonthComparison.diff)}
                  <span className="text-xs font-normal ml-1.5">
                    {prevMonthComparison.diffPct !== null ? `(${prevMonthComparison.diff > 0 ? "+" : ""}${prevMonthComparison.diffPct}%)` : "(–)"}
                  </span>
                </p>
              </div>
            </div>
          )}

          {catData.length > 0 && (
            <div className="bg-indigo-50 rounded-2xl p-4 border border-indigo-100 flex items-center gap-4">
              <span className="text-4xl">{catData[0].emoji}</span>
              <div>
                <p className="text-xs text-indigo-500 font-semibold">トップ支出カテゴリ</p>
                <p className="text-base font-bold text-gray-900 mt-0.5">{catData[0].name}</p>
                <p className="text-rose-500 font-bold text-sm">{fmtCurrency(catData[0].value)}</p>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">月別収支推移</p>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `${(v / 10000).toFixed(0)}万`} width={32} />
                <Tooltip formatter={(v, n) => [`¥${v.toLocaleString()}`, { income: "収入", expense: "支出" }[n]]} />
                <Line type="monotone" dataKey="income"  stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="expense" stroke="#f43f5e" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {catData.length > 0 && (
            <div className="bg-white rounded-2xl p-4 border border-gray-100">
              <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">カテゴリ別支出</p>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={catData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value"
                    label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`} labelLine={false}>
                    {catData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={v => `¥${v.toLocaleString()}`} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-3 space-y-1">
                {catData.map((d, i) => (
                  <div key={d.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-xs text-gray-600">{d.emoji} {d.name}</span>
                    </div>
                    <span className="text-xs font-semibold text-gray-700">{fmtCurrency(d.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 月次レポートタブ ── */}
      {tab === "report" && (
        <div className="px-4 py-5 space-y-5">
          {/* テキスト出力ボタン */}
          {monthlyReport.length > 0 && (() => {
            const r = monthlyReport[0];
            const text = [
              `📊 ${r.label} 家計レポート`,
              `━━━━━━━━━━━━`,
              `収入：${fmtCurrency(r.inc)}`,
              `支出：${fmtCurrency(r.exp)}`,
              `収支：${r.bal >= 0 ? "+" : ""}${fmtCurrency(r.bal)}`,
              `1日平均：${fmtCurrency(r.dailyAvg)}`,
              r.topCat ? `最多支出：${r.topCat[0]} ${fmtCurrency(r.topCat[1])}` : "",
            ].filter(Boolean).join("\n");
            return (
              <button
                onClick={() => navigator.clipboard?.writeText(text).then(() => alert("コピーしました！"))}
                className="w-full py-2.5 rounded-xl text-xs font-semibold bg-indigo-50 text-indigo-600 border border-indigo-100">
                📋 今月のレポートをコピー
              </button>
            );
          })()}

          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">直近6ヶ月</p>
            <div className="space-y-3">
              {monthlyReport.map((r, i) => (
                <div key={r.ym} className={`rounded-xl p-3 ${i === 0 ? "bg-indigo-50 border border-indigo-100" : "bg-gray-50"}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-sm font-bold ${i === 0 ? "text-indigo-700" : "text-gray-700"}`}>{r.label}</span>
                    {i > 0 && monthlyReport[i-1] && (
                      <span className={`text-xs font-semibold ${r.exp > monthlyReport[i-1]?.exp ? "text-rose-500" : "text-emerald-500"}`}>
                        {r.exp > monthlyReport[i-1]?.exp ? "▲" : "▼"}
                        {Math.abs(Math.round(((r.exp - monthlyReport[i-1]?.exp) / (monthlyReport[i-1]?.exp||1)) * 100))}%
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-1 text-xs">
                    <div className="text-center">
                      <p className="text-gray-400">収入</p>
                      <p className="font-bold text-emerald-600">{fmtCurrency(r.inc)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-gray-400">支出</p>
                      <p className="font-bold text-rose-600">{fmtCurrency(r.exp)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-gray-400">収支</p>
                      <p className={`font-bold ${r.bal >= 0 ? "text-indigo-600" : "text-orange-500"}`}>{r.bal >= 0 ? "+" : ""}{fmtCurrency(r.bal)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-gray-400">1日均</p>
                      <p className="font-bold text-gray-600">{fmtCurrency(r.dailyAvg)}</p>
                    </div>
                  </div>
                  {r.topCat && (
                    <p className="text-xs text-gray-400 mt-1.5">
                      最多: {categories.find(c=>c.name===r.topCat[0])?.emoji} {r.topCat[0]} {fmtCurrency(r.topCat[1])}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {catTrendData.length > 0 && catTrendCats.length > 0 && (
            <div className="bg-white rounded-2xl p-4 border border-gray-100">
              <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">カテゴリ別支出推移</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={catTrendData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `${(v/10000).toFixed(0)}万`} width={32} />
                  <Tooltip formatter={(v, n) => [`¥${v.toLocaleString()}`, n]} />
                  {catTrendCats.map((cat, i) => (
                    <Bar key={cat} dataKey={cat} stackId="a" fill={CAT_COLORS[i % CAT_COLORS.length]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-2 mt-3">
                {catTrendCats.map((cat, i) => (
                  <div key={cat} className="flex items-center gap-1">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: CAT_COLORS[i] }} />
                    <span className="text-xs text-gray-500">{categories.find(c=>c.name===cat)?.emoji} {cat}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}


      {tab === "settlement" && (
        <div className="px-4 py-5 space-y-4">

          {/* 期間選択 */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">📅 精算期間</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-400 mb-1">開始日</p>
                <input type="date" value={settleDateFrom} onChange={e => setSettleDateFrom(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">終了日</p>
                <input type="date" value={settleDateTo} onChange={e => setSettleDateTo(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {[
                { label: "今月", from: today.slice(0, 7) + "-01", to: today },
                { label: "先月", from: (() => { const d = new Date(); d.setMonth(d.getMonth()-1); return d.toISOString().slice(0,7)+"-01"; })(),
                  to: (() => { const d = new Date(); d.setDate(0); return d.toISOString().slice(0,10); })() },
                { label: "全期間", from: firstDay, to: today },
              ].map(q => (
                <button key={q.label}
                  onClick={() => { setSettleDateFrom(q.from); setSettleDateTo(q.to); }}
                  className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-xs font-semibold">
                  {q.label}
                </button>
              ))}
            </div>
          </div>

          {/* 精算結果 */}
          {!settlementData ? (
            <div className="bg-amber-50 rounded-2xl p-5 border border-amber-200 text-center">
              <p className="text-sm font-bold text-amber-700">メンバーを設定してください</p>
              <p className="text-xs text-amber-500 mt-1">設定 → メンバー で名前を登録できます</p>
            </div>
          ) : settlementData.txCount === 0 ? (
            <div className="bg-gray-50 rounded-2xl p-5 border border-gray-200 text-center">
              <p className="text-2xl mb-2">🔍</p>
              <p className="text-sm font-bold text-gray-600">対象の取引がありません</p>
              <p className="text-xs text-gray-400 mt-1">期間内に支出データがありません</p>
            </div>
          ) : (
            <>
              {/* 支払者未設定の警告 */}
              {unsetPayerTxs.length > 0 && (
                <div className="bg-rose-50 rounded-2xl border border-rose-200 overflow-hidden">
                  <button
                    onClick={() => setShowUnsetPanel(p => !p)}
                    className="w-full flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-rose-500 text-lg">⚠️</span>
                      <div className="text-left">
                        <p className="text-sm font-bold text-rose-700">支払者未設定 {unsetPayerTxs.length}件</p>
                        <p className="text-xs text-rose-500">タップして一括設定</p>
                      </div>
                    </div>
                    <span className="text-rose-400">{showUnsetPanel ? "▲" : "▼"}</span>
                  </button>

                  {showUnsetPanel && (
                    <div className="border-t border-rose-200 bg-white">
                      <div className="px-4 py-3 bg-rose-50 border-b border-rose-100 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-rose-600">{selectedUnset.size}件選択中</p>
                          <div className="flex gap-2">
                            <button onClick={() => setSelectedUnset(new Set(unsetPayerTxs.map(t => t.id)))}
                              className="text-xs text-rose-500 font-semibold bg-white px-2 py-1 rounded-lg border border-rose-200">全選択</button>
                            <button onClick={() => setSelectedUnset(new Set())}
                              className="text-xs text-gray-500 font-semibold bg-white px-2 py-1 rounded-lg border border-gray-200">解除</button>
                          </div>
                        </div>
                        {selectedUnset.size > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs text-rose-600 font-semibold">
                              {selectedUnset.size}件に適用する設定を選択：
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {members.map(m => (
                                <button key={m.id}
                                  onClick={async () => {
                                    if (!window.confirm(`選択中の${selectedUnset.size}件を「${m.name}が払った」に設定しますか？`)) return;
                                    const snap = [...transactions];
                                    for (const id of [...selectedUnset]) {
                                      const tx = snap.find(t => t.id === id);
                                      if (tx) await onUpdate?.({ ...tx, paidBy: m.id, shareType: "shared", updatedAt: new Date().toISOString() });
                                    }
                                    setSelectedUnset(new Set());
                                  }}
                                  className="px-3 py-2 bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1">
                                  👤 {m.name}が払った
                                </button>
                              ))}
                              <button
                                onClick={async () => {
                                  if (!window.confirm(`選択中の${selectedUnset.size}件を「個人費用」に設定しますか？精算対象から除外されます。`)) return;
                                  const snapshot2 = [...transactions];
                                  const ids2 = [...selectedUnset];
                                  for (const id of ids2) {
                                    const tx = snapshot2.find(t => t.id === id);
                                    if (tx) await onUpdate?.({ ...tx, shareType: "personal", updatedAt: new Date().toISOString() });
                                  }
                                  setSelectedUnset(new Set());
                                }}
                                className="px-3 py-2 bg-rose-400 text-white rounded-xl text-xs font-semibold">
                                👤 個人費用
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
                        {unsetPayerTxs.map(t => (
                          <div key={t.id}
                            onClick={() => setSelectedUnset(prev => {
                              const next = new Set(prev);
                              next.has(t.id) ? next.delete(t.id) : next.add(t.id);
                              return next;
                            })}
                            className={"flex items-center gap-3 px-4 py-3 cursor-pointer " + (selectedUnset.has(t.id) ? "bg-indigo-50" : "bg-white")}>
                            <div className={"w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 " + (selectedUnset.has(t.id) ? "bg-indigo-500 border-indigo-500" : "border-gray-300")}>
                              {selectedUnset.has(t.id) && <span className="text-white text-xs">✓</span>}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800 truncate">{t.label}</p>
                              <p className="text-xs text-gray-400">{t.category} · {t.date}</p>
                            </div>
                            <p className="text-sm font-bold text-rose-600 flex-shrink-0">
                              -{fmtCurrency(Math.abs(t.amount))}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 合計サマリー */}
              <div className="bg-white rounded-2xl p-4 border border-gray-100">
                <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">共有支出合計</p>
                <p className="text-2xl font-bold text-gray-900">{fmtCurrency(settlementData.totalShared)}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {settlementData.txCount}件 ÷ {members.length}人 = 1人あたり {fmtCurrency(Math.round(settlementData.perPerson))}
                </p>
              </div>

              {/* メンバー別支払額 */}
              <div className="bg-white rounded-2xl p-4 border border-gray-100 space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">メンバー別支払額</p>
                {settlementData.balances.map(b => (
                  <div key={b.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">👤</span>
                      <div>
                        <p className="text-sm font-medium text-gray-800">{b.name}</p>
                        <p className="text-xs text-gray-400">支払済: {fmtCurrency(b.paid)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold ${b.balance >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                        {b.balance >= 0 ? "+" : ""}{fmtCurrency(Math.round(b.balance))}
                      </p>
                      <p className="text-xs text-gray-400">
                        {b.balance >= 0 ? "受け取り" : "支払い"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* 精算内容 */}
              {settlementData.settlements.length > 0 ? (
                <div className="bg-indigo-50 rounded-2xl p-4 border border-indigo-200 space-y-3">
                  <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">💸 精算内容</p>
                  {settlementData.settlements.map((s, i) => (
                    <div key={i} className="bg-white rounded-xl p-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-gray-800">{s.from} → {s.to}</p>
                        <p className="text-xs text-gray-400 mt-0.5">が支払う</p>
                      </div>
                      <p className="text-lg font-bold text-indigo-600">{fmtCurrency(s.amount)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-200 text-center">
                  <p className="text-2xl mb-2">✅</p>
                  <p className="text-sm font-bold text-emerald-700">精算不要です！</p>
                  <p className="text-xs text-emerald-500 mt-1">支払いが均等になっています</p>
                </div>
              )}

              {/* 精算対象取引一覧（選択・並び替え対応） */}
              {sortedSettleTarget.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  {/* ヘッダー */}
                  <button
                    onClick={() => setShowSettleTxs(p => !p)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left">
                    <div>
                      <p className="text-xs font-bold text-gray-700">📋 精算対象の取引（{sortedSettleTarget.length}件）</p>
                      <p className="text-xs text-gray-400 mt-0.5">タップで一覧を表示</p>
                    </div>
                    <span className="text-gray-400">{showSettleTxs ? "▲" : "▼"}</span>
                  </button>

                  {showSettleTxs && (
                    <div className="border-t border-gray-100">
                      {/* ツールバー：並び替え・選択操作 */}
                      <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between gap-2">
                        {/* 並び替えボタン */}
                        <button
                          onClick={() => setSettleSortAsc(p => !p)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-600">
                          <span>⇅</span>
                          <span>{settleSortAsc ? "古い順" : "新しい順"}</span>
                        </button>

                        {/* 選択操作 */}
                        <div className="flex items-center gap-2">
                          {selectedSettle.size > 0 ? (
                            <>
                              <span className="text-xs text-indigo-600 font-semibold">{selectedSettle.size}件選択</span>
                              <button onClick={clearSettleSelect}
                                className="text-xs text-gray-500 bg-white px-2 py-1 rounded-lg border border-gray-200 font-semibold">解除</button>
                              <button onClick={() => setShowSettleEditPanel(p => !p)}
                                className="text-xs text-white bg-indigo-500 px-2 py-1 rounded-lg font-semibold">変更</button>
                            </>
                          ) : (
                            <button onClick={selectAllSettle}
                              className="text-xs text-indigo-500 bg-white px-2 py-1 rounded-lg border border-indigo-200 font-semibold">全選択</button>
                          )}
                        </div>
                      </div>

                      {/* 一括変更パネル */}
                      {showSettleEditPanel && selectedSettle.size > 0 && (
                        <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-100 space-y-2">
                          <p className="text-xs font-semibold text-indigo-700">{selectedSettle.size}件に適用：</p>
                          <div className="flex flex-wrap gap-2">
                            {/* 支払者変更 */}
                            {members.map(m => (
                              <button key={m.id}
                                onClick={() => applySettleChange({ paidBy: m.id, shareType: "shared" })}
                                className="px-3 py-1.5 bg-indigo-500 text-white rounded-xl text-xs font-semibold">
                                👤 {m.name}が払った
                              </button>
                            ))}
                            {/* shareType変更 */}
                            <button
                              onClick={() => applySettleChange({ shareType: "shared" })}
                              className="px-3 py-1.5 bg-emerald-500 text-white rounded-xl text-xs font-semibold">
                              🤝 共有
                            </button>
                            <button
                              onClick={() => applySettleChange({ shareType: "personal" })}
                              className="px-3 py-1.5 bg-rose-400 text-white rounded-xl text-xs font-semibold">
                              👤 個人
                            </button>
                            <button
                              onClick={() => applySettleChange({ shareType: "partner" })}
                              className="px-3 py-1.5 bg-orange-400 text-white rounded-xl text-xs font-semibold">
                              👥 パートナー
                            </button>
                          </div>
                          <button onClick={() => setShowSettleEditPanel(false)}
                            className="text-xs text-gray-400 underline">キャンセル</button>
                        </div>
                      )}

                      {/* 取引リスト */}
                      <div className="divide-y divide-gray-50">
                        {sortedSettleTarget.map(t => {
                          const settleAmt = t.shareAmount != null ? Math.abs(t.shareAmount) : Math.abs(t.amount);
                          const payer = members.find(m => m.id === t.paidBy);
                          const isSelected = selectedSettle.has(t.id);
                          return (
                            <div
                              key={t.id}
                              onClick={() => toggleSettleSelect(t.id)}
                              className={"flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors " + (isSelected ? "bg-indigo-50" : "bg-white")}>
                              {/* チェックボックス */}
                              <div className={"w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 " + (isSelected ? "bg-indigo-500 border-indigo-500" : "border-gray-300")}>
                                {isSelected && <span className="text-white text-xs">✓</span>}
                              </div>
                              {/* 内容 */}
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-gray-800 truncate">{t.label}</p>
                                <p className="text-xs text-gray-400">{t.date} · {payer?.name || "支払者不明"}</p>
                                {t.memo && <p className="text-xs text-indigo-500 mt-0.5">📝 {t.memo}</p>}
                              </div>
                              {/* 個別shareType変更ボタン */}
                              <div className="flex gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                                {[
                                  { type: "shared",  label: "🤝" },
                                  { type: "personal", label: "👤" },
                                  { type: "partner",  label: "👥" },
                                ].map(({ type, label }) => (
                                  <button
                                    key={type}
                                    onClick={() => onUpdate?.({ ...t, shareType: type, updatedAt: new Date().toISOString() })}
                                    className={"w-7 h-7 rounded-full text-sm flex items-center justify-center transition-all " + (
                                      t.shareType === type
                                        ? "bg-indigo-100 ring-2 ring-indigo-400"
                                        : "bg-gray-100 opacity-50"
                                    )}>
                                    {label}
                                  </button>
                                ))}
                              </div>
                              {/* 金額 */}
                              <p className="text-xs font-bold text-rose-500 flex-shrink-0 text-right">
                                -{fmtCurrency(settleAmt)}
                                {t.shareAmount != null && t.shareAmount !== Math.abs(t.amount) && (
                                  <span className="block text-gray-400 font-normal line-through text-xs">
                                    {fmtCurrency(Math.abs(t.amount))}
                                  </span>
                                )}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
