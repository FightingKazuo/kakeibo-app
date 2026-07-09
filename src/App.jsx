import React, { useState, useMemo, useEffect, useCallback } from "react";
import { STOCKS } from "./stocks";

// ── Error Boundary（クラッシュ時に白画面を防ぐ）──────────
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(e) { return { hasError: true, error: e }; }
  componentDidCatch(e, info) { console.error("App crashed:", e, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{padding:32,textAlign:"center",fontFamily:"sans-serif"}}>
          <div style={{fontSize:32,marginBottom:12}}>⚠️</div>
          <div style={{fontSize:16,fontWeight:700,color:"#1E293B",marginBottom:8}}>表示エラーが発生しました</div>
          <div style={{fontSize:12,color:"#64748B",marginBottom:24}}>{String(this.state.error)}</div>
          <button onClick={()=>window.location.reload()}
            style={{background:"#2563EB",color:"#fff",border:"none",borderRadius:8,padding:"10px 20px",fontSize:14,cursor:"pointer"}}>
            再読み込み（データ保持）
          </button>
          <button onClick={()=>{ if(window.confirm("保有データが削除されます。よろしいですか？")){ localStorage.removeItem("kabu_holdings"); window.location.reload(); } }}
            style={{background:"#F1F5F9",color:"#DC2626",border:"1px solid #FECACA",borderRadius:8,padding:"10px 20px",fontSize:14,cursor:"pointer",marginLeft:8}}>
            データ削除して再起動
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area, ReferenceLine } from "recharts";


const TYPE_LABEL = { fund:"投信", jp:"国内株", us:"米国株", crypto:"仮想通貨" };
const TYPE_COLOR = { fund:"#7C3AED", jp:"#2563EB", us:"#059669", crypto:"#F59E0B" };
const RISK_LABEL = { low:"低リスク", medium:"中リスク", high:"高リスク", "very-high":"超ハイリスク" };
const RISK_COLOR = { low:"#059669", medium:"#2563EB", high:"#D97706", "very-high":"#DC2626" };
const COLORS = ["#2563EB","#059669","#D97706","#DC2626","#7C3AED","#DB2777"];

const C = {
  bg:"#F8FAFF", card:"#FFFFFF", border:"#E2E8F0", soft:"#F1F5F9",
  text:"#1E293B", mid:"#475569", light:"#94A3B8",
  blue:"#2563EB", blueLight:"#EFF6FF", blueMid:"#BFDBFE",
  green:"#059669", greenLight:"#ECFDF5", greenMid:"#A7F3D0",
  red:"#DC2626", redLight:"#FEF2F2", redMid:"#FECACA",
  amber:"#D97706", amberLight:"#FFFBEB",
};

// ── localStorage + 世代バックアップ ─────────────────
const BACKUP_KEYS = ["kabu_holdings", "kabu_goal"];
const MAX_GEN = 3; // 保持世代数

function loadLS(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    if (!v) return fallback;
    const parsed = JSON.parse(v);
    if (key === "kabu_holdings") return parsed.map(h => {
      const stock = STOCKS.find(s => s.symbol === h.stock?.symbol) || h.stock;
      let purchasePrice = h.purchasePrice ?? null;
      if (purchasePrice !== null && h.amount > 0) {
        if (h.amount / purchasePrice > 100000) purchasePrice = null;
      }
      return { ...h, stock, purchasePrice };
    });
    if (key === "kabu_simStocks") return parsed.map(sym => STOCKS.find(s => s.symbol === sym) || STOCKS[0]);
    return parsed;
  } catch { return fallback; }
}

function saveLS(key, value) {
  try {
    const serialized = JSON.stringify(key === "kabu_simStocks" ? value.map(s => s.symbol) : value);
    if (BACKUP_KEYS.includes(key)) {
      const existing = localStorage.getItem(key);
      if (existing && existing !== serialized) {
        // 世代をシフト: bak2←bak1←bak0←current
        for (let i = MAX_GEN - 1; i >= 1; i--) {
          const prev = localStorage.getItem(`${key}_bak${i-1}`);
          if (prev) localStorage.setItem(`${key}_bak${i}`, prev);
        }
        localStorage.setItem(`${key}_bak0`, existing);
        localStorage.setItem("kabu_bak_time", new Date().toISOString());
      }
    }
    localStorage.setItem(key, serialized);
  } catch {}
}

function restoreBackup() {
  try {
    const bak = localStorage.getItem("kabu_holdings_bak0");
    if (!bak) return false;
    // 世代を1つ戻す
    localStorage.setItem("kabu_holdings", bak);
    const bak1 = localStorage.getItem("kabu_holdings_bak1");
    if (bak1) localStorage.setItem("kabu_holdings_bak0", bak1);
    localStorage.removeItem("kabu_holdings_bak1");
    return true;
  } catch { return false; }
}

function getBackupTime() {
  try {
    const t = localStorage.getItem("kabu_bak_time");
    if (!t) return null;
    return new Date(t).toLocaleString("ja-JP", { month:"numeric", day:"numeric", hour:"2-digit", minute:"2-digit" });
  } catch { return null; }
}

// ── 計算ユーティリティ ───────────────────────────────
function calcCurrentValue(amount, purchaseDate, annualReturn, currentPrice, purchasePrice) {
  try {
    const amt = Number(amount) || 0;
    const ret = Number(annualReturn) || 0;
    if (currentPrice && purchasePrice && purchasePrice > 0) {
      return Math.round(amt * (currentPrice / purchasePrice));
    }
    const bought = new Date(purchaseDate);
    if (isNaN(bought.getTime())) return amt;
    const years = Math.max(0, (new Date() - bought) / (1000*60*60*24*365.25));
    const result = amt * Math.pow(1 + ret/100, years);
    return isNaN(result) ? amt : Math.round(result);
  } catch(e) {
    return Number(amount) || 0;
  }
}
function simulateMonthly(stock, monthly, months) {
  const r = stock.annualReturn/100/12;
  const out = [];
  for (let m=0; m<=months; m++) {
    const invested = monthly*m;
    const value = r===0 ? invested : monthly*((Math.pow(1+r,m)-1)/r)*(1+r);
    if (m%12===0||m===months) out.push({ year: m%12===0?`${m/12}年`:`${m}ヶ月`, invested, value:Math.round(value) });
  }
  return out;
}
function simulateLumpSum(stock, amount, yrs) {
  const r = stock.annualReturn/100;
  return Array.from({length:yrs+1},(_,y)=>({ year:`${y}年`, invested:amount, value:Math.round(amount*Math.pow(1+r,y)) }));
}

// 指定日時点の評価額を計算（補完用）
function calcCurrentValueAt(h, dateStr, dayPrice) {
  try {
    const amt = Number(h.amount) || 0;
    // 過去価格と購入時価格の両方があれば正確な比率計算
    if (dayPrice && h.purchasePrice && h.purchasePrice > 0) {
      return Math.round(amt * (dayPrice / h.purchasePrice));
    }
    // なければ年率近似
    const bought = new Date(h.purchaseDate);
    const target = new Date(dateStr);
    if (isNaN(bought.getTime()) || isNaN(target.getTime())) return amt;
    const years = Math.max(0, (target - bought) / (1000*60*60*24*365.25));
    const ret = Number(h.stock?.annualReturn) || 0;
    const result = amt * Math.pow(1 + ret/100, years);
    return isNaN(result) ? amt : Math.round(result);
  } catch { return Number(h.amount) || 0; }
}

const fmt    = n => n>=100000000 ? `${(n/100000000).toFixed(2)}億円` : `${Math.round(n).toLocaleString()}円`;
const fmtPct = n => (n>=0?"+":"")+n.toFixed(1)+"%";
const today  = () => new Date().toISOString().split("T")[0];

const ChartTooltip = ({active,payload,label}) => {
  if(!active||!payload?.length) return null;
  const base = payload.find(p=>p.name==="元本");
  const stocks = payload.filter(p=>p.name!=="元本"&&p.name!=="目標");
  return (
    <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 14px",boxShadow:"0 4px 16px rgba(0,0,0,0.10)"}}>
      <p style={{color:C.light,fontSize:11,margin:"0 0 4px",fontWeight:600}}>{label}</p>
      {base&&<p style={{color:C.mid,fontSize:12,margin:"2px 0"}}>元本: {fmt(base.value)}</p>}
      {stocks.map((p,i)=>{
        const gain=base?p.value-base.value:0;
        return (
          <div key={i} style={{borderTop:`1px solid ${C.soft}`,marginTop:4,paddingTop:4}}>
            <p style={{color:p.color,fontSize:13,margin:"2px 0",fontWeight:700}}>{p.name}: {fmt(p.value)}</p>
            {base&&<p style={{color:gain>=0?C.green:C.red,fontSize:11,margin:0}}>損益 {gain>=0?"+":""}{fmt(gain)} ({fmtPct((p.value/base.value-1)*100)})</p>}
          </div>
        );
      })}
    </div>
  );
};

// ── 銘柄一覧コンポーネント ─────────────────────────────
const THEME_TABS = [
  { key:"all",     label:"すべて" },
  { key:"beginner",label:"初心者向け" },
  { key:"dividend",label:"高配当" },
  { key:"growth",  label:"成長株" },
  { key:"fund",    label:"投信" },
  { key:"jp",      label:"国内株" },
  { key:"us",      label:"米国株" },
  { key:"crypto",  label:"仮想通貨" },
];

function matchTheme(s, theme) {
  if (theme === "all") return true;
  if (theme === "fund" || theme === "jp" || theme === "us" || theme === "crypto") return s.type === theme;
  if (theme === "beginner") return s.tags?.includes("初心者向け") || s.tags?.includes("少額OK") || s.risk === "low";
  if (theme === "dividend") return s.tags?.some(t => t.includes("配当")) || s.dividend >= 2;
  if (theme === "growth")   return s.tags?.includes("成長株") || s.tags?.includes("爆発的成長") || s.annualReturn >= 18;
  return true;
}

