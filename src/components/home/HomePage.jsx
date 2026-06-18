import { useMemo } from "react";
import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  BarChart, Bar, Cell,
} from "recharts";
import { toYM, fmtCurrency } from "../../utils/format";
import { BalanceCard } from "./BalanceCard";
import { RecentExpenseCard } from "./RecentExpenseCard";
import { TransactionItem } from "../transactions/TransactionItem";

const APP_VERSION = "v2.8.0";

// カテゴリバーのカラーパレット
const BAR_COLORS = ["#6366f1","#f43f5e","#10b981","#f59e0b","#3b82f6","#8b5cf6","#ec4899","#14b8a6"];

// カテゴリ別支出バーチャート（カーソルで金額表示）
function CategoryBar({ catExpenses, categories, maxAmt }) {
  const data = catExpenses.map(([cat, amt]) => ({
    cat,
    amt,
    emoji: categories.find(x => x.name === cat)?.emoji || "📦",
  }));

  return (
    <ResponsiveContainer width="100%" height={catExpenses.length * 44 + 20}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 0, right: 60, left: 8, bottom: 0 }}
      >
        <XAxis type="number" hide domain={[0, maxAmt * 1.1]} />
        <YAxis
          type="category"
          dataKey="cat"
          tick={({ x, y, payload }) => {
            const item = data.find(d => d.cat === payload.value);
            return (
              <text x={x} y={y} dy={4} textAnchor="end" fontSize={12} fill="#6b7280">
                {item?.emoji} {payload.value}
              </text>
            );
          }}
          width={100}
        />
        <Tooltip
          cursor={{ fill: "rgba(99,102,241,0.05)" }}
          formatter={(v) => [`¥${v.toLocaleString()}`, "支出"]}
        />
        <Bar dataKey="amt" radius={[0, 6, 6, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function HomePage({ transactions, categories, pointAccounts, onNavigate }) {
  const now       = new Date();
  const currentYM = now.toISOString().slice(0, 7);

  const incomeTxs       = useMemo(() => transactions.filter(t => t.type === "income"),  [transactions]);
  const expenseTxs      = useMemo(() => transactions.filter(t => t.type === "expense"), [transactions]);
  const currentMonthTxs = useMemo(() => transactions.filter(t => t.date.slice(0, 7) === currentYM), [transactions, currentYM]);

  const totalIncome  = useMemo(() => incomeTxs.reduce((s, t) => s + t.amount, 0),             [incomeTxs]);
  const totalExpense = useMemo(() => expenseTxs.reduce((s, t) => s + Math.abs(t.amount), 0),  [expenseTxs]);

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
      expenseTxs.reduce((acc, t) => {
        acc[t.category] = (acc[t.category] || 0) + Math.abs(t.amount);
        return acc;
      }, {})
    ).sort((a, b) => b[1] - a[1]).slice(0, 8),
    [expenseTxs]
  );

  const maxCatAmt = catExpenses[0]?.[1] || 1;

  return (
    <div className="pb-20 md:pb-8">
      {/* ヘッダー */}
      <div className="bg-white px-4 md:px-8 pt-12 md:pt-8 pb-3 border-b border-gray-100 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">ホーム</h1>
        <span className="text-xs text-gray-300 font-mono">{APP_VERSION}</span>
      </div>

      {/* ── PC: 2カラム / スマホ: 1カラム ── */}
      <div className="md:grid md:grid-cols-5 md:gap-6 md:px-8 md:py-6">

        {/* ── 左カラム（PC: 2/5） ── */}
        <div className="md:col-span-2 md:space-y-4">
          {/* 残高カード */}
          <BalanceCard
            totalIncome={totalIncome}
            totalExpense={totalExpense}
            thisMonthBalance={thisMonthBalance}
            year={now.getFullYear()}
            month={now.getMonth() + 1}
          />

          {/* 最近7日 */}
          <RecentExpenseCard amount={last7DaysExpense} />

          {/* ポイント口座残高 */}
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

          {/* カテゴリ別支出（バー） */}
          {catExpenses.length > 0 && (
            <div className="mx-4 md:mx-0 mt-4 md:mt-0 bg-white rounded-2xl p-4 border border-gray-100">
              <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">カテゴリ別支出</p>
              <CategoryBar
                catExpenses={catExpenses}
                categories={categories}
                maxAmt={maxCatAmt}
              />
            </div>
          )}
        </div>

        {/* ── 右カラム（PC: 3/5） ── */}
        <div className="md:col-span-3 md:space-y-4">
          {/* 月別収支グラフ */}
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

          {/* 最近の取引 */}
          <div className="mx-4 md:mx-0 mt-5 md:mt-0">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">最近の取引</h2>
              <button onClick={() => onNavigate("list")} className="text-xs text-indigo-500 font-semibold">すべて見る →</button>
            </div>
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100">
              {transactions.slice(0, 8).map(t => (
                <TransactionItem key={t.id} transaction={t} categories={categories} />
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
