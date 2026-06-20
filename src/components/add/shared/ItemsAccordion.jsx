import { useState } from "react";
import { fmtCurrency } from "../../../utils/format";
import { ItemTypeToggle } from "./ItemTypeToggle";

// ─── 品目リスト（アコーディオン）────────────────────────────
export function ItemsAccordion({ items, onToggleType, onEditAmount, onEditQuantity, totalAmount, categories, onToggleCategory }) {
  const [open,        setOpen]        = useState(false);
  const [catPickIdx,  setCatPickIdx]  = useState(null); // カテゴリ選択中の品目index

  if (!items || items.length === 0) return null;

  const sharedTotal   = items.filter(i => (i.type || "shared") === "shared").reduce((s, i) => s + i.amount, 0);
  const personalTotal = items.filter(i => i.type === "personal").reduce((s, i) => s + i.amount, 0);
  const partnerTotal  = items.filter(i => i.type === "partner").reduce((s, i) => s + i.amount, 0);
  const hasPersonal   = personalTotal > 0;
  const hasPartner    = partnerTotal > 0;
  const itemsSum      = items.reduce((s, i) => s + i.amount, 0);
  const diff          = totalAmount ? Math.round(totalAmount - itemsSum) : 0;
  const hasDiff       = Math.abs(diff) >= 2;
  const hasCatItems   = items.some(i => i.category && i.category !== "その他");

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(p => !p)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 text-sm">
        <span className="font-medium text-gray-700">品目 {items.length}件</span>
        <div className="flex items-center gap-3">
          {hasCatItems    && <span className="text-xs text-indigo-400 font-medium">🏷️カテゴリ設定済</span>}
          {hasPersonal    && <span className="text-xs text-rose-500 font-medium">個人 {fmtCurrency(personalTotal)}</span>}
          {hasPartner     && <span className="text-xs text-purple-500 font-medium">相手 {fmtCurrency(partnerTotal)}</span>}
          <span className="text-xs text-indigo-500 font-medium">共有 {fmtCurrency(sharedTotal)}</span>
          {hasDiff        && <span className="text-xs text-amber-500 font-medium">差額 ¥{Math.abs(diff)}</span>}
          <span className="text-gray-400">{open ? "▲" : "▼"}</span>
        </div>
      </button>
      {open && (
        <div className="divide-y divide-gray-50">
          {items.map((item, i) => (
            <div key={i} className={`px-4 py-2.5 ${item.type === "personal" ? "bg-rose-50" : item.type === "partner" ? "bg-purple-50" : "bg-white"}`}>
              <div className="flex items-center gap-2 mb-1.5">
                <p className="text-xs font-medium text-gray-800 flex-1 truncate">{item.name}</p>
                <ItemTypeToggle type={item.type || "shared"} onChange={t => onToggleType(i, t)} />
              </div>
              <div className="flex items-center gap-1.5 mb-1.5">
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
              {/* カテゴリ選択（categoriesが渡されている場合のみ表示） */}
              {categories && onToggleCategory && (
                <div>
                  <button onClick={() => setCatPickIdx(catPickIdx === i ? null : i)}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-all ${
                      item.category && item.category !== "その他"
                        ? "bg-indigo-50 text-indigo-600 border-indigo-200"
                        : "bg-gray-50 text-gray-400 border-gray-200"
                    }`}>
                    🏷️ {item.category && item.category !== "その他" ? item.category : "カテゴリ未設定"}
                  </button>
                  {catPickIdx === i && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {categories.filter(c => c.type === "expense").map(cat => (
                        <button key={cat.id}
                          onClick={() => { onToggleCategory(i, cat.name); setCatPickIdx(null); }}
                          className={`px-2 py-0.5 rounded-full text-xs border transition-all ${
                            item.category === cat.name
                              ? "bg-indigo-500 text-white border-indigo-500"
                              : "bg-white text-gray-600 border-gray-200"
                          }`}>
                          {cat.emoji} {cat.name}
                        </button>
                      ))}
                    </div>
                  )}
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
      )}
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
    </div>
  );
}
