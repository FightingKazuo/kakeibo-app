import { useState, useMemo } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell } from "recharts";
import { toYM, fmtCurrency } from "../../utils/format";
import { PIE_COLORS } from "../../constants";
import { MonthSelector } from "../common/MonthSelector";
import { EmptyState } from "../ui/EmptyState";

export function AnalysisPage({ transactions, categories }) {
  const [selMonth, setSelMonth] = useState("all");

  const months = useMemo(
    () => [...new Set(transactions.map(t=>toYM(t.date)))].sort().reverse(),
    [transactions]
  );

  const filtered = useMemo(
    () => selMonth==="all" ? transactions : transactions.filter(t=>toYM(t.date)===selMonth),
    [transactions, selMonth]
  );

  // ④ useMemo 化して重複 filter を排除
  const totalIncome  = useMemo(() => filtered.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0),            [filtered]);
  const totalExpense = useMemo(() => filtered.filter(t=>t.type==="expense").reduce((s,t)=>s+Math.abs(t.amount),0), [filtered]);

  const catData = useMemo(() => {
    const bycat = filtered.filter(t=>t.type==="expense")
      .reduce((acc,t) => { acc[t.category]=(acc[t.category]||0)+Math.abs(t.amount); return acc; }, {});
    return Object.entries(bycat)
      .sort((a,b)=>b[1]-a[1])
      .map(([name,value]) => ({ name, value, emoji:categories.find(c=>c.name===name)?.emoji||"📦" }));
  }, [filtered, categories]);

  const chartData = useMemo(() => {
    const ms = [...new Set(transactions.map(t=>toYM(t.date)))].sort();
    return ms.map(m => {
      const mt = transactions.filter(t=>toYM(t.date)===m);
      const inc = mt.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0);
      const exp = mt.filter(t=>t.type==="expense").reduce((s,t)=>s+Math.abs(t.amount),0);
      return { month:m.slice(5)+"月", income:inc, expense:exp };
    });
  }, [transactions]);

  // 1日平均支出
  const dailyAvg = useMemo(() => {
    if (!totalExpense) return 0;
    const days = selMonth==="all" ? 30
      : new Date(parseInt(selMonth.slice(0,4)), parseInt(selMonth.slice(5,7)), 0).getDate();
    return Math.floor(totalExpense / days);
  }, [totalExpense, selMonth]);

  // 前月比較
  const prevMonthComparison = useMemo(() => {
    if (selMonth==="all") return null;
    const [y,m] = selMonth.split("-").map(Number);
    const prev  = new Date(y, m-2, 1);
    const prevYM = `${prev.getFullYear()}-${String(prev.getMonth()+1).padStart(2,"0")}`;
    const prevExp = transactions
      .filter(t=>t.date.slice(0,7)===prevYM && t.type==="expense")
      .reduce((s,t)=>s+Math.abs(t.amount),0);
    const diff    = totalExpense - prevExp;
    const diffPct = prevExp>0 ? Math.round((diff/prevExp)*100) : null;
    return { prevExp, diff, diffPct };
  }, [transactions, selMonth, totalExpense]);

  if (transactions.length===0) return (
    <div className="pb-20">
      <div className="bg-white px-4 pt-12 pb-3 border-b border-gray-100">
        <h1 className="text-xl font-bold text-gray-900">分析</h1>
      </div>
      <EmptyState emoji="📊" title="分析データがありません" desc="取引を追加すると分析が表示されます" />
    </div>
  );

  return (
    <div className="pb-20">
      <div className="bg-white px-4 pt-12 pb-3 border-b border-gray-100">
        <h1 className="text-xl font-bold text-gray-900 mb-3">分析</h1>
        <MonthSelector months={months} selected={selMonth} onChange={setSelMonth} />
      </div>

      <div className="px-4 py-5 space-y-5">
        {/* 収支サマリー */}
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

        {/* 1日平均支出 */}
        {totalExpense > 0 && (
          <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-blue-500 uppercase tracking-wide">1日平均支出</p>
              <p className="text-xl font-bold text-blue-700 mt-1">{fmtCurrency(dailyAvg)}</p>
            </div>
            <span className="text-3xl">📉</span>
          </div>
        )}

        {/* 前月比較 */}
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
            <div className={`rounded-xl p-3 text-center ${prevMonthComparison.diff>0?"bg-rose-50":"bg-emerald-50"}`}>
              <p className="text-xs text-gray-400 mb-1">増減</p>
              <p className={`text-lg font-bold ${prevMonthComparison.diff>0?"text-rose-600":"text-emerald-600"}`}>
                {prevMonthComparison.diff>0?"+":""}{fmtCurrency(prevMonthComparison.diff)}
                <span className="text-xs font-normal ml-1.5">
                  {prevMonthComparison.diffPct!==null ? `(${prevMonthComparison.diff>0?"+":""}${prevMonthComparison.diffPct}%)` : "(–)"}
                </span>
              </p>
            </div>
          </div>
        )}

        {/* トップカテゴリ */}
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

        {/* 月別グラフ */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100">
          <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">月別収支推移</p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData} margin={{top:4,right:8,left:0,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{fontSize:10}} />
              <YAxis tick={{fontSize:9}} tickFormatter={v=>`${(v/10000).toFixed(0)}万`} width={32} />
              <Tooltip formatter={(v,n)=>[`¥${v.toLocaleString()}`,{income:"収入",expense:"支出"}[n]]} />
              <Line type="monotone" dataKey="income"  stroke="#10b981" strokeWidth={2} dot={{r:3}} />
              <Line type="monotone" dataKey="expense" stroke="#f43f5e" strokeWidth={2} dot={{r:3}} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* 円グラフ */}
        {catData.length > 0 && (
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">カテゴリ別支出</p>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={catData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value"
                  label={({name,percent})=>`${name} ${Math.round(percent*100)}%`} labelLine={false}>
                  {catData.map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={v=>`¥${v.toLocaleString()}`} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-3 space-y-1">
              {catData.map((d,i)=>(
                <div key={d.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{background:PIE_COLORS[i%PIE_COLORS.length]}} />
                    <span className="text-xs text-gray-600">{d.emoji} {d.name}</span>
                  </div>
                  <span className="text-xs font-semibold text-gray-700">{fmtCurrency(d.value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
