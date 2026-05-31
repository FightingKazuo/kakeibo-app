import { useMemo } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { toYM, fmtCurrency } from "../../utils/format";
import { BalanceCard } from "./BalanceCard";
import { RecentExpenseCard } from "./RecentExpenseCard";
import { TransactionItem } from "../transactions/TransactionItem";

export function HomePage({ transactions, categories, onNavigate }) {
  const now       = new Date();
  const currentYM = now.toISOString().slice(0, 7);

  // ④ 中間配列をメモ化して重複filterを防ぐ
  const incomeTxs       = useMemo(() => transactions.filter(t => t.type==="income"),  [transactions]);
  const expenseTxs      = useMemo(() => transactions.filter(t => t.type==="expense"), [transactions]);
  const currentMonthTxs = useMemo(() => transactions.filter(t => t.date.slice(0,7)===currentYM), [transactions, currentYM]);

  const totalIncome  = useMemo(() => incomeTxs.reduce((s,t)=>s+t.amount,0),            [incomeTxs]);
  const totalExpense = useMemo(() => expenseTxs.reduce((s,t)=>s+Math.abs(t.amount),0), [expenseTxs]);

  const thisMonthBalance = useMemo(() => {
    const inc = currentMonthTxs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0);
    const exp = currentMonthTxs.filter(t=>t.type==="expense").reduce((s,t)=>s+Math.abs(t.amount),0);
    return inc - exp;
  }, [currentMonthTxs]);

  const last7DaysExpense = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate()-6);
    const cutoff = d.toISOString().split("T")[0];
    return expenseTxs.filter(t=>t.date>=cutoff).reduce((s,t)=>s+Math.abs(t.amount),0);
  }, [expenseTxs]);

  const chartData = useMemo(() => {
    const months = [...new Set(transactions.map(t=>toYM(t.date)))].sort();
    return months.map(m => {
      const mt  = transactions.filter(t=>toYM(t.date)===m);
      const inc = mt.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0);
      const exp = mt.filter(t=>t.type==="expense").reduce((s,t)=>s+Math.abs(t.amount),0);
      return { month: m.slice(5)+"月", income:inc, expense:exp, balance:inc-exp };
    });
  }, [transactions]);

  const catExpenses = useMemo(() =>
    Object.entries(
      expenseTxs.reduce((acc,t) => { acc[t.category]=(acc[t.category]||0)+Math.abs(t.amount); return acc; }, {})
    ).sort((a,b)=>b[1]-a[1]).slice(0,6),
    [expenseTxs]
  );

  return (
    <div className="pb-20">
      <BalanceCard
        totalIncome={totalIncome}
        totalExpense={totalExpense}
        thisMonthBalance={thisMonthBalance}
        year={now.getFullYear()}
        month={now.getMonth()+1}
      />

      <RecentExpenseCard amount={last7DaysExpense} />

      {chartData.length > 0 && (
        <div className="px-4 mt-4">
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">月別収支推移</p>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData} margin={{top:4,right:8,left:0,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{fontSize:10}} />
                <YAxis tick={{fontSize:9}} tickFormatter={v=>`${(v/10000).toFixed(0)}万`} width={32} />
                <Tooltip formatter={(v,n)=>[`¥${v.toLocaleString()}`,{income:"収入",expense:"支出",balance:"残高"}[n]]} />
                <Legend formatter={v=>({income:"収入",expense:"支出",balance:"残高"}[v])} />
                <Line type="monotone" dataKey="income"  stroke="#10b981" strokeWidth={2} dot={{r:3}} />
                <Line type="monotone" dataKey="expense" stroke="#f43f5e" strokeWidth={2} dot={{r:3}} />
                <Line type="monotone" dataKey="balance" stroke="#6366f1" strokeWidth={2} dot={{r:3}} strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="px-4 mt-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">最近の取引</h2>
          <button onClick={() => onNavigate("list")} className="text-xs text-indigo-500 font-semibold">すべて見る →</button>
        </div>
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100">
          {transactions.slice(0,5).map(t => (
            <TransactionItem key={t.id} transaction={t} categories={categories} />
          ))}
        </div>
      </div>

      <div className="px-4 mt-5 pb-4">
        <h2 className="text-sm font-semibold text-gray-500 mb-3 uppercase tracking-wide">カテゴリ別支出</h2>
        <div className="grid grid-cols-2 gap-3">
          {catExpenses.map(([cat, amt]) => {
            const c = categories.find(x => x.name===cat);
            return (
              <div key={cat} className="bg-white rounded-2xl p-4 border border-gray-100">
                <p className="text-2xl mb-1">{c?.emoji||"📦"}</p>
                <p className="text-xs text-gray-500">{cat}</p>
                <p className="text-sm font-bold text-gray-800 mt-1">{fmtCurrency(amt)}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
