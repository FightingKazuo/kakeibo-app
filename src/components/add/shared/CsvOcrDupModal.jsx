// ─── CSV-OCR重複確認モーダル ─────────────────────────────────
export function CsvOcrDupModal({ ocrTxs, csvCandidates, onDecide }) {
  const ocrAmt   = Math.abs(ocrTxs[0]?.amount || 0);
  const csvAmt   = Math.abs(csvCandidates[0]?.amount || 0);
  const ocrDate  = ocrTxs[0]?.date   || "";
  const ocrLabel = ocrTxs[0]?.label  || "";
  const csvLabel = csvCandidates[0]?.label || "";
  const csvDate  = csvCandidates[0]?.date  || "";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
      <div className="bg-white rounded-t-2xl w-full p-5 space-y-4 max-h-[85vh] overflow-y-auto">
        <div>
          <p className="text-sm font-bold text-gray-900">🔍 同じ支出かもしれません</p>
          <p className="text-xs text-gray-500 mt-1">日付と金額が近いCSVデータが見つかりました。どうしますか？</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-200">
            <p className="text-xs font-bold text-indigo-600 mb-1">📷 OCR（品目あり）</p>
            <p className="text-xs font-semibold text-gray-800 truncate">{ocrLabel}</p>
            <p className="text-xs text-gray-500">{ocrDate}</p>
            <p className="text-sm font-bold text-rose-500 mt-1">¥{ocrAmt.toLocaleString()}</p>
            {ocrTxs[0]?.items?.length > 0 && <p className="text-xs text-indigo-500 mt-1">品目 {ocrTxs[0].items.length}件</p>}
          </div>
          <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
            <p className="text-xs font-bold text-gray-500 mb-1">📊 CSV（品目なし）</p>
            <p className="text-xs font-semibold text-gray-800 truncate">{csvLabel}</p>
            <p className="text-xs text-gray-500">{csvDate}</p>
            <p className="text-sm font-bold text-rose-500 mt-1">¥{csvAmt.toLocaleString()}</p>
          </div>
        </div>
        <div className="space-y-2">
          <button onClick={() => onDecide("merge")} className="w-full py-3 bg-indigo-500 text-white rounded-xl text-sm font-bold">
            ✅ CSVデータ＋品目情報をマージ（推奨）
          </button>
          <button onClick={() => onDecide("ocr-win")} className="w-full py-3 bg-white border border-gray-300 text-gray-700 rounded-xl text-sm font-medium">
            📷 OCRを残してCSVを削除
          </button>
          <button onClick={() => onDecide("both")} className="w-full py-3 bg-white border border-gray-200 text-gray-500 rounded-xl text-sm font-medium">
            両方残す
          </button>
          <button onClick={() => onDecide("skip")} className="w-full py-2 text-gray-400 text-xs">
            キャンセル（登録しない）
          </button>
        </div>
      </div>
    </div>
  );
}
