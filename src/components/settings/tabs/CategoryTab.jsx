import { useState } from "react";
import { PrimaryButton } from "../../ui/PrimaryButton";
import { EmojiPicker } from "../../common/EmojiPicker";

export function CategoryTab({ categories, onAddCat, onUpdateCat, onDeleteCat, onReorderCat }) {
  const [showAdd,    setShowAdd]   = useState(false);
  const [newName,    setNewName]   = useState("");
  const [newEmoji,   setNewEmoji]  = useState("📦");
  const [newType,    setNewType]   = useState("expense");
  const [editingId,  setEditingId] = useState(null);
  const [editName,   setEditName]  = useState("");
  const [editEmoji,  setEditEmoji] = useState("");
  const [editBudget, setEditBudget]= useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiPickerFor,  setEmojiPickerFor]  = useState(null);

  const moveCategory = (idx, dir) => {
    const next = [...categories];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onReorderCat?.(next);
  };

  const handleAdd = () => {
    if (!newName.trim()) return;
    onAddCat({ id: `c_${Date.now()}`, name: newName.trim(), emoji: newEmoji, type: newType });
    setNewName(""); setNewEmoji("📦"); setShowAdd(false);
  };

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm font-bold text-gray-700">カテゴリ一覧</p>
        <button onClick={() => setShowAdd(p => !p)} className="text-xs font-semibold text-indigo-500 bg-indigo-50 px-3 py-1.5 rounded-full">
          {showAdd ? "キャンセル" : "+ 追加"}
        </button>
      </div>

      {showAdd && (
        <div className="bg-indigo-50 rounded-2xl p-4 border border-indigo-100 space-y-3">
          <div className="flex gap-2">
            <button onClick={() => { setEmojiPickerFor("new"); setShowEmojiPicker(true); }}
              className="w-12 h-12 text-2xl bg-white border border-indigo-200 rounded-xl flex items-center justify-center hover:bg-indigo-100">
              {newEmoji}
            </button>
            <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="カテゴリ名"
              className="flex-1 px-3 py-2 bg-white border border-indigo-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
          <div className="flex gap-2">
            {["expense","income"].map(t => (
              <button key={t} onClick={() => setNewType(t)}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${newType===t?"bg-indigo-500 text-white border-indigo-500":"bg-white text-gray-500 border-gray-200"}`}>
                {t === "expense" ? "💸 支出" : "💰 収入"}
              </button>
            ))}
          </div>
          <PrimaryButton onClick={handleAdd}>追加する</PrimaryButton>
        </div>
      )}

      {["expense", "income"].map(type => {
        const typeCats = categories.filter(c => c.type === type);
        if (typeCats.length === 0) return null;
        return (
          <div key={type}>
            <p className={`text-xs font-bold mb-2 px-1 ${type === "expense" ? "text-rose-400" : "text-emerald-500"}`}>
              {type === "expense" ? "💸 支出カテゴリ" : "💰 収入カテゴリ"}
            </p>
            <div className="bg-white rounded-2xl overflow-hidden border border-gray-100">
              {typeCats.map(cat => {
                const idx     = categories.findIndex(c => c.id === cat.id);
                const typeIdx = typeCats.findIndex(c => c.id === cat.id);
                return (
                  <div key={cat.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-b-0">
                    {editingId === cat.id ? (
                      <>
                        <button onClick={() => { setEmojiPickerFor(cat.id); setShowEmojiPicker(true); }}
                          className="w-10 h-10 text-xl bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-center hover:bg-gray-100">
                          {editEmoji}
                        </button>
                        <div className="flex-1 flex flex-col gap-1.5">
                          <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                            className="w-full text-sm px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg outline-none" />
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-gray-400">月予算 ¥</span>
                            <input type="number" value={editBudget} onChange={e => setEditBudget(e.target.value)} placeholder="未設定"
                              className="flex-1 text-xs px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg outline-none" />
                          </div>
                        </div>
                        <button onClick={() => { onUpdateCat({...cat, name:editName, emoji:editEmoji, budget: editBudget ? Number(editBudget) : null}); setEditingId(null); }}
                          className="text-xs text-indigo-500 font-semibold">保存</button>
                        <button onClick={() => setEditingId(null)} className="text-xs text-gray-400">×</button>
                      </>
                    ) : (
                      <>
                        <div className="flex flex-col gap-0.5">
                          <button onClick={() => moveCategory(idx, -1)} disabled={typeIdx === 0}
                            className="w-8 h-7 flex items-center justify-center text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 disabled:opacity-20 disabled:cursor-not-allowed rounded-md text-sm">▲</button>
                          <button onClick={() => moveCategory(idx, 1)} disabled={typeIdx === typeCats.length - 1}
                            className="w-8 h-7 flex items-center justify-center text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 disabled:opacity-20 disabled:cursor-not-allowed rounded-md text-sm">▼</button>
                        </div>
                        <span className="text-xl">{cat.emoji}</span>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-800">{cat.name}</p>
                          {cat.budget ? <p className="text-xs text-indigo-400">予算 ¥{cat.budget.toLocaleString()}</p> : null}
                        </div>
                        <button onClick={() => { setEditingId(cat.id); setEditName(cat.name); setEditEmoji(cat.emoji); setEditBudget(cat.budget ?? ""); }}
                          className="text-xs text-gray-400 hover:text-indigo-500 px-2">✏️</button>
                        <button onClick={() => { if(window.confirm(`「${cat.name}」を削除しますか？`)) onDeleteCat(cat.id); }}
                          className="text-gray-300 hover:text-rose-400 text-xl">×</button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {showEmojiPicker && (
        <EmojiPicker
          value={emojiPickerFor === "new" ? newEmoji : editEmoji}
          onChange={emoji => { emojiPickerFor === "new" ? setNewEmoji(emoji) : setEditEmoji(emoji); }}
          onClose={() => { setShowEmojiPicker(false); setEmojiPickerFor(null); }}
        />
      )}
    </div>
  );
}
