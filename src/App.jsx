import { useState, useEffect, useCallback, useRef } from "react";
import { STORAGE_KEYS, DEFAULT_CATS, DEFAULT_CATEGORY_RULES, DEFAULT_MEMBERS, DEFAULT_POINT_ACCOUNTS } from "./constants";
import { SAMPLE_TX } from "./data/sampleData";
import { loadStorage, saveStorage, clearAllStorage } from "./utils/storage";
import { learnCategoryRule } from "./services/categoryPredictor";
import { normalizeTransaction } from "./services/transaction";

// ── 既存データのcsvFormatId補完（csvParser.js修正前に取り込んだデータ対応） ──
// source="csv"でcsvFormatIdがない取引をlabelから推測して補完する
// zen2han: 全角英数を半角に変換してからパターン比較（PDF由来の半角ラベル対応）
const zen2han = s => String(s || "").replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));

const CSV_FORMAT_HINTS = [
  { id: "smbc", patterns: [
    // ETC・高速道路
    "ETC", "高速道路", "中日本高速",
    // iD払い（三井住友ApplePay）
    "iD",
    // ガソリン
    "イデミツ", "アポロステーション", "出光興産SS",
    // サブスク・通信
    "YOUTUBE", "NETFLIX", "GOOGLE", "ラクテンモバイル", "Rakuten",
    // コンビニ・スーパー
    "セブン", "ローソン", "ウエルシア", "ミニストップ", "エブリィ", "ファミリーマート", "マックスバリュ",
    // ドラッグストア・医療
    "城北耳鼻咽喉科",
    // 税金・公共料金
    "eLTAX", "地方税共同機構", "システム利用料",
    // 三井住友PDFでよく出る店舗
    "ENEOS", "ダイソー", "SBI証券投信積立", "ハウマッチ", "ドン・キホーテ",
    "藍屋", "プレミアム付き", "快活CLUB", "バロー",
    "YUHOBI", "VANSAN", "THE GROVE", "Vent STORE",
    "スターバックス", "ニコニコレンタカー",
    "かんてんぱぱ", "姨捨", "奈良田温泉",
    "遊食酒房", "酒場", "温泉",
  ]},
  { id: "epos", patterns: [
    "AP/", "QP/",
    "ＡＰ／", "ＱＰ／",
    "NINTENDO CC",
    "ＮＩＮＴＥＮＤＯ　ＣＣ",
  ]},
  { id: "sbi", patterns: [
    "口座振替　", "給与＊", "賞与＊", "振込＊",
    "利息", "SBIハイブリッド", "ＳＢＩハイブリッド",
    "地方税", "国税",   // SBI銀行の税金引き落とし
  ]},
  { id: "amazon",  patterns: ["Amazon -", "Amazon　-"] },
  { id: "recruit", patterns: ["コジマ", "ニトリ"] },
  { id: "rakuten", patterns: ["楽天スーパー", "楽天市場", "ランプショップ"] },
];
const inferCsvFormatId = (tx, pointAccounts = []) => {
  if (tx.source !== "csv" || tx.csvFormatId) return tx;
  // PayPay: paymentMethodがPayPayのpointAccountIdと一致する場合
  const payPayId = pointAccounts.find(a => a.name === "PayPay")?.id;
  if (payPayId && (tx.paymentMethod === payPayId || tx.pointAccountId === payPayId)) {
    return { ...tx, csvFormatId: "paypay" };
  }
  // ラベルをzen2han変換してからパターン比較（PDF由来の半角ラベルも全角ラベルも統一）
  const label = zen2han(tx.label || "");
  for (const { id, patterns } of CSV_FORMAT_HINTS) {
    if (patterns.some(p => label.includes(zen2han(p)))) return { ...tx, csvFormatId: id };
  }
  return tx;
};
import {
  getShareId, setShareId,
  fetchTransactions, upsertTransaction, deleteTransaction, upsertTransactions,
  fetchCategories, fetchLearnedRules, fetchMembers, fetchPointAccounts,
  saveCategories, saveLearnedRules, saveMembers, savePointAccounts,
  fetchImportHistory, saveImportHistory,
  fetchActiveCsvSources, saveActiveCsvSources,
  fetchCsvSourceLabels, saveCsvSourceLabels,
  fetchBudgets, saveBudgets,
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
  const [importHistory,    setImportHistory]    = useState({});
  const [activeCsvSources,  setActiveCsvSources]  = useState(["sbi","epos","smbc","paypay"]);
  const [csvSourceLabels, setCsvSourceLabels] = useState({});
  const [budgets,         setBudgets]         = useState(() => {
    try { const s = localStorage.getItem("kakeibo_budgets"); return s ? JSON.parse(s) : {}; } catch { return {}; }
  });

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

        // import_history / active_csv_sourcesはオプション
        let importHist = {};
        try { importHist = await fetchImportHistory(shareId) || {}; } catch {}
        let activeSources = null;
        try { activeSources = await fetchActiveCsvSources(shareId); } catch {}
        if (activeSources) setActiveCsvSources(activeSources);
        else {
          try {
            const saved = localStorage.getItem("kakeibo_active_csv_sources");
            if (saved) { const parsed = JSON.parse(saved); setActiveCsvSources(parsed); await saveActiveCsvSources(shareId, parsed); }
          } catch {}
        }

        // csvSourceLabels
        try {
          const labels = await fetchCsvSourceLabels(shareId);
          if (labels) setCsvSourceLabels(labels);
          else {
            const saved = localStorage.getItem("kakeibo_csv_source_labels");
            if (saved) { const parsed = JSON.parse(saved); setCsvSourceLabels(parsed); await saveCsvSourceLabels(shareId, parsed); }
          }
        } catch {}

        // budgets
        try {
          const bgt = await fetchBudgets(shareId);
          if (bgt) setBudgets(bgt);
          else {
            const saved = localStorage.getItem("kakeibo_budgets");
            if (saved) { const parsed = JSON.parse(saved); setBudgets(parsed); await saveBudgets(shareId, parsed); }
          }
        } catch {}

        if (txs && txs.length > 0) {
          const pa = points || loadStorage(STORAGE_KEYS.POINT_ACCOUNTS, DEFAULT_POINT_ACCOUNTS) || [];
          setTransactions(txs.map(normalizeTransaction).filter(Boolean).map(tx => inferCsvFormatId(tx, pa)));
        } else {
          // Supabaseが空なら空で開始（サンプルデータは投入しない）
          setTransactions([]);
        }

        setCategories(cats    || loadStorage(STORAGE_KEYS.CATEGORIES, DEFAULT_CATS));
        setLearnedRules(rules || loadStorage(STORAGE_KEYS.RULES, []));
        setMembers(mems       || loadStorage(STORAGE_KEYS.MEMBERS, DEFAULT_MEMBERS));
        setImportHistory(importHist || {});

        // ポイント口座：既存データにデフォルト口座が欠けていたら補完
        const loadedPoints = points || loadStorage(STORAGE_KEYS.POINT_ACCOUNTS, DEFAULT_POINT_ACCOUNTS);
        const mergedPoints = DEFAULT_POINT_ACCOUNTS.map(def => {
          const existing = loadedPoints.find(a => a.id === def.id);
          return existing ? { ...existing, unit: "円" } : def; // unitを円に統一
        });
        // デフォルトにないカスタム口座も保持
        const customPoints = loadedPoints.filter(a => !DEFAULT_POINT_ACCOUNTS.find(d => d.id === a.id));
        setPointAccounts([...mergedPoints, ...customPoints]);

        setSyncStatus("synced");
      } catch (e) {
        console.error("Supabase load error:", e);
        // フォールバック：localStorage
        const localPoints = loadStorage(STORAGE_KEYS.POINT_ACCOUNTS, DEFAULT_POINT_ACCOUNTS) || [];
        setTransactions((loadStorage(STORAGE_KEYS.TRANSACTIONS, SAMPLE_TX) || []).map(normalizeTransaction).filter(Boolean).map(tx => inferCsvFormatId(tx, localPoints)));
        setCategories(loadStorage(STORAGE_KEYS.CATEGORIES, DEFAULT_CATS));
        setLearnedRules(loadStorage(STORAGE_KEYS.RULES, []));
        setMembers(loadStorage(STORAGE_KEYS.MEMBERS, DEFAULT_MEMBERS));
        const fallbackPoints = loadStorage(STORAGE_KEYS.POINT_ACCOUNTS, DEFAULT_POINT_ACCOUNTS);
        const mergedFallback = DEFAULT_POINT_ACCOUNTS.map(def => {
          const existing = fallbackPoints.find(a => a.id === def.id);
          return existing ? { ...existing, unit: "円" } : def;
        });
        const customFallback = fallbackPoints.filter(a => !DEFAULT_POINT_ACCOUNTS.find(d => d.id === a.id));
        setPointAccounts([...mergedFallback, ...customFallback]);
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
    setSyncStatus("syncing");
    try {
      await upsertTransaction(shareId, normalized);
      setSyncStatus("synced");
    } catch (e) {
      console.error("sync error:", e);
      setSyncStatus("error");
    }
  };

  // 編集ページからの保存（editingTxをクリア）
  const handleSave = async (tx) => {
    await handleUpdate(tx);
    setEditingTx(null);
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

  const handleCsvSourceLabelsChange = async (newLabels) => {
    setCsvSourceLabels(newLabels);
    try { await saveCsvSourceLabels(shareId, newLabels); } catch {}
    try { localStorage.setItem("kakeibo_csv_source_labels", JSON.stringify(newLabels)); } catch {}
  };

  const handleBudgetsChange = async (newBudgets) => {
    setBudgets(newBudgets);
    try { await saveBudgets(shareId, newBudgets); } catch {}
    try { localStorage.setItem("kakeibo_budgets", JSON.stringify(newBudgets)); } catch {}
  };

  const handleActiveCsvSourcesChange = async (newSources) => {
    setActiveCsvSources(newSources);
    try { await saveActiveCsvSources(shareId, newSources); } catch {}
    // localStorageにも書く（後方互換）
    try { localStorage.setItem("kakeibo_active_csv_sources", JSON.stringify(newSources)); } catch {}
  };

  const handleImportHistoryChange = async (newHistory) => {
    setImportHistory(newHistory);
    try { await saveImportHistory(shareId, newHistory); } catch {}
  };

  // 既存のtransactionsからimportHistoryを再構築（過去取り込み済みデータの履歴補完）
  // ① csvFormatIdを先に補完 → ② importHistoryを再構築 を1ステップで実行
  const handleRebuildImportHistory = async () => {
    // Step1: csvFormatIdを補完したtransactionsを作成
    const updatedTxs = transactions.map(tx => inferCsvFormatId(tx, pointAccounts));
    const badgeChanged = updatedTxs.filter((tx, i) => tx.csvFormatId !== transactions[i].csvFormatId).length;

    // Step2: 補完済みtransactionsからimportHistoryを再構築
    const now = new Date().toISOString(); // 今日の日付で記録
    const rebuilt = { ...(importHistory || {}) };
    updatedTxs
      .filter(t => t.source === "csv" && t.csvFormatId && t.date)
      .forEach(t => {
        const ym  = t.date.slice(0, 7);
        const key = `${t.csvFormatId}_${ym}`;
        if (!rebuilt[key]) rebuilt[key] = now;
      });

    // Step3: 状態を更新して保存
    setTransactions(updatedTxs);
    setImportHistory(rebuilt);
    try {
      const { saveTransactions } = await import("./utils/supabase");
      await saveTransactions(shareId, updatedTxs);
    } catch {}
    try { await saveImportHistory(shareId, rebuilt); } catch {}

    const histKeys = Object.keys(rebuilt).length - Object.keys(importHistory || {}).length;
    alert(`バッジ補完: ${badgeChanged}件\n取込履歴補完: ${histKeys}件\n完了しました`);
  };

  // ① 過去取引へのcsvFormatId一括補完（設定画面から実行）
  const handleReapplyCsvFormatId = async () => {
    const updated = transactions.map(tx => inferCsvFormatId(tx, pointAccounts));
    const changed = updated.filter((tx, i) => tx.csvFormatId !== transactions[i].csvFormatId);
    if (changed.length === 0) { alert("補完対象がありませんでした"); return; }
    setTransactions(updated);
    // Supabaseにも保存
    try {
      const { saveTransactions } = await import("./utils/supabase");
      await saveTransactions(shareId, updated);
    } catch {}
    // localStorageにも
    try { localStorage.setItem(
      (await import("./constants/storage")).STORAGE_KEYS.TRANSACTIONS,
      JSON.stringify(updated)
    ); } catch {}
    alert(`${changed.length}件のcsvFormatIdを補完しました`);
  };

  // ② 過去取引への一括カテゴリ再適用
  const handleReapplyCategories = async () => {
    const allCatRules = [...learnedRules, ...DEFAULT_CATEGORY_RULES];
    let count = 0;
    const updated = transactions.map(tx => {
      if (tx.category !== "その他" || !tx.label) return tx;
      const labelLower = tx.label.toLowerCase();
      const matched = allCatRules.find(rule =>
        rule.keywords?.some(kw => labelLower.includes(kw.toLowerCase()))
      );
      if (!matched) return tx;
      count++;
      return { ...tx, category: matched.category, updatedAt: new Date().toISOString() };
    });
    if (count === 0) { alert("再適用できる取引がありませんでした（すべて分類済みです）"); return; }
    const changed = updated.filter((tx, i) => tx.category !== transactions[i].category);
    setTransactions(updated);
    try {
      await Promise.all(changed.map(tx => upsertTransaction(shareId, tx)));
    } catch (e) { console.error("再適用保存エラー:", e); }
    alert(`✅ ${count}件のカテゴリを自動分類しました`);
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
    // 同じページなら何もしない
    if (page === currentPage) return;
    // ホーム以外への遷移はhistoryに積む
    if (page !== "home") {
      history.pushState({ page }, "", window.location.pathname);
    } else {
      // ホームへ戻る場合はhistoryをクリア
      history.replaceState({ page: "home" }, "", window.location.pathname);
    }
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // iOSスワイプバック・ブラウザバック対応
  useEffect(() => {
    // 初期状態をhistoryに設定
    history.replaceState({ page: currentPage }, "", window.location.pathname);

    const handlePopState = (e) => {
      const page = e.state?.page || "home";
      setCurrentPage(page);
      window.scrollTo({ top: 0, behavior: "smooth" });
      // ホームに戻ったらhistoryを再設定（これ以上戻れないようにする）
      if (page === "home") {
        history.replaceState({ page: "home" }, "", window.location.pathname);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

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
            onSave={handleSave}
            onCancel={() => setEditingTx(null)}
          />
        </div>
      </div>
    </div>
  );

  const renderPage = () => {
    switch (currentPage) {
      case "home":
        return <HomePage transactions={transactions} categories={categories} pointAccounts={pointAccountsWithBalance} learnedRules={learnedRules} importHistory={importHistory} activeCsvSources={activeCsvSources} budgets={budgets} onNavigate={navigate} />;
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
          csvSourceLabels={csvSourceLabels}
        />;
      case "add":
      case "add-csv":
        return <AddPage
          categories={categories}
          existingTransactions={transactions}
          allRules={DEFAULT_CATEGORY_RULES}
          learnedRules={learnedRules}
          members={members}
          pointAccounts={pointAccountsWithBalance}
          importHistory={importHistory}
          onAdd={handleAdd}
          onDelete={handleDelete}
          onLearnRule={handleLearn}
          onImportHistoryChange={handleImportHistoryChange}
          activeCsvSources={activeCsvSources}
          onActiveCsvSourcesChange={handleActiveCsvSourcesChange}
        />;
      case "analysis":
        return <AnalysisPage transactions={transactions} categories={categories} members={members} pointAccounts={pointAccountsWithBalance} onUpdate={handleUpdate} />;
      case "assets":
        return <AssetsPage transactions={transactions} pointAccounts={pointAccountsWithBalance} />;
      case "settings":
        return <SettingsPage
          categories={categories}
          onAddCat={(c)         => handleCategoriesChange([...categories, c])}
          onUpdateCat={(c)      => handleCategoriesChange(categories.map(x => x.id === c.id ? c : x))}
          onDeleteCat={(id)     => handleCategoriesChange(categories.filter(x => x.id !== id))}
          onReorderCat={(cats)  => handleCategoriesChange(cats)}
          onResetCategories={()  => handleCategoriesChange(DEFAULT_CATS)}
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
          // CSV管理
          activeCsvSources={activeCsvSources}
          onActiveCsvSourcesChange={handleActiveCsvSourcesChange}
          // 予算
          budgets={budgets}
          onBudgetsChange={handleBudgetsChange}
          onReapplyCategories={handleReapplyCategories}
              onReapplyCsvFormatId={handleReapplyCsvFormatId}
              onRebuildImportHistory={handleRebuildImportHistory}
          // 共有設定
          shareId={shareId}
          inviteUrl={inviteUrl}
          onJoinShare={(id) => { setShareId(id); setShareIdState(id); }}
          syncStatus={syncStatus}
        />;
      default:
        return <HomePage transactions={transactions} categories={categories} pointAccounts={pointAccountsWithBalance} learnedRules={learnedRules} importHistory={importHistory} activeCsvSources={activeCsvSources} budgets={budgets} onNavigate={navigate} />;
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
