import { useState } from "react";
import { CSV_SOURCES_ALL } from "../../../constants";

const DEFAULT_SHORTS = Object.fromEntries(CSV_SOURCES_ALL.map(s => [s.id, s.short]));

const loadDefaultShares = () => {
  try { return JSON.parse(localStorage.getItem("kakeibo_csv_default_share") || "{}"); } catch { return {}; }
};
const saveDefaultShares = (obj) => {
  try { localStorage.setItem("kakeibo_csv_default_share", JSON.stringify(obj)); } catch {}
};

const SHARE_TYPES = [
  { val: "shared",   label: "🤝 共有", color: "bg-indigo-500" },
  { val: "personal", label: "👤 個人", color: "bg-rose-400"   },
  { val: "partner",  label: "👥 相手", color: "bg-purple-500" },
];

const loadCsvSourceLabels = () => {
  try { const s = localStorage.getItem("kakeibo_csv_source_labels"); return s ? JSON.parse(s) : {}; } catch { return {}; }
};
const saveCsvSourceLabels = (obj) => {
  try { localStorage.setItem("kakeibo_csv_source_labels", JSON.stringify(obj)); } catch {}
};

export function CsvSourcesTab({ activeCsvSources, onActiveCsvSourcesChange }) {
  const active   = new Set(activeCsvSources || CSV_SOURCES_ALL.map(s => s.id));
  const [labels,        setLabels]       = useState(() => loadCsvSourceLabels());
  const [defaultShares, setDefaultShares] = useState(() => loadDefaultShares());
  const [editing,  setEditing]  = useState(null); // 編集中のid
  const [editVal,  setEditVal]  = useState("");

  const toggle = (id) => {
    const next = new Set(active);
    next.has(id) ? next.delete(id) : next.add(id);
    onActiveCsvSourcesChange?.([...next]);
  };

  const setDefaultShare = (id, val) => {
    const next = { ...defaultShares, [id]: val };
    setDefaultShares(next);
    saveDefaultShares(next);
  };

  const startEdit = (id) => {
    setEditing(id);
    setEditVal(labels[id] || DEFAULT_SHORTS[id] || id.toUpperCase().slice(0,4));
  };

  const saveEdit = (id) => {
    const trimmed = editVal.trim().slice(0, 6);
    const next = { ...labels };
    if (trimmed && trimmed !== DEFAULT_SHORTS[id]) next[id] = trimmed;
    else delete next[id];
    setLabels(next);
    saveCsvSourceLabels(next);
    setEditing(null);
  };

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
        <p className="text-xs font-semibold text-blue-700 mb-1">📋 使い方</p>
        <p className="text-xs text-blue-500 leading-relaxed">
          使用しているカード・銀行口座をONにしてください。ONのものだけがホーム画面の「CSV取り込み状況」に表示されます。短縮名は取引一覧のバッジに表示されます。
        </p>
      </div>

      <div className="bg-white rounded-2xl overflow-hidden border border-gray-100">
        {CSV_SOURCES_ALL.map(src => {
          const isActive   = active.has(src.id);
          const shortLabel = labels[src.id] || src.short;
          const isEditing  = editing === src.id;
          return (
            <div key={src.id}
              className={`px-4 py-3 border-b border-gray-50 last:border-b-0 transition-colors ${isActive ? "bg-white" : "bg-gray-50"}`}>
              <div className="flex items-center gap-3">
                <span className="text-2xl">{src.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${isActive ? "text-gray-800" : "text-gray-400"}`}>{src.label}</p>
                  {/* 短縮名編集 */}
                  {isEditing ? (
                    <div className="flex items-center gap-1 mt-1">
                      <input
                        value={editVal}
                        onChange={e => setEditVal(e.target.value)}
                        maxLength={6}
                        className="w-20 text-xs border border-indigo-300 rounded px-1.5 py-0.5"
                        autoFocus
                      />
                      <button onClick={() => saveEdit(src.id)} className="text-xs text-indigo-500 font-semibold">保存</button>
                      <button onClick={() => setEditing(null)} className="text-xs text-gray-400">キャンセル</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-semibold">{shortLabel}</span>
                      <button onClick={() => startEdit(src.id)} className="text-xs text-gray-400 underline">変更</button>
                    </div>
                  )}
                  {/* デフォルトshareType */}
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    {SHARE_TYPES.map(({ val, label, color }) => (
                      <button key={val}
                        onClick={() => setDefaultShare(src.id, val)}
                        className={`text-xs px-2 py-0.5 rounded-full font-semibold transition-all ${
                          (defaultShares[src.id] || "shared") === val
                            ? `${color} text-white`
                            : "bg-gray-100 text-gray-400"
                        }`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* トグルスイッチ */}
                <button
                  onClick={() => toggle(src.id)}
                  className={`relative w-12 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${isActive ? "bg-indigo-500" : "bg-gray-200"}`}>
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${isActive ? "left-7" : "left-1"}`} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onActiveCsvSourcesChange?.(CSV_SOURCES_ALL.map(s => s.id))}
          className="flex-1 py-2.5 rounded-xl text-xs font-semibold border border-gray-200 bg-white text-gray-600">
          すべてON
        </button>
        <button
          onClick={() => onActiveCsvSourcesChange?.([])}
          className="flex-1 py-2.5 rounded-xl text-xs font-semibold border border-gray-200 bg-white text-gray-400">
          すべてOFF
        </button>
      </div>

      <p className="text-xs text-gray-400 text-center">
        {active.size}件 / {CSV_SOURCES_ALL.length}件が管理対象
      </p>
    </div>
  );
}
