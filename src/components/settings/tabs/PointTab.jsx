import { useState } from "react";
import { PrimaryButton } from "../../ui/PrimaryButton";

export function PointTab({ pointAccounts, onAddPointAccount, onUpdatePointAccount, onDeletePointAccount, onAdd }) {
  const [editingId,   setEditingId]   = useState(null);
  const [editingName, setEditingName] = useState("");
  const [editingIcon, setEditingIcon] = useState("");
  const [editingUnit, setEditingUnit] = useState("");
  const [showAdd,     setShowAdd]     = useState(false);
  const [newName,     setNewName]     = useState("");
  const [newIcon,     setNewIcon]     = useState("⭐");
  const [newUnit,     setNewUnit]     = useState("pt");
  const [adjustVals,  setAdjustVals]  = useState({});
  const [adjustDate,  setAdjustDate]  = useState(() => new Date().toISOString().slice(0, 10));

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm font-bold text-gray-700">ポイント口座一覧</p>
        <button onClick={() => setShowAdd(p => !p)}
          className="text-xs font-semibold text-indigo-500 bg-indigo-50 px-3 py-1.5 rounded-full">
          {showAdd ? "キャンセル" : "+ 追加"}
        </button>
      </div>

      {showAdd && (
        <div className="bg-indigo-50 rounded-2xl p-4 border border-indigo-100 space-y-3">
          <div className="flex gap-2">
            <input type="text" value={newIcon} onChange={e => setNewIcon(e.target.value)} maxLength={2}
              className="w-12 text-center text-2xl bg-white border border-indigo-200 rounded-xl py-2 outline-none" />
            <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="口座名（例: Tポイント）"
              className="flex-1 px-3 py-2 bg-white border border-indigo-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
          <div className="flex gap-2 items-center">
            <p className="text-xs text-gray-500">単位：</p>
            {["pt", "円"].map(u => (
              <button key={u} onClick={() => setNewUnit(u)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${newUnit === u ? "bg-indigo-500 text-white border-indigo-500" : "bg-white text-gray-500 border-gray-200"}`}>
                {u}
              </button>
            ))}
          </div>
          <PrimaryButton onClick={() => {
            if (!newName.trim()) return;
            onAddPointAccount({ id: `pa_${Date.now()}`, name: newName.trim(), icon: newIcon, unit: newUnit, balance: 0 });
            setNewName(""); setNewIcon("⭐"); setNewUnit("pt"); setShowAdd(false);
          }}>追加する</PrimaryButton>
        </div>
      )}

      <div className="bg-white rounded-2xl overflow-hidden border border-gray-100">
        {(pointAccounts || []).map(a => (
          <div key={a.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-b-0">
            {editingId === a.id ? (
              <>
                <input type="text" value={editingIcon} onChange={e => setEditingIcon(e.target.value)} maxLength={2}
                  className="w-10 text-center text-xl bg-gray-50 border border-gray-200 rounded-lg outline-none" />
                <input type="text" value={editingName} onChange={e => setEditingName(e.target.value)}
                  className="flex-1 text-sm px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg outline-none" />
                <button onClick={() => {
                  if (editingName.trim()) onUpdatePointAccount({ ...a, name: editingName.trim(), icon: editingIcon, unit: editingUnit });
                  setEditingId(null);
                }} className="text-xs text-indigo-500 font-semibold">保存</button>
                <button onClick={() => setEditingId(null)} className="text-xs text-gray-400">×</button>
              </>
            ) : (
              <>
                <span className="text-xl">{a.icon}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800">{a.name}</p>
                  <p className="text-xs text-gray-400">
                    残高：<span className={`font-semibold ${a.balance >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {a.balance.toLocaleString()}{a.unit}
                    </span>
                  </p>
                </div>
                <button onClick={() => { setEditingId(a.id); setEditingName(a.name); setEditingIcon(a.icon); setEditingUnit(a.unit); }}
                  className="text-xs text-gray-400 hover:text-indigo-500 px-2">✏️</button>
                <button onClick={() => { if (window.confirm(`「${a.name}」を削除しますか？`)) onDeletePointAccount(a.id); }}
                  className="text-gray-300 hover:text-rose-400 text-xl">×</button>
              </>
            )}
          </div>
        ))}
      </div>

      {/* 残高手動調整 */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100 space-y-3">
        <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">📅 残高の手動調整</p>
        <p className="text-xs text-gray-400 leading-relaxed">
          実際の残高を入力して「調整」を押すと、指定日付で差額を収支として記録します。
        </p>
        <div className="flex gap-2 items-center">
          <label className="text-xs text-gray-500 whitespace-nowrap">調整日：</label>
          <input type="date" value={adjustDate} onChange={e => setAdjustDate(e.target.value)}
            className="flex-1 text-xs px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg outline-none" />
        </div>
        {(pointAccounts || []).map(a => (
          <div key={a.id} className="bg-gray-50 rounded-xl p-3 border border-gray-100 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">{a.icon}</span>
              <div>
                <p className="text-xs font-semibold text-gray-700">{a.name}</p>
                <p className="text-xs text-gray-400">現在: {a.balance.toLocaleString()}円</p>
              </div>
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-xs text-gray-400">¥</span>
              <input type="number" value={adjustVals[a.id] ?? ""} onChange={e => setAdjustVals(p => ({ ...p, [a.id]: e.target.value }))}
                placeholder="実際の残高（円）"
                className="flex-1 text-sm px-3 py-2 bg-white border border-gray-200 rounded-lg outline-none" />
              <button
                onClick={() => {
                  const actual = Number(adjustVals[a.id]);
                  if (isNaN(actual) || adjustVals[a.id] === "") return;
                  const diff = actual - a.balance;
                  if (Math.abs(diff) < 1) { alert("差額がありません"); return; }
                  onAdd?.({
                    date:           adjustDate,
                    label:          `${a.name} 残高調整`,
                    category:       "その他",
                    amount:         diff,
                    type:           diff > 0 ? "income" : "expense",
                    source:         "manual",
                    isTransfer:     true,
                    shareType:      "personal",
                    pointAccountId: a.id,
                    paymentMethod:  a.id,
                  });
                  setAdjustVals(p => ({ ...p, [a.id]: "" }));
                  alert(`✅ ${a.name}に¥${Math.abs(diff).toLocaleString()}の調整を記録しました`);
                }}
                className="px-3 py-2 bg-indigo-500 text-white rounded-lg text-xs font-semibold whitespace-nowrap">
                調整
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
        <p className="text-xs font-semibold text-amber-600 mb-1">📌 仕組み</p>
        <p className="text-xs text-amber-500 leading-relaxed">
          調整日以前の過去データには影響しません。差額のみを新しい取引として記録します。
        </p>
      </div>
    </div>
  );
}
