// ============================================================
// 定数・共有データ
// ============================================================

export const STORAGE_KEYS = {
  TRANSACTIONS:  "kakeibo_integrated_tx",
  CATEGORIES:    "kakeibo_integrated_cats",
  RULES:         "kakeibo_integrated_rules",
  OCR_HISTORY:   "kakeibo_ocr_history",
  OCR_CORRECTIONS: "kakeibo_ocr_corrections",
  MEMBERS:       "kakeibo_members",
};

// デフォルトメンバー（2人）
export const DEFAULT_MEMBERS = [
  { id: "m1", name: "自分" },
  { id: "m2", name: "パートナー" },
];

export const DEFAULT_CATS = [
  {id:"c1", name:"食費",    emoji:"🍱", type:"expense"},
  {id:"c2", name:"外食",    emoji:"🍜", type:"expense"},
  {id:"c3", name:"交通費",  emoji:"🚃", type:"expense"},
  {id:"c4", name:"光熱費",  emoji:"💡", type:"expense"},
  {id:"c5", name:"娯楽",    emoji:"🎬", type:"expense"},
  {id:"c6", name:"通信費",  emoji:"📱", type:"expense"},
  {id:"c7", name:"ガソリン",emoji:"⛽", type:"expense"},
  {id:"c8", name:"医療費",  emoji:"🏥", type:"expense"},
  {id:"c9", name:"その他",  emoji:"📦", type:"expense"},
  {id:"c13",name:"日用品",  emoji:"🏠", type:"expense"},
  {id:"c14",name:"投資",    emoji:"📈", type:"expense"},
  {id:"c15",name:"外食",    emoji:"🍜", type:"expense"},

  {id:"c10",name:"給料",    emoji:"💴", type:"income"},
  {id:"c11",name:"副業",    emoji:"💻", type:"income"},
  {id:"c12",name:"ボーナス",emoji:"🎁", type:"income"},
];

export const DEFAULT_CATEGORY_RULES = [
  {id:"r001",keywords:["セブンイレブン","7-eleven","seven-eleven","ｾﾌﾞﾝ"],category:"食費",type:"expense",priority:90},
  {id:"r002",keywords:["ローソン","lawson"],category:"食費",type:"expense",priority:90},
  {id:"r003",keywords:["ファミリーマート","familymart","ファミマ"],category:"食費",type:"expense",priority:90},
  {id:"r010",keywords:["イオン","西友","業務スーパー","コストコ","マルエツ","スーパー"],category:"食費",type:"expense",priority:80},
  {id:"r020",keywords:["マクドナルド","mcdonald","マック","マクド"],category:"外食",type:"expense",priority:90},
  {id:"r021",keywords:["すき家","吉野家","松屋","なか卯"],category:"外食",type:"expense",priority:90},
  {id:"r022",keywords:["スターバックス","starbucks","スタバ"],category:"外食",type:"expense",priority:90},
  {id:"r023",keywords:["はま寿司","くら寿司","スシロー","サイゼリヤ","ガスト"],category:"外食",type:"expense",priority:88},
  {id:"r030",keywords:["suica","pasmo"],category:"交通費",type:"expense",priority:92},
  {id:"r031",keywords:["タクシー","taxi","uber","新幹線","jr","駐車場"],category:"交通費",type:"expense",priority:88},
  {id:"r040",keywords:["eneos","エネオス","出光","コスモ","ガソリン","給油"],category:"ガソリン",type:"expense",priority:93},
  {id:"r050",keywords:["東京電力","関西電力","電気代","電力"],category:"光熱費",type:"expense",priority:92},
  {id:"r051",keywords:["東京ガス","大阪ガス","ガス代"],category:"光熱費",type:"expense",priority:92},
  {id:"r060",keywords:["ドコモ","au","ソフトバンク","楽天モバイル"],category:"通信費",type:"expense",priority:92},
  {id:"r070",keywords:["netflix","ネットフリックス","spotify","amazon prime","disney+"],category:"娯楽",type:"expense",priority:95},
  {id:"r071",keywords:["映画","シネマ","toho"],category:"娯楽",type:"expense",priority:88},
  {id:"r080",keywords:["病院","クリニック","薬局","マツキヨ"],category:"医療費",type:"expense",priority:88},
  {id:"r090",keywords:["給与","給料","月給"],category:"給料",type:"income",priority:95},
  {id:"r091",keywords:["ボーナス","賞与"],category:"ボーナス",type:"income",priority:95},
  {id:"r092",keywords:["フリーランス","業務委託","報酬"],category:"副業",type:"income",priority:90},
  {id:"r100",keywords:["ニトリ","nitori"],category:"日用品",type:"expense",priority:92},
  {id:"r101",keywords:["カインズ","cainz"],category:"日用品",type:"expense",priority:92},
  {id:"r102",keywords:["ウエルシア","welcia"],category:"日用品",type:"expense",priority:92},
  {id:"r103",keywords:["プレム","plein","ﾌﾟﾚﾑ"],category:"食費",type:"expense",priority:90},
  {id:"r104",keywords:["エブリビッグデイ","bigday","ビッグデイ"],category:"食費",type:"expense",priority:90},
  {id:"r105",keywords:["マックスバリュ","maxvalu","イオン","aeon"],category:"食費",type:"expense",priority:88},
  {id:"r106",keywords:["セルバ","selva"],category:"食費",type:"expense",priority:88},
  {id:"r107",keywords:["100えんハウス","レモン","100円"],category:"日用品",type:"expense",priority:88},
  {id:"r108",keywords:["オーシマ","oshima","ドーナツ"],category:"外食",type:"expense",priority:88},
  {id:"r109",keywords:["sbi証券","sbi","投信積立"],category:"投資",type:"expense",priority:95},
  {id:"r110",keywords:["楽天モバイル","rakuten mobile"],category:"通信費",type:"expense",priority:92},
  {id:"r111",keywords:["レンタカー","ニコニコレンタカー"],category:"交通費",type:"expense",priority:88},
  {id:"r112",keywords:["google play","googleplay"],category:"娯楽",type:"expense",priority:93},
  {id:"r113",keywords:["プレミアム商品券","商品券"],category:"その他",type:"expense",priority:70},
];

