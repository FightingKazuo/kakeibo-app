import { useState, useEffect } from "react";
import { STORAGE_KEYS, DEFAULT_CATS, DEFAULT_CATEGORY_RULES } from "./constants";
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

export default function App() {
  const [currentPage,  setCurrentPage]  = useState("home");

  // ② normalizeTransaction を適用して旧データを新構造に自動変換
  const [transactions, setTransactions] = useState(() =>
    (loadStorage(STORAGE_KEYS.TRANSACTIONS, SAMPLE_TX) || [])
      .map(normalizeTransaction)
      .filter(Boolean)
  );

  const [categories,   setCategories]   = useState(() => loadStorage(STORAGE_KEYS.CATEGORIES, DEFAULT_CATS));
  const [learnedRules, setLearnedRules] = useState(() => loadStorage(STORAGE_KEYS.RULES, []));
  const [editingTx,    setEditingTx]    = useState(null);

  useEffect(() => { saveStorage(STORAGE_KEYS.TRANSACTIONS, transactions); }, [transactions]);
  useEffect(() => { saveStorage(STORAGE_KEYS.CATEGORIES,   categories);   }, [categories]);
  useEffect(() => { saveStorage(STORAGE_KEYS.RULES,        learnedRules); }, [learnedRules]);

  const handleAdd        = (tx) => setTransactions(p => [normalizeTransaction(tx), ...p]);
  const handleDelete     = (id) => setTransactions(p => p.filter(t => t.id !== id));
  const handleUpdate     = (tx) => {
    setTransactions(p => p.map(t => t.id === tx.id ? normalizeTransaction(tx) : t));
    setEditingTx(null);
  };
  const handleLearn      = (label, cat, type) => setLearnedRules(p => learnCategoryRule(label, cat, type, p));
  const handleDeleteRule = (id) => setLearnedRules(p => p.filter(r => r.id !== id));
  const handleReset      = () => { clearAllStorage(); window.location.reload(); };

  const navigate = (page) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (editingTx) return (
    <div className="max-w-md mx-auto min-h-screen bg-gray-50">
      <EditPage
        transaction={editingTx}
        categories={categories}
        allRules={DEFAULT_CATEGORY_RULES}
        learnedRules={learnedRules}
        onSave={handleUpdate}
        onCancel={() => setEditingTx(null)}
      />
    </div>
  );

  const renderPage = () => {
    switch (currentPage) {
      case "home":
        return <HomePage transactions={transactions} categories={categories} onNavigate={navigate} />;
      case "list":
        return <TransactionListPage transactions={transactions} categories={categories} onEdit={setEditingTx} onDelete={handleDelete} onNavigate={navigate} />;
      case "add":
        return (
          <AddPage
            categories={categories}
            existingTransactions={transactions}
            allRules={DEFAULT_CATEGORY_RULES}
            learnedRules={learnedRules}
            onAdd={handleAdd}
            onLearnRule={handleLearn}
          />
        );
      case "analysis":
        return <AnalysisPage transactions={transactions} categories={categories} />;
      case "settings":
        return (
          <SettingsPage
            categories={categories}
            onAddCat={(c)     => setCategories(p => [...p, c])}
            onUpdateCat={(c)  => setCategories(p => p.map(x => x.id === c.id ? c : x))}
            onDeleteCat={(id) => setCategories(p => p.filter(x => x.id !== id))}
            learnedRules={learnedRules}
            onDeleteRule={handleDeleteRule}
            transactions={transactions}
            onAdd={handleAdd}
            onReset={handleReset}
          />
        );
      default:
        return <HomePage transactions={transactions} categories={categories} onNavigate={navigate} />;
    }
  };

  return (
    <div className="max-w-md mx-auto min-h-screen bg-gray-50 relative">
      <main>{renderPage()}</main>
      <BottomNav currentPage={currentPage} onNavigate={navigate} />
    </div>
  );
}
