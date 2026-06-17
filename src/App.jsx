import { useState, useEffect } from "react";
import { STORAGE_KEYS, DEFAULT_CATS, DEFAULT_CATEGORY_RULES, DEFAULT_MEMBERS, DEFAULT_POINT_ACCOUNTS } from "./constants";
import { SAMPLE_TX } from "./data/sampleData";
import { loadStorage, saveStorage, clearAllStorage } from "./utils/storage";
import { learnCategoryRule } from "./services/categoryPredictor";
import { normalizeTransaction } from "./services/transaction";

import { HomePage }            from "./components/home/HomePage";
import { TransactionListPage } from "./components/transactions/TransactionListPage";
import { AddPage }             from "./components/add/AddPage";
import { EditPage }            from "./components/add/EditPage";
import { AnalysisPage }        from "./components/analysis/AnalysisPage";
import { SettingsPage }        from "./components/settings/SettingsPage";
import { BottomNav }           from "./components/layout/BottomNav";

const NAV_ITEMS = [
  { id: "home",     icon: "🏠", label: "ホーム"   },
  { id: "list",     icon: "📋", label: "一覧"     },
  { id: "add",      icon: "➕", label: "追加"     },
  { id: "analysis", icon: "📊", label: "分析"     },
  { id: "settings", icon: "⚙️", label: "設定"     },
];

function SideNav({ currentPage, onNavigate }) {
  return (
    <aside className="hidden md:flex flex-col w-56 min-h-screen bg-white border-r border-gray-200 fixed left-0 top-0 z-40">
      <div className="px-6 py-6 border-b border-gray-100">
        <p className="text-lg font-bold text-indigo-600">💰 家計簿</p>
        <p className="text-xs text-gray-400 mt-0.5">kakeibo app</p>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200
              ${currentPage === item.id
                ? "bg-indigo-50 text-indigo-600 font-semibold"
                : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
              }`}
          >
            <span className="text-xl">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

export default function App() {
  const [currentPage,    setCurrentPage]    = useState("home");

  const [transactions,   setTransactions]   = useState(() =>
    (loadStorage(STORAGE_KEYS.TRANSACTIONS, SAMPLE_TX) || [])
      .map(normalizeTransaction)
      .filter(Boolean)
  );
  const [categories,     setCategories]     = useState(() => loadStorage(STORAGE_KEYS.CATEGORIES, DEFAULT_CATS));
  const [learnedRules,   setLearnedRules]   = useState(() => loadStorage(STORAGE_KEYS.RULES, []));
  const [members,        setMembers]        = useState(() => loadStorage(STORAGE_KEYS.MEMBERS, DEFAULT_MEMBERS));
  const [pointAccounts,  setPointAccounts]  = useState(() => loadStorage(STORAGE_KEYS.POINT_ACCOUNTS, DEFAULT_POINT_ACCOUNTS));
  const [editingTx,      setEditingTx]      = useState(null);

  useEffect(() => { saveStorage(STORAGE_KEYS.TRANSACTIONS,   transactions);   }, [transactions]);
  useEffect(() => { saveStorage(STORAGE_KEYS.CATEGORIES,     categories);     }, [categories]);
  useEffect(() => { saveStorage(STORAGE_KEYS.RULES,          learnedRules);   }, [learnedRules]);
  useEffect(() => { saveStorage(STORAGE_KEYS.MEMBERS,        members);        }, [members]);
  useEffect(() => { saveStorage(STORAGE_KEYS.POINT_ACCOUNTS, pointAccounts);  }, [pointAccounts]);

  const handleAdd    = (tx) => setTransactions(p => [normalizeTransaction(tx), ...p]);
  const handleDelete = (id) => setTransactions(p => p.filter(t => t.id !== id));
  const handleUpdate = (tx) => {
    setTransactions(p => p.map(t => t.id === tx.id ? normalizeTransaction(tx) : t));
    setEditingTx(null);
  };
  const handleLearn      = (label, cat, type) => setLearnedRules(p => learnCategoryRule(label, cat, type, p));
  const handleDeleteRule = (id) => setLearnedRules(p => p.filter(r => r.id !== id));
  const handleReset      = () => { clearAllStorage(); window.location.reload(); };

  // ── ポイント口座の残高を取引から自動計算 ──────────────────
  const calcPointBalance = (accountId) => {
    const account = pointAccounts.find(a => a.id === accountId);
    if (!account) return 0;
    return transactions
      .filter(t => t.pointAccountId === accountId)
      .reduce((sum, t) => sum + t.amount, 0);
  };

  const navigate = (page) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ポイント口座に計算済み残高を付与して渡す
  const pointAccountsWithBalance = pointAccounts.map(a => ({
    ...a,
    balance: calcPointBalance(a.id),
  }));

  if (editingTx) return (
    <div className="min-h-screen bg-gray-50">
      <SideNav currentPage={currentPage} onNavigate={navigate} />
      <div className="md:ml-56">
        <div className="max-w-2xl mx-auto min-h-screen bg-gray-50">
          <EditPage
            transaction={editingTx}
            categories={categories}
            allRules={DEFAULT_CATEGORY_RULES}
            learnedRules={learnedRules}
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
        return <HomePage
          transactions={transactions}
          categories={categories}
          pointAccounts={pointAccountsWithBalance}
          onNavigate={navigate}
        />;
      case "list":
        return <TransactionListPage
          transactions={transactions}
          categories={categories}
          onEdit={setEditingTx}
          onDelete={handleDelete}
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
        return <AnalysisPage
          transactions={transactions}
          categories={categories}
          members={members}
          pointAccounts={pointAccountsWithBalance}
        />;
      case "settings":
        return <SettingsPage
          categories={categories}
          onAddCat={(c)     => setCategories(p => [...p, c])}
          onUpdateCat={(c)  => setCategories(p => p.map(x => x.id === c.id ? c : x))}
          onDeleteCat={(id) => setCategories(p => p.filter(x => x.id !== id))}
          learnedRules={learnedRules}
          onDeleteRule={handleDeleteRule}
          transactions={transactions}
          onAdd={handleAdd}
          onReset={handleReset}
          members={members}
          onUpdateMember={(m) => setMembers(p => p.map(x => x.id === m.id ? m : x))}
          onAddMember={(m)    => setMembers(p => [...p, m])}
          onDeleteMember={(id)=> setMembers(p => p.filter(x => x.id !== id))}
          pointAccounts={pointAccountsWithBalance}
          onAddPointAccount={(a)    => setPointAccounts(p => [...p, a])}
          onUpdatePointAccount={(a) => setPointAccounts(p => p.map(x => x.id === a.id ? { ...x, name: a.name, icon: a.icon, unit: a.unit } : x))}
          onDeletePointAccount={(id)=> setPointAccounts(p => p.filter(x => x.id !== id))}
        />;
      default:
        return <HomePage transactions={transactions} categories={categories} pointAccounts={pointAccountsWithBalance} onNavigate={navigate} />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <SideNav currentPage={currentPage} onNavigate={navigate} />
      <div className="md:ml-56">
        <div className={`mx-auto min-h-screen bg-gray-50 relative
          ${currentPage === "home"     ? "max-w-4xl" : ""}
          ${currentPage === "list"     ? "max-w-4xl" : ""}
          ${currentPage === "add"      ? "max-w-2xl" : ""}
          ${currentPage === "analysis" ? "max-w-4xl" : ""}
          ${currentPage === "settings" ? "max-w-2xl" : ""}
        `}>
          <main>{renderPage()}</main>
          <BottomNav currentPage={currentPage} onNavigate={navigate} />
        </div>
      </div>
    </div>
  );
}
