import { useState } from "react";
import { predictCategory } from "../../services/categoryPredictor";
import { DEFAULT_CATEGORY_RULES } from "../../constants";
import { CategorySuggestion } from "./CategorySuggestion";

export function TransactionFormFields({
  type, setType, amount, setAmount, label, setLabel,
  date, setDate, category, setCategory, categories,
  allRules, learnedRules,
}) {
  const [predictions, setPredictions] = useState([]);
  const [isAutoSet,   setIsAutoSet]   = useState(false);

  const handleLabel = (v) => {
    setLabel(v);
    if (v.length < 2) { setPredictions([]); return; }
    const rules  = [...(allRules||DEFAULT_CATEGORY_RULES), ...(learnedRules||[])];
    const result = predictCategory(v, rules);
    setPredictions(result.predictions);
    if (result.isConfident && !category) {
      setCategory(result.topCategory);
      if (result.predictions[0]?.type) setType(result.predictions[0].type);
      setIsAutoSet(true);
    }
  };

  const handleCatSelect = (catName, catType) => {
    setCategory(catName);
    if (catType) setType(catType);
    setIsAutoSet(false);
  };

  const filteredCats = categories.filter(c => c.type === type);

  return (
    <div className="space-y-4">
      {/* 種類 */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">種類</label>
        <div className="flex bg-gray-100 rounded-xl p-1">
          <button onClick={() => { setType("expense"); setCategory(""); setPredictions([]); }}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${type==="expense"?"bg-white text-rose-500 shadow-sm":"text-gray-400"}`}>支出</button>
          <button onClick={() => { setType("income"); setCategory(""); setPredictions([]); }}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${type==="income"?"bg-white text-emerald-500 shadow-sm":"text-gray-400"}`}>収入</button>
        </div>
      </div>
      {/* ラベル */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">店舗名・内容</label>
        <input type="text" value={label} onChange={e=>handleLabel(e.target.value)} placeholder="例: セブンイレブン、マクドナルド"
          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
        {predictions.length>0 && <CategorySuggestion predictions={predictions} selectedCategory={category} onSelect={handleCatSelect} />}
      </div>
      {/* 金額 */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">金額</label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">¥</span>
          <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0"
            className="w-full pl-8 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-2xl font-bold text-gray-900 outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>
      </div>
      {/* カテゴリ */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">カテゴリ</label>
          {isAutoSet && <span className="text-xs text-indigo-500 font-semibold">🤖 自動推定</span>}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {filteredCats.map(cat => (
            <button key={cat.id} onClick={() => handleCatSelect(cat.name, cat.type)}
              className={`py-2 rounded-xl text-xs transition-all duration-200 border ${category===cat.name?"bg-indigo-500 text-white border-indigo-500 font-semibold":"bg-white text-gray-600 border-gray-200"}`}>
              {cat.emoji} {cat.name}
            </button>
          ))}
        </div>
      </div>
      {/* 日付 */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">日付</label>
        <input type="date" value={date} onChange={e=>setDate(e.target.value)}
          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
      </div>
    </div>
  );
}
