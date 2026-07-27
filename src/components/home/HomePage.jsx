import { useMemo, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  BarChart, Bar, Cell,
} from "recharts";
import { toYM, fmtCurrency } from "../../utils/format";
import { BalanceCard } from "./BalanceCard";
import { RecentExpenseCard } from "./RecentExpenseCard";
import { TransactionItem } from "../transactions/TransactionItem";

const APP_VERSION = "v3.9.1";
const BAR_COLORS = ["#6366f1","#f43f5e","#10b981","#f59e0b","#3b82f6","#8b5cf6","#ec4899","#14b8a6"];

// ── 今月サマリーカード ────────────────────────────────────────
function MonthlySummary({ currentMonthTxs, prevMonthTxs, now }) {
  const inc  = currentMonthTxs.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const exp  = currentMonthTxs.filter(t => t.type === "expense").reduce((s, t) => s + Math.abs(t.amount), 0);
  const bal  = inc - exp;
  const pExp = prevMonthTxs.filter(t => t.type === "expense").reduce((s, t) => s + Math.abs(t.amount), 0);
  const diff = pExp > 0 ? exp - pExp : null;
  const diffPct = pExp > 0 ? Math.round(((exp - pExp) / pExp) * 100) : null;

  const daysInMonth  = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysPassed   = now.getDate();
  const monthProgress = Math.round((daysPassed / daysInMonth) * 100);
  const dailyAvg = daysPassed > 0 ? Math.round(exp / daysPassed) : 0;
  const projectedExp = dailyAvg * daysInMonth;

  return (
    <div className="mx-4 md:mx-0 mt-4 md:mt-0 bg-white rounded-2xl p-4 border border-gray-100 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">今月のサマリー</p>
        <span className="text-xs text-gray-400">{now.getMonth() + 1}月 {daysPassed}/{daysInMonth}日</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-emerald-50 rounded-xl p-3 text-center">
          <p className="text-xs text-emerald-600 font-semibold">収入</p>
          <p className="text-sm font-bold text-emerald-700 mt-1">{fmtCurrency(inc)}</p>
        </div>
        <div className="bg-rose-50 rounded-xl p-3 text-center">
          <p className="text-xs text-rose-600 font-semibold">支出</p>
          <p className="text-sm font-bold text-rose-700 mt-1">{fmtCurrency(exp)}</p>
        </div>
        <div className={`rounded-xl p-3 text-center ${bal >= 0 ? "bg-indigo-50" : "bg-orange-50"}`}>
          <p className={`text-xs font-semibold ${bal >= 0 ? "text-indigo-500" : "text-orange-500"}`}>収支</p>
          <p className={`text-sm font-bold mt-1 ${bal >= 0 ? "text-indigo-700" : "text-orange-600"}`}>{bal >= 0 ? "+" : ""}{fmtCurrency(bal)}</p>
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>月の経過 {monthProgress}%</span>
          {diff !== null && (
            <span className={diff > 0 ? "text-rose-500 font-semibold" : "text-emerald-500 font-semibold"}>
              前月比 {diff > 0 ? "+" : ""}{fmtCurrency(diff)}（{diffPct > 0 ? "+" : ""}{diffPct}%）
            </span>
          )}
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-indigo-300 rounded-full" style={{ width: `${monthProgress}%` }} />
        </div>
        {exp > 0 && (
          <p className="text-xs text-gray-400 text-right">
            1日平均 {fmtCurrency(dailyAvg)}・月末予測 {fmtCurrency(projectedExp)}
          </p>
        )}
      </div>
    </div>
  );
}

