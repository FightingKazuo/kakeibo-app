import { useState } from "react";
import { EmptyState } from "../../ui/EmptyState";
import { DEFAULT_CATEGORY_RULES, BANK_CARD_MAPPING } from "../../../constants";
import { getTransferKeywords, learnTransferKeyword, removeTransferKeyword } from "../../../services/csvParser";

const SUBTABS = [
  { id: "learned",    label: "学習ルール",   icon: "🧠" },
  { id: "category",   label: "分類ルール",   icon: "🏷️" },
  { id: "card",       label: "カード対応",   icon: "💳" },
  { id: "transfer",   label: "振替キーワード", icon: "🔄" },
];

export function RulesTab({ learnedRules, onDeleteRule }) {
  const [sub, setSub] = useState("learned");
  const [transferKws, setTransferKws] = useState(() => getTransferKeywords());
  const [newKw, setNewKw] = useState("");

  return (
    <div className="pb-6">
      {/* サブタブ */}
      <div className="flex gap-1.5 px-4 py-3 overflow-x-auto">
        {SUBTABS.map(t => (
          <button key={t.id} onClick={() => setSub(t.id)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
              sub === t.id ? "bg-indigo-500 text-white" : "bg-gray-100 text-gray-500"
            }`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* 学習ルール */}
      {sub === "learned" && (
        <div className="px-4 space-y-3">
          <p className="text-xs text-gray-400">OCR・手動入力でカテゴリを選ぶと自動で学習されます。（{learnedRules.length}件）</p>
          {learnedRules.length === 0 ? (
            <EmptyState emoji="🧠" title="学習ルールなし" desc="OCR・手動入力でカテゴリを選ぶと自動で学習されます" />
          ) : (
            <div className="bg-white rounded-2xl overflow-hidden border border-gray-100">
              {learnedRules.map((r, i) => (
                <div key={r.id} className="flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-b-0">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-600">{i + 1}</div>
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

      {/* カテゴリ分類ルール */}
      {sub === "category" && (
        <div className="px-4 space-y-3">
          <p className="text-xs text-gray-400">店舗名にキーワードが含まれると自動でカテゴリを割り当てます。（{DEFAULT_CATEGORY_RULES.length}件）</p>
          <div className="bg-white rounded-2xl overflow-hidden border border-gray-100">
            {DEFAULT_CATEGORY_RULES.map((r, i) => (
              <div key={r.id} className="px-4 py-3 border-b border-gray-50 last:border-b-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${r.type === "income" ? "bg-emerald-100 text-emerald-600" : "bg-rose-50 text-rose-500"}`}>
                      {r.type === "income" ? "収入" : "支出"}
                    </span>
                    <span className="text-sm font-semibold text-gray-800">→ {r.category}</span>
                    <span className="text-xs text-gray-400">優先度: {r.priority}</span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  {r.keywords.join("、")}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* カード対応マッピング */}
      {sub === "card" && (
        <div className="px-4 space-y-3">
          <p className="text-xs text-gray-400">銀行明細の口座振替キーワードとカードCSVの対応表です。</p>
          <div className="bg-white rounded-2xl overflow-hidden border border-gray-100">
            {BANK_CARD_MAPPING.map((m, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-b-0">
                <div>
                  <p className="text-sm font-medium text-gray-800">💳 {m.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">銀行キーワード: 「{m.bankKeyword}」</p>
                </div>
                <span className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-1 rounded-lg font-mono">
                  {m.formatId}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            ※ カードCSVをインポートすると対応する口座振替は自動スキップされます。
          </p>
        </div>
      )}

      {/* 振替キーワード */}
      {sub === "transfer" && (
        <div className="px-4 space-y-3">
          <p className="text-xs text-gray-400">これらのキーワードを含む行は振替（支出・収入に計上しない）として処理されます。</p>
          <div className="flex gap-2">
            <input type="text" value={newKw} onChange={e => setNewKw(e.target.value)}
              placeholder="例: SBIハイブリッド預金"
              className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
            <button
              onClick={() => {
                if (!newKw.trim()) return;
                learnTransferKeyword(newKw.trim());
                setTransferKws(getTransferKeywords());
                setNewKw("");
              }}
              className="px-4 py-2 bg-indigo-500 text-white rounded-xl text-sm font-semibold">
              追加
            </button>
          </div>
          <div className="bg-white rounded-2xl overflow-hidden border border-gray-100">
            {transferKws.map((kw, i) => {
              const isDefault = ["SBIハイブリッド預金","振替","ことら送金","振込＊コバヤシ","振込手数料","フリカエ　ＰＡＹＰＡＹ","フリカエ PAYPAY","ＳＢＩハイブリッド"].includes(kw);
              return (
                <div key={i} className="flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-b-0">
                  <div className="flex items-center gap-2">
                    {isDefault
                      ? <span className="text-xs bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full">デフォルト</span>
                      : <span className="text-xs bg-indigo-50 text-indigo-500 px-1.5 py-0.5 rounded-full">カスタム</span>
                    }
                    <p className="text-sm text-gray-700">{kw}</p>
                  </div>
                  {!isDefault && (
                    <button onClick={() => {
                      removeTransferKeyword(kw);
                      setTransferKws(getTransferKeywords());
                    }} className="text-gray-300 hover:text-rose-400 text-xl">×</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
