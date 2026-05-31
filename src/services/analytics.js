// ============================================================
// services/analytics.js — 分析用 helper 関数群
// ⑤ 商品・店舗集計 / 価格推移 / 定期支払い検出
//
// 【設計方針】
// ・純粋関数（副作用なし）
// ・UI には今は繋がない。将来 components/analysis/ から import する
// ・TypeScript 化しやすいよう JSDoc で型を明示
// ============================================================

import { normalizeStoreName } from "./transaction";

// ─── 内部ユーティリティ ──────────────────────────────────────

/** ラベル正規化（重複検出用） */
const normKey = (str) =>
  String(str || "")
    .toLowerCase()
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/\s+/g, "")
    .replace(/[^\u3040-\u30ff\u4e00-\u9fa5a-z0-9]/g, "")
    .trim();

/** 日付文字列を Date に安全変換 */
const toDate = (str) => {
  const d = new Date(str);
  return isNaN(d.getTime()) ? new Date() : d;
};

/** 次回予定日を推定 */
const estimateNextDate = (lastDateStr, avgIntervalDays) => {
  const d = toDate(lastDateStr);
  d.setDate(d.getDate() + Math.round(avgIntervalDays));
  return d.toISOString().split("T")[0];
};

// ─── aggregateByItem ─────────────────────────────────────────
/**
 * 全取引の items フィールドを商品名で集計する。
 * 商品価格推移・カテゴリ分析のベースデータとして使用。
 *
 * @param {Transaction[]} transactions
 * @returns {{
 *   name:         string,      // 商品名
 *   totalAmount:  number,      // 累計支出
 *   totalQty:     number,      // 累計数量
 *   avgUnitPrice: number,      // 平均単価
 *   occurrences:  number,      // 購入回数
 *   lastSeen:     string,      // 最終購入日
 *   stores:       string[],    // 購入した店舗一覧
 *   priceHistory: {date,unitPrice,storeName}[]
 * }[]}
 */
