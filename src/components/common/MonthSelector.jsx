export function MonthSelector({ months, selected, onChange }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
      <button onClick={() => onChange("all")} className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-200 active:scale-95 ${selected==="all"?"bg-indigo-500 text-white border-indigo-500":"bg-white text-gray-500 border-gray-200"}`}>全期間</button>
      {months.map(m => (
        <button key={m} onClick={() => onChange(m)} className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-200 active:scale-95 ${selected===m?"bg-indigo-500 text-white border-indigo-500":"bg-white text-gray-500 border-gray-200"}`}>
          {m.slice(2,4)}年{parseInt(m.slice(5))}月
        </button>
      ))}
    </div>
  );
}
