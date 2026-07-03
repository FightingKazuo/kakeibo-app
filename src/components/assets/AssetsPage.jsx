import { useState, useEffect, useRef } from "react";
import { fmtCurrency } from "../../utils/format";
import { readCSVFile } from "../../services/csvParser";
import { loadStorage, saveStorage } from "../../utils/storage";

const ASSETS_KEY       = "kakeibo_assets";
// 残高調整はApp.jsx経由でSupabaseに保存（propsで受け取る）

// B案: 残高 = 最新の調整残高 + その調整日以降の取引積み上げ
const calcBalanceWithAdjustment = (accountId, transactions, adjustments) => {
  const adjs = (adjustments || [])
    .filter(a => a.accountId === accountId)
    .sort((a, b) => b.date.localeCompare(a.date)); // 新しい順

  if (adjs.length === 0) {
    // 調整なし → 全取引の積み上げ
    return transactions
      .filter(t => t.pointAccountId === accountId)
      .reduce((s, t) => s + t.amount, 0);
  }

  const latest = adjs[0]; // 最新の調整
  // 調整日以降（調整日を含む）の通常取引だけ積み上げ
  const txAfter = transactions
    .filter(t => t.pointAccountId === accountId && t.date >= latest.date)
    .reduce((s, t) => s + t.amount, 0);

  return latest.balance + txAfter;
};

// ─── 積立設定 ────────────────────────────────────────────────
const TSUMITATE_KEY = "kakeibo_tsumitate_settings";
const loadTsumitateSettings = () => {
  try { return JSON.parse(localStorage.getItem(TSUMITATE_KEY) || "[]"); } catch { return []; }
};
const saveTsumitateSettings = (arr) => {
  try { localStorage.setItem(TSUMITATE_KEY, JSON.stringify(arr)); } catch {}
};

