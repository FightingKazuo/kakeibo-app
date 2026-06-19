import { useState, useRef } from "react";
import { DEFAULT_CATEGORY_RULES, STORAGE_KEYS } from "../../constants";
import { removeStorage } from "../../utils/storage";
import { fmtCurrency } from "../../utils/format";
import { PrimaryButton } from "../ui/PrimaryButton";
import { EmptyState } from "../ui/EmptyState";
import { getTransferKeywords, learnTransferKeyword, removeTransferKeyword } from "../../services/csvParser";
import { EmojiPicker } from "../common/EmojiPicker";
import { getAllTaxRules, removeTaxRule } from "../../services/taxLearning";

export function SettingsPage({
  categories, onAddCat, onUpdateCat, onDeleteCat,
  learnedRules, onDeleteRule,
  transactions, onAdd,
  onReset,
  members, onUpdateMember, onAddMember, onDeleteMember,
  pointAccounts, onAddPointAccount, onUpdatePointAccount, onDeletePointAccount,
  shareId, inviteUrl, onJoinShare, syncStatus,
}) {
  const [tab,        setTab]       = useState("categories");
  const [showAdd,    setShowAdd]   = useState(false);
  const [newName,    setNewName]   = useState("");
  const [newEmoji,   setNewEmoji]  = useState("📦");
  const [newType,    setNewType]   = useState("expense");
  const [editingId,  setEditingId] = useState(null);
  const [editName,   setEditName]  = useState("");
  const [editEmoji,  setEditEmoji] = useState("");
  const [editBudget, setEditBudget]= useState("");
  const [restoreMsg, setRestoreMsg]= useState("");

  // メンバー編集用
  const [editingMemberId,   setEditingMemberId]   = useState(null);
  const [editingMemberName, setEditingMemberName] = useState("");
  const [showAddMember,     setShowAddMember]     = useState(false);
  const [newMemberName,     setNewMemberName]     = useState("");

  // ポイント口座編集用
  const [editingPointId,   setEditingPointId]   = useState(null);
  const [editingPointName, setEditingPointName] = useState("");
  const [editingPointIcon, setEditingPointIcon] = useState("");
  const [editingPointUnit, setEditingPointUnit] = useState("");
  const [showAddPoint,     setShowAddPoint]     = useState(false);
  const [newPointName,     setNewPointName]     = useState("");
  const [newPointIcon,     setNewPointIcon]     = useState("⭐");
  const [newPointUnit,     setNewPointUnit]     = useState("pt");

  // 共有設定用
  const [inviteInput, setInviteInput] = useState("");

  // 絵文字ピッカー
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiPickerFor,  setEmojiPickerFor]  = useState(null); // "new" | catId

  // 振替キーワード管理用
  const [transferKws,    setTransferKws]    = useState(() => getTransferKeywords());
  const [newTransferKw,  setNewTransferKw]  = useState("");

  // ポイント残高手動調整用
  const [pointAdjust,     setPointAdjust]     = useState({});  // { [accountId]: 入力値 }
  const [pointAdjustDate, setPointAdjustDate] = useState(() => new Date().toISOString().slice(0, 10));

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
    const header = "日付,種別,カテゴリ,内容,金額,登録元,支払者,支払方法";
    const rows = transactions.map(t => [
      t.date, t.type === "income" ? "収入" : "支出", t.category,
      `"${(t.label || "").replace(/"/g, '""')}"`,
      t.amount, t.source || "manual", t.paidBy || "",
      t.paymentMethod || "cash",
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
    { id:"categories",    label:"カテゴリ"    },
    { id:"members",       label:"メンバー"    },
    { id:"points",        label:"ポイント口座" },
    { id:"share",         label:"共有設定"    },
    { id:"datalinks",     label:"データ取得"  },
    { id:"transfer",      label:"振替設定"    },
    { id:"taxrules",      label:"消費税学習"  },
    { id:"rules",         label:"学習ルール"   },
    { id:"backup",        label:"バックアップ" },
    { id:"data",          label:"データ"       },
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

      {/* ── 消費税学習 タブ ── */}
      {tab === "taxrules" && (() => {
        const taxRules = getAllTaxRules();
        const entries  = Object.entries(taxRules);
        return (
          <div className="px-4 py-4 space-y-4">
            <p className="text-xs text-gray-500 leading-relaxed">
              OCRレシート登録時に品目合計とレシート合計の差額から自動学習した税率情報です。
            </p>
            {entries.length === 0 ? (
              <div className="bg-gray-50 rounded-2xl p-6 text-center border border-gray-100">
                <p className="text-3xl mb-2">🧾</p>
                <p className="text-sm font-semibold text-gray-600">学習データなし</p>
                <p className="text-xs text-gray-400 mt-1">品目付きのレシートをOCRで登録すると自動学習されます</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl overflow-hidden border border-gray-100">
                {entries.map(([store, rule]) => (
                  <div key={store} className="flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-b-0">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{store}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {rule.type === "inclusive" ? "税込み表示" :
                         rule.type === "exclusive" ? `税抜き（${Math.round(rule.rate * 100)}%）` :
                         rule.type === "mixed"     ? `軽減税率混在（${Math.round(rule.rate * 100)}%）` : ""}
                        · {rule.samples}回学習 · {rule.learnedAt?.slice(0, 10)}
                      </p>
                    </div>
                    <button
                      onClick={() => { removeTaxRule(store); }}
                      className="text-gray-300 hover:text-rose-400 text-xl">×</button>
                  </div>
                ))}
              </div>
            )}
            <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
              <p className="text-xs font-semibold text-blue-600 mb-1">💡 学習の仕組み</p>
              <p className="text-xs text-blue-500 leading-relaxed">
                品目合計とレシート合計の差から税率を自動推定します。同じ店で複数回登録するほど精度が上がります。
              </p>
            </div>
          </div>
        );
      })()}

      {/* ── 振替設定 タブ ── */}
      {tab === "transfer" && (
        <div className="px-4 py-4 space-y-4">
          <p className="text-xs text-gray-500 leading-relaxed">
            銀行明細CSVの取り込み時に「振替」として自動判定するキーワードを管理します。振替は支出・収入に計上されません。
          </p>

          {/* キーワード追加 */}
          <div className="flex gap-2">
            <input type="text" value={newTransferKw} onChange={e => setNewTransferKw(e.target.value)}
              placeholder="例: SBIハイブリッド預金"
              className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
            <button
              onClick={() => {
                if (!newTransferKw.trim()) return;
                learnTransferKeyword(newTransferKw.trim());
                setTransferKws(getTransferKeywords());
                setNewTransferKw("");
              }}
              className="px-4 py-2 bg-indigo-500 text-white rounded-xl text-sm font-semibold">
              追加
            </button>
          </div>

          {/* キーワード一覧 */}
          <div className="bg-white rounded-2xl overflow-hidden border border-gray-100">
            {transferKws.map((kw, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-b-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm">🔄</span>
                  <p className="text-sm text-gray-700">{kw}</p>
                </div>
                <button
                  onClick={() => {
                    removeTransferKeyword(kw);
                    setTransferKws(getTransferKeywords());
                  }}
                  className="text-gray-300 hover:text-rose-400 text-xl">×</button>
              </div>
            ))}
          </div>

          <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
            <p className="text-xs font-semibold text-blue-600 mb-1">💡 使い方</p>
            <p className="text-xs text-blue-500 leading-relaxed">
              取引一覧の「⋮」ボタンから「振替とする」を選ぶと、そのキーワードが自動で学習されます。次回CSVインポート時から自動除外されます。
            </p>
          </div>
        </div>
      )}

      {/* ── データ取得リンク タブ ── */}
      {tab === "datalinks" && (
        <div className="px-4 py-4 space-y-3">
          <p className="text-xs text-gray-500 leading-relaxed">
            各サービスのダウンロードページへ直接移動できます。ファイルをダウンロード後、追加 → CSVインポートで取り込んでください。
          </p>
          {[
            {
              name: "エポスカード",
              icon: "💳",
              desc: "利用明細PDF（月次）",
              url:  "https://www.eposcard.co.jp/memberservice/pc/paymentamountreference/disp_use_detail_preload.do",
              color: "bg-red-50 border-red-200 text-red-700",
            },
            {
              name: "三井住友カード",
              icon: "💳",
              desc: "Web明細CSV",
              url:  "https://www.smbc-card.com/memx/web_meisai/top/index.html",
              color: "bg-green-50 border-green-200 text-green-700",
            },
            {
              name: "住信SBIネット銀行",
              icon: "🏦",
              desc: "入出金明細CSV",
              url:  "https://www.netbk.co.jp/contents/pages/wpl020201C/i020201CT/DI02020150",
              color: "bg-blue-50 border-blue-200 text-blue-700",
            },
            {
              name: "SBI証券",
              icon: "📈",
              desc: "保有証券一覧CSV（SaveFile.csv）",
              url:  "https://site3.sbisec.co.jp/ETGate/?_ControlID=WPLETacR002Control&_PageID=DefaultPID&getFlg=on",
              color: "bg-emerald-50 border-emerald-200 text-emerald-700",
            },
            {
              name: "JCBカード",
              icon: "💳",
              desc: "利用明細CSV",
              url:  "https://my.jcb.co.jp/iss-pc/member/details_inquiry/detail.html",
              color: "bg-orange-50 border-orange-200 text-orange-700",
            },
            {
              name: "Amazon注文履歴",
              icon: "📦",
              desc: "注文履歴レポート（数日かかる場合あり）",
              url:  "https://www.amazon.co.jp/hz/privacy-central/data-requests/preview.html",
              color: "bg-yellow-50 border-yellow-200 text-yellow-700",
            },
            {
              name: "PayPay",
              icon: "📱",
              desc: "アプリからのみ申請可能",
              url:  null,
              color: "bg-gray-50 border-gray-200 text-gray-500",
            },
          ].map(item => (
            <div key={item.name} className={`rounded-xl p-3.5 border ${item.color}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{item.icon}</span>
                  <div>
                    <p className="text-sm font-bold">{item.name}</p>
                    <p className="text-xs opacity-70 mt-0.5">{item.desc}</p>
                  </div>
                </div>
                {item.url ? (
                  <a href={item.url} target="_blank" rel="noopener noreferrer"
                    className="px-3 py-2 bg-white rounded-lg text-xs font-semibold border border-current opacity-80 hover:opacity-100 whitespace-nowrap">
                    開く →
                  </a>
                ) : (
                  <span className="px-3 py-2 text-xs opacity-50">アプリのみ</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── 共有設定 タブ ── */}
      {tab === "share" && (
        <div className="px-4 py-4 space-y-4">

          {/* 同期ステータス */}
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

          {/* 招待リンク */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100 space-y-3">
            <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">📤 パートナーを招待</p>
            <p className="text-xs text-gray-500 leading-relaxed">
              以下のリンクをパートナーに送ってください。リンクを開くだけで同じデータにアクセスできます。
            </p>
            <div className="bg-gray-50 rounded-xl px-3 py-2 border border-gray-200">
              <p className="text-xs text-gray-600 font-mono break-all">{inviteUrl}</p>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(inviteUrl);
                alert("リンクをコピーしました！\nLINEなどでパートナーに送ってください。");
              }}
              className="w-full py-3 bg-indigo-500 text-white rounded-xl text-sm font-bold">
              📋 招待リンクをコピー
            </button>
          </div>

          {/* 共有IDで参加 */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100 space-y-3">
            <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">📥 共有グループに参加</p>
            <p className="text-xs text-gray-500">招待リンクを直接開けない場合は、共有IDを入力してください。</p>
            <input
              type="text"
              value={inviteInput}
              onChange={e => setInviteInput(e.target.value)}
              placeholder="共有ID（UUID形式）"
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-300 font-mono"
            />
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

          {/* 現在の共有ID */}
          <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
            <p className="text-xs font-semibold text-gray-500 mb-1">現在の共有ID</p>
            <p className="text-xs text-gray-400 font-mono break-all">{shareId}</p>
          </div>
        </div>
      )}

      {/* ── ポイント口座 タブ ── */}
      {tab === "points" && (
        <div className="px-4 py-4 space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm font-bold text-gray-700">ポイント口座一覧</p>
            <button onClick={() => setShowAddPoint(p => !p)}
              className="text-xs font-semibold text-indigo-500 bg-indigo-50 px-3 py-1.5 rounded-full">
              {showAddPoint ? "キャンセル" : "+ 追加"}
            </button>
          </div>

          {showAddPoint && (
            <div className="bg-indigo-50 rounded-2xl p-4 border border-indigo-100 space-y-3">
              <div className="flex gap-2">
                <input type="text" value={newPointIcon} onChange={e => setNewPointIcon(e.target.value)} maxLength={2}
                  className="w-12 text-center text-2xl bg-white border border-indigo-200 rounded-xl py-2 outline-none" />
                <input type="text" value={newPointName} onChange={e => setNewPointName(e.target.value)}
                  placeholder="口座名（例: Tポイント）"
                  className="flex-1 px-3 py-2 bg-white border border-indigo-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
              <div className="flex gap-2 items-center">
                <p className="text-xs text-gray-500">単位：</p>
                {["pt", "円"].map(u => (
                  <button key={u} onClick={() => setNewPointUnit(u)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${newPointUnit === u ? "bg-indigo-500 text-white border-indigo-500" : "bg-white text-gray-500 border-gray-200"}`}>
                    {u}
                  </button>
                ))}
              </div>
              <PrimaryButton onClick={() => {
                if (!newPointName.trim()) return;
                onAddPointAccount({ id: `pa_${Date.now()}`, name: newPointName.trim(), icon: newPointIcon, unit: newPointUnit, balance: 0 });
                setNewPointName(""); setNewPointIcon("⭐"); setNewPointUnit("pt"); setShowAddPoint(false);
              }}>追加する</PrimaryButton>
            </div>
          )}

          <div className="bg-white rounded-2xl overflow-hidden border border-gray-100">
            {(pointAccounts || []).map(a => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-b-0">
                {editingPointId === a.id ? (
                  <>
                    <input type="text" value={editingPointIcon} onChange={e => setEditingPointIcon(e.target.value)} maxLength={2}
                      className="w-10 text-center text-xl bg-gray-50 border border-gray-200 rounded-lg outline-none" />
                    <input type="text" value={editingPointName} onChange={e => setEditingPointName(e.target.value)}
                      className="flex-1 text-sm px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg outline-none" />
                    <button onClick={() => {
                      if (editingPointName.trim()) onUpdatePointAccount({ ...a, name: editingPointName.trim(), icon: editingPointIcon, unit: editingPointUnit });
                      setEditingPointId(null);
                    }} className="text-xs text-indigo-500 font-semibold">保存</button>
                    <button onClick={() => setEditingPointId(null)} className="text-xs text-gray-400">×</button>
                  </>
                ) : (
                  <>
                    <span className="text-xl">{a.icon}</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800">{a.name}</p>
                      <p className="text-xs text-gray-400">
                        残高：
                        <span className={`font-semibold ${a.balance >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                          {a.balance.toLocaleString()}{a.unit}
                        </span>
                      </p>
                    </div>
                    <button onClick={() => { setEditingPointId(a.id); setEditingPointName(a.name); setEditingPointIcon(a.icon); setEditingPointUnit(a.unit); }}
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
              <input type="date" value={pointAdjustDate} onChange={e => setPointAdjustDate(e.target.value)}
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
                  <input
                    type="number"
                    value={pointAdjust[a.id] ?? ""}
                    onChange={e => setPointAdjust(p => ({ ...p, [a.id]: e.target.value }))}
                    placeholder="実際の残高（円）"
                    className="flex-1 text-sm px-3 py-2 bg-white border border-gray-200 rounded-lg outline-none"
                  />
                  <button
                    onClick={() => {
                      const actual = Number(pointAdjust[a.id]);
                      if (isNaN(actual) || pointAdjust[a.id] === "") return;
                      const diff = actual - a.balance;
                      if (Math.abs(diff) < 1) { alert("差額がありません"); return; }
                      onAdd?.({
                        date:     pointAdjustDate,
                        label:    `${a.name} 残高調整`,
                        category: "その他",
                        amount:   diff,
                        type:     diff > 0 ? "income" : "expense",
                        source:   "manual",
                        pointAccountId: a.id,
                        paymentMethod:  a.id,
                      });
                      setPointAdjust(p => ({ ...p, [a.id]: "" }));
                      alert(`✅ ${a.name}に¥${Math.abs(diff).toLocaleString()}の${diff > 0 ? "収入" : "支出"}を記録しました`);
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
      )}

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
              <input type="text" value={newMemberName} onChange={e => setNewMemberName(e.target.value)} placeholder="名前を入力"
                className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
              <PrimaryButton onClick={() => {
                if (!newMemberName.trim()) return;
                onAddMember({ id: `m_${Date.now()}`, name: newMemberName.trim() });
                setNewMemberName(""); setShowAddMember(false);
              }}>追加する</PrimaryButton>
            </div>
          )}
          <div className="bg-white rounded-2xl overflow-hidden border border-gray-100">
            {(members || []).map(m => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-b-0">
                {editingMemberId === m.id ? (
                  <>
                    <input type="text" value={editingMemberName} onChange={e => setEditingMemberName(e.target.value)}
                      className="flex-1 text-sm px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg outline-none" />
                    <button onClick={() => { if (editingMemberName.trim()) onUpdateMember({ ...m, name: editingMemberName.trim() }); setEditingMemberId(null); }}
                      className="text-xs text-indigo-500 font-semibold">保存</button>
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
        </div>
      )}

      {/* ── バックアップ タブ ── */}
      {tab === "backup" && (
        <div className="px-4 py-4 space-y-4">
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <p className="text-xs font-semibold text-gray-500 mb-3">📊 ストレージ使用量</p>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-gray-800">{storageUsed} MB / 5 MB</span>
              <span className={`text-xs font-semibold ${storageRatio > 70 ? "text-rose-500" : storageRatio > 40 ? "text-amber-500" : "text-emerald-500"}`}>{storageRatio}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div className={`h-2 rounded-full transition-all ${storageRatio > 70 ? "bg-rose-400" : storageRatio > 40 ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${storageRatio}%` }} />
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
                <button
                  onClick={() => { setEmojiPickerFor("new"); setShowEmojiPicker(true); }}
                  className="w-12 h-12 text-2xl bg-white border border-indigo-200 rounded-xl flex items-center justify-center hover:bg-indigo-100 transition-all">
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
          <div className="bg-white rounded-2xl overflow-hidden border border-gray-100">
            {categories.map(cat => (
              <div key={cat.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-b-0">
                {editingId === cat.id ? (
                  <>
                    <button
                      onClick={() => { setEmojiPickerFor(cat.id); setShowEmojiPicker(true); }}
                      className="w-10 h-10 text-xl bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-center hover:bg-gray-100">
                      {editEmoji}
                    </button>
                    <div className="flex-1 flex flex-col gap-1.5">
                      <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                        className="w-full text-sm px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg outline-none" />
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-400">月予算 ¥</span>
                        <input type="number" value={editBudget} onChange={e => setEditBudget(e.target.value)}
                          placeholder="未設定"
                          className="flex-1 text-xs px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg outline-none" />
                      </div>
                    </div>
                    <button onClick={() => { onUpdateCat({...cat, name:editName, emoji:editEmoji, budget: editBudget ? Number(editBudget) : null}); setEditingId(null); }} className="text-xs text-indigo-500 font-semibold">保存</button>
                    <button onClick={() => setEditingId(null)} className="text-xs text-gray-400">×</button>
                  </>
                ) : (
                  <>
                    <span className="text-xl">{cat.emoji}</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800">{cat.name}</p>
                      <p className="text-xs text-gray-400">
                        {cat.type === "expense" ? "支出" : "収入"}
                        {cat.budget ? <span className="ml-1.5 text-indigo-400">予算 ¥{cat.budget.toLocaleString()}</span> : null}
                      </p>
                    </div>
                    <button onClick={() => { setEditingId(cat.id); setEditName(cat.name); setEditEmoji(cat.emoji); setEditBudget(cat.budget ?? ""); }} className="text-xs text-gray-400 hover:text-indigo-500 px-2">✏️</button>
                    <button onClick={() => { if(window.confirm(`「${cat.name}」を削除しますか？`)) onDeleteCat(cat.id); }} className="text-gray-300 hover:text-rose-400 text-xl">×</button>
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

      {/* ── 絵文字ピッカーモーダル ── */}
      {showEmojiPicker && (
        <EmojiPicker
          value={emojiPickerFor === "new" ? newEmoji : editEmoji}
          onChange={(emoji) => {
            if (emojiPickerFor === "new") setNewEmoji(emoji);
            else setEditEmoji(emoji);
          }}
          onClose={() => { setShowEmojiPicker(false); setEmojiPickerFor(null); }}
        />
      )}
    </div>
  );
}
