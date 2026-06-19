import { useState } from "react";

export function ShareTab({ shareId, inviteUrl, onJoinShare, syncStatus }) {
  const [inviteInput, setInviteInput] = useState("");

  return (
    <div className="px-4 py-4 space-y-4">
      <div className={`rounded-xl p-4 border ${
        syncStatus === "synced"  ? "bg-emerald-50 border-emerald-200" :
        syncStatus === "error"   ? "bg-rose-50 border-rose-200" :
        "bg-amber-50 border-amber-200"
      }`}>
        <p className="text-sm font-bold text-gray-700">
          {syncStatus === "synced"  ? "✅ Supabase同期中"   :
           syncStatus === "syncing" ? "🔄 同期中..."        :
           syncStatus === "error"   ? "⚠️ 同期エラー"       : ""}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">データはリアルタイムでクラウドに保存されています</p>
      </div>

      <div className="bg-white rounded-2xl p-4 border border-gray-100 space-y-3">
        <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">📤 パートナーを招待</p>
        <p className="text-xs text-gray-500 leading-relaxed">
          以下のリンクをパートナーに送ってください。リンクを開くだけで同じデータにアクセスできます。
        </p>
        <div className="bg-gray-50 rounded-xl px-3 py-2 border border-gray-200">
          <p className="text-xs text-gray-600 font-mono break-all">{inviteUrl}</p>
        </div>
        <button
          onClick={() => { navigator.clipboard.writeText(inviteUrl); alert("リンクをコピーしました！\nLINEなどでパートナーに送ってください。"); }}
          className="w-full py-3 bg-indigo-500 text-white rounded-xl text-sm font-bold">
          📋 招待リンクをコピー
        </button>
      </div>

      <div className="bg-white rounded-2xl p-4 border border-gray-100 space-y-3">
        <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">📥 共有グループに参加</p>
        <p className="text-xs text-gray-500">招待リンクを直接開けない場合は、共有IDを入力してください。</p>
        <input type="text" value={inviteInput} onChange={e => setInviteInput(e.target.value)}
          placeholder="共有ID（UUID形式）"
          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-300 font-mono" />
        <button
          onClick={() => {
            if (!inviteInput.trim()) return;
            const ok = window.confirm("このデバイスを共有グループに参加させますか？\n※ 現在のデータは共有グループのデータに切り替わります。");
            if (ok) { onJoinShare?.(inviteInput.trim()); setInviteInput(""); }
          }}
          className="w-full py-2.5 bg-white border border-gray-300 text-gray-700 rounded-xl text-sm font-medium">
          参加する
        </button>
      </div>

      <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
        <p className="text-xs font-semibold text-gray-500 mb-1">現在の共有ID</p>
        <p className="text-xs text-gray-400 font-mono break-all">{shareId}</p>
      </div>
    </div>
  );
}