// 基準価額を投信協会APIから取得（ブラウザfetch）
const fetchFundPrice = async (fundCode) => {
  const url = `https://toushin-lib.fam.cx/api/v1/fund-informations/${fundCode}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return {
    price:     data.basePrice || data.base_price || 0,
    priceDate: data.basePriceDate || data.base_price_date || "",
    name:      data.fundName || data.fund_name || "",
  };
};

// ─── SBI証券CSVパーサー ───────────────────────────────────
const parseSBISecuritiesCSV = (text) => {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const funds = [];
  let totalEval = 0;
  let totalGain = 0;
  let inSummary  = false; // 合計行の次行を読む状態

  for (const line of lines) {
    const cols = line.split(",").map(c => c.replace(/^"|"$/g, "").trim());

    // 「評価額合計,評価損益合計」ヘッダー行の次行が口座別合計値
    if (cols[0] === "評価額合計" && cols[1] === "評価損益合計") {
      inSummary = true;
      continue;
    }
    if (inSummary && cols.length >= 2) {
      const v = parseInt(cols[0].replace(/[^0-9]/g, "")) || 0;
      const g = parseInt(cols[1].replace(/[^0-9]/g, "").replace("+", "")) || 0;
      const gSign = cols[1].startsWith("-") ? -1 : 1;
      if (v > 0) {
        totalEval += v;
        totalGain += g * gSign;
      }
      inSummary = false;
      continue;
    }

    // ファンド行（ファンド名を含む行）
    if (cols.length >= 8 && (
      cols[0].includes("Ｓｌｉｍ") || cols[0].includes("eMAXIS") ||
      cols[0].includes("ｅＭＡＸＩＳ") || cols[0].includes("ＳＬＩＭ")
    )) {
      // 全角→半角変換
      const name = cols[0].replace(/[Ａ-Ｚａ-ｚ０-９（）　ー]/g, c =>
        c.charCodeAt(0) >= 0xFF01 && c.charCodeAt(0) <= 0xFF5E
          ? String.fromCharCode(c.charCodeAt(0) - 0xFEE0)
          : c === "　" ? " " : c
      ).replace(/\s+/g, " ").trim();
      const evalAmt = parseInt(String(cols[6] || "0").replace(/[^0-9]/g, "")) || 0;
      const gainStr = String(cols[7] || "0");
      const gainSign = gainStr.startsWith("-") ? -1 : 1;
      const gainAmt = (parseInt(gainStr.replace(/[^0-9]/g, "")) || 0) * gainSign;
      if (evalAmt > 0) {
        funds.push({ name, evalAmt, gainAmt });
      }
    }
  }

  return { funds, totalEval, totalGain };
};

// ─── 住信SBI残高パーサー ─────────────────────────────────
const parseSBIBankBalance = (text) => {
  // PapaParseを使えないためクォート対応の簡易CSVパーサーを使用
  const parseCSVLine = (line) => {
    const cols = []; let cur = "", inQ = false;
    for (const c of line) {
      if (c === '"') { inQ = !inQ; continue; }
      if (c === "," && !inQ) { cols.push(cur.trim()); cur = ""; continue; }
      cur += c;
    }
    cols.push(cur.trim());
    return cols;
  };
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    const cols = parseCSVLine(line);
    if (cols[0]?.match(/^\d{4}\/\d{1,2}\/\d{1,2}$/)) {
      // 最初のデータ行 = 最新残高（残高列のカンマを除去して整数化）
      const balance = parseInt((cols[4] || "0").replace(/[,，]/g, "")) || 0;
      const date    = cols[0].replace(/\//g, "-");
      if (balance > 0) return { balance, date };
    }
  }
  return null;
};

export function AssetsPage({ transactions, pointAccounts, balanceAdjustments: propAdj, onBalanceAdjustmentsChange }) {
  const [assets,          setAssets]         = useState(() => loadStorage(ASSETS_KEY, {
    bankBalance:  null,
    securities:   null,
    ideco:        null,
  }));
  // adjustmentsはpropsから受け取り（Supabase管理）、localStorageはフォールバック
  const [adjustments,     setAdjustments]    = useState(() =>
    propAdj || (() => { try { return JSON.parse(localStorage.getItem("kakeibo_balance_adjustments") || "[]"); } catch { return []; } })()
  );
  // propsが更新されたらstateも同期（Supabaseから読み込み後）
  useEffect(() => { if (propAdj) setAdjustments(propAdj); }, [propAdj]);
  const [adjInput,        setAdjInput]       = useState({}); // { [accountId]: string }
  const [showAdjHistory,  setShowAdjHistory] = useState({}); // { [accountId]: bool }
  const [bankAdjInput,    setBankAdjInput]   = useState("");
  const [loading,         setLoading]        = useState(false);
  const [activeTab,       setActiveTab]      = useState("overview");
  const [tsumitateList,   setTsumitateList]  = useState(() => loadTsumitateSettings());
  const [fundPrices,      setFundPrices]     = useState({});
  const [fundLoading,     setFundLoading]    = useState(false);
  const [showAddTsumi,    setShowAddTsumi]   = useState(false);
  const [newTsumi,        setNewTsumi]       = useState({ name: "", fundCode: "", monthlyAmount: "", startYM: "" });
  const [manualBankBalance, setManualBankBalance] = useState("");
  const [manualBankDate,    setManualBankDate]    = useState(() => new Date().toISOString().slice(0, 10));

  const bankFileRef  = useRef(null);
  const secFileRef   = useRef(null);

  // ── ファイル読み込み ──────────────────────────────────
  const handleBankFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const text   = await readCSVFile(file);
      const result = parseSBIBankBalance(text);
      if (result) {
        const newAssets = { ...assets, bankBalance: { ...result, updatedAt: new Date().toISOString() } };
        setAssets(newAssets);
        saveStorage(ASSETS_KEY, newAssets);
      } else {
        alert("残高を読み取れませんでした。住信SBIネット銀行のCSVか確認してください。");
      }
    } catch (e) {
      alert("読み込みエラー: " + e.message);
    } finally {
      setLoading(false);
    }
    e.target.value = "";
  };

  const handleSecFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const text   = await readCSVFile(file);
      const result = parseSBISecuritiesCSV(text);
      if (result.totalEval > 0) {
        const newAssets = { ...assets, securities: { ...result, updatedAt: new Date().toISOString() } };
        setAssets(newAssets);
        saveStorage(ASSETS_KEY, newAssets);
      } else {
        alert("証券データを読み取れませんでした。SBI証券のSaveFile.csvか確認してください。");
      }
    } catch (e) {
      alert("読み込みエラー: " + e.message);
    } finally {
      setLoading(false);
    }
    e.target.value = "";
  };

  // ── 計算 ─────────────────────────────────────────────
  const bankBalance  = assets.bankBalance?.balance  || 0;
  const secTotal     = assets.securities?.totalEval || 0;
  const secGain      = assets.securities?.totalGain || 0;
  const idecoBalance = assets.ideco?.balance        || 0;
  // 調整ベースの残高計算（B案: 最新調整以降の取引だけ積み上げ）
  const pointAccountsAdj = (pointAccounts || []).map(a => ({
    ...a,
    balance: calcBalanceWithAdjustment(a.id, transactions, adjustments),
  }));
  const pointTotal = pointAccountsAdj.reduce((s, a) => s + Math.max(0, a.balance), 0);
  const totalAssets  = bankBalance + secTotal + idecoBalance;

  // ── 今月の銀行増減 ────────────────────────────────────
  const now       = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthlyIncome  = (transactions || [])
    .filter(t => t.date?.startsWith(thisMonth) && t.type === "income")
    .reduce((s, t) => s + t.amount, 0);
  const monthlyExpense = (transactions || [])
    .filter(t => t.date?.startsWith(thisMonth) && t.type === "expense")
    .reduce((s, t) => s + t.amount, 0);
  const monthlyNet = monthlyIncome + monthlyExpense;

  const TABS = [
    { id: "overview",   label: "概要"   },
    { id: "bank",       label: "銀行"   },
    { id: "securities", label: "証券"   },
    { id: "tsumitate",  label: "積立"   },
    { id: "ideco",      label: "iDeCo"  },
  ];

  return (
    <div className="pb-24">
      <div className="bg-white px-4 pt-12 pb-4 border-b border-gray-100">
        <h1 className="text-xl font-bold text-gray-900">資産状況</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          最終更新：{assets.bankBalance?.updatedAt?.slice(0,10) || "未取得"}
        </p>
      </div>

      {/* タブ */}
      <div className="flex gap-1 px-4 py-3 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
              activeTab === t.id ? "bg-indigo-500 text-white" : "bg-gray-100 text-gray-500"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-4 py-2 space-y-4">

        {/* ── 概要タブ ── */}
        {activeTab === "overview" && (
          <>
            {/* 合計資産カード */}
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-5 text-white">
              <p className="text-xs font-semibold opacity-80 mb-1">合計資産</p>
              <p className="text-4xl font-bold tracking-tight">
                {fmtCurrency(totalAssets)}
              </p>
              <div className="flex gap-4 mt-3">
                <div>
                  <p className="text-xs opacity-70">証券含み益</p>
                  <p className={`text-sm font-bold ${secGain >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                    {secGain >= 0 ? "+" : ""}{fmtCurrency(secGain)}
                  </p>
                </div>
                <div>
                  <p className="text-xs opacity-70">今月収支</p>
                  <p className={`text-sm font-bold ${monthlyNet >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                    {monthlyNet >= 0 ? "+" : ""}{fmtCurrency(monthlyNet)}
                  </p>
                </div>
              </div>
            </div>

            {/* 内訳 */}
            <div className="bg-white rounded-2xl overflow-hidden border border-gray-100">
              {[
                { label:"住信SBIネット銀行", icon:"🏦", value: bankBalance,  sub: assets.bankBalance?.date || "未取得", color:"text-blue-600" },
                { label:"SBI証券（NISA）",   icon:"📈", value: secTotal,     sub: `含み益 ${secGain >= 0 ? "+" : ""}${fmtCurrency(secGain)}`, color:"text-emerald-600" },
                { label:"iDeCo",             icon:"🏛️", value: idecoBalance, sub: assets.ideco ? assets.ideco.date : "未取得", color:"text-purple-600" },
                { label:"ポイント合計",        icon:"⭐", value: pointTotal,   sub: `${(pointAccounts||[]).length}口座`, color:"text-amber-600" },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between px-4 py-3.5 border-b border-gray-50 last:border-b-0">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{item.icon}</span>
                    <div>
                      <p className="text-sm font-medium text-gray-800">{item.label}</p>
                      <p className="text-xs text-gray-400">{item.sub}</p>
                    </div>
                  </div>
                  <p className={`text-sm font-bold ${item.color}`}>{fmtCurrency(item.value)}</p>
                </div>
              ))}
            </div>

            {/* ファイル更新ボタン */}
            <div className="grid grid-cols-2 gap-3">
              <input ref={bankFileRef} type="file" accept=".csv" onChange={handleBankFile} className="hidden" />
              <button onClick={() => bankFileRef.current?.click()}
                className="py-3 bg-blue-50 border border-blue-200 rounded-xl text-xs font-semibold text-blue-600 flex flex-col items-center gap-1">
                <span className="text-xl">🏦</span>
                銀行残高を更新
              </button>
              <input ref={secFileRef} type="file" accept=".csv" onChange={handleSecFile} className="hidden" />
              <button onClick={() => secFileRef.current?.click()}
                className="py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-600 flex flex-col items-center gap-1">
                <span className="text-xl">📈</span>
                証券を更新
              </button>
            </div>
            {/* ポイント口座残高調整 */}
            {(pointAccountsAdj || []).length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <button onClick={() => setShowAdjHistory(p => ({...p, _panel: !p._panel}))}
                  className="w-full flex items-center justify-between px-4 py-3 text-left">
                  <p className="text-xs font-bold text-gray-700">🔧 ポイント口座 残高調整</p>
                  <span className="text-gray-400 text-xs">{showAdjHistory._panel ? "▲" : "▼"}</span>
                </button>
                {showAdjHistory._panel && (
                  <div className="px-4 pb-4 space-y-4 border-t border-gray-50">
                    <p className="text-xs text-gray-400 pt-2">
                      実際の残高を入力すると差分を自動補正します。取引一覧には表示されません。
                    </p>
                    {pointAccountsAdj.map(a => (
                      <div key={a.id} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-bold text-gray-700">{a.icon} {a.name}</p>
                          <p className="text-sm font-semibold text-gray-500">現在: {fmtCurrency(a.balance)}</p>
                        </div>
                        <div className="flex gap-2">
                          <span className="text-xs text-gray-400 self-center whitespace-nowrap">実際：¥</span>
                          <input type="number"
                            value={adjInput[a.id] || ""}
                            onChange={e => setAdjInput(p => ({...p, [a.id]: e.target.value}))}
                            placeholder={String(Math.abs(a.balance))}
                            className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                          />
                          <button onClick={() => {
                            const bal = parseInt(adjInput[a.id]);
                            if (isNaN(bal)) { alert("残高を入力してください"); return; }
                            const today = new Date().toISOString().slice(0, 10);
                            const newAdj = { accountId: a.id, date: today, balance: bal, note: "手動調整" };
                            const updated = [...adjustments.filter(x => !(x.accountId === a.id && x.date === today)), newAdj];
                            setAdjustments(updated); onBalanceAdjustmentsChange?.(updated);
                            setAdjInput(p => ({...p, [a.id]: ""}));
                            alert(`✅ ${a.name}残高を¥${bal.toLocaleString()}に調整しました`);
                          }} className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-bold whitespace-nowrap">
                            調整
                          </button>
                        </div>
                        {/* 調整履歴 */}
                        {adjustments.filter(x => x.accountId === a.id).length > 0 && (
                          <div className="bg-gray-50 rounded-lg px-3 py-2">
                            <p className="text-xs text-gray-400 font-semibold mb-1">📅 履歴</p>
                            {adjustments.filter(x => x.accountId === a.id)
                              .sort((x,y) => y.date.localeCompare(x.date)).slice(0,3)
                              .map((x,i) => (
                                <div key={i} className="flex justify-between text-xs text-gray-500 py-0.5">
                                  <span>{x.date}</span>
                                  <span className="font-semibold">¥{x.balance.toLocaleString()}</span>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── 銀行タブ ── */}
        {activeTab === "bank" && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-4 border border-gray-100">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-xs text-gray-400 font-semibold">住信SBIネット銀行</p>
                  <p className="text-3xl font-bold text-blue-600 mt-1">{fmtCurrency(bankBalance)}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {assets.bankBalance ? `${assets.bankBalance.date} 時点` : "未取得"}
                  </p>
                </div>
                <input ref={bankFileRef} type="file" accept=".csv" onChange={handleBankFile} className="hidden" />
                <button onClick={() => bankFileRef.current?.click()}
                  className="px-3 py-2 bg-blue-500 text-white rounded-xl text-xs font-semibold">
                  CSV更新
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 border-t border-gray-50 pt-3">
                <div className="bg-emerald-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-emerald-500 font-semibold">今月入金</p>
                  <p className="text-lg font-bold text-emerald-600 mt-0.5">{fmtCurrency(monthlyIncome)}</p>
                </div>
                <div className="bg-rose-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-rose-500 font-semibold">今月出金</p>
                  <p className="text-lg font-bold text-rose-600 mt-0.5">{fmtCurrency(Math.abs(monthlyExpense))}</p>
                </div>
              </div>
            </div>

            {/* 残高調整（差異補正） */}
            <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100 space-y-2">
              <p className="text-xs font-bold text-amber-700">🔧 残高調整（最終手段）</p>
              <p className="text-xs text-amber-600">実際の残高と合わない場合に使用。取引一覧には表示されません。</p>
              <div className="flex gap-2 items-center">
                <span className="text-xs text-gray-500 whitespace-nowrap">実際の残高：¥</span>
                <input type="number" value={bankAdjInput} onChange={e => setBankAdjInput(e.target.value)}
                  placeholder="213305"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" />
              </div>
              <button onClick={() => {
                const bal = parseInt(bankAdjInput);
                if (!bal || bal <= 0) { alert("正しい残高を入力してください"); return; }
                const today = new Date().toISOString().slice(0, 10);
                const newAdj = { accountId: "sbi_bank", date: today, balance: bal, note: "手動調整" };
                const updated = [...adjustments.filter(a => !(a.accountId === "sbi_bank" && a.date === today)), newAdj];
                setAdjustments(updated); onBalanceAdjustmentsChange?.(updated);
                const na = { ...assets, bankBalance: { balance: bal, date: today } };
                setAssets(na); saveStorage(ASSETS_KEY, na);
                setBankAdjInput("");
                alert(`✅ SBI銀行残高を¥${bal.toLocaleString()}に調整しました`);
              }} className="w-full py-2 text-xs font-bold bg-amber-500 text-white rounded-lg">
                🔧 残高を調整する
              </button>
              {adjustments.filter(a => a.accountId === "sbi_bank").length > 0 && (
                <div className="pt-2 border-t border-amber-200">
                  <p className="text-xs font-bold text-amber-700 mb-1">📅 調整履歴</p>
                  {adjustments.filter(a => a.accountId === "sbi_bank").sort((a,b) => b.date.localeCompare(a.date)).slice(0,5).map((a,i) => (
                    <div key={i} className="flex justify-between text-xs text-gray-500 py-0.5">
                      <span>{a.date}</span><span className="font-semibold">¥{a.balance.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 手動入力 */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100 space-y-3">
              <p className="text-xs font-bold text-gray-600">✏️ 残高を手動入力</p>
              <div className="flex gap-2 items-center">
                <label className="text-xs text-gray-500 whitespace-nowrap">日付：</label>
                <input type="date"
                  value={manualBankDate}
                  onChange={e => setManualBankDate(e.target.value)}
                  className="flex-1 text-xs px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg outline-none" />
              </div>
              <div className="flex gap-2 items-center">
                <label className="text-xs text-gray-500 whitespace-nowrap">残高：</label>
                <div className="flex-1 flex items-center gap-1">
                  <span className="text-xs text-gray-400">¥</span>
                  <input type="number"
                    value={manualBankBalance}
                    onChange={e => setManualBankBalance(e.target.value)}
                    placeholder="例: 190000"
                    className="flex-1 text-sm font-bold px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg outline-none" />
                </div>
              </div>
              <button
                onClick={() => {
                  if (!manualBankBalance) return;
                  const newAssets = {
                    ...assets,
                    bankBalance: {
                      balance:   parseInt(manualBankBalance),
                      date:      manualBankDate,
                      updatedAt: new Date().toISOString(),
                      source:    "manual",
                    }
                  };
                  setAssets(newAssets);
                  saveStorage(ASSETS_KEY, newAssets);
                  setManualBankBalance("");
                  alert(`✅ ${manualBankDate}時点の残高を¥${parseInt(manualBankBalance).toLocaleString()}で記録しました`);
                }}
                className="w-full py-2.5 bg-blue-500 text-white rounded-xl text-sm font-semibold">
                記録する
              </button>
            </div>

            <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
              <p className="text-xs font-semibold text-amber-600 mb-1">📌 取得方法</p>
              <p className="text-xs text-amber-500 leading-relaxed">
                CSV更新：住信SBIネット銀行 → 入出金明細 → CSVダウンロード<br/>
                手動入力：ネットバンキングで残高照会して直接入力
              </p>
            </div>
          </div>
        )}

        {/* ── 証券タブ ── */}
        {activeTab === "securities" && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-4 border border-gray-100">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="text-xs text-gray-400 font-semibold">SBI証券（NISA）</p>
                  <p className="text-3xl font-bold text-emerald-600 mt-1">{fmtCurrency(secTotal)}</p>
                  <p className={`text-sm font-semibold mt-0.5 ${secGain >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                    含み益 {secGain >= 0 ? "+" : ""}{fmtCurrency(secGain)}
                  </p>
                </div>
                <input ref={secFileRef} type="file" accept=".csv" onChange={handleSecFile} className="hidden" />
                <button onClick={() => secFileRef.current?.click()}
                  className="px-3 py-2 bg-emerald-500 text-white rounded-xl text-xs font-semibold">
                  CSV更新
                </button>
              </div>
            </div>

            {/* 銘柄一覧 */}
            {assets.securities?.funds?.length > 0 && (
              <div className="bg-white rounded-2xl overflow-hidden border border-gray-100">
                <div className="px-4 py-3 border-b border-gray-50">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">保有銘柄</p>
                </div>
                {assets.securities.funds.map((f, i) => (
                  <div key={i} className="px-4 py-3 border-b border-gray-50 last:border-b-0">
                    <p className="text-xs font-medium text-gray-800 leading-snug">{f.name}</p>
                    <div className="flex justify-between mt-1">
                      <p className="text-sm font-bold text-gray-700">{fmtCurrency(f.evalAmt)}</p>
                      <p className={`text-xs font-semibold ${f.gainAmt >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                        {f.gainAmt >= 0 ? "+" : ""}{fmtCurrency(f.gainAmt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!assets.securities && (
              <div className="bg-gray-50 rounded-2xl p-6 text-center border border-gray-100">
                <p className="text-3xl mb-2">📊</p>
                <p className="text-sm font-semibold text-gray-600">SBI証券のデータ未取得</p>
                <p className="text-xs text-gray-400 mt-1">SaveFile.csvをアップロードしてください</p>
              </div>
            )}

            <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
              <p className="text-xs font-semibold text-amber-600 mb-1">📌 取得方法</p>
              <p className="text-xs text-amber-500 leading-relaxed">
                SBI証券 → 口座管理 → 保有証券一覧 → 「保存」ボタン → SaveFile.csvをアップロード
              </p>
            </div>
          </div>
        )}

        {/* ── 積立タブ ── */}
        {activeTab === "tsumitate" && (
          <TsumitateTab
            transactions={transactions}
            tsumitateList={tsumitateList}
            onSave={(list) => { setTsumitateList(list); saveTsumitateSettings(list); }}
            fundPrices={fundPrices}
            onFetchPrices={async (list) => {
              setFundLoading(true);
              const prices = {};
              for (const t of list) {
                if (!t.fundCode) continue;
                try { prices[t.fundCode] = await fetchFundPrice(t.fundCode); } catch (e) { prices[t.fundCode] = { error: e.message }; }
              }
              setFundPrices(prices);
              setFundLoading(false);
            }}
            fundLoading={fundLoading}
          />
        )}

        {/* ── iDeCoタブ ── */}
        {activeTab === "ideco" && (
          <div className="space-y-4">
            <div className="bg-purple-50 rounded-2xl p-5 border border-purple-100 text-center">
              <p className="text-3xl mb-2">🏛️</p>
              <p className="text-sm font-semibold text-purple-700">iDeCo設定待ち</p>
              <p className="text-xs text-purple-400 mt-1 leading-relaxed">
                iDeCoのCSVファイルを確認後に対応します
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── 積立タブコンポーネント ───────────────────────────────────
function TsumitateTab({ transactions, tsumitateList, onSave, fundPrices, onFetchPrices, fundLoading }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form,    setForm]    = useState({ name: "", fundCode: "", monthlyAmount: "", startYM: "" });

  const now = new Date();
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // SBI証券積立の取引からactualな積立月を取得
  const sbiTxs = (transactions || []).filter(t =>
    t.label?.includes("SBI証券投信積立") || t.label?.includes("ＳＢＩ証券投信積立")
  );

  // 積立設定ごとに計算
  const calcTsumi = (t) => {
    const start = t.startYM || "2024-01";
    const [sy, sm] = start.split("-").map(Number);
    const [ny, nm] = currentYM.split("-").map(Number);
    const months = Math.max(0, (ny - sy) * 12 + (nm - sm) + 1);
    const totalInvested = (parseInt(t.monthlyAmount) || 0) * months;
    const fp = fundPrices[t.fundCode];
    const evalAmt   = fp?.price ? Math.round(totalInvested * (fp.price / 10000)) : null;
    const gainAmt   = evalAmt != null ? evalAmt - totalInvested : null;
    const gainPct   = totalInvested > 0 && gainAmt != null ? (gainAmt / totalInvested * 100) : null;
    return { months, totalInvested, evalAmt, gainAmt, gainPct, fp };
  };

  const totalInvested = tsumitateList.reduce((s, t) => s + calcTsumi(t).totalInvested, 0);
  const totalEval     = tsumitateList.reduce((s, t) => { const c = calcTsumi(t); return s + (c.evalAmt ?? c.totalInvested); }, 0);
  const totalGain     = totalEval - totalInvested;

  const startEdit = (t, idx) => {
    setForm({ ...t, _idx: idx });
    setEditing(idx);
    setShowAdd(true);
  };

  const saveForm = () => {
    const next = [...tsumitateList];
    if (editing != null) next[editing] = { ...form };
    else next.push({ ...form, id: Date.now() });
    onSave(next);
    setShowAdd(false); setEditing(null);
    setForm({ name: "", fundCode: "", monthlyAmount: "", startYM: "" });
  };

  const deleteTsumi = (idx) => {
    if (!window.confirm("削除しますか？")) return;
    const next = tsumitateList.filter((_, i) => i !== idx);
    onSave(next);
  };

  return (
    <div className="px-4 py-4 space-y-4">
      {/* SBI積立の取引実績 */}
      {sbiTxs.length > 0 && (
        <div className="bg-blue-50 rounded-2xl p-3 border border-blue-100">
          <p className="text-xs font-semibold text-blue-700 mb-1">📊 SBI証券積立の取引履歴</p>
          <p className="text-xs text-blue-500">{sbiTxs.length}件 合計¥{Math.abs(sbiTxs.reduce((s,t)=>s+t.amount,0)).toLocaleString()}</p>
        </div>
      )}

      {/* 合計サマリー */}
      {tsumitateList.length > 0 && (
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-2xl p-4 border border-emerald-100">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-emerald-700">積立合計（概算）</p>
            <button onClick={() => onFetchPrices(tsumitateList)}
              disabled={fundLoading}
              className="text-xs text-emerald-600 bg-white px-2 py-0.5 rounded-full border border-emerald-200">
              {fundLoading ? "取得中..." : "🔄 基準価額更新"}
            </button>
          </div>
          <p className="text-2xl font-bold text-emerald-700">¥{totalEval.toLocaleString()}</p>
          <p className={`text-xs font-semibold mt-0.5 ${totalGain >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
            {totalGain >= 0 ? "+" : ""}¥{totalGain.toLocaleString()} 含み{totalGain >= 0 ? "益" : "損"}
          </p>
          <p className="text-xs text-gray-400 mt-1">投資元本: ¥{totalInvested.toLocaleString()}</p>
        </div>
      )}

      {/* 銘柄一覧 */}
      {tsumitateList.map((t, idx) => {
        const { months, totalInvested: inv, evalAmt, gainAmt, gainPct, fp } = calcTsumi(t);
        return (
          <div key={t.id || idx} className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-800">{t.name || "銘柄名未設定"}</p>
                {t.fundCode && <p className="text-xs text-gray-400 mt-0.5">コード: {t.fundCode}</p>}
                {fp?.price && <p className="text-xs text-gray-400">基準価額: ¥{fp.price.toLocaleString()} ({fp.priceDate})</p>}
                {fp?.error && <p className="text-xs text-rose-400">⚠️ 取得失敗: {fp.error}</p>}
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={() => startEdit(t, idx)} className="text-xs text-gray-400">✏️</button>
                <button onClick={() => deleteTsumi(idx)} className="text-xs text-rose-400">✕</button>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="bg-gray-50 rounded-xl p-2 text-center">
                <p className="text-xs font-bold text-gray-700">¥{(parseInt(t.monthlyAmount)||0).toLocaleString()}</p>
                <p className="text-xs text-gray-400">月額</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-2 text-center">
                <p className="text-xs font-bold text-gray-700">{months}ヶ月</p>
                <p className="text-xs text-gray-400">{t.startYM}〜</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-2 text-center">
                <p className="text-xs font-bold text-gray-700">¥{inv.toLocaleString()}</p>
                <p className="text-xs text-gray-400">元本合計</p>
              </div>
            </div>
            {evalAmt != null && (
              <div className="mt-2 flex items-center justify-between bg-emerald-50 rounded-xl px-3 py-2">
                <p className="text-sm font-bold text-emerald-700">¥{evalAmt.toLocaleString()}</p>
                <p className={`text-xs font-semibold ${gainAmt >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                  {gainAmt >= 0 ? "+" : ""}¥{gainAmt.toLocaleString()} ({gainPct?.toFixed(1)}%)
                </p>
              </div>
            )}
          </div>
        );
      })}

      {/* 追加フォーム */}
      {showAdd && (
        <div className="bg-white rounded-2xl border border-indigo-100 p-4 space-y-3">
          <p className="text-sm font-bold text-gray-700">{editing != null ? "銘柄を編集" : "銘柄を追加"}</p>
          {[
            { key: "name",          label: "銘柄名",          placeholder: "eMAXIS Slim S&P500" },
            { key: "fundCode",      label: "ファンドコード",  placeholder: "0331418A" },
            { key: "monthlyAmount", label: "月額（円）",       placeholder: "20000", type: "number" },
            { key: "startYM",       label: "開始年月",         placeholder: "2024-01" },
          ].map(({ key, label, placeholder, type }) => (
            <div key={key}>
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <input value={form[key] || ""} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                type={type || "text"} placeholder={placeholder}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-300" />
            </div>
          ))}
          <p className="text-xs text-gray-400">※ファンドコードは投信協会サイトで確認できます</p>
          <div className="flex gap-2">
            <button onClick={saveForm} className="flex-1 py-2.5 bg-indigo-500 text-white text-sm font-semibold rounded-xl">保存</button>
            <button onClick={() => { setShowAdd(false); setEditing(null); }} className="flex-1 py-2.5 bg-gray-100 text-gray-500 text-sm font-semibold rounded-xl">キャンセル</button>
          </div>
        </div>
      )}

      <button onClick={() => { setShowAdd(true); setEditing(null); setForm({ name: "", fundCode: "", monthlyAmount: "", startYM: "" }); }}
        className="w-full py-3 rounded-2xl border-2 border-dashed border-gray-200 text-gray-400 text-sm font-semibold">
        ＋ 銘柄を追加
      </button>
    </div>
  );
}
