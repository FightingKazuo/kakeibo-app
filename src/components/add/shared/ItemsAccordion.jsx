import { useState } from "react";
import { fmtCurrency } from "../../../utils/format";
import { ItemTypeToggle } from "./ItemTypeToggle";

export function ItemsAccordion({ items, onToggleType, onEditAmount, onEditQuantity, totalAmount, categories, onToggleCategory }) {
  const [open,      setOpen]     = useState(false);
  const [editMode,  setEditMode] = useState(false);
  const [selected,  setSelected] = useState(new Set());
  const [lastApplied, setLastApplied] = useState(""); // 最後に適用したカテゴリー名

  if (!items || items.length === 0) return null;

  const sharedTotal   = items.filter(i => (i.type || "shared") === "shared").reduce((s, i) => s + i.amount, 0);
  const personalTotal = items.filter(i => i.type === "personal").reduce((s, i) => s + i.amount, 0);
  const partnerTotal  = items.filter(i => i.type === "partner").reduce((s, i) => s + i.amount, 0);
  const hasPersonal   = personalTotal > 0;
  const hasPartner    = partnerTotal > 0;
  const itemsSum      = items.reduce((s, i) => s + i.amount, 0);
  const diff          = totalAmount ? Math.round(totalAmount - itemsSum) : 0;
  const hasDiff       = Math.abs(diff) >= 2;
  const hasMixedCat   = items.some((item, i, arr) =>
    item.category && arr[0]?.category && item.category !== arr[0].category
  );

  const toggleSelect = (idx) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const applyCategory = (catName) => {
    if (selected.size === 0) return;
    // onToggleCategoryを呼んでitemsを更新
    selected.forEach(idx => onToggleCategory?.(idx, catName));
    setLastApplied(`✅ ${selected.size}件 → ${catName}`);
    setSelected(new Set());
    // 1.5秒後にメッセージを消す
    setTimeout(() => setLastApplied(""), 1500);
  };

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      {/* ヘッダー */}
      <div className="flex items-center bg-gray-50 px-4 py-3">
        <button onClick={() => { setOpen(p => !p); setEditMode(false); setSelected(new Set()); }}
          className="flex-1 flex items-center gap-2 text-sm text-left">
          <span className="font-medium text-gray-700">品目 {items.length}件</span>
          <span className="text-gray-400">{open ? "▲" : "▼"}</span>
        </button>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {hasPersonal && <span className="text-xs text-rose-500 font-medium">個人 {fmtCurrency(personalTotal)}</span>}
          {hasPartner  && <span className="text-xs text-purple-500 font-medium">相手 {fmtCurrency(partnerTotal)}</span>}
          <span className="text-xs text-indigo-500 font-medium">共有 {fmtCurrency(sharedTotal)}</span>
          {hasDiff     && <span className="text-xs text-amber-500 font-medium">差額 ¥{Math.abs(diff)}</span>}
        </div>
      </div>

      {open && (
        <>
          {/* カテゴリー変更モードバー */}
          {categories && onToggleCategory && (
            <div className="px-4 py-2 bg-white border-b border-gray-100 space-y-2">
              {/* 適用完了メッセージ */}
              {lastApplied && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5 text-xs font-semibold text-emerald-700">
                  {lastApplied}
                </div>
              )}
              {!editMode ? (
                <button onClick={() => { setEditMode(true); }}
                  className="text-xs text-indigo-500 font-semibold border border-indigo-200 bg-indigo-50 px-3 py-1.5 rounded-full">
                  🏷️ カテゴリーを変更する
                </button>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-indigo-600">
                      {selected.size === 0 ? "品目を選んでカテゴリーを押す" : `${selected.size}件を選択中 →`}
                    </p>
                    <div className="flex gap-1.5">
                      <button onClick={() => setSelected(new Set(items.map((_, i) => i)))}
                        className="text-xs text-gray-500 border border-gray-200 bg-gray-50 px-2 py-1 rounded-lg">全選択</button>
                      <button onClick={() => { setEditMode(false); setSelected(new Set()); }}
                        className="text-xs text-gray-400 border border-gray-200 px-2 py-1 rounded-lg">完了</button>
                    </div>
                  </div>
                  {/* 常にカテゴリーボタンを表示（グレーアウトで選択中のみ適用） */}
                  <div className="flex flex-wrap gap-1.5">
                    {categories.filter(c => c.type === "expense").map(cat => (
                      <button key={cat.id} onClick={() => applyCategory(cat.name)}
                        className={`px-2.5 py-1 rounded-full text-xs border transition-all ${
                          selected.size === 0
                            ? "bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed"
                            : "bg-white text-gray-600 border-gray-200 hover:bg-indigo-500 hover:text-white hover:border-indigo-500"
                        }`}>
                        {cat.emoji} {cat.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 品目リスト */}
          <div className="divide-y divide-gray-50">
            {items.map((item, i) => (
              <div key={i} className={`px-4 py-2.5 ${
                editMode && selected.has(i) ? "bg-indigo-50 border-l-2 border-indigo-400" :
                item.type === "personal" ? "bg-rose-50" :
                item.type === "partner"  ? "bg-purple-50" : "bg-white"
              }`}>
                <div className="flex items-center gap-2 mb-1.5">
                  {editMode && (
                    <input type="checkbox" checked={selected.has(i)} onChange={() => toggleSelect(i)}
                      className="accent-indigo-500 flex-shrink-0 w-4 h-4" />
                  )}
                  <p className="text-xs font-medium text-gray-800 flex-1 truncate">{item.name}</p>
                  {/* カテゴリーバッジ：常に表示 */}
                  {item.category && item.category !== "その他" && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full border flex-shrink-0 ${
                      hasMixedCat && item.category !== items[0]?.category
                        ? "bg-indigo-50 text-indigo-600 border-indigo-200 font-medium"
                        : "bg-gray-50 text-gray-400 border-gray-200"
                    }`}>
                      {categories?.find(c => c.name === item.category)?.emoji} {item.category}
                    </span>
                  )}
                  {!editMode && <ItemTypeToggle type={item.type || "shared"} onChange={t => onToggleType(i, t)} />}
                </div>
                {!editMode && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-400">単価</span>
                    <input type="number" value={item.unitPrice || item.amount}
                      onChange={e => { const u = Number(e.target.value); onEditAmount?.(i, u * (item.quantity || 1), u); }}
                      className="w-16 text-xs font-bold text-gray-700 text-right bg-gray-50 border border-gray-200 rounded-lg px-1.5 py-1 outline-none focus:ring-1 focus:ring-indigo-300" />
                    <span className="text-xs text-gray-400">×</span>
                    <input type="number" value={item.quantity || 1} min={1}
                      onChange={e => { const q = Math.max(1, Number(e.target.value)); onEditQuantity?.(i, q, (item.unitPrice || item.amount) * q); }}
                      className="w-12 text-xs font-bold text-gray-700 text-center bg-gray-50 border border-gray-200 rounded-lg px-1.5 py-1 outline-none focus:ring-1 focus:ring-indigo-300" />
                    <span className="text-xs text-gray-400">=</span>
                    <span className="text-xs font-bold text-gray-700">¥{item.amount.toLocaleString()}</span>
                  </div>
                )}
              </div>
            ))}
            {hasDiff && (
              <div className={`flex items-center justify-between px-4 py-2.5 ${diff > 0 ? "bg-amber-50" : "bg-emerald-50"}`}>
                <p className="text-xs font-medium text-gray-600">{diff > 0 ? "🧾 消費税等" : "💰 値引き等"}</p>
                <p className={`text-xs font-bold ${diff > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                  {diff > 0 ? `+¥${diff.toLocaleString()}` : `-¥${Math.abs(diff).toLocaleString()}`}
                </p>
              </div>
            )}
          </div>

          {(hasPersonal || hasPartner) && (
            <div className="px-4 py-2.5 bg-indigo-50 border-t border-indigo-100 text-xs">
              <div className="flex justify-between">
                <span className="text-indigo-600 font-medium">登録内訳</span>
                <span className="text-indigo-600">
                  共有 {fmtCurrency(sharedTotal)}
                  {hasPersonal && ` ＋ 個人 ${fmtCurrency(personalTotal)}`}
                  {hasPartner  && ` ＋ 相手 ${fmtCurrency(partnerTotal)}`}
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
