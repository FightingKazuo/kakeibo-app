import { useState } from "react";
import { fmtCurrency } from "../../utils/format";
import { SourceBadge } from "../ui/SourceBadge";

export function DuplicateCheckModal({ newTx, candidates, categories, onDecide }) {
  const [idx, setIdx] = useState(0);
  const { transaction:ex, comparison:cmp } = candidates[idx];
  const getEmoji = label => categories.find(c=>c.name===label)?.emoji||"📦";

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      {/* ヘッダー */}
      <div className="bg-white px-4 pt-12 pb-4 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <p className="text-base font-bold text-gray-900">似た取引が見つかりました</p>
            <p className="text-xs text-gray-400">登録前に確認してください</p>
          </div>
        </div>
        {candidates.length > 1 && (
          <div className="flex gap-2 overflow-x-auto mt-3 pb-1">
            {candidates.map((c,i) => (
              <button key={i} onClick={() => setIdx(i)}
                className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold border ${idx===i?"bg-indigo-500 text-white border-indigo-500":"bg-white text-gray-500 border-gray-200"}`}>
                候補{i+1}（{c.comparison.totalScore}点）
              </button>
            ))}
          </div>
        )}
      </div>

      {/* スクロールエリア */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
        <div className="bg-indigo-50 rounded-2xl p-4 border border-indigo-100">
          <p className="text-xs font-semibold text-indigo-600 mb-2">📥 登録しようとしている取引</p>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-lg">{getEmoji(newTx.category)}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{newTx.label}</p>
              <p className="text-xs text-gray-500">{newTx.category} · {newTx.date}</p>
            </div>
            <p className={`text-sm font-bold flex-shrink-0 ${newTx.type==="income"?"text-emerald-500":"text-rose-500"}`}>
              {newTx.type==="income"?"+":"-"}{fmtCurrency(newTx.amount)}
            </p>
          </div>
        </div>

        <div className="text-center py-3 bg-amber-50 rounded-xl">
          <p className="text-2xl font-bold">{cmp.totalScore}<span className="text-sm text-gray-400">/100</span></p>
          <p className="text-xs font-semibold text-amber-600">
            {cmp.totalScore>=85?"非常に似ています":cmp.totalScore>=70?"やや似ています":"少し似ています"}
          </p>
        </div>

        <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200">
          <p className="text-xs font-semibold text-gray-500 mb-2">📂 既存の取引</p>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-lg">{getEmoji(ex.category)}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-700 truncate">{ex.label}</p>
              <p className="text-xs text-gray-400">{ex.category} · {ex.date}</p>
            </div>
            <p className={`text-sm font-bold flex-shrink-0 ${ex.type==="income"?"text-emerald-500":"text-rose-500"}`}>
              {ex.type==="income"?"+":"-"}{fmtCurrency(ex.amount)}
            </p>
          </div>
          {ex.source && <div className="mt-2"><SourceBadge source={ex.source} /></div>}
        </div>
      </div>

      {/* ボタン固定 */}
      <div className="px-5 pb-8 pt-3 border-t border-gray-100 space-y-2 flex-shrink-0 bg-white">
        <button onClick={() => onDecide("skip", candidates[idx])}
          className="w-full py-4 rounded-2xl border-2 border-rose-200 bg-rose-50 text-left px-4 active:bg-rose-100">
          <p className="text-sm font-bold text-rose-700">☑ 同じ取引（重複）なので登録しない</p>
        </button>
        <button onClick={() => onDecide("register", candidates[idx])}
          className="w-full py-4 rounded-2xl border-2 border-indigo-200 bg-indigo-50 text-left px-4 active:bg-indigo-100">
          <p className="text-sm font-bold text-indigo-700">□ 別の取引なので登録する</p>
        </button>
      </div>
    </div>
  );
}
