import { useState, useEffect, useCallback, useRef } from "react";
import { STORAGE_KEYS, DEFAULT_CATS, DEFAULT_CATEGORY_RULES, DEFAULT_MEMBERS, DEFAULT_POINT_ACCOUNTS } from "./constants";
import { SAMPLE_TX } from "./data/sampleData";
import { loadStorage, saveStorage, clearAllStorage } from "./utils/storage";
import { learnCategoryRule } from "./services/categoryPredictor";
import { normalizeTransaction } from "./services/transaction";
import {
  getShareId, setShareId,
  fetchTransactions, upsertTransaction, deleteTransaction, upsertTransactions,
  fetchCategories, fetchLearnedRules, fetchMembers, fetchPointAccounts,
  saveCategories, saveLearnedRules, saveMembers, savePointAccounts,
  testConnection,
} from "./utils/supabase";
import { learnTransferKeyword } from "./services/csvParser";

import { HomePage }            from "./components/home/HomePage";
import { TransactionListPage } from "./components/transactions/TransactionListPage";
import { AddPage }             from "./components/add/AddPage";
import { EditPage }            from "./components/add/EditPage";
import { AnalysisPage }        from "./components/analysis/AnalysisPage";
import { AssetsPage }          from "./components/assets/AssetsPage";
import { SettingsPage }        from "./components/settings/SettingsPage";
import { BottomNav }           from "./components/layout/BottomNav";

const NAV_ITEMS = [
  { id: "home",     icon: "🏠", label: "ホーム"   },
  { id: "list",     icon: "📋", label: "一覧"     },
  { id: "add",      icon: "➕", label: "追加"     },
  { id: "analysis", icon: "📊", label: "分析"     },
  { id: "assets",   icon: "💰", label: "資産"     },
  { id: "settings", icon: "⚙️", label: "設定"     },
];

