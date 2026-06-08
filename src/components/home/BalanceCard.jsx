import { fmtCurrency } from "../../utils/format";

export function BalanceCard({ totalIncome, totalExpense, thisMonthBalance, year, month }) {
  return (
    <div className="bg-gradient-to-br from-indigo-500 to-purple-600 px-6 pt-10 pb-8 md:rounded-2xl text-white md:mx-0">
      <p className="text-sm opacity-80">{year}年{month}月の収支</p>
      <div className="my-4">
        <p className="text-xs opacity-70 mb-1">累計残高</p>
        <p className="text-4xl font-bold tracking-tight">{fmtCurrency(totalIncome - totalExpense)}</p>
      </div>
      <div className="flex gap-3">
        <div className="flex-1 bg-white/20 rounded-xl p-3">
          <p className="text-xs opacity-80">収入</p>
          <p className="text-lg font-bold mt-0.5">{fmtCurrency(totalIncome)}</p>
        </div>
        <div className="flex-1 bg-white/20 rounded-xl p-3">
          <p className="text-xs opacity-80">支出</p>
          <p className="text-lg font-bold mt-0.5">{fmtCurrency(totalExpense)}</p>
        </div>
      </div>
      <div className={`mt-3 rounded-xl p-3 flex items-center justify-between ${thisMonthBalance >= 0 ? "bg-emerald-400/30" : "bg-rose-400/30"}`}>
        <p className="text-xs opacity-90 font-semibold">今月の残高</p>
        <p className={`text-lg font-bold ${thisMonthBalance >= 0 ? "text-emerald-100" : "text-rose-100"}`}>
          {thisMonthBalance >= 0 ? "+" : ""}{fmtCurrency(thisMonthBalance)}
        </p>
      </div>
    </div>
  );
}
