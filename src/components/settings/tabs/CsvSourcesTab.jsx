import { useState } from "react";
import { STORAGE_KEYS } from "../../../constants/storage";

const ALL_CSV_SOURCES = [
  { id: "sbi",     label: "住信SBIネット銀行",  icon: "🏦", desc: "銀行口座の入出金明細" },
  { id: "epos",    label: "エポスカード",         icon: "💳", desc: "クレジットカード利用明細" },
  { id: "smbc",    label: "三井住友カード",       icon: "💳", desc: "クレジットカード利用明細" },
  { id: "paypay",  label: "PayPay",              icon: "💛", desc: "PayPay利用履歴" },
  { id: "recruit", label: "リクルートカード",     icon: "💳", desc: "クレジットカード利用明細" },
  { id: "mufg",    label: "三菱UFJ銀行",          icon: "🏦", desc: "銀行口座の入出金明細" },
];

const loadActive = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.ACTIVE_CSV_SOURCES);
    if (saved) return new Set(JSON.parse(saved));
    // 初回はすべて有効
    return new Set(ALL_CSV_SOURCES.map(s => s.id));
  } catch { return new Set(ALL_CSV_SOURCES.map(s => s.id)); }
};

const saveActive = (set) => {
  try { localStorage.setItem(STORAGE_KEYS.ACTIVE_CSV_SOURCES, JSON.stringify([...set])); } catch {}
};

export function CsvSourcesTab() {
  const [active, setActive] = useState(() => loadActive());

  const toggle = (id) => {
    setActive(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      saveActive(next);
      return next;
    });
  };

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
        <p className="text-xs font-semibold text-blue-700 mb-1">📋 使い方</p>
        <p className="text-xs text-blue-500 leading-relaxed">
          使用しているカード・銀行口座をONにしてください。ONにしたものだけがホーム画面の「CSV取り込み状況」に表示されます。
        </p>
      </div>

      <div className="bg-white rounded-2xl overflow-hidden border border-gray-100">
        {ALL_CSV_SOURCES.map((src, i) => {
          const isActive = active.has(src.id);
          return (
            <div key={src.id}
              className={`flex items-center gap-3 px-4 py-4 border-b border-gray-50 last:border-b-0 transition-colors ${isActive ? "bg-white" : "bg-gray-50"}`}>
              <span className="text-2xl">{src.icon}</span>
              <div className="flex-1">
                <p className={`text-sm font-semibold ${isActive ? "text-gray-800" : "text-gray-400"}`}>
                  {src.label}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{src.desc}</p>
              </div>
              {/* トグルスイッチ */}
              <button
                onClick={() => toggle(src.id)}
                className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${isActive ? "bg-indigo-500" : "bg-gray-200"}`}>
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${isActive ? "left-7" : "left-1"}`} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => { const all = new Set(ALL_CSV_SOURCES.map(s => s.id)); setActive(all); saveActive(all); }}
          className="flex-1 py-2.5 rounded-xl text-xs font-semibold border border-gray-200 bg-white text-gray-600">
          すべてON
        </button>
        <button
          onClick={() => { const none = new Set(); setActive(none); saveActive(none); }}
          className="flex-1 py-2.5 rounded-xl text-xs font-semibold border border-gray-200 bg-white text-gray-400">
          すべてOFF
        </button>
      </div>

      <p className="text-xs text-gray-400 text-center">
        {active.size}件 / {ALL_CSV_SOURCES.length}件が管理対象
      </p>
    </div>
  );
}
