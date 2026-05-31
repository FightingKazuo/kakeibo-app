export function CategorySuggestion({ predictions, selectedCategory, onSelect }) {
  if (!predictions?.length) return null;
  return (
    <div className="mt-2 space-y-1.5">
      <p className="text-xs font-semibold text-indigo-600 flex items-center gap-1">
        🤖 AI推定 <span className="font-normal text-gray-400">（クリックで選択）</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {predictions.map((p, i) => {
          const lvl = p.confidence>=85?"emerald":p.confidence>=65?"amber":"gray";
          const isSel = selectedCategory===p.category;
          const cls = {
            emerald: isSel?"bg-emerald-500 text-white border-emerald-500":"bg-emerald-50 text-emerald-700 border-emerald-200",
            amber:   isSel?"bg-amber-500 text-white border-amber-500":  "bg-amber-50 text-amber-700 border-amber-200",
            gray:    isSel?"bg-gray-500 text-white border-gray-500":    "bg-gray-50 text-gray-600 border-gray-200",
          }[lvl];
          return (
            <button key={p.category} onClick={() => onSelect(p.category, p.type)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-semibold transition-all duration-200 ${cls}`}>
              {i===0 && <span>✨</span>}{p.category}
              <span className={`px-1 py-0.5 rounded-full text-xs font-bold ${isSel?"bg-white/20":"bg-white/60"}`}>{p.confidence}%</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
