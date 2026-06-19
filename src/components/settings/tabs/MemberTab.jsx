import { useState } from "react";
import { PrimaryButton } from "../../ui/PrimaryButton";

export function MemberTab({ members, onUpdateMember, onAddMember, onDeleteMember }) {
  const [editingId,   setEditingId]   = useState(null);
  const [editingName, setEditingName] = useState("");
  const [showAdd,     setShowAdd]     = useState(false);
  const [newName,     setNewName]     = useState("");

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm font-bold text-gray-700">メンバー一覧</p>
        <button onClick={() => setShowAdd(p => !p)}
          className="text-xs font-semibold text-indigo-500 bg-indigo-50 px-3 py-1.5 rounded-full">
          {showAdd ? "キャンセル" : "+ 追加"}
        </button>
      </div>

      {showAdd && (
        <div className="bg-indigo-50 rounded-2xl p-4 border border-indigo-100 space-y-3">
          <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="名前を入力"
            className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
          <PrimaryButton onClick={() => {
            if (!newName.trim()) return;
            onAddMember({ id: `m_${Date.now()}`, name: newName.trim() });
            setNewName(""); setShowAdd(false);
          }}>追加する</PrimaryButton>
        </div>
      )}

      <div className="bg-white rounded-2xl overflow-hidden border border-gray-100">
        {(members || []).map(m => (
          <div key={m.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-b-0">
            {editingId === m.id ? (
              <>
                <input type="text" value={editingName} onChange={e => setEditingName(e.target.value)}
                  className="flex-1 text-sm px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg outline-none" />
                <button onClick={() => { if (editingName.trim()) onUpdateMember({ ...m, name: editingName.trim() }); setEditingId(null); }}
                  className="text-xs text-indigo-500 font-semibold">保存</button>
                <button onClick={() => setEditingId(null)} className="text-xs text-gray-400">×</button>
              </>
            ) : (
              <>
                <span className="text-xl">👤</span>
                <p className="flex-1 text-sm font-medium text-gray-800">{m.name}</p>
                <button onClick={() => { setEditingId(m.id); setEditingName(m.name); }}
                  className="text-xs text-gray-400 hover:text-indigo-500 px-2">✏️</button>
                {(members || []).length > 2 && (
                  <button onClick={() => { if (window.confirm(`「${m.name}」を削除しますか？`)) onDeleteMember(m.id); }}
                    className="text-gray-300 hover:text-rose-400 text-xl">×</button>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
