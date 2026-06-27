// ============================================================
// utils/supabase.js
// Supabase接続・データ同期
//
// 設計：
//   - share_id = 2人が共有するグループID（UUIDv4）
//   - localStorageにshare_idを保存
//   - 全データはshare_id単位で読み書き
//   - 取引のみ行単位、それ以外はJSONBで1行保存
// ============================================================

const SUPABASE_URL = "https://wvxmtbytevzkosjcgrgn.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2eG10Ynl0ZXZ6a29zamNncmduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2NTYxNzAsImV4cCI6MjA5NzIzMjE3MH0.iUrp6oiHrdkmgOPAeOtcwoffW2N36K9XgEXIEy_l2D4";

const SHARE_ID_KEY = "kakeibo_share_id";

// ─── share_id の取得・生成 ────────────────────────────────
export const getShareId = () => {
  let id = localStorage.getItem(SHARE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SHARE_ID_KEY, id);
  }
  return id;
};

export const setShareId = (id) => {
  localStorage.setItem(SHARE_ID_KEY, id);
};

// ─── 共通fetch ────────────────────────────────────────────
const sbFetch = async (path, options = {}) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      "apikey":        SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type":  "application/json",
      "Prefer":        "return=minimal",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase error: ${res.status} ${err}`);
  }
  // 204 No Content はJSONなし
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
};

// ─── 取引 ─────────────────────────────────────────────────

/** 全取引を取得 */
export const fetchTransactions = async (shareId) => {
  const rows = await sbFetch(`transactions?share_id=eq.${shareId}&select=id,data`, {
    headers: { "Prefer": "return=representation" },
  });
  return (rows || []).map(r => r.data);
};

/** 取引を1件upsert */
export const upsertTransaction = async (shareId, tx) => {
  await sbFetch("transactions", {
    method: "POST",
    headers: { "Prefer": "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      id:         tx.id,
      share_id:   shareId,
      data:       tx,
      updated_at: new Date().toISOString(),
    }),
  });
};

/** 取引を1件削除 */
export const deleteTransaction = async (txId) => {
  await sbFetch(`transactions?id=eq.${txId}`, { method: "DELETE" });
};

/** 複数取引を一括upsert */
export const upsertTransactions = async (shareId, txs) => {
  if (!txs.length) return;
  const rows = txs.map(tx => ({
    id:         tx.id,
    share_id:   shareId,
    data:       tx,
    updated_at: new Date().toISOString(),
  }));
  await sbFetch("transactions", {
    method:  "POST",
    headers: { "Prefer": "resolution=merge-duplicates,return=minimal" },
    body:    JSON.stringify(rows),
  });
};

// ─── 設定系（categories / learned_rules / members / point_accounts）
// 各テーブルはshare_idをPKとして1行保存

const fetchSetting = async (table, shareId) => {
  const rows = await sbFetch(`${table}?share_id=eq.${shareId}&select=data`, {
    headers: { "Prefer": "return=representation" },
  });
  return rows?.[0]?.data ?? null;
};

const upsertSetting = async (table, shareId, data) => {
  await sbFetch(table, {
    method:  "POST",
    headers: { "Prefer": "resolution=merge-duplicates,return=minimal" },
    body:    JSON.stringify({
      share_id:   shareId,
      data,
      updated_at: new Date().toISOString(),
    }),
  });
};

export const saveCategories    = (shareId, data) => upsertSetting("categories",     shareId, data);
export const saveLearnedRules  = (shareId, data) => upsertSetting("learned_rules",  shareId, data);
export const saveMembers       = (shareId, data) => upsertSetting("members",        shareId, data);
export const savePointAccounts = (shareId, data) => upsertSetting("point_accounts", shareId, data);
export const saveImportHistory    = (shareId, data) => upsertSetting("import_history",    shareId, data);
export const saveActiveCsvSources = (shareId, data) => upsertSetting("active_csv_sources", shareId, data);
export const saveCsvSourceLabels  = (shareId, data) => upsertSetting("csv_source_labels",  shareId, data);
export const saveBudgets          = (shareId, data) => upsertSetting("budgets",             shareId, data);

export const fetchCategories    = (shareId) => fetchSetting("categories",     shareId);
export const fetchLearnedRules  = (shareId) => fetchSetting("learned_rules",  shareId);
export const fetchMembers       = (shareId) => fetchSetting("members",        shareId);
export const fetchPointAccounts = (shareId) => fetchSetting("point_accounts", shareId);
export const fetchImportHistory    = (shareId) => fetchSetting("import_history",    shareId);
export const fetchActiveCsvSources = (shareId) => fetchSetting("active_csv_sources", shareId);
export const fetchCsvSourceLabels  = (shareId) => fetchSetting("csv_source_labels",  shareId);
export const fetchBudgets          = (shareId) => fetchSetting("budgets",             shareId);

// ─── 接続テスト ───────────────────────────────────────────
export const testConnection = async () => {
  await sbFetch("transactions?limit=1", {
    headers: { "Prefer": "return=representation" },
  });
  return true;
};