export const aggregateByItem = (transactions) => {
  const map = {};

  for (const tx of transactions) {
    if (!Array.isArray(tx.items) || tx.items.length === 0) continue;
    const storeName = tx.store?.name || tx.label || "";

    for (const item of tx.items) {
      if (!item.name || item.isDiscount) continue;
      const key = normKey(item.name);
      if (!map[key]) {
        map[key] = {
          name:         item.name,
          totalAmount:  0,
          totalQty:     0,
          occurrences:  0,
          lastSeen:     "",
          stores:       new Set(),
          priceHistory: [],
        };
      }
      const entry = map[key];
      entry.totalAmount  += item.amount;
      entry.totalQty     += item.quantity || 1;
      entry.occurrences  += 1;
      if (!entry.lastSeen || tx.date > entry.lastSeen) entry.lastSeen = tx.date;
      if (storeName) entry.stores.add(storeName);
      if (item.unitPrice > 0) {
        entry.priceHistory.push({
          date:      tx.date,
          unitPrice: item.unitPrice,
          storeName,
        });
      }
    }
  }

  return Object.values(map)
    .map(e => ({
      ...e,
      stores:       [...e.stores],
      avgUnitPrice: e.totalQty > 0 ? Math.round(e.totalAmount / e.totalQty) : 0,
      priceHistory: e.priceHistory.sort((a, b) => a.date.localeCompare(b.date)),
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
};

// ─── aggregateByStore ────────────────────────────────────────
/**
 * 取引を店舗名で集計する。
 * 店舗別の利用状況・平均単価の把握に使用。
 *
 * @param {Transaction[]} transactions
 * @returns {{
 *   storeName:    string,
 *   totalAmount:  number,
 *   visitCount:   number,
 *   avgPerVisit:  number,
 *   lastVisit:    string,
 *   categories:   string[],   // 利用カテゴリ一覧
 *   transactions: Transaction[]
 * }[]}
 */
export const aggregateByStore = (transactions) => {
  const map = {};

  for (const tx of transactions) {
    if (tx.type !== "expense") continue;
    const rawName   = tx.store?.name || tx.label || "（不明）";
    const storeName = normalizeStoreName(rawName) || rawName;

    if (!map[storeName]) {
      map[storeName] = {
        storeName,
        displayName:  rawName,
        totalAmount:  0,
        visitCount:   0,
        lastVisit:    "",
        categories:   new Set(),
        transactions: [],
      };
    }
    const entry = map[storeName];
    entry.totalAmount  += Math.abs(tx.amount);
    entry.visitCount   += 1;
    if (!entry.lastVisit || tx.date > entry.lastVisit) entry.lastVisit = tx.date;
    if (tx.category) entry.categories.add(tx.category);
    entry.transactions.push(tx);
  }

  return Object.values(map)
    .map(e => ({
      ...e,
      categories:  [...e.categories],
      avgPerVisit: e.visitCount > 0 ? Math.round(e.totalAmount / e.visitCount) : 0,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
};

// ─── calculatePriceTrend ─────────────────────────────────────
/**
 * 特定商品の価格推移を時系列で返す。
 * 折れ線グラフ表示に使用。
 *
 * @param {Transaction[]} transactions
 * @param {string}        itemName      - 商品名（部分一致）
 * @returns {{
 *   date:      string,
 *   unitPrice: number,
 *   storeName: string,
 *   txId:      string
 * }[]}
 */
export const calculatePriceTrend = (transactions, itemName) => {
  if (!itemName) return [];
  const normTarget = normKey(itemName);
  const results    = [];

  for (const tx of transactions) {
    if (!Array.isArray(tx.items)) continue;
    const storeName = tx.store?.name || tx.label || "";

    for (const item of tx.items) {
      if (!item.name || item.isDiscount) continue;
      if (!normKey(item.name).includes(normTarget)) continue;
      if (item.unitPrice <= 0) continue;

      results.push({
        date:      tx.date,
        unitPrice: item.unitPrice,
        storeName,
        txId:      tx.id,
      });
    }
  }

  return results.sort((a, b) => a.date.localeCompare(b.date));
};

// ─── detectRecurringPayments ─────────────────────────────────
/**
 * 定期支払いを検出する。
 * サブスク・公共料金など月次・年次の定期支出を自動検出。
 *
 * @param {Transaction[]} transactions
 * @returns {{
 *   label:        string,
 *   avgAmount:    number,
 *   frequency:    'monthly' | 'yearly' | 'weekly',
 *   count:        number,
 *   lastDate:     string,
 *   nextEstDate:  string,   // 次回予定日（推定）
 *   confidence:   number,   // 0〜100
 *   transactions: Transaction[]
 * }[]}
 */
export const detectRecurringPayments = (transactions) => {
  // 支出のみ対象
  const expenses = transactions.filter(t => t.type === "expense");

  // ラベルでグループ化
  const groups = {};
  for (const tx of expenses) {
    const key = normKey(tx.label);
    if (!key) continue;
    if (!groups[key]) groups[key] = [];
    groups[key].push(tx);
  }

  const recurring = [];

  for (const txs of Object.values(groups)) {
    if (txs.length < 2) continue;

    const sorted  = [...txs].sort((a, b) => a.date.localeCompare(b.date));
    const amounts = sorted.map(t => Math.abs(t.amount));
    const avgAmt  = amounts.reduce((s, a) => s + a, 0) / amounts.length;

    // 金額の一貫性チェック（±20%以内）
    const amountConsistent = amounts.every(a =>
      avgAmt === 0 || Math.abs(a - avgAmt) / avgAmt < 0.2
    );
    if (!amountConsistent) continue;

    // 間隔計算
    const dates     = sorted.map(t => toDate(t.date).getTime());
    const intervals = dates.slice(1).map((d, i) => (d - dates[i]) / 86400000);
    const avgInterval = intervals.reduce((s, v) => s + v, 0) / intervals.length;

    // 間隔の一貫性（±7日以内のばらつき）
    const intervalConsistent = intervals.every(v => Math.abs(v - avgInterval) <= 7);
    if (!intervalConsistent && txs.length < 4) continue;

    // 頻度判定
    let frequency = null;
    if      (avgInterval >= 6  && avgInterval <= 10) frequency = "weekly";
    else if (avgInterval >= 25 && avgInterval <= 40) frequency = "monthly";
    else if (avgInterval >= 350 && avgInterval <= 380) frequency = "yearly";
    if (!frequency) continue;

    // 信頼度スコア（出現回数・金額一貫性・間隔一貫性）
    const confidence = Math.min(100, Math.round(
      (Math.min(txs.length, 12) / 12) * 40 +
      (amountConsistent ? 40 : 20) +
      (intervalConsistent ? 20 : 10)
    ));

    recurring.push({
      label:        sorted[0].label,
      avgAmount:    Math.round(avgAmt),
      frequency,
      count:        txs.length,
      lastDate:     sorted[sorted.length - 1].date,
      nextEstDate:  estimateNextDate(sorted[sorted.length - 1].date, avgInterval),
      confidence,
      transactions: sorted,
    });
  }

  return recurring.sort((a, b) => b.confidence - a.confidence);
};

// ─── summarizeSharedExpenses ─────────────────────────────────
/**
 * 共有支出（items.type === "shared"）を集計する。
 * 将来の「割り勘計算」機能のための土台。
 *
 * @param {Transaction[]} transactions
 * @returns {{ totalShared: number, totalPersonal: number, sharedRatio: number }}
 */
export const summarizeSharedExpenses = (transactions) => {
  let totalShared   = 0;
  let totalPersonal = 0;

  for (const tx of transactions) {
    if (!Array.isArray(tx.items) || tx.items.length === 0) {
      totalPersonal += Math.abs(tx.amount);
      continue;
    }
    for (const item of tx.items) {
      if (item.type === "shared") totalShared   += item.amount;
      else                        totalPersonal += item.amount;
    }
  }

  const total      = totalShared + totalPersonal;
  const sharedRatio = total > 0 ? Math.round((totalShared / total) * 100) : 0;

  return { totalShared, totalPersonal, total, sharedRatio };
};