export const CSV_FORMATS = {
  generic: {
    label: "汎用（アプリ標準）",
    sampleColumns: ["date","label","amount","type"],
    normalize: (r) => {
      const type = r.type === "income" ? "income" : "expense";
      const amt  = parseFloat(String(r.amount || 0).replace(/[¥,\s]/g, "")) || 0;
      return {
        date:     (r.date || "").replace(/\//g, "-"),
        label:    (r.label || "不明").trim(),
        category: (r.category || "その他").trim(),
        amount:   type === "expense" ? -Math.abs(amt) : Math.abs(amt),
        type,
      };
    },
  },
  mufg: {
    label: "三菱UFJ銀行",
    sampleColumns: ["日付","摘要","支払い金額（円）"],
    normalize: (r) => {
      const pay  = parseFloat(String(r["支払い金額（円）"] || 0).replace(/,/g, "")) || 0;
      const recv = parseFloat(String(r["預かり金額（円）"] || 0).replace(/,/g, "")) || 0;
      return {
        date:     (r["日付"] || "").replace(/\//g, "-"),
        label:    (r["摘要"] || "不明").trim(),
        category: "その他",
        amount:   pay > 0 ? -pay : recv,
        type:     pay > 0 ? "expense" : "income",
      };
    },
  },
  sbi: {
    label: "住信SBIネット銀行",
    sampleColumns: ["日付","内容","出金金額(円)","入金金額(円)"],
    normalize: (r) => {
      const date = (r["日付"] || "").replace(/\//g, "-").trim();
      if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) return null;
      const label = (r["内容"] || "不明").trim()
        .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
        .trim();
      const outStr = String(r["出金金額(円)"] || "").replace(/[,，\s]/g, "");
      const inStr  = String(r["入金金額(円)"] || "").replace(/[,，\s]/g, "");
      const out = parseFloat(outStr) || 0;
      const inc = parseFloat(inStr)  || 0;
      if (!out && !inc) return null;
      return { date, label, category: "その他", amount: out > 0 ? -out : inc, type: out > 0 ? "expense" : "income" };
    },
  },
  paypay: {
    label: "PayPay",
    sampleColumns: ["取引日","出金金額（円）","取引先","取引内容"],
    normalize: (r) => {
      const content = (r["取引内容"] || "").trim();
      if (["送った金額","ポイント、残高の獲得"].includes(content)) return null;
      const dateRaw = (r["取引日"] || "").slice(0, 10);
      const date    = dateRaw.replace(/\//g, "-");
      if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) return null;
      const label   = (r["取引先"] || r["取引内容"] || "不明").trim();
      const outStr  = String(r["出金金額（円）"] || "").replace(/[,，\-\s]/g, "");
      const inStr   = String(r["入金金額（円）"] || "").replace(/[,，\-\s]/g, "");
      const out = parseFloat(outStr) || 0;
      const inc = parseFloat(inStr)  || 0;
      if (!out && !inc) return null;
      return { date, label, category: "その他", amount: out > 0 ? -out : inc, type: out > 0 ? "expense" : "income" };
    },
  },
  recruit: {
    label: "リクルートカード",
    sampleColumns: ["ご利用日","ご利用先など","ご利用金額(￥)"],
    normalize: (r) => {
      const date = (r["ご利用日"] || "").trim().replace(/\//g, "-");
      if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) return null;
      const label  = (r["ご利用先など"] || "不明").trim();
      const amtStr = String(r["ご利用金額(￥)"] || r["お支払い金額(￥)"] || "0").replace(/[,，]/g, "");
      const amount = parseFloat(amtStr) || 0;
      if (!amount) return null;
      return { date, label, category: "その他", amount: -Math.abs(amount), type: "expense" };
    },
  },
  epos: {
    label: "エポスカード",
    sampleColumns: ["ご利用日","ご利用先など","ご利用金額(円)"],
    normalize: (r) => {
      let dateRaw = (r["ご利用日"] || "").trim();
      let date;
      const m1 = dateRaw.match(/^(\d{2})\s+(\d{2})\s+(\d{2})$/);
      if (m1) { date = `20${m1[1]}-${m1[2]}-${m1[3]}`; }
      else { date = dateRaw.replace(/\//g, "-"); }
      if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) return null;
      const label  = (r["ご利用先など"] || "不明").trim().replace(/^[A-Z]{2}\//,"").replace(/　+/g," ").trim();
      const amtStr = String(r["ご利用金額(円)"] || r["お支払金額(円)"] || "0").replace(/[,，]/g,"");
      const amount = parseFloat(amtStr) || 0;
      if (!amount) return null;
      return { date, label, category: "その他", amount: -Math.abs(amount), type: "expense" };
    },
  },
};

export const SOURCE_CFG = {
  ocr:    { label: "📷 OCR", cls: "bg-purple-100 text-purple-700" },
  csv:    { label: "📊 CSV", cls: "bg-emerald-100 text-emerald-700" },
  manual: { label: "✏️ 手動", cls: "bg-gray-100 text-gray-600" },
};

export const PIE_COLORS = ["#6366f1","#10b981","#f43f5e","#f59e0b","#8b5cf6","#06b6d4","#ec4899","#84cc16"];
