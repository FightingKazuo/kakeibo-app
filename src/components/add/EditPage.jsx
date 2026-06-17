import { useState } from "react";
import { todayStr } from "../../utils/format";
import { PrimaryButton } from "../ui/PrimaryButton";
import { DEFAULT_CATEGORY_RULES } from "../../constants";
import { predictCategory } from "../../services/categoryPredictor";

export function EditPage({ transaction, categories, allRules, learnedRules, onSave, onCancel }) {
  const [type,     setType]     = useState(transaction.type);
  const [amount,   setAmount]   = useState(String(Math.abs(transaction.amount)));
  const [label,    setLabel]    = useState(transaction.label);
  const [date,     setDate]     = useState(transaction.date || todayStr());
  const [category, setCategory] = useState(transaction.category);

  const handleSave = () => {
    if (!amount || !category || !label) { alert("すべて入力してください"); return; }
    onSave({
      ...transaction,
      type,
      amount:   type === "expense" ? -Number(amount) : Number(amount),
      label, date, category,
      updatedAt: new Date().toISOString(),
    });
  };

  const expenseCats = categories.filter(c => c.type === "expense");
  const incomeCats  = categories.filter(c => c.type === "income");
  const displayCats = type === "expense" ? expenseCats : incomeCats;

  return (
    <div className="pb-20">
      <div className="bg-white px-4 pt-12 pb-4 border-b border-gray-100 flex items-center gap-3">
        <button onClick={onCancel} className="text-gray-400 text-lg">←</button>
        <h1 className="text-xl font-bold text-gray-900">取引を編集</h1>
      </div>
      <div className="px-4 py-5 space-y-5">
        <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
          <p className="text-xs text-amber-700 font-semibold">✏️ 編集中：「{transaction.label}」</p>
        </div>

        {/* 種類 */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-2">種類</label>
          <div className="grid grid-cols-2 gap-2">
            {["expense","income"].map(t => (
              <button key={t} onClick={() => setType(t)}
                className={`py-3 rounded-xl text-sm font-semibold border transition-all ${
                  type === t
                    ? t === "expense" ? "bg-rose-500 text-white border-rose-500" : "bg-emerald-500 text-white border-emerald-500"
                    : "bg-white text-gray-500 border-gray-200"
                }`}>
                {t === "expense" ? "支出" : "収入"}
              </button>
            ))}
          </div>
        </div>

        {/* 店舗名 */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-2">店舗名・内容</label>
          <input type="text" value={label} onChange={e => setLabel(e.target.value)}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>

        {/* 金額 */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-2">金額</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">¥</span>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
              className="w-full pl-8 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-2xl font-bold outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
        </div>

        {/* カテゴリ（4列） */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-2">カテゴリ</label>
          <div className="grid grid-cols-4 gap-1.5">
            {displayCats.map(cat => (
              <button key={cat.id} onClick={() => setCategory(cat.name)}
                className={`py-2 px-1 rounded-xl text-xs border transition-all flex flex-col items-center gap-0.5 ${
                  category === cat.name
                    ? "bg-indigo-500 text-white border-indigo-500 font-semibold"
                    : "bg-white text-gray-600 border-gray-200"
                }`}>
                <span className="text-base">{cat.emoji}</span>
                <span className="leading-tight text-center">{cat.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 日付 */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-2">日付</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>

        <PrimaryButton onClick={handleSave} variant="warning">✅ 更新して保存</PrimaryButton>
      </div>
    </div>
  );
}