// ── 予算進捗バー ──────────────────────────────────────────────
function BudgetProgress({ categories, currentMonthTxs }) {
  const budgetCats = categories.filter(c => c.type === "expense" && c.budget > 0);
  if (budgetCats.length === 0) return null;

  const spentMap = useMemo(() =>
    currentMonthTxs
      .filter(t => t.type === "expense")
      .reduce((acc, t) => {
        acc[t.category] = (acc[t.category] || 0) + Math.abs(t.amount);
        return acc;
      }, {}),
    [currentMonthTxs]
  );

  return (
    <div className="mx-4 md:mx-0 mt-4 md:mt-0 bg-white rounded-2xl p-4 border border-gray-100">
      <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">今月の予算</p>
      <div className="space-y-3">
        {budgetCats.map(cat => {
          const spent = spentMap[cat.name] || 0;
          const pct   = Math.min((spent / cat.budget) * 100, 100);
          const over  = spent > cat.budget;
          const warn  = pct >= 80 && !over;
          const barColor = over ? "bg-rose-500" : warn ? "bg-amber-400" : "bg-indigo-400";
          return (
            <div key={cat.id}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-gray-700">{cat.emoji} {cat.name}</span>
                <span className={`text-xs font-bold ${over ? "text-rose-500" : warn ? "text-amber-500" : "text-gray-500"}`}>
                  {fmtCurrency(spent)}
                  <span className="font-normal text-gray-400"> / {fmtCurrency(cat.budget)}</span>
                  {over && <span className="ml-1">⚠️</span>}
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── カテゴリ別支出バーチャート ────────────────────────────────
function CategoryBar({ catExpenses, categories }) {
  const data = catExpenses.map(([cat, amt]) => ({
    cat, amt,
    emoji: categories.find(x => x.name === cat)?.emoji || "📦",
  }));
  return (
    <ResponsiveContainer width="100%" height={catExpenses.length * 44 + 20}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 60, left: 8, bottom: 0 }}>
        <XAxis type="number" hide domain={[0, (data[0]?.amt || 1) * 1.1]} />
        <YAxis type="category" dataKey="cat"
          tick={({ x, y, payload }) => {
            const item = data.find(d => d.cat === payload.value);
            return <text x={x} y={y} dy={4} textAnchor="end" fontSize={12} fill="#6b7280">{item?.emoji} {payload.value}</text>;
          }}
          width={100}
        />
        <Tooltip cursor={{ fill: "rgba(99,102,241,0.05)" }} formatter={(v) => [`¥${v.toLocaleString()}`, "支出"]} />
        <Bar dataKey="amt" radius={[0, 6, 6, 0]}>
          {data.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── 予算アラート ─────────────────────────────────────────────
function BudgetAlert({ transactions, budgets = {} }) {
  const now = new Date();
  const ym  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const monthExpenses = {};
  transactions
    .filter(t => t.type === "expense" && t.date?.startsWith(ym))
    .forEach(t => {
      const cat = t.category || "その他";
      monthExpenses[cat] = (monthExpenses[cat] || 0) + Math.abs(t.amount);
    });

  const alerts = Object.entries(budgets)
    .map(([cat, budget]) => {
      const spent = monthExpenses[cat] || 0;
      const pct   = spent / budget * 100;
      return { cat, budget, spent, pct };
    })
    .filter(a => a.pct >= 80)
    .sort((a, b) => b.pct - a.pct);

  if (alerts.length === 0) return null;

  return (
    <div className="mx-4 md:mx-0 mt-4">
      <div className="bg-amber-50 rounded-2xl border border-amber-200 px-4 py-3 space-y-2">
        <p className="text-xs font-bold text-amber-700">🎯 予算アラート</p>
        {alerts.map(({ cat, budget, spent, pct }) => (
          <div key={cat} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold ${pct >= 100 ? "text-rose-500" : "text-amber-500"}`}>
                {pct >= 100 ? "⚠️" : "🔶"}
              </span>
              <span className="text-xs text-gray-700">{cat}</span>
            </div>
            <div className="text-right">
              <span className={`text-xs font-bold ${pct >= 100 ? "text-rose-500" : "text-amber-600"}`}>
                {pct.toFixed(0)}%
              </span>
              <span className="text-xs text-gray-400 ml-1">
                ({fmtCurrency(spent)}/{fmtCurrency(budget)})
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── CSV取り込み状況 ─────────────────────────────────────────
export const CSV_SOURCES_ALL = [
  { id: "sbi",     label: "住信SBI銀行",    short: "SBI",  icon: "🏦" },
  { id: "epos",    label: "エポスカード",    short: "EPOS", icon: "💳" },
  { id: "smbc",    label: "三井住友カード",  short: "三井", icon: "💳" },
  { id: "paypay",  label: "PayPay",          short: "PPay", icon: "💛" },
  { id: "recruit", label: "リクルートカード", short: "RC",  icon: "💳" },
  { id: "mufg",    label: "三菱UFJ銀行",     short: "UFJ",  icon: "🏦" },
  { id: "amazon",  label: "Amazon",          short: "AMZ",  icon: "📦" },
  { id: "rakuten", label: "楽天カード",      short: "楽天", icon: "💳" },
];

function CsvImportStatusImpl({ importHistory, activeCsvSources, onNavigate }) {
  const [openMonths, setOpenMonths] = useState(new Set(["current"]));

  const now    = new Date();
  const hist   = importHistory || {};
  const active = new Set(activeCsvSources || ["sbi","epos","smbc","paypay"]);
  const sources = CSV_SOURCES_ALL.filter(s => active.has(s.id));

  const months = [];
  const start  = new Date(2026, 3, 1);
  for (let d = new Date(start); d <= now; d.setMonth(d.getMonth() + 1)) {
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  months.reverse();
  const currentYM = months[0];

  const todoCount = sources.filter(s => !hist[`${s.id}_${currentYM}`]).length;

  const fmtYM = (ym) => {
    const [y, m] = ym.split("-");
    return `${y.slice(2)}年${parseInt(m)}月`;
  };
  const fmtDate = (isoStr) => {
    if (!isoStr || isoStr === true) return null;
    const d = new Date(isoStr);
    return isNaN(d) ? null : `${d.getMonth() + 1}/${d.getDate()}`;
  };

  const toggleMonth = (ym) => {
    setOpenMonths(prev => {
      const next = new Set(prev);
      next.has(ym) ? next.delete(ym) : next.add(ym);
      return next;
    });
  };

  return (
    <div className="mx-4 md:mx-0 mt-4">
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-800">📊 CSV取り込み状況</span>
            {todoCount > 0 && (
              <span className="text-xs bg-rose-100 text-rose-600 font-semibold px-2 py-0.5 rounded-full">
                {todoCount}件未取込
              </span>
            )}
          </div>
          <button onClick={() => onNavigate?.("add-csv")}
            className="text-xs text-indigo-500 font-semibold bg-indigo-50 px-3 py-1.5 rounded-full">
            取り込む →
          </button>
        </div>

        {(() => {
          const ym = currentYM;
          const todo = sources.filter(s => !hist[`${s.id}_${ym}`]);
          const allDone = todo.length === 0;
          const isOpen = openMonths.has(ym);
          return (
            <div key={ym} className="border-b border-gray-50">
              <button onClick={() => toggleMonth(ym)}
                className="w-full flex items-center justify-between px-4 py-3 text-left">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-700">{fmtYM(ym)}（今月）</span>
                  {allDone
                    ? <span className="text-xs text-emerald-500 font-semibold">✅ 完了</span>
                    : <span className="text-xs text-rose-400 font-semibold">{todo.length}件未取込</span>
                  }
                </div>
                <span className="text-gray-400 text-xs">{isOpen ? "▲" : "▼"}</span>
              </button>
              {isOpen && (
                <div className="px-4 pb-3 space-y-1.5">
                  {sources.map(s => {
                    const val  = hist[`${s.id}_${ym}`];
                    const done = !!val;
                    const date = fmtDate(val);
                    return (
                      <div key={s.id} className="flex items-center gap-2">
                        <span className={`w-4 h-4 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${
                          done ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-400"
                        }`}>{done ? "✓" : "!"}</span>
                        <span className="text-xs text-gray-600">{s.icon} {s.label}</span>
                        <span className="text-xs font-medium ml-auto">
                          {done
                            ? <span className="text-emerald-500">{date ? `✅ ${date}` : "✅"}</span>
                            : <span className="text-rose-400">未取込</span>
                          }
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        <button
          onClick={() => toggleMonth("history")}
          className="w-full flex items-center justify-between px-4 py-2.5 text-left border-b border-gray-50">
          <span className="text-xs font-semibold text-gray-500">過去の履歴を見る</span>
          <span className="text-gray-400 text-xs">{openMonths.has("history") ? "▲" : "▼"}</span>
        </button>

        {openMonths.has("history") && months.slice(1).map((ym) => {
          const todo = sources.filter(s => !hist[`${s.id}_${ym}`]);
          const allDone = todo.length === 0;
          const isOpen  = openMonths.has(ym);
          return (
            <div key={ym} className={`border-b border-gray-50 last:border-b-0 ${!allDone ? "bg-amber-50" : ""}`}>
              <button onClick={() => toggleMonth(ym)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-left">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold ${allDone ? "text-gray-500" : "text-amber-600"}`}>
                    {!allDone && "⚠️ "}{fmtYM(ym)}
                  </span>
                  {allDone
                    ? <span className="text-xs text-emerald-500 font-semibold">✅ 完了</span>
                    : <span className="text-xs text-rose-400 font-semibold">{todo.length}件未取込</span>
                  }
                </div>
                <span className="text-gray-400 text-xs">{isOpen ? "▲" : "▼"}</span>
              </button>
              {isOpen && (
                <div className="px-4 pb-3 space-y-1.5">
                  {sources.map(s => {
                    const val  = hist[`${s.id}_${ym}`];
                    const done = !!val;
                    const date = fmtDate(val);
                    return (
                      <div key={s.id} className="flex items-center gap-2">
                        <span className={`w-4 h-4 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${
                          done ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-400"
                        }`}>{done ? "✓" : "!"}</span>
                        <span className="text-xs text-gray-600">{s.icon} {s.label}</span>
                        <span className="text-xs font-medium ml-auto">
                          {done
                            ? <span className="text-emerald-500">{date ? `✅ ${date}` : "✅"}</span>
                            : <span className="text-rose-400">未取込</span>
                          }
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function HomePage({ transactions, categories, pointAccounts, learnedRules, importHistory, activeCsvSources, budgets, onNavigate, pendingCount }) {
  const now       = new Date();
  const currentYM = now.toISOString().slice(0, 7);
  const prevDate  = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevYM    = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

  const expenseTxs      = useMemo(() => transactions.filter(t => t.type === "expense"), [transactions]);
  const currentMonthTxs = useMemo(() => transactions.filter(t => t.date.slice(0, 7) === currentYM), [transactions, currentYM]);
  const prevMonthTxs    = useMemo(() => transactions.filter(t => t.date.slice(0, 7) === prevYM),    [transactions, prevYM]);

  const totalIncome  = useMemo(() => transactions.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0), [transactions]);
  const totalExpense = useMemo(() => expenseTxs.reduce((s, t) => s + Math.abs(t.amount), 0), [expenseTxs]);

  const thisMonthBalance = useMemo(() => {
    const inc = currentMonthTxs.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const exp = currentMonthTxs.filter(t => t.type === "expense").reduce((s, t) => s + Math.abs(t.amount), 0);
    return inc - exp;
  }, [currentMonthTxs]);

  const last7DaysExpense = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - 6);
    const cutoff = d.toISOString().split("T")[0];
    return expenseTxs.filter(t => t.date >= cutoff).reduce((s, t) => s + Math.abs(t.amount), 0);
  }, [expenseTxs]);

  const chartData = useMemo(() => {
    const months = [...new Set(transactions.map(t => toYM(t.date)))].sort();
    return months.map(m => {
      const mt  = transactions.filter(t => toYM(t.date) === m);
      const inc = mt.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
      const exp = mt.filter(t => t.type === "expense").reduce((s, t) => s + Math.abs(t.amount), 0);
      return { month: m.slice(5) + "月", income: inc, expense: exp, balance: inc - exp };
    });
  }, [transactions]);

  const catExpenses = useMemo(() =>
    Object.entries(
      currentMonthTxs.filter(t => t.type === "expense").reduce((acc, t) => {
        acc[t.category] = (acc[t.category] || 0) + Math.abs(t.amount);
        return acc;
      }, {})
    ).sort((a, b) => b[1] - a[1]).slice(0, 8),
    [currentMonthTxs]
  );

  const recentTxs = useMemo(() =>
    [...transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8),
    [transactions]
  );

  return (
    <div className="pb-20 md:pb-8">
      <div className="bg-white px-4 md:px-8 pt-12 md:pt-8 pb-3 border-b border-gray-100 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">ホーム</h1>
        <span className="text-xs text-gray-300 font-mono">{APP_VERSION}</span>
      </div>

      {/* 承認待ちバッジ（最優先で最上部に表示） */}
      {pendingCount > 0 && (
        <div className="px-4 md:px-8 pt-4">
          <button onClick={() => onNavigate("analysis", "settlement")}
            className="w-full flex items-center gap-3 bg-amber-50 border-2 border-amber-300 rounded-2xl px-4 py-3.5 text-left shadow-sm active:bg-amber-100">
            <span className="relative flex-shrink-0">
              <span className="text-2xl">📬</span>
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-500 rounded-full animate-pulse" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-amber-700">承認待ちの申請があります</p>
              <p className="text-xs text-amber-600 mt-0.5">パートナーから {pendingCount}件 の共有支出申請 · タップして確認</p>
            </div>
            <span className="bg-amber-500 text-white text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0">{pendingCount}</span>
            <span className="text-amber-400 flex-shrink-0">›</span>
          </button>
        </div>
      )}

      <div className="md:grid md:grid-cols-5 md:gap-6 md:px-8 md:py-6">
        <div className="md:col-span-2 md:space-y-4">
          <BalanceCard
            totalIncome={totalIncome}
            totalExpense={totalExpense}
            thisMonthBalance={thisMonthBalance}
            year={now.getFullYear()}
            month={now.getMonth() + 1}
          />
          <MonthlySummary
            currentMonthTxs={currentMonthTxs}
            prevMonthTxs={prevMonthTxs}
            now={now}
          />
          <BudgetProgress categories={categories} currentMonthTxs={currentMonthTxs} />
          <BudgetAlert transactions={transactions} budgets={budgets} />

          <CsvImportStatusImpl importHistory={importHistory} activeCsvSources={activeCsvSources} onNavigate={onNavigate} />
          <RecentExpenseCard amount={last7DaysExpense} />
          {pointAccounts && pointAccounts.length > 0 && (
            <div className="mx-4 md:mx-0 mt-4 md:mt-0 bg-white rounded-2xl p-4 border border-gray-100">
              <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">ポイント口座</p>
              <div className="space-y-2">
                {pointAccounts.map(a => (
                  <div key={a.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{a.icon}</span>
                      <span className="text-sm text-gray-700">{a.name}</span>
                    </div>
                    <span className={`text-sm font-bold ${a.balance >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {a.balance.toLocaleString()}円
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {catExpenses.length > 0 && (
            <div className="mx-4 md:mx-0 mt-4 md:mt-0 bg-white rounded-2xl p-4 border border-gray-100">
              <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">今月カテゴリ別支出</p>
              <CategoryBar catExpenses={catExpenses} categories={categories} />
            </div>
          )}
        </div>

        <div className="md:col-span-3 md:space-y-4">
          {chartData.length > 0 && (
            <div className="mx-4 md:mx-0 mt-4 md:mt-0 bg-white rounded-2xl p-4 border border-gray-100">
              <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">月別収支推移</p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `${(v / 10000).toFixed(0)}万`} width={32} />
                  <Tooltip formatter={(v, n) => [`¥${v.toLocaleString()}`, { income: "収入", expense: "支出", balance: "残高" }[n]]} />
                  <Legend formatter={v => ({ income: "収入", expense: "支出", balance: "残高" }[v])} />
                  <Line type="monotone" dataKey="income"  stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="expense" stroke="#f43f5e" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="balance" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="mx-4 md:mx-0 mt-5 md:mt-0">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">最近の取引</h2>
              <button onClick={() => onNavigate("list")} className="text-xs text-indigo-500 font-semibold">すべて見る →</button>
            </div>
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100">
              {recentTxs.map(t => (
                <TransactionItem key={t.id} transaction={t} categories={categories} learnedRules={learnedRules} />
              ))}
              {transactions.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-8">取引データがありません</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
