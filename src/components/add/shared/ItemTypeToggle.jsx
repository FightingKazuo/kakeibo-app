// ─── 品目タイプトグルボタン ──────────────────────────────────
export function ItemTypeToggle({ type, onChange }) {
  return (
    <div className="flex rounded-lg overflow-hidden border border-gray-200 flex-shrink-0">
      <button onClick={() => onChange("shared")}
        className={`px-2 py-1 text-xs font-medium transition-all ${type === "shared" ? "bg-indigo-500 text-white" : "bg-white text-gray-400"}`}>
        共有
      </button>
      <button onClick={() => onChange("personal")}
        className={`px-2 py-1 text-xs font-medium transition-all ${type === "personal" ? "bg-rose-400 text-white" : "bg-white text-gray-400"}`}>
        個人
      </button>
      <button onClick={() => onChange("partner")}
        className={`px-2 py-1 text-xs font-medium transition-all ${type === "partner" ? "bg-purple-400 text-white" : "bg-white text-gray-400"}`}>
        相手
      </button>
    </div>
  );
}