function StockList({ stocks, stockPrices, cryptoPrices, onSelect }) {
  const [theme, setTheme]   = useState("all");
  const [search, setSearch] = useState("");

  const filtered = stocks.filter(s => {
    const matchT = matchTheme(s, theme);
    const q = search.toLowerCase();
    const matchS = !q || s.name.toLowerCase().includes(q) || s.symbol.toLowerCase().includes(q) || s.sector.includes(q);
    return matchT && matchS;
  });

  return (
    <div>
      {/* 検索 */}
      <div style={{marginBottom:12}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍  銘柄名・コード・セクターで検索"
          style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,borderRadius:10,color:C.text,padding:"10px 14px",fontSize:13,boxSizing:"border-box",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}/>
      </div>

      {/* テーマタブ */}
      <div style={{display:"flex",gap:6,marginBottom:14,overflowX:"auto",paddingBottom:4}}>
        {THEME_TABS.map(t=>(
          <button key={t.key} onClick={()=>setTheme(t.key)} style={{background:theme===t.key?C.blue:C.card,color:theme===t.key?"#fff":C.mid,border:`1px solid ${theme===t.key?C.blue:C.border}`,borderRadius:20,padding:"5px 14px",fontSize:12,fontWeight:theme===t.key?700:400,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,transition:"all .15s"}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* 件数 */}
      <div style={{fontSize:11,color:C.light,marginBottom:10}}>{filtered.length}銘柄</div>

      {/* リスト */}
      <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,overflow:"hidden",boxShadow:"0 1px 6px rgba(0,0,0,0.05)"}}>
        {filtered.length===0&&<div style={{textAlign:"center",padding:"32px 0",color:C.light,fontSize:13}}>見つかりませんでした</div>}
        {filtered.map((s,i)=>{
          const sp = stockPrices[s.symbol];
          const cp = cryptoPrices[s.symbol];
          const livePrice = sp?.price ?? cp?.price ?? null;
          const liveChange = sp?.change ?? cp?.change24h ?? null;
          return (
            <div key={s.symbol} style={{padding:"12px 16px",borderTop:i>0?`1px solid ${C.soft}`:"none"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                {/* 左：銘柄名・説明 */}
                <div style={{flex:1,marginRight:12}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3,flexWrap:"wrap"}}>
                    <span style={{fontSize:14,fontWeight:700,color:C.text}}>{s.name}</span>
                    <span style={{background:TYPE_COLOR[s.type]+"18",color:TYPE_COLOR[s.type],fontSize:9,fontWeight:700,borderRadius:4,padding:"1px 6px"}}>{TYPE_LABEL[s.type]}</span>
                    <span style={{background:RISK_COLOR[s.risk]+"15",color:RISK_COLOR[s.risk],fontSize:9,fontWeight:700,borderRadius:4,padding:"1px 6px"}}>{RISK_LABEL[s.risk]}</span>
                  </div>
                  <div style={{fontSize:11,color:C.mid,marginBottom:5,lineHeight:1.5}}>{s.desc}</div>
                  {/* タグ */}
                  <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                    {s.tags?.map(tag=>(
                      <span key={tag} style={{background:C.soft,color:C.mid,fontSize:10,borderRadius:4,padding:"2px 7px"}}>{tag}</span>
                    ))}
                  </div>
                </div>
                {/* 右：株価・ボタン */}
                <div style={{textAlign:"right",flexShrink:0}}>
                  {livePrice&&typeof livePrice==="number"?(
                    <>
                      <div style={{fontSize:13,fontWeight:800,color:C.text}}>¥{Number(livePrice).toLocaleString()}</div>
                      {liveChange!==null&&typeof liveChange==="number"&&<div style={{fontSize:11,color:liveChange>=0?C.green:C.red,fontWeight:600}}>{liveChange>=0?"+":""}{liveChange.toFixed(1)}%</div>}
                      <div style={{fontSize:9,color:C.green,fontWeight:700,marginBottom:4}}>●LIVE</div>
                    </>
                  ):(
                    <div style={{fontSize:11,color:C.light,marginBottom:6}}>年率{fmtPct(s.annualReturn)}</div>
                  )}
                  <button onClick={()=>onSelect(s)} style={{background:C.blue,border:"none",borderRadius:7,color:"#fff",fontSize:11,fontWeight:700,padding:"5px 10px",cursor:"pointer",whiteSpace:"nowrap"}}>
                    ＋ 追加
                  </button>
                </div>
              </div>
              {/* 下段：配当・最低購入額 */}
              <div style={{display:"flex",gap:12,paddingTop:6,borderTop:`1px solid ${C.soft}`}}>
                <div style={{fontSize:10,color:C.light}}>最低購入額: <span style={{color:C.mid,fontWeight:600}}>{fmt(s.minAmount)}</span></div>
                {s.dividend>0&&<div style={{fontSize:10,color:C.light}}>配当利回り: <span style={{color:C.amber,fontWeight:600}}>{s.dividend}%</span></div>}
                {s.優待&&<div style={{fontSize:10,color:C.amber}}>🎁 優待あり</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const SAMPLE_HOLDINGS = [
  {id:1,stock:STOCKS[0],purchaseDate:"2023-04-01",amount:30000,purchasePrice:null},
  {id:2,stock:STOCKS[6],purchaseDate:"2022-10-15",amount:358000,purchasePrice:null},
  {id:3,stock:STOCKS[20],purchaseDate:"2023-01-01",amount:50000,purchasePrice:null},
];

// ════════════════════════════════════════════════════════
function KabuPlusInner() {
  const [mainTab, setMainTab] = useState("portfolio");

  // ── ポートフォリオ ──
  const [holdings, setHoldingsRaw] = useState(() => loadLS("kabu_holdings", SAMPLE_HOLDINGS));
  const setHoldings = useCallback(v => setHoldingsRaw(prev => {
    const n = typeof v === "function" ? v(prev) : v;
    saveLS("kabu_holdings", n);
    setBackupTime(getBackupTime());
    return n;
  }),[]);

  const [showAdd, setShowAdd]         = useState(false);
  const [newStock, setNewStock]       = useState(STOCKS[0]);
  const [newDate, setNewDate]         = useState(today());
  const [newAmount, setNewAmount]     = useState(100000);
  const [newAnnualReturn, setNewAnnualReturn] = useState(null); // カスタム年率
  const [stockSearch, setStockSearch] = useState("");
  const [showPicker, setShowPicker]   = useState(false);
  const [filterType, setFilterType]   = useState("all");
  const [sortMode, setSortMode]       = useState("date"); // date|gain|symbol
  const [groupMode, setGroupMode]     = useState(false);  // 銘柄集計モード
  const [expandedGroup, setExpandedGroup] = useState(null);

  // ── API データ ──
  const [cryptoPrices, setCryptoPrices] = useState({});
  const [fundPrices, setFundPrices]     = useState({});
  const [stockPrices, setStockPrices]   = useState({});
  const [usdJpy, setUsdJpy]             = useState(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError]     = useState(false);
  const [searchResults, setSearchResults]   = useState([]);
  const [searchLoading, setSearchLoading]   = useState(false);
  const [searchError, setSearchError]       = useState(false);
  const [searchMode, setSearchMode]         = useState(false);

  // ── 目標金額 ──
  const [goalAmount, setGoalAmountRaw] = useState(() => loadLS("kabu_goal", 0));
  const [backupTime, setBackupTime]     = useState(() => getBackupTime());
  const [restoreMsg, setRestoreMsg]     = useState("");
  const setGoalAmount = v => { setGoalAmountRaw(v); saveLS("kabu_goal", v); };
  const [showGoalEdit, setShowGoalEdit] = useState(false);
  const [goalInput, setGoalInput]       = useState("");

  // ── シミュ ──
  const [simMode, setSimModeRaw]  = useState(() => loadLS("kabu_simMode","monthly"));
  const setSimMode = v => { setSimModeRaw(v); saveLS("kabu_simMode",v); };
  const [simStocks, setSimStocksRaw] = useState(() => loadLS("kabu_simStocks",[STOCKS[0]]));
  const setSimStocks = useCallback(v => setSimStocksRaw(prev => { const n=typeof v==="function"?v(prev):v; saveLS("kabu_simStocks",n); return n; }),[]);
  const [monthly,  setMonthlyRaw]  = useState(() => loadLS("kabu_monthly",30000));
  const setMonthly  = v => { setMonthlyRaw(v);  saveLS("kabu_monthly",v); };
  const [lump,     setLumpRaw]     = useState(() => loadLS("kabu_lump",1000000));
  const setLump     = v => { setLumpRaw(v);     saveLS("kabu_lump",v); };
  const [months,   setMonthsRaw]   = useState(() => loadLS("kabu_months",120));
  const setMonths   = v => { setMonthsRaw(v);   saveLS("kabu_months",v); };
  const [years,    setYearsRaw]    = useState(() => loadLS("kabu_years",10));
  const setYears    = v => { setYearsRaw(v);    saveLS("kabu_years",v); };
  const [simSearch, setSimSearch]  = useState("");
  const [showSimSearch, setShowSimSearch] = useState(false);

  // ── API取得 ──
  // ════ 価格取得（統合版・60秒ポーリング）════
  const [lastUpdate, setLastUpdate] = useState(null);
  const [priceFlash, setPriceFlash] = useState({}); // symbol → "up"|"down"

  const refreshAllPrices = useCallback(() => {
    // ① 仮想通貨（保有中のみ）
    const heldCryptos = STOCKS.filter(s => s.type === "crypto" && s.cgId &&
      holdings.some(h => h.stock?.symbol === s.symbol));
    if (heldCryptos.length > 0) {
      const ids = heldCryptos.map(s => s.cgId).join(",");
      fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=jpy&include_24hr_change=true`)
        .then(r => r.json()).then(data => {
          const prices = {};
          heldCryptos.forEach(s => {
            if (data[s.cgId]) prices[s.symbol] = { price: data[s.cgId].jpy, change24h: data[s.cgId].jpy_24h_change || 0 };
          });
          setCryptoPrices(prev => {
            // フラッシュ判定
            const flash = {};
            Object.keys(prices).forEach(sym => {
              if (prev[sym]?.price && prices[sym].price !== prev[sym].price) {
                flash[sym] = prices[sym].price > prev[sym].price ? "up" : "down";
              }
            });
            if (Object.keys(flash).length) {
              setPriceFlash(f => ({ ...f, ...flash }));
              setTimeout(() => setPriceFlash({}), 1500);
            }
            return { ...prev, ...prices };
          });
          // ★purchasePrice未設定の仮想通貨を補正
          setHoldings(prevH => {
            let changed = false;
            const next = prevH.map(h => {
              if (h.purchasePrice) return h;
              const priceData = prices[h.stock?.symbol];
              if (!priceData?.price) return h;
              const daysSince = Math.floor((new Date() - new Date(h.purchaseDate)) / (1000*60*60*24));
              if (daysSince <= 3) {
                changed = true;
                return { ...h, purchasePrice: priceData.price, priceSource: "backfilled" };
              }
              return h;
            });
            return changed ? next : prevH;
          });
        }).catch(() => {});
    }

    // ② 投信（保有中のみ・銘柄名フォールバック検索付き）
    const getFundCode = (s) => {
      // 解決済みコードのキャッシュ確認
      try {
        const resolved = JSON.parse(localStorage.getItem("kabu_fund_codes") || "{}");
        if (s?.fundCode && resolved[s.fundCode]) return resolved[s.fundCode];
      } catch {}
      if (s?.fundCode) return s.fundCode;
      if (s?.type === "fund" && /^[0-9A-Z]{8}$/.test(s?.symbol ?? "")) return s.symbol;
      return null;
    };
    const fundHoldings = holdings.filter(h => getFundCode(h.stock));
    const fundCodes = [...new Set(fundHoldings.map(h => getFundCode(h.stock)))];
    if (fundCodes.length > 0) {
      // コード→銘柄名の対応（検索フォールバック用）
      const fundNames = fundCodes.map(code => {
        const h = fundHoldings.find(x => getFundCode(x.stock) === code);
        return h?.stock?.name ?? "";
      });
      // MUFG公式APIコード（eMAXIS系）も渡す
      const mufgCds = fundCodes.map(code => {
        const h = fundHoldings.find(x => getFundCode(x.stock) === code);
        return h?.stock?.mufgCd ?? "-";
      });
      fetch(`/api/fund-prices?codes=${fundCodes.join(",")}&names=${encodeURIComponent(fundNames.join("|"))}&mufg=${mufgCds.join(",")}`)
        .then(r => r.ok ? r.json() : {})
        .then(data => {
          // 解決済みコードをキャッシュ（次回から直接使う）
          if (data.__resolved && Object.keys(data.__resolved).length) {
            try {
              const cache = JSON.parse(localStorage.getItem("kabu_fund_codes") || "{}");
              localStorage.setItem("kabu_fund_codes", JSON.stringify({ ...cache, ...data.__resolved }));
            } catch {}
          }
          const bySymbol = {};
          fundHoldings.forEach(h => {
            const code = getFundCode(h.stock);
            // 元コードでも解決後コードでも取れるように
            const priceData = data[code] ?? data[h.stock?.fundCode];
            if (priceData?.price) bySymbol[h.stock.symbol] = priceData;
          });
          setFundPrices(prev => ({ ...prev, ...bySymbol }));
          // ★purchasePrice未設定の保有記録を遡って補正
          // 購入日が今日なら現在の基準価額＝購入時価額として保存（皮算用を正確に）
          const todayStr = new Date().toISOString().split("T")[0];
          setHoldings(prevH => {
            let changed = false;
            const next = prevH.map(h => {
              if (h.purchasePrice) return h; // 既に設定済み
              const priceData = bySymbol[h.stock?.symbol];
              if (!priceData?.price) return h;
              // 購入日が3日以内なら現在価格を購入時価格として採用
              // （投信の基準価額は1日1回更新なのでほぼ同じ値）
              const daysSince = Math.floor((new Date() - new Date(h.purchaseDate)) / (1000*60*60*24));
              if (daysSince <= 3) {
                changed = true;
                return { ...h, purchasePrice: priceData.price, priceSource: "backfilled" };
              }
              return h;
            });
            return changed ? next : prevH;
          });
        }).catch(() => {});
    }

    // ③ 株式（保有中のみ・為替も）
    fetch("/api/forex").then(r => r.json()).then(fx => {
      const rate = fx.usdJpy ?? 157.0;
      setUsdJpy(rate);
      const targets = [...new Set(holdings
        .filter(h => h.stock?.type === "jp" || h.stock?.type === "us")
        .map(h => h.stock?.symbol).filter(Boolean))];
      if (targets.length === 0) { setPriceLoading(false); setLastUpdate(new Date()); return; }
      setPriceLoading(true); setPriceError(false);
      const chunks = [];
      for (let i = 0; i < targets.length; i += 20) chunks.push(targets.slice(i, i + 20));
      Promise.all(chunks.map(chunk =>
        fetch(`/api/stock-prices?symbols=${chunk.join(",")}&usdJpy=${rate}`)
          .then(r => r.ok ? r.json() : {}).catch(() => ({}))
      )).then(results => {
        const merged = Object.assign({}, ...results);
        setStockPrices(prev => {
          const flash = {};
          Object.keys(merged).forEach(sym => {
            if (prev[sym]?.price && merged[sym].price !== prev[sym].price) {
              flash[sym] = merged[sym].price > prev[sym].price ? "up" : "down";
            }
          });
          if (Object.keys(flash).length) {
            setPriceFlash(f => ({ ...f, ...flash }));
            setTimeout(() => setPriceFlash({}), 1500);
          }
          return { ...prev, ...merged };
        });
        // ★purchasePrice未設定の株を補正（購入3日以内なら現価格を採用）
        setHoldings(prevH => {
          let changed = false;
          const next = prevH.map(h => {
            if (h.purchasePrice) return h;
            const priceData = merged[h.stock?.symbol];
            if (!priceData?.price) return h;
            const daysSince = Math.floor((new Date() - new Date(h.purchaseDate)) / (1000*60*60*24));
            if (daysSince <= 3) {
              changed = true;
              return { ...h, purchasePrice: priceData.price, priceSource: "backfilled" };
            }
            return h;
          });
          return changed ? next : prevH;
        });
        setLastUpdate(new Date());
      }).catch(() => setPriceError(true))
        .finally(() => setPriceLoading(false));
    }).catch(() => setPriceLoading(false));
  // eslint-disable-next-line
  }, [holdings.map(h => h.stock?.symbol).join(",")]);

  // 初回＋銘柄変更時に取得
  useEffect(() => { refreshAllPrices(); }, [refreshAllPrices]);

  // 60秒ごとの自動更新（画面表示中のみ）
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refreshAllPrices();
    }, 30000);
    // 画面復帰時に即更新
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshAllPrices();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [refreshAllPrices]);

  // ════ ④ 日次スナップショット記録 ════
  useEffect(() => {
    if (holdings.length === 0) return;
    // 評価額を計算して今日の日付で記録（1日1回上書き）
    const timer = setTimeout(() => {
      try {
        const todayStr = new Date().toISOString().split("T")[0];
        const history = JSON.parse(localStorage.getItem("kabu_history") || "[]");
        let totalV = 0, totalI = 0;
        holdings.forEach(h => {
          const sp = stockPrices[h.stock?.symbol];
          const cp = cryptoPrices[h.stock?.symbol];
          const fp = fundPrices[h.stock?.symbol];
          const livePrice = sp?.price ?? fp?.price ?? null;
          totalV += calcCurrentValue(h.amount, h.purchaseDate, h.stock?.annualReturn ?? 10, livePrice, h.purchasePrice ?? null);
          totalI += h.amount;
        });
        const existing = history.findIndex(r => r.date === todayStr);
        const record = { date: todayStr, value: totalV, invested: totalI };
        if (existing >= 0) history[existing] = record;
        else history.push(record);
        // 最大365日分保持
        const trimmed = history.slice(-365);
        localStorage.setItem("kabu_history", JSON.stringify(trimmed));
      } catch {}
    }, 3000); // 価格取得が終わってから記録
    return () => clearTimeout(timer);
  }, [holdings, stockPrices, cryptoPrices, fundPrices]);

  // ════ 過去の未記録日を株価履歴APIで補完（起動時1回）════
  useEffect(() => {
    if (holdings.length === 0) return;
    try {
      const history = JSON.parse(localStorage.getItem("kabu_history") || "[]");
      const todayStr = new Date().toISOString().split("T")[0];
      // 直近7日間で欠けている日を確認
      const missingDates = [];
      for (let d = 1; d <= 30; d++) {
        const date = new Date();
        date.setDate(date.getDate() - d);
        const ds = date.toISOString().split("T")[0];
        // 最も古い保有日より前はスキップ
        const earliest = holdings.reduce((min, h) => h.purchaseDate < min ? h.purchaseDate : min, todayStr);
        if (ds < earliest) break;
        if (!history.some(r => r.date === ds)) missingDates.push(ds);
      }
      if (missingDates.length === 0) return;

      // 株・米国株の保有銘柄の過去価格を取得
      const targets = [...new Set(holdings
        .filter(h => h.stock?.type === "jp" || h.stock?.type === "us")
        .map(h => h.stock?.symbol).filter(Boolean))];

      const backfill = (priceHistory) => {
        try {
          const hist = JSON.parse(localStorage.getItem("kabu_history") || "[]");
          missingDates.forEach(ds => {
            let totalV = 0, totalI = 0;
            holdings.forEach(h => {
              if (h.purchaseDate > ds) return; // その日まだ買ってない
              totalI += h.amount;
              const symHist = priceHistory[h.stock?.symbol];
              const dayPrice = symHist?.find(p => p.date === ds)?.price ?? null;
              // 過去価格があれば purchasePrice との比率、なければ年率近似
              totalV += calcCurrentValueAt(h, ds, dayPrice);
            });
            if (totalI > 0) hist.push({ date: ds, value: totalV, invested: totalI, backfilled: true });
          });
          hist.sort((a, b) => a.date.localeCompare(b.date));
          localStorage.setItem("kabu_history", JSON.stringify(hist.slice(-365)));
        } catch {}
      };

      if (targets.length > 0) {
        fetch(`/api/stock-history?symbols=${targets.join(",")}&usdJpy=${usdJpy ?? 157}`)
          .then(r => r.ok ? r.json() : {})
          .then(backfill)
          .catch(() => backfill({}));
      } else {
        backfill({});
      }
    } catch {}
  // eslint-disable-next-line
  }, [holdings.length]); // 保有数が変わったときのみ

  useEffect(() => {
    if(!searchMode||stockSearch.length<1){setSearchResults([]);return;}
    const timer=setTimeout(()=>{
      setSearchLoading(true); setSearchError(false);
      fetch(`/api/stock-search?q=${encodeURIComponent(stockSearch)}`)
        .then(r=>{ if(!r.ok) throw new Error(); return r.json(); })
        .then(data=>setSearchResults(data.results??[]))
        .catch(()=>setSearchError(true))
        .finally(()=>setSearchLoading(false));
    },500);
    return ()=>clearTimeout(timer);
  },[stockSearch,searchMode]);

  // ── 最低金額チェック ──
  const effectiveReturn = newAnnualReturn !== null ? newAnnualReturn : (newStock?.annualReturn ?? 10);
  const minWarning = useMemo(()=>{
    if(!newAmount||newAmount<=0) return null;
    if(newStock?.minAmount && newAmount<newStock.minAmount) return `最低${fmt(newStock.minAmount)}必要です`;
    return null;
  },[newAmount,newStock]);

  // ── ポートフォリオ計算 ──
  const portfolioStats = useMemo(()=>
    holdings
      .filter(h => h?.stock?.symbol && h?.amount > 0) // 不正データを除外
      .map(h=>{
        try {
          const sp = stockPrices[h.stock.symbol];
          const cp = cryptoPrices[h.stock.symbol];
          const fp = fundPrices[h.stock.symbol];
          // 現在価格: 株価 > 仮想通貨 > 投信基準価額
          const livePrice = sp?.price ?? cp?.price ?? fp?.price ?? null;
          // 購入時価格があれば実際の価格比率で損益計算（＝本当に買った場合と同じ）
          const currentValue = calcCurrentValue(h.amount, h.purchaseDate, h.stock.annualReturn ?? 10, livePrice, h.purchasePrice ?? null);
          const gain    = currentValue - h.amount;
          const gainPct = h.amount > 0 ? (currentValue / h.amount - 1) * 100 : 0;
          const days    = Math.max(0, Math.floor((new Date() - new Date(h.purchaseDate)) / (1000*60*60*24)));
          const isLive  = !!(sp || cp || fp);
          return { ...h, currentValue, gain, gainPct, days, isLive, currentPrice: sp?.price ?? null, cp: cp ?? null, fp: fp ?? null, spChange: sp?.change ?? null };
        } catch(e) {
          // 計算エラーは安全なデフォルト値で返す
          return { ...h, currentValue: h.amount, gain: 0, gainPct: 0, days: 0, isLive: false, currentPrice: null, cp: null, spChange: null };
        }
      })
  ,[holdings, cryptoPrices, stockPrices, fundPrices]);

  // ── 銘柄ごと集計 ──
  const groupedStats = useMemo(()=>{
    const map={};
    portfolioStats.forEach(h=>{
      const sym=h.stock?.symbol;
      if(!map[sym]) map[sym]={symbol:sym,stock:h.stock,entries:[],totalAmount:0,totalValue:0};
      map[sym].entries.push(h);
      map[sym].totalAmount+=h.amount;
      map[sym].totalValue+=h.currentValue;
    });
    return Object.values(map).map(g=>({
      ...g,
      gain:g.totalValue-g.totalAmount,
      gainPct:(g.totalValue/g.totalAmount-1)*100,
      avgPurchasePrice: g.entries.filter(e=>e.purchasePrice).length>0
        ? g.entries.reduce((s,e)=>s+(e.purchasePrice||0)*e.amount,0)/g.entries.reduce((s,e)=>s+(e.purchasePrice?e.amount:0),0)
        : null,
    }));
  },[portfolioStats]);

  // ── ソート ──
  const sortedStats = useMemo(()=>{
    const arr=[...portfolioStats];
    if(sortMode==="gain") arr.sort((a,b)=>b.gainPct-a.gainPct);
    else if(sortMode==="date") arr.sort((a,b)=>new Date(b.purchaseDate)-new Date(a.purchaseDate));
    else if(sortMode==="symbol") arr.sort((a,b)=>a.stock?.name?.localeCompare(b.stock?.name,"ja"));
    return arr;
  },[portfolioStats,sortMode]);

  const totalInvested = portfolioStats.reduce((s,h)=>s+h.amount,0);
  const totalValue    = portfolioStats.reduce((s,h)=>s+h.currentValue,0);
  const totalGain     = totalValue-totalInvested;
  const totalGainPct  = totalInvested>0?(totalValue/totalInvested-1)*100:0;

  // ③ 本日の増減（前日スナップショットとの差分）
  const todayChange = useMemo(() => {
    try {
      const history = JSON.parse(localStorage.getItem("kabu_history") || "[]");
      if (history.length < 1) return null;
      const todayStr = new Date().toISOString().split("T")[0];
      // 今日以外の最新レコード（＝前日以前）
      const prev = [...history].reverse().find(r => r.date !== todayStr);
      if (!prev) return null;
      const diff = totalValue - prev.value;
      const pct = prev.value > 0 ? (diff / prev.value) * 100 : 0;
      return { diff, pct, since: prev.date };
    } catch { return null; }
  }, [totalValue]);

  // ④ 資産推移の実績履歴
  const realHistory = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("kabu_history") || "[]");
    } catch { return []; }
  }, [totalValue]);
  const goalProgress  = goalAmount>0 ? Math.min(100,(totalValue/goalAmount)*100) : 0;

  // ── 資産推移グラフ ──
  const portfolioChart = useMemo(()=>{
    if(!holdings.length) return [];
    const earliest=holdings.reduce((min,h)=>h.purchaseDate<min?h.purchaseDate:min,holdings[0].purchaseDate);
    const startDate=new Date(earliest);
    const now=new Date();
    const totalMonths=Math.ceil((now-startDate)/(1000*60*60*24*30));
    const points=[];
    for(let m=0;m<=totalMonths;m++){
      const d=new Date(startDate); d.setMonth(d.getMonth()+m);
      if(d>now) break;
      const ds=d.toISOString().split("T")[0];
      let val=0,inv=0;
      holdings.forEach(h=>{
        if(h.purchaseDate<=ds){
          const y=(d-new Date(h.purchaseDate))/(1000*60*60*24*365.25);
          val+=Math.round(h.amount*Math.pow(1+(h.stock?.annualReturn??10)/100,y));
          inv+=h.amount;
        }
      });
      if(m%3===0||m===totalMonths) points.push({label:`${d.getFullYear()}/${d.getMonth()+1}`,value:val,invested:inv,goal:goalAmount||undefined});
    }
    return points;
  },[holdings,goalAmount]);

  // ── addHolding ──
  const [addingHolding, setAddingHolding] = useState(false);

  const addHolding = async () => {
    if(minWarning || addingHolding) return;
    if(!newStock?.symbol || !newStock?.name) return;
    setAddingHolding(true);

    const stockToSave = {
      symbol:      newStock.symbol,
      name:        newStock.name,
      sector:      newStock.sector ?? "",
      type:        newStock.type ?? "us",
      annualReturn: newAnnualReturn !== null ? newAnnualReturn : (newStock.annualReturn ?? 10),
      dividend:    newStock.dividend ?? 0,
      minAmount:   newStock.minAmount ?? 0,
      unitShares:  newStock.unitShares ?? null,
      優待:        newStock.優待 ?? null,
      risk:        newStock.risk ?? "medium",
      fundCode:    newStock.fundCode ?? null,
      mufgCd:      newStock.mufgCd ?? null,
      cgId:        newStock.cgId ?? null,
    };

    // ★購入時価格を必ず取得してから記録（実際の取引と同じ精度にする）
    let purchasePrice = null;
    try {
      if (stockToSave.type === "jp" || stockToSave.type === "us") {
        // キャッシュ済みならそれを使用、なければAPIで取得
        purchasePrice = stockPrices[stockToSave.symbol]?.price ?? null;
        if (!purchasePrice) {
          const r = await fetch(`/api/stock-prices?symbols=${stockToSave.symbol}&usdJpy=${usdJpy ?? 157}`);
          if (r.ok) {
            const data = await r.json();
            purchasePrice = data[stockToSave.symbol]?.price ?? null;
          }
        }
      } else if (stockToSave.type === "crypto" && stockToSave.cgId) {
        purchasePrice = cryptoPrices[stockToSave.symbol]?.price ?? null;
        if (!purchasePrice) {
          const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${stockToSave.cgId}&vs_currencies=jpy`);
          if (r.ok) {
            const data = await r.json();
            purchasePrice = data[stockToSave.cgId]?.jpy ?? null;
          }
        }
      } else if (stockToSave.type === "fund") {
        purchasePrice = fundPrices[stockToSave.symbol]?.price ?? null;
        if (!purchasePrice) {
          const code = stockToSave.fundCode ?? (/^[0-9A-Z]{8}$/.test(stockToSave.symbol) ? stockToSave.symbol : null);
          if (code) {
            const r = await fetch(`/api/fund-prices?codes=${code}&names=${encodeURIComponent(stockToSave.name)}&mufg=${stockToSave.mufgCd ?? "-"}`);
            if (r.ok) {
              const data = await r.json();
              purchasePrice = data[code]?.price ?? null;
            }
          }
        }
      }
    } catch {}

    setHoldings(p=>[...p,{
      id: Date.now(),
      stock: stockToSave,
      purchaseDate: newDate,
      amount: newAmount,
      purchasePrice,           // 円建て購入時価格（取得できた場合）
      priceSource: purchasePrice ? "live" : "approx", // 損益計算の根拠を記録
    }]);
    setAddingHolding(false);
    setShowAdd(false); setStockSearch(""); setSearchResults([]); setSearchMode(false); setNewAnnualReturn(null);
  };

  // ── シミュ計算 ──
  const filteredSimStocks=STOCKS.filter(s=>!simSearch||s.name.includes(simSearch)||s.symbol.toLowerCase().includes(simSearch.toLowerCase())||s.sector.includes(simSearch));
  const chartData=useMemo(()=>{
    if(!simStocks.length) return [];
    const base=simMode==="monthly"?simulateMonthly(simStocks[0],monthly,months):simulateLumpSum(simStocks[0],lump,years);
    return base.map((d,i)=>{
      const row={year:d.year,元本:d.invested};
      if(goalAmount>0) row["目標"]=goalAmount;
      simStocks.forEach(s=>{
        const sim=simMode==="monthly"?simulateMonthly(s,monthly,months):simulateLumpSum(s,lump,years);
        if(sim[i]) row[s.name]=sim[i].value;
      });
      return row;
    });
  },[simStocks,simMode,monthly,lump,months,years,goalAmount]);

  const simStats=useMemo(()=>simStocks.map(s=>{
    const data=simMode==="monthly"?simulateMonthly(s,monthly,months):simulateLumpSum(s,lump,years);
    const last=data[data.length-1];
    return{...s,finalValue:last.value,invested:last.invested,gain:last.value-last.invested,gainPct:(last.value/last.invested-1)*100};
  }),[simStocks,simMode,monthly,lump,months,years]);

  const toggleSimStock=s=>{
    setSimStocks(p=>{const ex=p.find(x=>x.symbol===s.symbol);if(ex)return p.length>1?p.filter(x=>x.symbol!==s.symbol):p;return[...p,s].slice(0,4);});
    setShowSimSearch(false); setSimSearch("");
  };

  const pickerStocks=STOCKS.filter(s=>{
    const typeOk=filterType==="all"||s.type===filterType;
    const searchOk=!stockSearch||s.name.includes(stockSearch)||s.symbol.toLowerCase().includes(stockSearch.toLowerCase())||s.sector.includes(stockSearch);
    return typeOk&&searchOk;
  });

  const card={background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:16,marginBottom:14,boxShadow:"0 1px 6px rgba(0,0,0,0.05)"};

  // ── シミュからポートフォリオへ連携 ──
  const sendToPortfolio = (stock) => {
    if (!stock?.symbol) return;
    setNewStock(stock); setNewAnnualReturn(null);
    setShowAdd(false);
    setMainTab("portfolio");
    setTimeout(() => setShowAdd(true), 50);
  };

  return (
    <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"'Helvetica Neue',Arial,sans-serif",maxWidth:480,margin:"0 auto"}}>

      {/* ── Header ── */}
      <div style={{background:C.card,borderBottom:`1px solid ${C.border}`,position:"sticky",top:0,zIndex:10,boxShadow:"0 2px 12px rgba(0,0,0,0.06)"}}>
        {/* ロゴ行 */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px 10px"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:34,height:34,background:"linear-gradient(135deg,#2563EB,#06B6D4)",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,boxShadow:"0 2px 8px #2563EB40"}}>📈</div>
            <div>
              <h1 style={{margin:0,fontSize:18,fontWeight:800,letterSpacing:"-0.03em",color:C.text}}>株＋</h1>
              <p style={{margin:0,fontSize:10,color:C.light,letterSpacing:"0.02em"}}>投資シミュレーター</p>
            </div>
          </div>
          {/* ステータスバッジ群 */}
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            {usdJpy&&(
              <div style={{background:C.blueLight,border:`1px solid ${C.blueMid}`,borderRadius:8,padding:"3px 8px",textAlign:"center"}}>
                <div style={{fontSize:8,color:C.light,fontWeight:600}}>USD/JPY</div>
                <div style={{fontSize:12,fontWeight:800,color:C.blue}}>¥{usdJpy.toFixed(1)}</div>
              </div>
            )}
            {priceLoading&&(
              <div style={{background:C.soft,borderRadius:8,padding:"3px 8px"}}>
                <div style={{fontSize:10,color:C.light}}>取得中...</div>
              </div>
            )}
            {!priceLoading&&!priceError&&stockPrices&&Object.keys(stockPrices).length>0&&(
              <div style={{background:C.greenLight,border:`1px solid ${C.greenMid}`,borderRadius:8,padding:"3px 8px"}}>
                <div style={{fontSize:10,color:C.green,fontWeight:700}}>● LIVE</div>
              </div>
            )}
          </div>
        </div>
        {/* タブ */}
        <div style={{display:"flex",borderTop:`1px solid ${C.soft}`}}>
          {[["portfolio","💼 保有株"],["sim","📊 シミュ"],["stocks","🔍 銘柄一覧"]].map(([key,label])=>(
            <button key={key} onClick={()=>setMainTab(key)} style={{flex:1,padding:"9px 0",background:"none",border:"none",borderBottom:mainTab===key?`2.5px solid ${C.blue}`:"2.5px solid transparent",color:mainTab===key?C.blue:C.light,fontSize:12,fontWeight:mainTab===key?700:400,cursor:"pointer",transition:"color .15s"}}>{label}</button>
          ))}
        </div>
      </div>

      <div style={{padding:"16px 16px 48px"}}>

        {/* ════ 保有株タブ ════ */}
        {mainTab==="portfolio"&&(<>

          {/* サマリーカード */}
          <div style={{background:"linear-gradient(135deg,#1D4ED8 0%,#0EA5E9 100%)",borderRadius:16,padding:"20px 20px 18px",marginBottom:14,boxShadow:"0 4px 20px #2563EB30"}}>
            <div style={{fontSize:12,color:"#BFDBFE",marginBottom:4,fontWeight:600}}>合計評価額</div>
            <div style={{fontSize:32,fontWeight:900,color:"#fff",letterSpacing:"-0.02em",marginBottom:8}}>{fmt(totalValue)}</div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
              <span style={{background:"rgba(255,255,255,0.18)",borderRadius:5,color:"#fff",fontSize:11,fontWeight:700,padding:"2px 8px"}}>運用収益額</span>
              <span style={{fontSize:18,fontWeight:800,color:totalGain>=0?"#86EFAC":"#FCA5A5"}}>{totalGain>=0?"+":""}{fmt(totalGain)} ({fmtPct(totalGainPct)})</span>
            </div>
            {/* ③ 本日の増減 */}
            {todayChange&&(
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                <span style={{background:"rgba(255,255,255,0.12)",borderRadius:5,color:"#BFDBFE",fontSize:10,fontWeight:600,padding:"2px 8px"}}>本日</span>
                <span style={{fontSize:14,fontWeight:700,color:todayChange.diff>=0?"#86EFAC":"#FCA5A5"}}>
                  {todayChange.diff>=0?"▲":"▼"} {todayChange.diff>=0?"+":""}{fmt(todayChange.diff)} ({fmtPct(todayChange.pct)})
                </span>
              </div>
            )}
            {/* 最終更新時刻＋手動更新 */}
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              {lastUpdate&&<span style={{fontSize:10,color:"#93C5FD"}}>🔄 {lastUpdate.toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})}更新 · 30秒毎に自動更新</span>}
              <button onClick={refreshAllPrices} style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:5,color:"#fff",fontSize:10,fontWeight:600,padding:"2px 8px",cursor:"pointer"}}>今すぐ更新</button>
            </div>

            {/* 目標プログレスバー */}
            {goalAmount>0&&(
              <div style={{marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <span style={{fontSize:11,color:"#BFDBFE"}}>目標: {fmt(goalAmount)}</span>
                  <span style={{fontSize:11,color:"#FDE68A",fontWeight:700}}>{goalProgress.toFixed(1)}%</span>
                </div>
                <div style={{background:"rgba(255,255,255,0.2)",borderRadius:99,height:8,overflow:"hidden"}}>
                  <div style={{background:"linear-gradient(90deg,#86EFAC,#FDE68A)",height:"100%",width:`${goalProgress}%`,borderRadius:99,transition:"width 0.5s"}}/>
                </div>
              </div>
            )}

            <div style={{display:"flex",gap:12,paddingTop:12,borderTop:"1px solid rgba(255,255,255,0.2)",alignItems:"center"}}>
              {[["投資元本",fmt(totalInvested)],["保有銘柄",`${[...new Set(holdings.map(h=>h.stock?.symbol))].length}銘柄`],["購入回数",`${holdings.length}回`]].map(([l,v])=>(
                <div key={l}><div style={{fontSize:10,color:"#BFDBFE"}}>{l}</div><div style={{fontSize:13,fontWeight:700,color:"#fff"}}>{v}</div></div>
              ))}
              <button onClick={()=>{setGoalInput(goalAmount||"");setShowGoalEdit(true);}} style={{marginLeft:"auto",background:"rgba(255,255,255,0.18)",border:"1px solid rgba(255,255,255,0.3)",borderRadius:7,color:"#fff",fontSize:11,fontWeight:600,padding:"4px 10px",cursor:"pointer"}}>
                {goalAmount>0?"目標変更":"🎯 目標設定"}
              </button>
            </div>
            {/* バックアップ情報 */}
            {backupTime&&(
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:10,paddingTop:10,borderTop:"1px solid rgba(255,255,255,0.15)"}}>
                <span style={{fontSize:10,color:"#BFDBFE"}}>💾 最終バックアップ: {backupTime}</span>
                <button onClick={()=>{
                  if(window.confirm("1つ前のデータに戻しますか？")) {
                    const ok = restoreBackup();
                    if(ok) {
                      setHoldingsRaw(loadLS("kabu_holdings", []));
                      setBackupTime(getBackupTime());
                      setRestoreMsg("✅ 復元しました");
                      setTimeout(()=>setRestoreMsg(""), 3000);
                    } else {
                      setRestoreMsg("⚠️ バックアップがありません");
                      setTimeout(()=>setRestoreMsg(""), 3000);
                    }
                  }
                }} style={{background:"rgba(255,255,255,0.18)",border:"1px solid rgba(255,255,255,0.3)",borderRadius:6,color:"#fff",fontSize:10,fontWeight:700,padding:"3px 8px",cursor:"pointer"}}>
                  ↩️ 元に戻す
                </button>
              </div>
            )}
            {restoreMsg&&<div style={{fontSize:11,color:"#FDE68A",marginTop:6,textAlign:"center"}}>{restoreMsg}</div>}
          </div>

          {/* 目標入力モーダル */}
          {showGoalEdit&&(
            <div style={{...card,border:`1.5px solid ${C.blueMid}`}}>
              <div style={{fontSize:13,fontWeight:700,color:C.blue,marginBottom:10}}>🎯 目標金額を設定</div>
              <div style={{display:"flex",gap:8,marginBottom:8}}>
                <input type="number" value={goalInput} onChange={e=>setGoalInput(e.target.value)} placeholder="例: 10000000"
                  style={{flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,padding:"9px 12px",fontSize:16,fontWeight:700}}/>
                <span style={{color:C.mid,fontSize:13,alignSelf:"center"}}>円</span>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>
                {[3000000,5000000,10000000,30000000].map(v=>(
                  <button key={v} onClick={()=>setGoalInput(v)} style={{background:Number(goalInput)===v?C.blue:C.card,color:Number(goalInput)===v?"#fff":C.mid,border:`1px solid ${Number(goalInput)===v?C.blue:C.border}`,borderRadius:7,padding:"5px 10px",fontSize:12,fontWeight:600,cursor:"pointer"}}>{fmt(v)}</button>
                ))}
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>{setGoalAmount(0);setShowGoalEdit(false);}} style={{flex:1,background:C.redLight,border:`1px solid ${C.redMid}`,borderRadius:9,color:C.red,fontSize:12,fontWeight:600,padding:"9px 0",cursor:"pointer"}}>削除</button>
                <button onClick={()=>{setGoalAmount(Number(goalInput)||0);setShowGoalEdit(false);}} style={{flex:2,background:C.blue,border:"none",borderRadius:9,color:"#fff",fontSize:13,fontWeight:700,padding:"9px 0",cursor:"pointer"}}>設定する</button>
              </div>
            </div>
          )}

          {/* ④ 実績推移グラフ（日次スナップショット） */}
          {realHistory.length>1&&(
            <div style={{...card,padding:"14px 6px 10px"}}>
              <div style={{fontSize:12,fontWeight:700,color:C.mid,marginLeft:10,marginBottom:10}}>📈 実績推移（毎日自動記録）</div>
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={realHistory.map(r=>({...r,label:r.date.slice(5).replace("-","/")}))}>
                  <defs>
                    <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.green} stopOpacity={0.15}/><stop offset="95%" stopColor={C.green} stopOpacity={0.02}/></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.soft}/>
                  <XAxis dataKey="label" tick={{fontSize:10,fill:C.light}}/>
                  <YAxis tick={{fontSize:10,fill:C.light}} tickFormatter={v=>`${(v/10000).toFixed(0)}万`} domain={["dataMin","dataMax"]}/>
                  <Tooltip formatter={(v,n)=>[fmt(v),n==="value"?"評価額":"元本"]} contentStyle={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,fontSize:12}}/>
                  <Area type="monotone" dataKey="invested" stroke={C.light} strokeDasharray="4 3" strokeWidth={1.5} fill="none" name="元本"/>
                  <Area type="monotone" dataKey="value" stroke={C.green} strokeWidth={2.5} fill="url(#rg)" name="評価額"/>
                </AreaChart>
              </ResponsiveContainer>
              <p style={{fontSize:9,color:C.light,margin:"4px 10px 0"}}>アプリを開いた日の評価額を自動記録しています</p>
            </div>
          )}

          {/* 推移グラフ（理論値） */}
          {portfolioChart.length>1&&realHistory.length<=1&&(
            <div style={{...card,padding:"14px 6px 10px"}}>
              <div style={{fontSize:12,fontWeight:700,color:C.mid,marginLeft:10,marginBottom:10}}>資産推移</div>
              <ResponsiveContainer width="100%" height={170}>
                <AreaChart data={portfolioChart}>
                  <defs>
                    <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.blue} stopOpacity={0.15}/><stop offset="95%" stopColor={C.blue} stopOpacity={0.02}/></linearGradient>
                    <linearGradient id="ig" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.light} stopOpacity={0.1}/><stop offset="95%" stopColor={C.light} stopOpacity={0.01}/></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.soft}/>
                  <XAxis dataKey="label" tick={{fontSize:10,fill:C.light}}/>
                  <YAxis tick={{fontSize:10,fill:C.light}} tickFormatter={v=>`${(v/10000).toFixed(0)}万`}/>
                  <Tooltip formatter={(v,n)=>[fmt(v),n==="value"?"評価額":n==="invested"?"元本":"目標"]} contentStyle={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,fontSize:12}}/>
                  <Area type="monotone" dataKey="invested" stroke={C.light} strokeDasharray="4 3" strokeWidth={1.5} fill="url(#ig)" name="元本"/>
                  <Area type="monotone" dataKey="value" stroke={C.blue} strokeWidth={2.5} fill="url(#ag)" name="評価額"/>
                  {goalAmount>0&&<Line type="monotone" dataKey="goal" stroke="#F59E0B" strokeDasharray="6 3" strokeWidth={1.5} dot={false} name="目標"/>}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* コントロールバー */}
          <div style={{display:"flex",gap:6,marginBottom:12,alignItems:"center"}}>
            <div style={{display:"flex",background:C.soft,borderRadius:8,padding:2,flex:1}}>
              {[["date","日付順"],["gain","損益順"],["symbol","銘柄順"]].map(([m,l])=>(
                <button key={m} onClick={()=>setSortMode(m)} style={{flex:1,padding:"5px 0",background:sortMode===m?C.blue:"transparent",border:"none",borderRadius:6,color:sortMode===m?"#fff":C.mid,fontSize:11,fontWeight:600,cursor:"pointer"}}>{l}</button>
              ))}
            </div>
            <button onClick={()=>setGroupMode(!groupMode)} style={{background:groupMode?C.blue:C.card,border:`1px solid ${groupMode?C.blue:C.border}`,borderRadius:8,color:groupMode?"#fff":C.mid,fontSize:11,fontWeight:600,padding:"6px 10px",cursor:"pointer",whiteSpace:"nowrap"}}>
              {groupMode?"集計中":"銘柄集計"}
            </button>
          </div>

          {/* 保有銘柄リスト */}
          <div style={{...card}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontSize:13,fontWeight:700,color:C.mid}}>{groupMode?"銘柄ごと集計":"保有銘柄の内訳"}</div>
              <button onClick={()=>setShowAdd(!showAdd)} style={{background:C.blueLight,border:`1px solid ${C.blueMid}`,borderRadius:8,color:C.blue,fontSize:12,fontWeight:700,padding:"5px 14px",cursor:"pointer"}}>＋ 追加</button>
            </div>
            {holdings.length===0&&<div style={{textAlign:"center",color:C.light,padding:"24px 0",fontSize:13}}>＋ 追加ボタンから仮想購入を記録しましょう</div>}

            {/* 集計モード */}
            {groupMode&&groupedStats.map((g,i)=>{
              const isExp=expandedGroup===g.symbol;
              return (
                <div key={g.symbol} style={{borderTop:i>0?`1px solid ${C.soft}`:"none",paddingTop:i>0?12:0,paddingBottom:12}}>
                  <div onClick={()=>setExpandedGroup(isExp?null:g.symbol)} style={{cursor:"pointer"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{width:10,height:10,borderRadius:"50%",background:TYPE_COLOR[g.stock?.type]}}/>
                        <div>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <span style={{fontSize:14,fontWeight:700}}>{g.stock?.name}</span>
                            <span style={{background:TYPE_COLOR[g.stock?.type]+"18",color:TYPE_COLOR[g.stock?.type],fontSize:9,fontWeight:700,borderRadius:3,padding:"1px 4px"}}>{TYPE_LABEL[g.stock?.type]}</span>
                          </div>
                          <div style={{fontSize:11,color:C.light}}>{g.entries.length}回購入 · 合計{fmt(g.totalAmount)}</div>
                          {g.avgPurchasePrice&&<div style={{fontSize:10,color:C.light}}>平均取得単価: ¥{Math.round(g.avgPurchasePrice).toLocaleString()}</div>}
                        </div>
                      </div>
                      <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                        <div style={{background:g.gain>=0?C.greenLight:C.redLight,border:`1px solid ${g.gain>=0?C.greenMid:C.redMid}`,borderRadius:8,padding:"4px 12px"}}>
                          <div style={{fontSize:16,fontWeight:800,color:g.gain>=0?C.green:C.red}}>{fmtPct(g.gainPct)}</div>
                        </div>
                        <span style={{fontSize:10,color:C.light}}>{isExp?"▲ 閉じる":"▼ 明細"}</span>
                      </div>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
                      {[["合計投資",fmt(g.totalAmount),C.mid],["合計評価",fmt(g.totalValue),C.text],["損益",(g.gain>=0?"+":"")+fmt(g.gain),g.gain>=0?C.green:C.red]].map(([l,v,c])=>(
                        <div key={l} style={{background:C.bg,borderRadius:8,padding:"7px 6px",textAlign:"center"}}>
                          <div style={{fontSize:10,color:C.light,marginBottom:2}}>{l}</div>
                          <div style={{fontSize:12,fontWeight:700,color:c}}>{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* 明細展開 */}
                  {isExp&&g.entries.map((h,j)=>(
                    <div key={h.id} style={{background:C.bg,borderRadius:9,padding:"10px 12px",marginTop:8,border:`1px solid ${C.border}`}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div style={{fontSize:12,color:C.mid}}>{new Date(h.purchaseDate).toLocaleDateString("ja-JP",{year:"numeric",month:"short",day:"numeric"})}</div>
                        <div style={{fontSize:13,fontWeight:700,color:h.gain>=0?C.green:C.red}}>{fmtPct(h.gainPct)}</div>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
                        <span style={{fontSize:12,color:C.light}}>購入: {fmt(h.amount)}</span>
                        <span style={{fontSize:12,color:C.text,fontWeight:600}}>現在: {fmt(h.currentValue)}</span>
                        <button onClick={()=>setHoldings(p=>p.filter(x=>x.id!==h.id))} style={{background:"none",border:"none",color:C.light,fontSize:11,cursor:"pointer"}}>削除</button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}

            {/* 通常モード */}
            {!groupMode&&sortedStats.map((h,i)=>{
              const boughtStr=new Date(h.purchaseDate).toLocaleDateString("ja-JP",{year:"numeric",month:"short",day:"numeric"});
              const flash = priceFlash[h.stock?.symbol];
              return (
                <div key={h.id} style={{borderTop:i>0?`1px solid ${C.soft}`:"none",paddingTop:i>0?14:0,paddingBottom:14,background:flash==="up"?"#ECFDF580":flash==="down"?"#FEF2F280":"transparent",transition:"background 1s ease-out",borderRadius:flash?8:0}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:10,height:10,borderRadius:"50%",background:TYPE_COLOR[h.stock?.type],flexShrink:0}}/>
                      <div>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span style={{fontSize:14,fontWeight:700}}>{h.stock?.name}</span>
                          <span style={{background:TYPE_COLOR[h.stock?.type]+"18",color:TYPE_COLOR[h.stock?.type],fontSize:9,fontWeight:700,borderRadius:3,padding:"1px 4px"}}>{TYPE_LABEL[h.stock?.type]}</span>
                        </div>
                        <div style={{fontSize:11,color:C.light}}>{h.stock?.sector} · 年率{fmtPct(h.stock?.annualReturn??0)}</div>
                        {h.cp&&<div style={{fontSize:11,color:C.amber,marginTop:1}}>¥{h.cp?.price?.toLocaleString()} ({h.cp?.change24h>=0?"+":""}{h.cp?.change24h?.toFixed(1)}% 24h) <span style={{color:C.green,fontSize:10,fontWeight:700}}>●LIVE</span></div>}
                        {h.currentPrice&&typeof h.currentPrice==="number"&&<div style={{fontSize:11,color:C.blue,marginTop:1}}>¥{h.currentPrice.toLocaleString()} {h.spChange!=null&&typeof h.spChange==="number"&&`(${h.spChange>=0?"+":""}${h.spChange.toFixed(1)}%)`} <span style={{color:C.green,fontSize:10,fontWeight:700}}>●LIVE</span></div>}
                        {h.fp?.price&&typeof h.fp.price==="number"&&<div style={{fontSize:11,color:"#7C3AED",marginTop:1}}>基準価額: ¥{h.fp.price.toLocaleString()} <span style={{color:C.green,fontSize:10,fontWeight:700}}>●LIVE</span></div>}
                        {!h.isLive&&<div style={{fontSize:10,color:C.light,marginTop:1}}>年率近似で計算中（{h.stock?.type==="fund"?"基準価額":"株価"}取得待ち・30秒毎に再試行）</div>}
                        {h.isLive&&!h.purchasePrice&&(
                          <button onClick={()=>{
                            const livePrice = h.currentPrice ?? h.cp?.price ?? h.fp?.price;
                            if(!livePrice) return;
                            if(window.confirm("今の価格を購入時価格として設定します。\n以降、実際の値動きで損益が計算されます。")){
                              setHoldings(p=>p.map(x=>x.id===h.id?{...x,purchasePrice:livePrice,purchaseDate:new Date().toISOString().split("T")[0],priceSource:"rebased"}:x));
                            }
                          }} style={{background:C.amberLight,border:"1px solid #FDE68A",borderRadius:6,color:C.amber,fontSize:10,fontWeight:700,padding:"3px 8px",cursor:"pointer",marginTop:3}}>
                            📍 今の価格を基準にして実測開始
                          </button>
                        )}
                        {h.purchasePrice&&h.isLive&&<div style={{fontSize:9,color:C.green,marginTop:1}}>✓ 実際の価格比率で計算中（購入時: ¥{Number(h.purchasePrice).toLocaleString()}）</div>}
                      </div>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                      <div style={{background:h.gain>=0?C.greenLight:C.redLight,border:`1px solid ${h.gain>=0?C.greenMid:C.redMid}`,borderRadius:8,padding:"4px 12px"}}>
                        <div style={{fontSize:16,fontWeight:800,color:h.gain>=0?C.green:C.red}}>{fmtPct(h.gainPct)}</div>
                      </div>
                      <button onClick={()=>setHoldings(p=>p.filter(x=>x.id!==h.id))} style={{background:"none",border:"none",color:C.light,fontSize:11,cursor:"pointer",padding:0}}>削除</button>
                    </div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:8}}>
                    {[["購入額",fmt(h.amount),C.mid],["現在価値",fmt(h.currentValue),C.text],["損益",(h.gain>=0?"+":"")+fmt(h.gain),h.gain>=0?C.green:C.red]].map(([l,v,c])=>(
                      <div key={l} style={{background:C.bg,borderRadius:8,padding:"8px 6px",textAlign:"center"}}>
                        <div style={{fontSize:10,color:C.light,marginBottom:2}}>{l}</div>
                        <div style={{fontSize:12,fontWeight:700,color:c}}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{fontSize:11,color:C.light}}>📅 {boughtStr} · {h.days}日{h.stock?.優待&&<span style={{marginLeft:6,color:C.amber}}>🎁 {h.stock.優待}</span>}</div>
                    <button onClick={()=>sendToPortfolio(h.stock)} style={{background:C.blueLight,border:`1px solid ${C.blueMid}`,borderRadius:6,color:C.blue,fontSize:10,fontWeight:700,padding:"3px 8px",cursor:"pointer"}}>📊 シミュ</button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 追加フォーム */}
          {showAdd&&(
            <div style={{...card,border:`1.5px solid ${C.blueMid}`}}>
              <div style={{fontSize:13,fontWeight:700,color:C.blue,marginBottom:14}}>🛒 仮想購入を記録</div>

              {/* 銘柄選択 */}
              <div style={{marginBottom:12}}>
                <label style={{fontSize:12,fontWeight:600,color:C.mid,display:"block",marginBottom:6}}>銘柄</label>
                <div onClick={()=>setShowPicker(!showPicker)} style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:9,padding:"10px 14px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{fontSize:13,fontWeight:700}}>{newStock.name}</span>
                      <span style={{background:TYPE_COLOR[newStock.type]+"18",color:TYPE_COLOR[newStock.type],fontSize:9,fontWeight:700,borderRadius:3,padding:"1px 4px"}}>{TYPE_LABEL[newStock.type]}</span>
                    </div>
                    <div style={{fontSize:11,color:C.light}}>年率{fmtPct(effectiveReturn)} · 最低{fmt(newStock.minAmount)}</div>
                  </div>
                  <span style={{color:C.light}}>▼</span>
                </div>

                {showPicker&&(
                  <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:10,marginTop:6,overflow:"hidden"}}>
                    <div style={{display:"flex",background:C.soft,margin:8,borderRadius:8,padding:3}}>
                      {[[false,"プリセット"],[true,"🔍 リアルタイム検索"]].map(([mode,label])=>(
                        <button key={String(mode)} onClick={()=>{setSearchMode(mode);setSearchResults([]);setStockSearch("");}}
                          style={{flex:1,padding:"6px 0",background:searchMode===mode?C.blue:"transparent",border:"none",borderRadius:6,color:searchMode===mode?"#fff":C.mid,fontSize:12,fontWeight:600,cursor:"pointer"}}>{label}</button>
                      ))}
                    </div>
                    <div style={{padding:"0 8px 6px"}}>
                      <input value={stockSearch} onChange={e=>setStockSearch(e.target.value)}
                        placeholder={searchMode?"銘柄名・コードで検索（例: トヨタ, AAPL）":"銘柄名・コード・セクター"}
                        style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,borderRadius:7,color:C.text,padding:"8px 10px",fontSize:13,boxSizing:"border-box"}}/>
                    </div>
                    {searchMode&&(
                      <div style={{maxHeight:260,overflowY:"auto"}}>
                        {searchLoading&&<div style={{textAlign:"center",padding:"16px 0",color:C.light,fontSize:12}}>検索中...</div>}
                        {searchError&&<div style={{textAlign:"center",padding:"16px 0",color:C.red,fontSize:12}}>検索失敗 · プリセットをご利用ください</div>}
                        {!searchLoading&&searchResults.length===0&&stockSearch.length>0&&!searchError&&<div style={{textAlign:"center",padding:"16px 0",color:C.light,fontSize:12}}>見つかりませんでした</div>}
                        {searchResults.map(s=>{
                          const sp=stockPrices[s.symbol];
                          return (
                            <div key={s.symbol} onClick={()=>{
                              const existing=STOCKS.find(x=>x.symbol===s.symbol);
                              const stock=existing??{symbol:s.symbol,name:s.name,sector:s.sector||s.quoteType||"",type:s.type,annualReturn:s.type==="crypto"?50:s.type==="fund"?14:s.type==="jp"?10:15,dividend:0,minAmount:s.type==="jp"?100000:s.type==="fund"?100:1000,unitShares:s.type==="jp"?100:1,優待:null,risk:s.type==="crypto"?"very-high":"medium"};
                              setNewStock(stock); setNewAnnualReturn(null); setShowPicker(false); setStockSearch(""); setSearchResults([]);
                            }} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",borderTop:`1px solid ${C.soft}`,cursor:"pointer",background:newStock.symbol===s.symbol?C.blueLight:C.card}}>
                              <div>
                                <div style={{fontSize:13,fontWeight:600,color:newStock.symbol===s.symbol?C.blue:C.text}}>{s.name}</div>
                                <div style={{fontSize:11,color:C.light}}>{s.symbol} · {s.exchange}</div>
                              </div>
                              <div style={{textAlign:"right"}}>
                                {sp?<><div style={{fontSize:13,fontWeight:700}}>¥{sp?.price?.toLocaleString()}</div><div style={{fontSize:11,color:sp?.change>=0?C.green:C.red}}>{sp?.change>=0?"+":""}{sp?.change}%</div></>:<div style={{fontSize:11,color:C.light}}>{s.quoteType}</div>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {!searchMode&&(<>
                      <div style={{display:"flex",gap:4,padding:"0 8px 8px",overflowX:"auto"}}>
                        {[["all","すべて"],["fund","投信"],["jp","国内株"],["us","米国株"],["crypto","仮想通貨"]].map(([t,l])=>(
                          <button key={t} onClick={()=>setFilterType(t)} style={{background:filterType===t?C.blue:C.card,color:filterType===t?"#fff":C.mid,border:`1px solid ${filterType===t?C.blue:C.border}`,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>{l}</button>
                        ))}
                      </div>
                      <div style={{maxHeight:240,overflowY:"auto"}}>
                        {pickerStocks.map(s=>{
                          const sp=stockPrices[s.symbol]; const cp=cryptoPrices[s.symbol];
                          return (
                            <div key={s.symbol} onClick={()=>{setNewStock(s);setNewAnnualReturn(null);setShowPicker(false);setStockSearch("");}}
                              style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 14px",borderTop:`1px solid ${C.soft}`,cursor:"pointer",background:newStock.symbol===s.symbol?C.blueLight:C.card}}>
                              <div>
                                <div style={{display:"flex",alignItems:"center",gap:5}}>
                                  <span style={{fontSize:13,fontWeight:600,color:newStock.symbol===s.symbol?C.blue:C.text}}>{s.name}</span>
                                  <span style={{background:TYPE_COLOR[s.type]+"18",color:TYPE_COLOR[s.type],fontSize:9,fontWeight:700,borderRadius:3,padding:"1px 4px"}}>{TYPE_LABEL[s.type]}</span>
                                </div>
                                <div style={{fontSize:11,color:C.light}}>{s.sector} · 最低{fmt(s.minAmount)}{s.優待?" 🎁":""}</div>
                              </div>
                              <div style={{textAlign:"right"}}>
                                {sp&&<div style={{fontSize:12,fontWeight:700}}>{sp?.price?.toLocaleString()}円</div>}
                                {cp&&<div style={{fontSize:12,fontWeight:700}}>{cp?.price?.toLocaleString()}円</div>}
                                {!sp&&!cp&&<div style={{fontSize:12,color:RISK_COLOR[s.risk],fontWeight:700}}>{fmtPct(s.annualReturn)}／年</div>}
                                <div style={{fontSize:10,color:RISK_COLOR[s.risk]}}>{RISK_LABEL[s.risk]}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>)}
                  </div>
                )}
              </div>

              {/* カスタム年率（プリセット外銘柄用）*/}
              <div style={{marginBottom:12}}>
                <label style={{fontSize:12,fontWeight:600,color:C.mid,display:"block",marginBottom:6}}>
                  期待年率（任意で上書き可）
                  <span style={{fontSize:10,color:C.light,fontWeight:400,marginLeft:6}}>デフォルト: {fmtPct(newStock.annualReturn)}</span>
                </label>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <input type="number" step="0.1" value={newAnnualReturn??""} onChange={e=>setNewAnnualReturn(e.target.value===""?null:Number(e.target.value))}
                    placeholder={String(newStock.annualReturn)}
                    style={{width:90,background:C.bg,border:`1px solid ${newAnnualReturn!==null?C.blue:C.border}`,borderRadius:8,color:C.text,padding:"7px 10px",fontSize:15,fontWeight:700}}/>
                  <span style={{color:C.mid,fontSize:13}}>% / 年</span>
                  {newAnnualReturn!==null&&<button onClick={()=>setNewAnnualReturn(null)} style={{background:"none",border:"none",color:C.light,fontSize:11,cursor:"pointer"}}>リセット</button>}
                </div>
              </div>

              {/* 購入日 */}
              <div style={{marginBottom:12}}>
                <label style={{fontSize:12,fontWeight:600,color:C.mid,display:"block",marginBottom:6}}>購入日（想定）</label>
                <input type="date" value={newDate} onChange={e=>setNewDate(e.target.value)} max={today()}
                  style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,padding:"9px 12px",fontSize:14,boxSizing:"border-box"}}/>
              </div>

              {/* 購入金額 */}
              <div style={{marginBottom:14}}>
                <label style={{fontSize:12,fontWeight:600,color:C.mid,display:"block",marginBottom:6}}>購入金額</label>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                  <input type="number" value={newAmount} onChange={e=>setNewAmount(Number(e.target.value))}
                    style={{flex:1,background:C.bg,border:`1.5px solid ${minWarning?C.red:C.border}`,borderRadius:8,color:C.text,padding:"9px 12px",fontSize:18,fontWeight:800}}/>
                  <span style={{color:C.mid,fontSize:13}}>円</span>
                </div>
                {minWarning&&(
                  <div style={{background:C.redLight,border:`1px solid ${C.redMid}`,borderRadius:8,padding:"8px 12px",marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
                    <span>⚠️</span><span style={{fontSize:12,color:C.red,fontWeight:600}}>{minWarning}</span>
                  </div>
                )}
                <div style={{fontSize:11,color:C.light,marginBottom:8}}>最低: <span style={{color:C.mid,fontWeight:600}}>{fmt(newStock.minAmount)}</span>{newStock.type==="jp"&&newStock.unitShares&&` (${newStock.unitShares}株単位)`}</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {(newStock.type==="fund"||newStock.type==="crypto"
                    ?[10000,30000,50000,100000,300000]
                    :[newStock.minAmount,newStock.minAmount*2,newStock.minAmount*5].filter(v=>v<=2000000)
                  ).map(v=>(
                    <button key={v} onClick={()=>setNewAmount(v)} style={{background:newAmount===v?C.blue:C.card,color:newAmount===v?"#fff":C.mid,border:`1px solid ${newAmount===v?C.blue:C.border}`,borderRadius:7,padding:"5px 10px",fontSize:12,fontWeight:600,cursor:"pointer"}}>{fmt(v)}</button>
                  ))}
                </div>
              </div>

              {/* プレビュー */}
              {!minWarning&&newDate&&newAmount>0&&(()=>{
                const preview=calcCurrentValue(newAmount,newDate,effectiveReturn,stockPrices[newStock.symbol]?.price??null,null);
                const previewGain=preview-newAmount;
                const previewPct=(preview/newAmount-1)*100;
                return (
                  <div style={{background:previewGain>=0?C.greenLight:C.redLight,border:`1px solid ${previewGain>=0?C.greenMid:C.redMid}`,borderRadius:10,padding:"10px 14px",marginBottom:14}}>
                    <div style={{fontSize:11,color:C.mid,marginBottom:4}}>📊 現在価値の試算（年率{fmtPct(effectiveReturn)}）</div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontSize:15,fontWeight:800}}>{fmt(preview)}</span>
                      <span style={{fontSize:14,fontWeight:800,color:previewGain>=0?C.green:C.red}}>{previewGain>=0?"+":""}{fmt(previewGain)} ({fmtPct(previewPct)})</span>
                    </div>
                  </div>
                );
              })()}

              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>{setShowAdd(false);setStockSearch("");setNewAnnualReturn(null);}} style={{flex:1,background:C.soft,border:`1px solid ${C.border}`,borderRadius:10,color:C.mid,fontSize:13,fontWeight:600,padding:"11px 0",cursor:"pointer"}}>キャンセル</button>
                <button onClick={addHolding} disabled={!!minWarning||addingHolding} style={{flex:2,background:(minWarning||addingHolding)?C.light:C.blue,border:"none",borderRadius:10,color:"#fff",fontSize:13,fontWeight:700,padding:"11px 0",cursor:(minWarning||addingHolding)?"not-allowed":"pointer"}}>{addingHolding?"価格取得中...":"記録する"}</button>
              </div>
            </div>
          )}
        </>)}

        {/* ════ シミュタブ ════ */}
        {mainTab==="sim"&&(<>
          <div style={{display:"flex",background:C.soft,borderRadius:10,padding:3,marginBottom:14}}>
            {[["monthly","積立投資"],["lump","一括投資"]].map(([m,l])=>(
              <button key={m} onClick={()=>setSimMode(m)} style={{flex:1,padding:"8px 0",background:simMode===m?C.blue:"transparent",border:"none",borderRadius:8,color:simMode===m?"#fff":C.mid,fontSize:13,fontWeight:600,cursor:"pointer"}}>{l}</button>
            ))}
          </div>

          <div style={{...card}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <span style={{fontSize:12,fontWeight:600,color:C.mid}}>比較銘柄（最大4つ）</span>
              <button onClick={()=>setShowSimSearch(!showSimSearch)} style={{background:C.blueLight,border:`1px solid ${C.blueMid}`,borderRadius:7,color:C.blue,fontSize:12,fontWeight:700,padding:"4px 12px",cursor:"pointer"}}>＋ 追加</button>
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {simStocks.map((s,i)=>(
                <div key={s.symbol} style={{display:"flex",alignItems:"center",gap:5,background:C.bg,border:`1.5px solid ${COLORS[i]}33`,borderRadius:9,padding:"5px 10px"}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:COLORS[i]}}/>
                  <span style={{fontSize:12,fontWeight:700}}>{s.name}</span>
                  <span style={{background:TYPE_COLOR[s.type]+"18",color:TYPE_COLOR[s.type],fontSize:9,fontWeight:700,borderRadius:3,padding:"1px 4px"}}>{TYPE_LABEL[s.type]}</span>
                  {simStocks.length>1&&<button onClick={()=>toggleSimStock(s)} style={{background:"none",border:"none",color:C.light,cursor:"pointer",fontSize:14,padding:0}}>✕</button>}
                </div>
              ))}
            </div>
            {showSimSearch&&(
              <div style={{marginTop:12,background:C.bg,borderRadius:10,border:`1px solid ${C.border}`,overflow:"hidden"}}>
                <div style={{padding:10}}>
                  <input value={simSearch} onChange={e=>setSimSearch(e.target.value)} placeholder="銘柄名・コード・セクター"
                    style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,padding:"8px 12px",fontSize:13,boxSizing:"border-box"}}/>
                </div>
                <div style={{maxHeight:260,overflowY:"auto"}}>
                  {filteredSimStocks.map(s=>{
                    const isSel=simStocks.find(x=>x.symbol===s.symbol);
                    const sp=stockPrices[s.symbol]; const cp=cryptoPrices[s.symbol];
                    return (
                      <div key={s.symbol} onClick={()=>toggleSimStock(s)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",borderTop:`1px solid ${C.soft}`,cursor:"pointer",background:isSel?C.blueLight:C.card}}>
                        <div>
                          <div style={{display:"flex",alignItems:"center",gap:5}}>
                            <span style={{fontSize:13,fontWeight:600,color:isSel?C.blue:C.text}}>{s.name}</span>
                            <span style={{background:TYPE_COLOR[s.type]+"18",color:TYPE_COLOR[s.type],fontSize:9,fontWeight:700,borderRadius:3,padding:"1px 4px"}}>{TYPE_LABEL[s.type]}</span>
                          </div>
                          <div style={{fontSize:11,color:C.light}}>{s.sector} · 最低{fmt(s.minAmount)}{s.優待?" 🎁":""}</div>
                        </div>
                        <div style={{textAlign:"right"}}>
                          {sp&&<div style={{fontSize:12,fontWeight:700}}>{sp?.price?.toLocaleString()}円</div>}
                          {cp&&<div style={{fontSize:12,fontWeight:700}}>{cp?.price?.toLocaleString()}円</div>}
                          <div style={{fontSize:11,color:RISK_COLOR[s.risk]}}>{fmtPct(s.annualReturn)}／年</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div style={{...card}}>
            {simMode==="monthly"?(<>
              <label style={{fontSize:12,fontWeight:600,color:C.mid,display:"block",marginBottom:6}}>毎月の積立額</label>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                <input type="number" value={monthly} onChange={e=>setMonthly(Number(e.target.value))} style={{flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,padding:"9px 12px",fontSize:18,fontWeight:800}}/>
                <span style={{color:C.mid,fontSize:13}}>円</span>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:16}}>
                {[10000,30000,50000,100000].map(v=><button key={v} onClick={()=>setMonthly(v)} style={{background:monthly===v?C.blue:C.card,color:monthly===v?"#fff":C.mid,border:`1px solid ${monthly===v?C.blue:C.border}`,borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:600,cursor:"pointer"}}>{fmt(v)}</button>)}
              </div>
              <label style={{fontSize:12,fontWeight:600,color:C.mid,display:"block",marginBottom:6}}>積立期間</label>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <input type="range" min={12} max={360} step={12} value={months} onChange={e=>setMonths(Number(e.target.value))} style={{flex:1,accentColor:C.blue}}/>
                <span style={{color:C.blue,fontWeight:800,minWidth:44,textAlign:"right",fontSize:16}}>{months/12}年</span>
              </div>
            </>):(<>
              <label style={{fontSize:12,fontWeight:600,color:C.mid,display:"block",marginBottom:6}}>一括投資額</label>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                <input type="number" value={lump} onChange={e=>setLump(Number(e.target.value))} style={{flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,padding:"9px 12px",fontSize:18,fontWeight:800}}/>
                <span style={{color:C.mid,fontSize:13}}>円</span>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:16}}>
                {[100000,300000,500000,1000000].map(v=><button key={v} onClick={()=>setLump(v)} style={{background:lump===v?C.blue:C.card,color:lump===v?"#fff":C.mid,border:`1px solid ${lump===v?C.blue:C.border}`,borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:600,cursor:"pointer"}}>{fmt(v)}</button>)}
              </div>
              <label style={{fontSize:12,fontWeight:600,color:C.mid,display:"block",marginBottom:6}}>運用期間</label>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <input type="range" min={1} max={30} value={years} onChange={e=>setYears(Number(e.target.value))} style={{flex:1,accentColor:C.blue}}/>
                <span style={{color:C.blue,fontWeight:800,minWidth:36,textAlign:"right",fontSize:16}}>{years}年</span>
              </div>
            </>)}
          </div>

          {/* 目標ライン設定 */}
          {!showGoalEdit&&(
            <div style={{...card,padding:"12px 16px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{fontSize:12,fontWeight:600,color:C.mid}}>🎯 目標金額ライン</div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  {goalAmount>0&&<span style={{fontSize:12,color:C.amber,fontWeight:700}}>{fmt(goalAmount)}</span>}
                  <button onClick={()=>{setGoalInput(goalAmount||"");setShowGoalEdit(true);}} style={{background:C.amberLight,border:"1px solid #FDE68A",borderRadius:7,color:C.amber,fontSize:11,fontWeight:700,padding:"4px 10px",cursor:"pointer"}}>{goalAmount>0?"変更":"設定"}</button>
                </div>
              </div>
            </div>
          )}

          <div style={{...card,padding:"14px 6px 10px"}}>
            <p style={{fontSize:10,color:C.light,margin:"0 10px 10px",lineHeight:1.5}}>※過去実績ベースの試算。将来の利益を保証するものではありません</p>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.soft}/>
                <XAxis dataKey="year" tick={{fontSize:10,fill:C.light}}/>
                <YAxis tick={{fontSize:10,fill:C.light}} tickFormatter={v=>v>=10000?`${(v/10000).toFixed(0)}万`:v}/>
                <Tooltip content={<ChartTooltip/>}/>
                <Legend wrapperStyle={{fontSize:11,paddingTop:6}}/>
                {goalAmount>0&&<ReferenceLine y={goalAmount} stroke="#F59E0B" strokeDasharray="6 3" label={{value:"目標",fill:"#D97706",fontSize:10}}/>}
                <Line type="monotone" dataKey="元本" stroke={C.border} strokeDasharray="4 3" strokeWidth={1.5} dot={false}/>
                {simStocks.map((s,i)=><Line key={s.symbol} type="monotone" dataKey={s.name} stroke={COLORS[i]} strokeWidth={2.5} dot={false}/>)}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {simStats.map((s,i)=>(
            <div key={s.symbol} style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,borderLeft:`4px solid ${COLORS[i]}`,padding:"14px 16px",marginBottom:10,boxShadow:"0 1px 6px rgba(0,0,0,0.05)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                    <span style={{fontSize:14,fontWeight:700}}>{s.name}</span>
                    <span style={{background:TYPE_COLOR[s.type]+"18",color:TYPE_COLOR[s.type],fontSize:9,fontWeight:700,borderRadius:3,padding:"1px 4px"}}>{TYPE_LABEL[s.type]}</span>
                  </div>
                  <div style={{fontSize:11,color:C.light}}>{s.sector} · 年率{fmtPct(s.annualReturn)} · 最低{fmt(s.minAmount)}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{background:s.gain>=0?C.greenLight:C.redLight,border:`1px solid ${s.gain>=0?C.greenMid:C.redMid}`,borderRadius:8,padding:"5px 14px",marginBottom:6}}>
                    <div style={{fontSize:18,fontWeight:800,color:s.gain>=0?C.green:C.red}}>{fmtPct(s.gainPct)}</div>
                  </div>
                  <button onClick={()=>sendToPortfolio(s)} style={{background:C.blueLight,border:`1px solid ${C.blueMid}`,borderRadius:7,color:C.blue,fontSize:10,fontWeight:700,padding:"3px 10px",cursor:"pointer"}}>💼 保有に追加</button>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                {[["投資元本",fmt(s.invested),C.mid],["評価額",fmt(s.finalValue),C.text],["損益",(s.gain>=0?"+":"")+fmt(s.gain),s.gain>=0?C.green:C.red]].map(([l,v,c])=>(
                  <div key={l} style={{background:C.bg,borderRadius:8,padding:"8px 6px",textAlign:"center"}}>
                    <div style={{fontSize:10,color:C.light,marginBottom:2}}>{l}</div>
                    <div style={{fontSize:13,fontWeight:700,color:c}}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>)}

        {/* ════ 銘柄一覧タブ ════ */}
        {mainTab==="stocks"&&(<StockList stocks={STOCKS} stockPrices={stockPrices} cryptoPrices={cryptoPrices} onSelect={s=>{
          // 先にstockを設定してからタブ切替（クラッシュ防止）
          setNewStock(s);
          setNewAnnualReturn(null);
          setShowAdd(false); // 一度閉じてからタブ切替
          setMainTab("portfolio");
          // 次のレンダリング後に開く
          setTimeout(()=>setShowAdd(true), 50);
        }}/>)}

      </div>
      <div style={{padding:"0 16px 36px",textAlign:"center"}}>
        <p style={{fontSize:10,color:C.light,lineHeight:1.7}}>⚠️ 過去実績ベースの参考シミュレーションです。将来の利益を保証するものではありません。投資は自己責任でお願いします。</p>
      </div>
    </div>
  );
}

export default function KabuPlus() {
  return <ErrorBoundary><KabuPlusInner /></ErrorBoundary>;
}
