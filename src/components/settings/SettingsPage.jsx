import { useState } from "react";
import { DEFAULT_CATEGORY_RULES, STORAGE_KEYS } from "../../constants";
import { removeStorage, clearAllStorage } from "../../utils/storage";
import { fmtCurrency } from "../../utils/format";
import { PrimaryButton } from "../ui/PrimaryButton";
import { EmptyState } from "../ui/EmptyState";

export function SettingsPage({
  categories, onAddCat, onUpdateCat, onDeleteCat,
  learnedRules, onDeleteRule,
  transactions,
  onReset,
}) {
  const [tab,       setTab]       = useState("categories");
  const [showAdd,   setShowAdd]   = useState(false);
  const [newName,   setNewName]   = useState("");
  const [newEmoji,  setNewEmoji]  = useState("📦");
  const [newType,   setNewType]   = useState("expense");
  const [editingId, setEditingId] = useState(null);
  const [editName,  setEditName]  = useState("");
  const [editEmoji, setEditEmoji] = useState("");

  const handleAdd = () => {
    if (!newName.trim()) return;
    onAddCat({ id:`c_${Date.now()}`, name:newName.trim(), emoji:newEmoji, type:newType });
    setNewName(""); setNewEmoji("📦"); setShowAdd(false);
  };

  const exportCSV = () => {
    if (!transactions?.length) { alert("エクスポートするデータがありません"); return; }
    const header = "日付,種別,カテゴリ,内容,金額,登録元";
    const rows = transactions.map(t => [
      t.date,
      t.type==="income"?"収入":"支出",
      t.category,
      `"${(t.label||"").replace(/"/g,'""')}"`,
      t.amount,
      t.source||"manual",
    ].join(","));
    const csv  = "\uFEFF" + [header, ...rows].join("\n");
    const blob = new Blob([csv], { type:"text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `kakeibo_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="pb-20">
      <div className="bg-white px-4 pt-12 pb-4 border-b border-gray-100">
        <h1 className="text-xl font-bold text-gray-900">設定</h1>
      </div>

      {/* CSVエクスポート */}
      <div className="px-4 pt-4">
        <button onClick={exportCSV}
          className="w-full py-3 rounded-xl border border-emerald-200 bg-emerald-50 text-sm font-semibold text-emerald-700 flex items-center justify-center gap-2 active:scale-95 transition-all duration-200">
          ⬇️ CSVエクスポート（{transactions?.length||0}件）
        </button>
      </div>

      {/* タブ */}
      <div className="flex bg-gray-100 mx-4 mt-4 rounded-xl p-1">
        {[["categories","カテゴリ管理"],["rules","学習ルール"]].map(([id,lb]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${tab===id?"bg-white text-indigo-600 shadow-sm":"text-gray-400"}`}>
            {lb}
          </button>
        ))}
      </div>

      {/* カテゴリ管理 */}
      {tab==="categories" && (
        <div className="px-4 mt-4 space-y-5">
          <button onClick={() => setShowAdd(!showAdd)}
            className="w-full py-3 rounded-xl border border-indigo-200 text-sm font-semibold text-indigo-600 bg-indigo-50 transition-all duration-200 active:scale-95">
            {showAdd ? "キャンセル" : "＋ カテゴリを追加"}
          </button>
          {showAdd && (
            <div className="bg-indigo-50 rounded-2xl p-4 border border-indigo-100 space-y-3">
              <div className="flex bg-white rounded-xl p-1 border border-indigo-100">
                <button onClick={() => setNewType("expense")} className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${newType==="expense"?"bg-indigo-500 text-white":"text-gray-400"}`}>支出</button>
                <button onClick={() => setNewType("income")}  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${newType==="income"?"bg-indigo-500 text-white":"text-gray-400"}`}>収入</button>
              </div>
              <div className="flex gap-2">
                <input value={newEmoji} onChange={e=>setNewEmoji(e.target.value)}
                  className="w-12 text-center border border-indigo-200 bg-white rounded-xl py-2 text-xl outline-none" />
                <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="カテゴリ名"
                  className="flex-1 border border-indigo-200 bg-white rounded-xl px-3 py-2 text-sm outline-none" />
              </div>
              <PrimaryButton onClick={handleAdd} size="sm">追加する</PrimaryButton>
            </div>
          )}
          {[["expense","支出"],["income","収入"]].map(([t,lb]) => (
            <div key={t}>
              <p className="text-xs font-semibold text-gray-500 mb-2 uppercase">{lb}カテゴリ</p>
              <div className="bg-white rounded-2xl overflow-hidden border border-gray-100">
                {categories.filter(c=>c.type===t).map(cat => (
                  <div key={cat.id} className="px-4 py-3 border-b border-gray-50 last:border-b-0">
                    {editingId===cat.id ? (
                      <div className="flex items-center gap-2">
                        <input value={editEmoji} onChange={e=>setEditEmoji(e.target.value)} className="w-10 text-center border border-gray-200 rounded-lg py-1 text-lg" />
                        <input value={editName}  onChange={e=>setEditName(e.target.value)}  className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-indigo-300" />
                        <button onClick={()=>{onUpdateCat({...cat,name:editName,emoji:editEmoji});setEditingId(null);}} className="text-xs bg-indigo-500 text-white px-2 py-1 rounded-lg">保存</button>
                        <button onClick={()=>setEditingId(null)} className="text-xs text-gray-400">×</button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3"><span className="text-xl">{cat.emoji}</span><span className="text-sm font-medium">{cat.name}</span></div>
                        <div className="flex gap-2">
                          <button onClick={()=>{setEditingId(cat.id);setEditName(cat.name);setEditEmoji(cat.emoji);}} className="text-xs text-indigo-400">✏️</button>
                          <button onClick={()=>window.confirm(`「${cat.name}」を削除しますか？`)&&onDeleteCat(cat.id)} className="text-xs text-gray-300 hover:text-rose-400 transition-colors">×</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 学習ルール */}
      {tab==="rules" && (
        <div className="px-4 mt-4 space-y-4">
          <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
            <p className="text-xs font-semibold text-indigo-700 mb-2">🤖 カテゴリ推定の仕組み</p>
            <p className="text-xs text-indigo-600 leading-relaxed">
              ① デフォルトルール（{DEFAULT_CATEGORY_RULES.length}件）で判定<br/>
              ② あなたが修正したルール（{learnedRules.length}件）を優先適用<br/>
              ③ 信頼度75%以上で自動セット
            </p>
          </div>
          <p className="text-sm font-semibold text-gray-700">学習ルール（{learnedRules.length}件）</p>
          {learnedRules.length===0 ? (
            <EmptyState emoji="🧠" title="まだ学習ルールがありません" desc="取引追加時にカテゴリを修正すると記録されます" />
          ) : (
            <div className="bg-white rounded-2xl overflow-hidden border border-gray-100">
              {learnedRules.map((r,i) => (
                <div key={r.id} className="flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-b-0">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-600">{i+1}</div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">「{r.keywords[0]}」</p>
                      <p className="text-xs text-gray-400">→ {r.category}</p>
                    </div>
                  </div>
                  <button onClick={()=>onDeleteRule(r.id)} className="text-gray-300 hover:text-rose-400 text-xl transition-colors">×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Danger Zone */}
      <div className="px-4 mt-8 pb-4">
        <div className="rounded-2xl overflow-hidden border border-rose-200">
          <div className="bg-rose-50 px-4 py-3 border-b border-rose-200">
            <p className="text-xs font-bold text-rose-600 uppercase tracking-wide">⚠️ 危険な操作</p>
          </div>
          <div className="bg-white divide-y divide-gray-50">
            <button
              onClick={() => { if (window.confirm("OCR読み取り履歴を削除しますか？")) removeStorage(STORAGE_KEYS.OCR_HISTORY); }}
              className="w-full px-4 py-3.5 text-left text-sm text-rose-500 hover:bg-rose-50 transition-all duration-200">
              OCR履歴を削除
            </button>
            <button
              onClick={() => { if (window.confirm(`学習ルール ${learnedRules.length}件をすべて削除しますか？`)) learnedRules.forEach(r => onDeleteRule(r.id)); }}
              className="w-full px-4 py-3.5 text-left text-sm text-rose-500 hover:bg-rose-50 transition-all duration-200">
              学習ルールをすべて削除（{learnedRules.length}件）
            </button>
            <button
              onClick={() => { if (window.confirm("⚠️ すべてのデータを削除します。取り消せません。本当に削除しますか？")) onReset?.(); }}
              className="w-full px-4 py-3.5 text-left text-sm font-semibold text-rose-700 hover:bg-rose-100 transition-all duration-200">
              全データを削除してリセット
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
