import { useState, useRef } from "react";
import { DEFAULT_CATEGORY_RULES, STORAGE_KEYS } from "../../constants";
import { removeStorage, clearAllStorage } from "../../utils/storage";
import { fmtCurrency } from "../../utils/format";
import { PrimaryButton } from "../ui/PrimaryButton";
import { EmptyState } from "../ui/EmptyState";

export function SettingsPage({
  categories, onAddCat, onUpdateCat, onDeleteCat,
  learnedRules, onDeleteRule,
  transactions, onAdd,
  onReset,
  members, onUpdateMember, onAddMember, onDeleteMember,
}) {
  const [tab,        setTab]       = useState("categories");
  const [showAdd,    setShowAdd]   = useState(false);
  const [newName,    setNewName]   = useState("");
  const [newEmoji,   setNewEmoji]  = useState("📦");
  const [newType,    setNewType]   = useState("expense");
  const [editingId,  setEditingId] = useState(null);
  const [editName,   setEditName]  = useState("");
  const [editEmoji,  setEditEmoji] = useState("");
  const [restoreMsg, setRestoreMsg]= useState("");

  // メンバー編集用
  const [editingMemberId,  setEditingMemberId]  = useState(null);
  const [editingMemberName,setEditingMemberName]= useState("");
  const [showAddMember,    setShowAddMember]    = useState(false);
  const [newMemberName,    setNewMemberName]    = useState("");

  const backupFileRef = useRef(null);

  const handleAdd = () => {
    if (!newName.trim()) return;
    onAddCat({ id:`c_${Date.now()}`, name:newName.trim(), emoji:newEmoji, type:newType });
    setNewName(""); setNewEmoji("📦"); setShowAdd(false);
  };

  const exportJSON = () => {
    if (!transactions?.length) { alert("エクスポートするデータがありません"); return; }
    const backup = {
      version: "2.0", exportedAt: new Date().toISOString(),
      count: transactions.length, transactions, categories, learnedRules,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `kakeibo_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(url);
  };

  const importJSON = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.transactions || !Array.isArray(data.transactions)) {
          alert("バックアップファイルの形式が正しくありません"); return;
        }
        const ok = window.confirm(
          `バックアップを復元します。\n\n取引: ${data.transactions.length}件\nバックアップ日時: ${(data.exportedAt || "").slice(0, 10) || "不明"}\n\n⚠️ 現在のデータは上書きされます。続けますか？`
        );
        if (!ok) return;
        data.transactions.forEach(tx => onAdd?.(tx));
        setRestoreMsg(`✅ ${data.transactions.length}件を復元しました`);
        setTimeout(() => setRestoreMsg(""), 4000);
      } catch { alert("ファイルの読み込みに失敗しました"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const exportCSV = () => {
    if (!transactions?.length) { alert("エクスポートするデータがありません"); return; }
    const header = "日付,種別,カテゴリ,内容,金額,登録元,支払者";
    const rows = transactions.map(t => [
      t.date, t.type === "income" ? "収入" : "支出", t.category,
      `"${(t.label || "").replace(/"/g, '""')}"`,
      t.amount, t.source || "manual", t.paidBy || "",
    ].join(","));
    const csv  = "\uFEFF" + [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `kakeibo_${new Date().toISOString().split("T")[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const storageUsed = (() => {
    try {
      let total = 0;
      for (const key of Object.keys(localStorage)) total += (localStorage.getItem(key) || "").length * 2;
      return (total / 1024 / 1024).toFixed(2);
    } catch { return "?"; }
  })();
  const storageRatio = Math.min(100, Math.round((parseFloat(storageUsed) / 5) * 100));

  const TABS = [
    { id:"categories", label:"カテゴリ"   },
    { id:"members",    label:"メンバー"   },
    { id:"rules",      label:"学習ルール"  },
    { id:"backup",     label:"バックアップ" },
    { id:"data",       label:"データ"      },
  ];

  return (
    <div className="pb-24">
      <div className="bg-white px-4 pt-12 pb-4 border-b border-gray-100">
        <h1 className="text-xl font-bold text-gray-900">設定</h1>
      </div>

      {/* タブ */}
      <div className="flex gap-1 px-4 py-3 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
              tab === t.id ? "bg-indigo-500 text-white" : "bg-gray-100 text-gray-500"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── メンバー タブ ── */}
      {tab === "members" && (
        <div className="px-4 py-4 space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm font-bold text-gray-700">メンバー一覧</p>
            <button onClick={() => setShowAddMember(p => !p)}
              className="text-xs font-semibold text-indigo-500 bg-indigo-50 px-3 py-1.5 rounded-full">
              {showAddMember ? "キャンセル" : "+ 追加"}
            </button>
          </div>

          {showAddMember && (
            <div className="bg-indigo-50 rounded-2xl p-4 border border-indigo-100 space-y-3">
              <input
                type="text" value={newMemberName}
                onChange={e => setNewMemberName(e.target.value)}
                placeholder="名前を入力"
                className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <PrimaryButton onClick={() => {
                if (!newMemberName.trim()) return;
                onAddMember({ id: `m_${Date.now()}`, name: newMemberName.trim() });
                setNewMemberName(""); setShowAddMember(false);
              }}>追加する</PrimaryButton>
            </div>
          )}

          <div className="bg-white rounded-2xl overflow-hidden border border-gray-100">
            {(members || []).map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-b-0">
                {editingMemberId === m.id ? (
                  <>
                    <input
                      type="text" value={editingMemberName}
                      onChange={e => setEditingMemberName(e.target.value)}
                      className="flex-1 text-sm px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg outline-none"
                    />
                    <button onClick={() => {
                      if (editingMemberName.trim()) onUpdateMember({ ...m, name: editingMemberName.trim() });
                      setEditingMemberId(null);
                    }} className="text-xs text-indigo-500 font-semibold">保存</button>
                    <button onClick={() => setEditingMemberId(null)} className="text-xs text-gray-400">×</button>
                  </>
                ) : (
                  <>
                    <span className="text-xl">👤</span>
                    <p className="flex-1 text-sm font-medium text-gray-800">{m.name}</p>
                    <button onClick={() => { setEditingMemberId(m.id); setEditingMemberName(m.name); }}
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
          <p className="text-xs text-gray-400 text-center">※ メンバーは精算機能で使用されます</p>
        </div>
      )}

      {/* ── バックアップ タブ ── */}
      {tab === "backup" && (
        <div className="px-4 py-4 space-y-4">
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <p className="text-xs font-semibold text-gray-500 mb-3">📊 ストレージ使用量</p>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-gray-800">{storageUsed} MB / 5 MB</span>
              <span className={`text-xs font-semibold ${storageRatio > 70 ? "text-rose-500" : storageRatio > 40 ? "text-amber-500" : "text-emerald-500"}`}>
                {storageRatio}%
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div className={`h-2 rounded-full transition-all ${storageRatio > 70 ? "bg-rose-400" : storageRatio > 40 ? "bg-amber-400" : "bg-emerald-400"}`}
                style={{ width: `${storageRatio}%` }} />
            </div>
          </div>
          <div className="bg-white rounded-2xl overflow-hidden border border-gray-100">
            <div className="px-4 py-3 border-b border-gray-50">
              <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">💾 JSONバックアップ（推奨）</p>
            </div>
            <div className="p-4 space-y-3">
              <button onClick={exportJSON} className="w-full py-3 bg-indigo-500 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2">
                📥 JSONでバックアップ（{transactions?.length || 0}件）
              </button>
              <input ref={backupFileRef} type="file" accept=".json" onChange={importJSON} className="hidden" />
              <button onClick={() => backupFileRef.current?.click()} className="w-full py-3 bg-white border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold flex items-center justify-center gap-2">
                📤 JSONから復元
              </button>
              {restoreMsg && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                  <p className="text-sm font-semibold text-emerald-700">{restoreMsg}</p>
                </div>
              )}
            </div>
          </div>
          <div className="bg-white rounded-2xl overflow-hidden border border-gray-100">
            <div className="px-4 py-3 border-b border-gray-50">
              <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">📄 CSVエクスポート</p>
            </div>
            <div className="p-4">
              <button onClick={exportCSV} className="w-full py-3 bg-white border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold flex items-center justify-center gap-2">
                📊 CSVでダウンロード
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── カテゴリ タブ ── */}
      {tab === "categories" && (
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
                <input type="text" value={newEmoji} onChange={e => setNewEmoji(e.target.value)} maxLength={2}
                  className="w-12 text-center text-2xl bg-white border border-indigo-200 rounded-xl py-2 outline-none" />
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
          <div className="bg-white rounded-2xl overflow-hidden border border-gray-100">
            {categories.map((cat) => (
              <div key={cat.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-b-0">
                {editingId === cat.id ? (
                  <>
                    <input type="text" value={editEmoji} onChange={e => setEditEmoji(e.target.value)} maxLength={2}
                      className="w-10 text-center text-xl bg-gray-50 border border-gray-200 rounded-lg outline-none" />
                    <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                      className="flex-1 text-sm px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg outline-none" />
                    <button onClick={() => { onUpdateCat({...cat, name:editName, emoji:editEmoji}); setEditingId(null); }}
                      className="text-xs text-indigo-500 font-semibold">保存</button>
                    <button onClick={() => setEditingId(null)} className="text-xs text-gray-400">×</button>
                  </>
                ) : (
                  <>
                    <span className="text-xl">{cat.emoji}</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800">{cat.name}</p>
                      <p className="text-xs text-gray-400">{cat.type === "expense" ? "支出" : "収入"}</p>
                    </div>
                    <button onClick={() => { setEditingId(cat.id); setEditName(cat.name); setEditEmoji(cat.emoji); }}
                      className="text-xs text-gray-400 hover:text-indigo-500 px-2">✏️</button>
                    <button onClick={() => { if(window.confirm(`「${cat.name}」を削除しますか？`)) onDeleteCat(cat.id); }}
                      className="text-gray-300 hover:text-rose-400 text-xl">×</button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 学習ルール タブ ── */}
      {tab === "rules" && (
        <div className="px-4 py-4">
          <p className="text-sm font-bold text-gray-700 mb-3">学習ルール（{learnedRules.length}件）</p>
          {learnedRules.length === 0 ? (
            <EmptyState icon="🧠" title="学習ルールなし" desc="OCR・手動入力でカテゴリを選ぶと自動で学習されます" />
          ) : (
            <div className="bg-white rounded-2xl overflow-hidden border border-gray-100">
              {learnedRules.map((r, i) => (
                <div key={r.id} className="flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-b-0">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-600">{i+1}</div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">「{r.keywords[0]}」</p>
                      <p className="text-xs text-gray-400">→ {r.category}</p>
                    </div>
                  </div>
                  <button onClick={() => onDeleteRule(r.id)} className="text-gray-300 hover:text-rose-400 text-xl">×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── データ タブ ── */}
      {tab === "data" && (
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
          <div className="rounded-2xl overflow-hidden border border-rose-200">
            <div className="bg-rose-50 px-4 py-3 border-b border-rose-200">
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
      )}
    </div>
  );
}
