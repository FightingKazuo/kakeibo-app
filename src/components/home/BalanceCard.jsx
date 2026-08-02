import { fmtCurrency } from "../../utils/format";

export function BalanceCard({ thisMonthIncome, thisMonthExpense, thisMonthBalance, totalBalance, year, month }) {
  const isPositive = thisMonthBalance >= 0;
  return (
    <div className="bg-gradient-to-br from-indigo-500 to-purple-600 px-6 pt-10 pb-8 md:rounded-2xl text-white md:mx-0">
      <p className="text-sm opacity-80">{year}年{month}月の収支</p>
      <div className="my-4">
        <p className="text-xs opacity-70 mb-1">今月の収支</p>
        <p className={`text-4xl font-bold tracking-tight ${isPositive ? "" : "text-rose-200"}`}>
          {isPositive ? "+" : ""}{fmtCurrency(thisMonthBalance)}
        </p>
      </div>
      <div className="flex gap-3">
        <div className="flex-1 bg-white/20 rounded-xl p-3">
          <p className="text-xs opacity-80">収入</p>
          <p className="text-lg font-bold mt-0.5">{fmtCurrency(thisMonthIncome)}</p>
        </div>
        <div className="flex-1 bg-white/20 rounded-xl p-3">
          <p className="text-xs opacity-80">支出</p>
          <p className="text-lg font-bold mt-0.5">{fmtCurrency(thisMonthExpense)}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between px-1">
        <p className="text-xs opacity-70">累計残高（全期間）</p>
        <p className="text-sm font-semibold opacity-90">{fmtCurrency(totalBalance)}</p>
      </div>
    </div>
  );
}
