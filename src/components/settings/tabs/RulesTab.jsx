import { EmptyState } from "../../ui/EmptyState";

export function RulesTab({ learnedRules, onDeleteRule }) {
  return (
    <div className="px-4 py-4">
      <p className="text-sm font-bold text-gray-700 mb-3">学習ルール（{learnedRules.length}件）</p>
      {learnedRules.length === 0 ? (
        <EmptyState icon="🧠" title="学習ルールなし" desc="OCR・手動入力でカテゴリを選ぶと自動で学習されます" />
      ) : (
        <div className="bg-white rounded-2xl overflow-hidden border border-gray-100">
          {learnedRules.map((r, i) => (
            <div key={r.id} className="flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-b-0">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-600">{i+1}</div>
                <div>
                  <p className="text-sm font-medium text-gray-800">「{r.keywords[0]}」</p>
                  <p className="text-xs text-gray-400">→ {r.category}</p>
                </div>
              </div>
              <button onClick={() => onDeleteRule(r.id)} className="text-gray-300 hover:text-rose-400 text-xl">×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
