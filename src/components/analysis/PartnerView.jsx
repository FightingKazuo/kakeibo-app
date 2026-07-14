import { useState, useEffect, useMemo } from "react";
import { fetchTransactions, fetchMembers } from "../../utils/supabase";

const fmtCurrency = (n) => `¥${Math.abs(Math.round(n)).toLocaleString()}`;
const toYM = (d) => (d || "").slice(0, 7);

const PARTNER_SHARE_KEY = "kakeibo_partner_share_id";

export function PartnerView({ onBack }) {
  const [inputId,      setInputId]      = useState(() => localStorage.getItem(PARTNER_SHARE_KEY) || "");
  const [shareId,      setShareId]      = useState(() => localStorage.getItem(PARTNER_SHARE_KEY) || "");
  const [transactions, setTransactions] = useState([]);
  const [members,      setMembers]      = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");
  const [selMonth,     setSelMonth]     = useState("all");
  const [showTxList,   setShowTxList]   = useState(false);

  // shareIdが設定されていたら自動ロード
  useEffect(() => {
    if (shareId) load(shareId);
  }, [shareId]);

  const load = async (id) => {
    if (!id) return;
    setLoading(true); setError("");
    try {
      const [txs, mems] = await Promise.all([
        fetchTransactions(id),
        fetchMembers(id),
      ]);
      setTransactions(txs || []);
      setMembers(mems || []);
      localStorage.setItem(PARTNER_SHARE_KEY, id);
    } catch (e) {
      setError("データの取得に失敗しました。共有IDを確認してください。");
    } finally {
      setLoading(false);
    }
  };

  // 月一覧
  const months = useMemo(() => {
    const yms = [...new Set(transactions.map(t => toYM(t.date)).filter(Boolean))].sort().reverse();
    return ["all", ...yms];
  }, [transactions]);

  // フィルター済み取引
  const filtered = useMemo(() =>
    transactions.filter(t => selMonth === "all" || toYM(t.date) === selMonth),
    [transactions, selMonth]
  );

  // 精算計算（かずおさんのAnalysisPage.jsxと同じロジック）
  const settlementData = useMemo(() => {
    if (members.length < 2) return null;
    const selfId    = members[0]?.id;
    const partnerId = members[1]?.id;

    const dateFrom = selMonth === "all" ? "2000-01-01" : `${selMonth}-01`;
    const dateTo   = selMonth === "all" ? "9999-12-31"
      : new Date(selMonth.split("-")[0], selMonth.split("-")[1], 0).toISOString().slice(0,10);

    const base = t => t.type === "expense" && t.date >= dateFrom && t.date <= dateTo;

    // 共有支出
    const sharedTxs = filtered.filter(t =>
      t.type === "expense" && t.shareType === "shared"
    );
    const paidMap = { [selfId]: 0, [partnerId]: 0 };
    sharedTxs.forEach(t => {
      const amt = Math.abs(t.shareAmount ?? t.amount);
      if (paidMap[t.paidBy] !== undefined) paidMap[t.paidBy] += amt;
      else paidMap[selfId] += amt;
    });
    const totalShared = Object.values(paidMap).reduce((s,v)=>s+v,0);
    const perPerson   = totalShared / 2;
    const settleAmt   = Math.round(paidMap[selfId] - perPerson); // 正=パートナーが受け取り

    // 立替
    const advanceBySelf = filtered.filter(t =>
      base(t) && t.shareType === "partner" && (t.paidBy === selfId || !t.paidBy)
    );
    const advanceTotalSelf = advanceBySelf.reduce((s,t)=>s+Math.abs(t.shareAmount??t.amount),0);
    const advanceByPartner = filtered.filter(t =>
      base(t) && t.shareType === "personal" && t.paidBy === partnerId
    );
    const advanceTotalPartner = advanceByPartner.reduce((s,t)=>s+Math.abs(t.shareAmount??t.amount),0);
    const advanceNet = advanceTotalSelf - advanceTotalPartner;

    // 最終精算（パートナー視点：正=パートナーが支払う）
    const finalAmt = -settleAmt + advanceNet; // パートナーが払うべき金額

    return {
      selfName: members[0]?.name || "かずお",
      partnerName: members[1]?.name || "パートナー",
      totalShared, perPerson, settleAmt,
      advanceBySelf, advanceTotalSelf,
      advanceByPartner, advanceTotalPartner, advanceNet,
      finalAmt, sharedTxs,
    };
  }, [filtered, members, selMonth]);

  // 未接続状態
  if (!shareId) return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-white px-4 pt-12 pb-4 border-b border-gray-100 flex items-center gap-3">
        <button onClick={onBack} className="text-gray-400 text-xl">←</button>
        <h1 className="text-lg font-bold text-gray-900">精算を確認</h1>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-8 space-y-6">
        <div className="text-center">
          <p className="text-5xl mb-4">🤝</p>
          <p className="text-lg font-bold text-gray-800">共有IDを入力</p>
          <p className="text-sm text-gray-400 mt-2">
            かずおさんから共有IDを受け取って入力してください
          </p>
        </div>
        <div className="w-full space-y-3">
          <input
            type="text"
            value={inputId}
            onChange={e => setInputId(e.target.value)}
            placeholder="共有ID（例: abc-123-def）"
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-400"
          />
          {error && <p className="text-xs text-rose-500">{error}</p>}
          <button
            onClick={() => { setShareId(inputId.trim()); }}
            disabled={!inputId.trim()}
            className="w-full py-3 bg-indigo-500 text-white rounded-xl font-bold text-sm disabled:opacity-40">
            接続する
          </button>
        </div>
      </div>
    </div>
  );

  // メイン画面
  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <div className="bg-white px-4 pt-12 pb-3 border-b border-gray-100 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="text-gray-400 text-xl">←</button>
            <div>
              <h1 className="text-lg font-bold text-gray-900">精算確認</h1>
              <p className="text-xs text-gray-400">
                {loading ? "読み込み中..." : `${members[0]?.name || "相手"}のデータ`}
              </p>
            </div>
          </div>
          <button
            onClick={() => { setShareId(""); localStorage.removeItem(PARTNER_SHARE_KEY); setTransactions([]); }}
            className="text-xs text-gray-400 border border-gray-200 rounded-lg px-2 py-1">
            切替
          </button>
        </div>
        {/* 月フィルター */}
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
          {months.map(m => (
            <button key={m} onClick={() => setSelMonth(m)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                selMonth === m ? "bg-indigo-500 text-white border-indigo-500" : "bg-white text-gray-500 border-gray-200"
              }`}>
              {m === "all" ? "全期間" : m.replace("-","年") + "月"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
        </div>
      ) : !settlementData ? (
        <div className="text-center py-20 text-gray-400 text-sm">メンバー情報がありません</div>
      ) : (
        <div className="px-4 py-4 space-y-4 pb-24">

          {/* 最終精算サマリー */}
          <div className={`rounded-2xl p-5 text-white ${settlementData.finalAmt > 0 ? "bg-gradient-to-br from-rose-400 to-rose-600" : settlementData.finalAmt < 0 ? "bg-gradient-to-br from-emerald-400 to-emerald-600" : "bg-gradient-to-br from-gray-400 to-gray-600"}`}>
            <p className="text-xs font-semibold opacity-80 mb-1">
              {settlementData.finalAmt > 0
                ? `${settlementData.selfName}さんへ支払う`
                : settlementData.finalAmt < 0
                ? `${settlementData.selfName}さんから受け取る`
                : "精算なし"}
            </p>
            <p className="text-4xl font-bold">{fmtCurrency(Math.abs(settlementData.finalAmt))}</p>
            <p className="text-xs opacity-70 mt-2">
              {selMonth === "all" ? "全期間" : selMonth.replace("-","年") + "月"}の精算
            </p>
          </div>

          {/* 内訳 */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50">
              <p className="text-xs font-bold text-gray-500">内訳</p>
            </div>

            {/* 共有支出 */}
            <div className="px-4 py-3 border-b border-gray-50">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-semibold text-gray-700">🤝 共有支出の割り勘</p>
                  <p className="text-xs text-gray-400">
                    合計¥{Math.round(settlementData.totalShared).toLocaleString()} ÷ 2 = 1人¥{Math.round(settlementData.perPerson).toLocaleString()}
                  </p>
                </div>
                <p className={`text-sm font-bold ${-settlementData.settleAmt > 0 ? "text-rose-500" : "text-emerald-500"}`}>
                  {-settlementData.settleAmt >= 0 ? "+" : ""}{fmtCurrency(-settlementData.settleAmt)}
                </p>
              </div>
            </div>

            {/* 立替 */}
            {settlementData.advanceTotalSelf > 0 && (
              <div className="px-4 py-3 border-b border-gray-50">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-semibold text-gray-700">🔄 {settlementData.selfName}さんの立替</p>
                    <p className="text-xs text-gray-400">{settlementData.advanceBySelf.length}件</p>
                  </div>
                  <p className="text-sm font-bold text-rose-500">+{fmtCurrency(settlementData.advanceTotalSelf)}</p>
                </div>
              </div>
            )}
            {settlementData.advanceTotalPartner > 0 && (
              <div className="px-4 py-3 border-b border-gray-50">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-semibold text-gray-700">🔄 あなたの立替</p>
                    <p className="text-xs text-gray-400">{settlementData.advanceByPartner.length}件</p>
                  </div>
                  <p className="text-sm font-bold text-emerald-500">-{fmtCurrency(settlementData.advanceTotalPartner)}</p>
                </div>
              </div>
            )}
          </div>

          {/* 対象取引一覧 */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <button
              onClick={() => setShowTxList(p => !p)}
              className="w-full flex items-center justify-between px-4 py-3 text-left">
              <div>
                <p className="text-xs font-bold text-gray-700">📋 対象取引一覧</p>
                <p className="text-xs text-gray-400">
                  共有{settlementData.sharedTxs.length}件・立替{settlementData.advanceBySelf.length + settlementData.advanceByPartner.length}件
                </p>
              </div>
              <span className="text-gray-400 text-xs">{showTxList ? "▲" : "▼"}</span>
            </button>

            {showTxList && (
              <div className="border-t border-gray-50">
                {/* 共有支出 */}
                {settlementData.sharedTxs.length > 0 && (
                  <>
                    <div className="px-4 py-2 bg-gray-50">
                      <p className="text-xs font-bold text-gray-500">🤝 共有支出</p>
                    </div>
                    {settlementData.sharedTxs.map((t, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-b-0">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{t.label}</p>
                          <p className="text-xs text-gray-400">{t.date} · {t.paidBy === members[0]?.id ? members[0]?.name : members[1]?.name}払い</p>
                        </div>
                        <p className="text-sm font-bold text-rose-500 flex-shrink-0">
                          -{fmtCurrency(t.shareAmount ?? t.amount)}
                        </p>
                      </div>
                    ))}
                  </>
                )}
                {/* かずおさんの立替 */}
                {settlementData.advanceBySelf.length > 0 && (
                  <>
                    <div className="px-4 py-2 bg-amber-50">
                      <p className="text-xs font-bold text-amber-600">🔄 {settlementData.selfName}さんの立替（要返済）</p>
                    </div>
                    {settlementData.advanceBySelf.map((t, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-amber-50 last:border-b-0">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{t.label}</p>
                          <p className="text-xs text-gray-400">{t.date}</p>
                        </div>
                        <p className="text-sm font-bold text-amber-600 flex-shrink-0">
                          -{fmtCurrency(t.shareAmount ?? t.amount)}
                        </p>
                      </div>
                    ))}
                  </>
                )}
                {settlementData.sharedTxs.length === 0 && settlementData.advanceBySelf.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-6">対象取引なし</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
