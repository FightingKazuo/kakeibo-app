import { fmtCurrency } from "../../utils/format";

export function RecentExpenseCard({ amount }) {
  return (
    <div className="px-4 md:px-0 mt-4 md:mt-0">
      <div className="bg-rose-50 rounded-2xl p-4 border border-rose-100 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-rose-500 uppercase tracking-wide">最近7日間の支出</p>
          <p className="text-2xl font-bold text-rose-600 mt-1">{fmtCurrency(amount)}</p>
        </div>
        <span className="text-3xl">📅</span>
      </div>
    </div>
  );
}
