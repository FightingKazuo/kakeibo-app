import { STORAGE_KEYS } from "../../../constants/storage";
import { removeStorage } from "../../../utils/storage";

export function DataTab({ transactions, categories, learnedRules, onDeleteRule, onResetCategories, onReset , onReapplyCategories, onReapplyCsvFormatId, onRebuildImportHistory}) {
  return (
    <div className="px-4 py-4 space-y-4">
      <div className="bg-white rounded-2xl p-4 border border-gray-100 space-y-2">
        <p className="text-xs font-semibold text-gray-500">📊 データ概要</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-gray-800">{transactions?.length || 0}</p>
            <p className="text-xs text-gray-400">取引件数</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-gray-800">{categories?.length || 0}</p>
            <p className="text-xs text-gray-400">カテゴリ数</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl overflow-hidden border border-indigo-200">
        <div className="bg-indigo-50 px-4 py-3 border-b border-indigo-200">
          <p className="text-xs font-bold text-indigo-600 uppercase tracking-wide">🔄 カテゴリ更新</p>
        </div>
        <div className="bg-white px-4 py-3 space-y-2">
          <p className="text-xs text-gray-500">カテゴリをデフォルト（マネーフォワード準拠）にリセットします。予算設定・取引データは消えません。</p>
          <button
            onClick={() => { if (window.confirm("カテゴリをデフォルトに戻しますか？\n※予算・取引データは消えません")) onResetCategories?.(); }}
            className="w-full px-4 py-3 text-sm font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors">
            カテゴリをデフォルトに戻す
          </button>
        </div>
      </div>

      <div className="rounded-2xl overflow-hidden border border-rose-200">
        <div className="bg-rose-50 px-4 py-3 border-b border-rose-200">
          {/* カテゴリ一括再適用 */}
          {onRebuildImportHistory && (
            <div className="bg-indigo-50 rounded-2xl p-4 border border-indigo-100 mb-3">
              <p className="text-xs font-bold text-indigo-700 mb-1">🔄 バッジ・取込履歴を一括補完</p>
              <p className="text-xs text-indigo-500 mb-2">
                過去の取引に「📊 三井」「📊 SBI」等のバッジを付け、ホーム画面の取込状況を更新します。
              </p>
              <button onClick={onRebuildImportHistory}
                className="w-full py-2 text-xs font-bold bg-indigo-500 text-white rounded-lg">
                🔄 バッジ・取込履歴を一括更新
              </button>
            </div>
          )}

          {onReapplyCategories && (
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-xs font-bold text-indigo-700 mb-1">🔄 カテゴリ一括再適用</p>
              <p className="text-xs text-gray-400 mb-2 leading-relaxed">
                「その他」の過去取引にルールを自動適用します。確認なしに処理されます。
              </p>
              <button onClick={onReapplyCategories}
                className="w-full py-2 bg-indigo-500 text-white text-xs font-semibold rounded-lg">
                🔄 過去取引に一括適用
              </button>
            </div>
          )}
          <p className="text-xs font-bold text-rose-600 uppercase tracking-wide">⚠️ 危険な操作</p>
        </div>
        <div className="bg-white divide-y divide-gray-50">
          <button onClick={() => { if (window.confirm("OCR読み取り履歴を削除しますか？")) removeStorage(STORAGE_KEYS.OCR_HISTORY); }}
            className="w-full px-4 py-3.5 text-left text-sm text-rose-500 hover:bg-rose-50">OCR履歴を削除</button>
          <button onClick={() => { if (window.confirm(`学習ルール ${learnedRules.length}件をすべて削除しますか？`)) learnedRules.forEach(r => onDeleteRule(r.id)); }}
            className="w-full px-4 py-3.5 text-left text-sm text-rose-500 hover:bg-rose-50">学習ルールをすべて削除（{learnedRules.length}件）</button>
          <button onClick={() => { if (window.confirm("⚠️ すべてのデータを削除します。取り消せません。本当に削除しますか？")) onReset?.(); }}
            className="w-full px-4 py-3.5 text-left text-sm font-semibold text-rose-700 hover:bg-rose-100">全データを削除してリセット</button>
        </div>
      </div>
    </div>
  );
}