function SideNav({ currentPage, onNavigate, syncStatus }) {
  return (
    <aside className="hidden md:flex flex-col w-56 min-h-screen bg-white border-r border-gray-200 fixed left-0 top-0 z-40">
      <div className="px-6 py-6 border-b border-gray-100">
        <p className="text-lg font-bold text-indigo-600">💰 家計簿</p>
        <p className="text-xs text-gray-400 mt-0.5">kakeibo app</p>
        {syncStatus && (
          <p className={`text-xs mt-1 font-medium ${
            syncStatus === "synced"  ? "text-emerald-500" :
            syncStatus === "syncing" ? "text-amber-500"   :
            syncStatus === "error"   ? "text-rose-500"    : "text-gray-400"
          }`}>
            {syncStatus === "synced"  ? "✅ 同期済み"   :
             syncStatus === "syncing" ? "🔄 同期中..."  :
             syncStatus === "error"   ? "⚠️ 同期エラー" : ""}
          </p>
        )}
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(item => (
          <button key={item.id} onClick={() => onNavigate(item.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200
              ${currentPage === item.id ? "bg-indigo-50 text-indigo-600 font-semibold" : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"}`}>
            <span className="text-xl">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

export default function App() {
  const [currentPage,   setCurrentPage]   = useState("home");
  const [syncStatus,    setSyncStatus]    = useState("synced");
  const [shareId,       setShareIdState]  = useState(() => getShareId());
  const [isLoading,     setIsLoading]     = useState(true);
  const [showInvite,    setShowInvite]    = useState(false);
  const [inviteInput,   setInviteInput]   = useState("");

  const [transactions,  setTransactions]  = useState([]);
  const [categories,    setCategories]    = useState(DEFAULT_CATS);
  const [learnedRules,  setLearnedRules]  = useState([]);
  const [members,       setMembers]       = useState(DEFAULT_MEMBERS);
  const [pointAccounts, setPointAccounts] = useState(DEFAULT_POINT_ACCOUNTS);
  const [editingTx,     setEditingTx]     = useState(null);

  // ── 初回ロード：Supabaseからデータ取得 ──────────────────
  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const [txs, cats, rules, mems, points] = await Promise.all([
          fetchTransactions(shareId),
          fetchCategories(shareId),
          fetchLearnedRules(shareId),
          fetchMembers(shareId),
          fetchPointAccounts(shareId),
        ]);

        if (txs && txs.length > 0) {
          setTransactions(txs.map(normalizeTransaction).filter(Boolean));
        } else {
          // Supabaseが空なら空で開始（サンプルデータは投入しない）
          setTransactions([]);
        }

        setCategories(cats    || loadStorage(STORAGE_KEYS.CATEGORIES, DEFAULT_CATS));
        setLearnedRules(rules || loadStorage(STORAGE_KEYS.RULES, []));
        setMembers(mems       || loadStorage(STORAGE_KEYS.MEMBERS, DEFAULT_MEMBERS));
        setPointAccounts(points || loadStorage(STORAGE_KEYS.POINT_ACCOUNTS, DEFAULT_POINT_ACCOUNTS));

        setSyncStatus("synced");
      } catch (e) {
        console.error("Supabase load error:", e);
        // フォールバック：localStorage
        setTransactions((loadStorage(STORAGE_KEYS.TRANSACTIONS, SAMPLE_TX) || []).map(normalizeTransaction).filter(Boolean));
        setCategories(loadStorage(STORAGE_KEYS.CATEGORIES, DEFAULT_CATS));
        setLearnedRules(loadStorage(STORAGE_KEYS.RULES, []));
        setMembers(loadStorage(STORAGE_KEYS.MEMBERS, DEFAULT_MEMBERS));
        setPointAccounts(loadStorage(STORAGE_KEYS.POINT_ACCOUNTS, DEFAULT_POINT_ACCOUNTS));
        setSyncStatus("error");
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [shareId]);

  // ── URLパラメータで招待リンクを処理 ──────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inviteId = params.get("share");
    if (inviteId && inviteId !== shareId) {
      const ok = window.confirm(
        `招待リンクが検出されました。\n\nこのデバイスを共有グループに参加させますか？\n\n※ 現在のデータは共有グループのデータに切り替わります。`
      );
      if (ok) {
        setShareId(inviteId);
        setShareIdState(inviteId);
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
  }, []);

  // ── 取引操作 ──────────────────────────────────────────────
  const handleAdd = async (tx) => {
    const normalized = normalizeTransaction(tx);
    setTransactions(p => [normalized, ...p]);
    setSyncStatus("syncing");
    try {
      await upsertTransaction(shareId, normalized);
      setSyncStatus("synced");
    } catch (e) {
      console.error("sync error:", e);
      setSyncStatus("error");
    }
  };

  const handleDelete = async (id) => {
    setTransactions(p => p.filter(t => t.id !== id));
    setSyncStatus("syncing");
    try {
      await deleteTransaction(id);
      setSyncStatus("synced");
    } catch (e) {
      console.error("sync error:", e);
      setSyncStatus("error");
    }
  };

  const handleUpdate = async (tx) => {
    const normalized = normalizeTransaction(tx);
    setTransactions(p => p.map(t => t.id === normalized.id ? normalized : t));
    setEditingTx(null);
    setSyncStatus("syncing");
    try {
      await upsertTransaction(shareId, normalized);
      setSyncStatus("synced");
    } catch (e) {
      console.error("sync error:", e);
      setSyncStatus("error");
    }
  };

  // ── 設定操作（変更時にSupabaseへ保存）────────────────────
  const handleCategoriesChange = async (newCats) => {
    setCategories(newCats);
    try { await saveCategories(shareId, newCats); } catch {}
  };

  const handleLearnedRulesChange = async (newRules) => {
    setLearnedRules(newRules);
    try { await saveLearnedRules(shareId, newRules); } catch {}
  };

  const handleMembersChange = async (newMembers) => {
    setMembers(newMembers);
    try { await saveMembers(shareId, newMembers); } catch {}
  };

  const handlePointAccountsChange = async (newAccounts) => {
    setPointAccounts(newAccounts);
    try { await savePointAccounts(shareId, newAccounts); } catch {}
  };

  const handleLearn = (label, cat, type) => {
    const newRules = learnCategoryRule(label, cat, type, learnedRules);
    handleLearnedRulesChange(newRules);
  };

  const handleDeleteRule = (id) => {
    handleLearnedRulesChange(learnedRules.filter(r => r.id !== id));
  };

  const handleReset = () => { clearAllStorage(); window.location.reload(); };

  // ── ポイント残高計算 ──────────────────────────────────────
  const calcPointBalance = (accountId) =>
    transactions
      .filter(t => t.pointAccountId === accountId)
      .reduce((sum, t) => sum + t.amount, 0);

  const pointAccountsWithBalance = pointAccounts.map(a => ({
    ...a,
    balance: calcPointBalance(a.id),
  }));

  const navigate = (page) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ── 招待リンク生成 ────────────────────────────────────────
  const inviteUrl = `${window.location.origin}?share=${shareId}`;

  // ── ローディング画面 ──────────────────────────────────────
  if (isLoading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-500 rounded-full animate-spin mx-auto" />
        <p className="text-sm text-gray-500">データを読み込み中...</p>
      </div>
    </div>
  );

  if (editingTx) return (
    <div className="min-h-screen bg-gray-50">
      <SideNav currentPage={currentPage} onNavigate={navigate} syncStatus={syncStatus} />
      <div className="md:ml-56">
        <div className="max-w-2xl mx-auto min-h-screen bg-gray-50">
          <EditPage
            transaction={editingTx}
            categories={categories}
            allRules={DEFAULT_CATEGORY_RULES}
            learnedRules={learnedRules}
            members={members}
            pointAccounts={pointAccountsWithBalance}
            onSave={handleUpdate}
            onCancel={() => setEditingTx(null)}
          />
        </div>
      </div>
    </div>
  );

  const renderPage = () => {
    switch (currentPage) {
      case "home":
        return <HomePage transactions={transactions} categories={categories} pointAccounts={pointAccountsWithBalance} onNavigate={navigate} />;
      case "list":
        return <TransactionListPage
          transactions={transactions}
          categories={categories}
          members={members}
          pointAccounts={pointAccountsWithBalance}
          onEdit={setEditingTx}
          onDelete={handleDelete}
          onUpdate={handleUpdate}
          onNavigate={navigate}
        />;
      case "add":
        return <AddPage
          categories={categories}
          existingTransactions={transactions}
          allRules={DEFAULT_CATEGORY_RULES}
          learnedRules={learnedRules}
          members={members}
          pointAccounts={pointAccountsWithBalance}
          onAdd={handleAdd}
          onDelete={handleDelete}
          onLearnRule={handleLearn}
        />;
      case "analysis":
        return <AnalysisPage transactions={transactions} categories={categories} members={members} pointAccounts={pointAccountsWithBalance} onUpdate={handleUpdate} />;
      case "assets":
        return <AssetsPage transactions={transactions} pointAccounts={pointAccountsWithBalance} />;
      case "settings":
        return <SettingsPage
          categories={categories}
          onAddCat={(c)     => handleCategoriesChange([...categories, c])}
          onUpdateCat={(c)  => handleCategoriesChange(categories.map(x => x.id === c.id ? c : x))}
          onDeleteCat={(id) => handleCategoriesChange(categories.filter(x => x.id !== id))}
          learnedRules={learnedRules}
          onDeleteRule={handleDeleteRule}
          transactions={transactions}
          onAdd={handleAdd}
          onReset={handleReset}
          members={members}
          onUpdateMember={(m) => handleMembersChange(members.map(x => x.id === m.id ? m : x))}
          onAddMember={(m)    => handleMembersChange([...members, m])}
          onDeleteMember={(id)=> handleMembersChange(members.filter(x => x.id !== id))}
          pointAccounts={pointAccountsWithBalance}
          onAddPointAccount={(a)    => handlePointAccountsChange([...pointAccounts, a])}
          onUpdatePointAccount={(a) => handlePointAccountsChange(pointAccounts.map(x => x.id === a.id ? { ...x, name: a.name, icon: a.icon, unit: a.unit } : x))}
          onDeletePointAccount={(id)=> handlePointAccountsChange(pointAccounts.filter(x => x.id !== id))}
          // 共有設定
          shareId={shareId}
          inviteUrl={inviteUrl}
          onJoinShare={(id) => { setShareId(id); setShareIdState(id); }}
          syncStatus={syncStatus}
        />;
      default:
        return <HomePage transactions={transactions} categories={categories} pointAccounts={pointAccountsWithBalance} onNavigate={navigate} />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <SideNav currentPage={currentPage} onNavigate={navigate} syncStatus={syncStatus} />
      <div className="md:ml-56">
        <div className={`mx-auto min-h-screen bg-gray-50 relative
          ${currentPage === "home"     ? "max-w-4xl" : ""}
          ${currentPage === "list"     ? "max-w-4xl" : ""}
          ${currentPage === "add"      ? "max-w-2xl" : ""}
          ${currentPage === "analysis" ? "max-w-4xl" : ""}
          ${currentPage === "assets"   ? "max-w-2xl" : ""}
          ${currentPage === "settings" ? "max-w-2xl" : ""}
        `}>
          <main>{renderPage()}</main>
          <BottomNav currentPage={currentPage} onNavigate={navigate} />
        </div>
      </div>
    </div>
  );
}
