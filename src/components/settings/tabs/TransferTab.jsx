import { useState } from "react";
import { getTransferKeywords, learnTransferKeyword, removeTransferKeyword } from "../../../services/csvParser";

export function TransferTab() {
  const [keywords,   setKeywords]   = useState(() => getTransferKeywords());
  const [newKeyword, setNewKeyword] = useState("");

  return (
    <div className="px-4 py-4 space-y-4">
      <p className="text-xs text-gray-500 leading-relaxed">
        銀行明細CSVの取り込み時に「振替」として自動判定するキーワードを管理します。振替は支出・収入に計上されません。
      </p>

      <div className="flex gap-2">
        <input type="text" value={newKeyword} onChange={e => setNewKeyword(e.target.value)}
          placeholder="例: SBIハイブリッド預金"
          className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
        <button
          onClick={() => {
            if (!newKeyword.trim()) return;
            learnTransferKeyword(newKeyword.trim());
            setKeywords(getTransferKeywords());
            setNewKeyword("");
          }}
          className="px-4 py-2 bg-indigo-500 text-white rounded-xl text-sm font-semibold">
          追加
        </button>
      </div>

      <div className="bg-white rounded-2xl overflow-hidden border border-gray-100">
        {keywords.map((kw, i) => (
          <div key={i} className="flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-b-0">
            <div className="flex items-center gap-2">
              <span className="text-sm">🔄</span>
              <p className="text-sm text-gray-700">{kw}</p>
            </div>
            <button
              onClick={() => { removeTransferKeyword(kw); setKeywords(getTransferKeywords()); }}
              className="text-gray-300 hover:text-rose-400 text-xl">×</button>
          </div>
        ))}
      </div>

      <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
        <p className="text-xs font-semibold text-blue-600 mb-1">💡 使い方</p>
        <p className="text-xs text-blue-500 leading-relaxed">
          取引一覧の「⋮」ボタンから「振替とする」を選ぶと、そのキーワードが自動で学習されます。次回CSVインポート時から自動除外されます。
        </p>
      </div>
    </div>
  );
}
