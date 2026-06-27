import { useState, useEffect } from "react";
import { CategoryTab }  from "./tabs/CategoryTab";
import { MemberTab }    from "./tabs/MemberTab";
import { PointTab }     from "./tabs/PointTab";
import { ShareTab }     from "./tabs/ShareTab";
import { DataLinksTab } from "./tabs/DataLinksTab";
import { TransferTab }  from "./tabs/TransferTab";
import { TaxRulesTab }  from "./tabs/TaxRulesTab";
import { RulesTab }     from "./tabs/RulesTab";
import { BackupTab }    from "./tabs/BackupTab";
import { DataTab }      from "./tabs/DataTab";

import { CsvSourcesTab } from "./tabs/CsvSourcesTab";
import { BudgetTab }     from "./tabs/BudgetTab";

const TABS = [
  { id: "categories", label: "カテゴリ",        icon: "🏷️" },
  { id: "members",    label: "メンバー",         icon: "👥" },
  { id: "points",     label: "ポイント口座",     icon: "💳" },
  { id: "csvsources", label: "CSV管理",          icon: "📊" },
  { id: "share",      label: "共有設定",         icon: "🔗" },
  { id: "datalinks",  label: "データ取得",       icon: "📥" },
  { id: "transfer",   label: "振替設定",         icon: "🔄" },
  { id: "taxrules",   label: "消費税学習",       icon: "🧾" },
  { id: "rules",      label: "学習ルール",       icon: "🧠" },
  { id: "backup",     label: "バックアップ",     icon: "💾" },
  { id: "data",       label: "データ管理",       icon: "⚙️" },
  { id: "budget",     label: "予算",             icon: "🎯" },
];

export function SettingsPage({ transactions, categories,
  categories, onAddCat, onUpdateCat, onDeleteCat, onReorderCat, onResetCategories,
  learnedRules, onDeleteRule,
  transactions, onAdd, onReset,
  members, onUpdateMember, onAddMember, onDeleteMember,
  pointAccounts, onAddPointAccount, onUpdatePointAccount, onDeletePointAccount,
  shareId, inviteUrl, onJoinShare, syncStatus,
  activeCsvSources, onActiveCsvSourcesChange}) {
  const [tab, setTab] = useState(null);

  // iOSスワイプバック・ブラウザバックで setTab(null) を呼ぶ
  useEffect(() => {
    const handlePop = (e) => {
      // stateにtabがなければ一覧に戻る
      if (!e.state?.tab) {
        setTab(null);
      } else {
        setTab(e.state.tab);
      }
    };
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, []);

  const currentTab = TABS.find(t => t.id === tab);

  // タブ未選択時はメニュー一覧
  if (!tab) return (
    <div className="pb-24">
      <div className="bg-white px-4 pt-12 pb-4 border-b border-gray-100">
        <h1 className="text-xl font-bold text-gray-900">設定</h1>
      </div>
      <div className="px-4 py-4">
        <div className="bg-white rounded-2xl overflow-hidden border border-gray-100">
          {TABS.map(t => (
            <button key={t.id} onClick={() => {
              history.pushState({ page: "settings", tab: t.id }, "", window.location.pathname);
              setTab(t.id);
            }}
              className="w-full flex items-center gap-3 px-4 py-4 border-b border-gray-50 last:border-b-0 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left">
              <span className="text-xl w-8 text-center">{t.icon}</span>
              <span className="flex-1 text-sm font-medium text-gray-800">{t.label}</span>
              <span className="text-gray-300 text-sm">›</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="pb-24">
      <div className="bg-white px-4 pt-12 pb-4 border-b border-gray-100 flex items-center gap-3">
        <button
          onClick={() => { history.back(); }}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 active:bg-gray-300 transition-colors text-gray-600 text-lg font-bold">
          ‹
        </button>
        <h1 className="text-xl font-bold text-gray-900">
          {currentTab?.icon} {currentTab?.label}
        </h1>
      </div>

      {tab === "categories" && (
        <CategoryTab categories={categories} onAddCat={onAddCat} onUpdateCat={onUpdateCat} onDeleteCat={onDeleteCat} onReorderCat={onReorderCat} />
      )}
      {tab === "members" && (
        <MemberTab members={members} onUpdateMember={onUpdateMember} onAddMember={onAddMember} onDeleteMember={onDeleteMember} />
      )}
      {tab === "points" && (
        <PointTab pointAccounts={pointAccounts} onAddPointAccount={onAddPointAccount} onUpdatePointAccount={onUpdatePointAccount} onDeletePointAccount={onDeletePointAccount} onAdd={onAdd} />
      )}
      {tab === "csvsources" && <CsvSourcesTab activeCsvSources={activeCsvSources} onActiveCsvSourcesChange={onActiveCsvSourcesChange} />}
      {tab === "budget"     && <BudgetTab transactions={transactions} categories={categories} budgets={budgets} onBudgetsChange={onBudgetsChange} />}
      {tab === "share" && (
        <ShareTab shareId={shareId} inviteUrl={inviteUrl} onJoinShare={onJoinShare} syncStatus={syncStatus} />
      )}
      {tab === "datalinks" && <DataLinksTab />}
      {tab === "transfer"  && <TransferTab />}
      {tab === "taxrules"  && <TaxRulesTab />}
      {tab === "rules"     && <RulesTab learnedRules={learnedRules} onDeleteRule={onDeleteRule} />}
      {tab === "backup"    && <BackupTab transactions={transactions} categories={categories} learnedRules={learnedRules} onAdd={onAdd} />}
      {tab === "data"      && <DataTab transactions={transactions} categories={categories} learnedRules={learnedRules} onDeleteRule={onDeleteRule} onResetCategories={onResetCategories} onReset={onReset} onReapplyCategories={onReapplyCategories} />}
    </div>
  );
}
