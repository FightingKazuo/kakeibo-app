// ============================================================
// 定数・共有データ
// ============================================================

export const STORAGE_KEYS = {
  TRANSACTIONS:    "kakeibo_integrated_tx",
  CATEGORIES:      "kakeibo_integrated_cats",
  RULES:           "kakeibo_integrated_rules",
  OCR_HISTORY:     "kakeibo_ocr_history",
  OCR_CORRECTIONS: "kakeibo_ocr_corrections",
  MEMBERS:         "kakeibo_members",
  POINT_ACCOUNTS:  "kakeibo_point_accounts",
};// ============================================================
// 定数・共有データ
// ============================================================

export const STORAGE_KEYS = {
  TRANSACTIONS:    "kakeibo_integrated_tx",
  CATEGORIES:      "kakeibo_integrated_cats",
  RULES:           "kakeibo_integrated_rules",
  OCR_HISTORY:     "kakeibo_ocr_history",
  OCR_CORRECTIONS: "kakeibo_ocr_corrections",
  MEMBERS:         "kakeibo_members",
  POINT_ACCOUNTS:  "kakeibo_point_accounts",
};

// デフォルトメンバー（2人）
export const DEFAULT_MEMBERS = [
  { id: "m1", name: "自分" },
  { id: "m2", name: "パートナー" },
];

// デフォルトポイント口座
export const DEFAULT_POINT_ACCOUNTS = [
  { id: "pa1", name: "Tポイント",   icon: "🟡", unit: "円", balance: 0 },
  { id: "pa2", name: "WAON",        icon: "🔵", unit: "円", balance: 0 },
  { id: "pa3", name: "楽天ポイント", icon: "🔴", unit: "円", balance: 0 },
  { id: "pa4", name: "PayPay",      icon: "💛", unit: "円", balance: 0 },
];

// 支払方法（現金 + ポイント口座）
export const PAYMENT_METHODS = {
  cash: { id: "cash", name: "現金/カード", icon: "💳" },
};

export const DEFAULT_CATS = [
  // ── 支出（マネーフォワード準拠）──────────────────────────────
  {id:"c1",  name:"食費",        emoji:"🍱", type:"expense"},
  {id:"c2",  name:"外食",        emoji:"🍜", type:"expense"},
  {id:"c13", name:"日用品",      emoji:"🧴", type:"expense"},
  {id:"c5",  name:"趣味・娯楽",  emoji:"🎬", type:"expense"},
  {id:"c18", name:"交際費",      emoji:"👥", type:"expense"},
  {id:"c3",  name:"交通費",      emoji:"🚃", type:"expense"},
  {id:"c19", name:"衣服・美容",  emoji:"👕", type:"expense"},
  {id:"c8",  name:"健康・医療",  emoji:"🏥", type:"expense"},
  {id:"c7",  name:"自動車",      emoji:"🚗", type:"expense"},
  {id:"c20", name:"教養・教育",  emoji:"📚", type:"expense"},
  {id:"c21", name:"特別な支出",  emoji:"🎪", type:"expense"},
  {id:"c4",  name:"水道・光熱費",emoji:"💡", type:"expense"},
  {id:"c6",  name:"通信費",      emoji:"📱", type:"expense"},
  {id:"c22", name:"住宅",        emoji:"🏡", type:"expense"},
  {id:"c23", name:"税・社会保障",emoji:"🏛", type:"expense"},
  {id:"c24", name:"保険",        emoji:"🛡", type:"expense"},
  {id:"c14", name:"投資",        emoji:"📈", type:"expense"},
  {id:"c9",  name:"その他",      emoji:"📦", type:"expense"},

  // ── 収入 ─────────────────────────────────────────────────────
  {id:"c10", name:"給料",        emoji:"💴", type:"income"},
  {id:"c11", name:"副業",        emoji:"💻", type:"income"},
  {id:"c12", name:"ボーナス",    emoji:"🎁", type:"income"},
  {id:"c16", name:"割り勘戻り",  emoji:"🔄", type:"income"},
  {id:"c17", name:"その他収入",  emoji:"💰", type:"income"},
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
  {id:"r040",keywords:["eneos","エネオス","出光","コスモ","自動車","給油"],category:"自動車",type:"expense",priority:93},
  {id:"r050",keywords:["東京電力","関西電力","電気代","電力"],category:"水道・光熱費",type:"expense",priority:92},
  {id:"r051",keywords:["東京ガス","大阪ガス","ガス代"],category:"水道・光熱費",type:"expense",priority:92},
  {id:"r060",keywords:["ドコモ","au","ソフトバンク","楽天モバイル"],category:"通信費",type:"expense",priority:92},
  {id:"r070",keywords:["netflix","ネットフリックス","spotify","amazon prime","disney+"],category:"趣味・娯楽",type:"expense",priority:95},
  {id:"r071",keywords:["映画","シネマ","toho"],category:"趣味・娯楽",type:"expense",priority:88},
  {id:"r080",keywords:["病院","クリニック","薬局","マツキヨ"],category:"健康・医療",type:"expense",priority:88},
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
  {id:"r112",keywords:["google play","googleplay"],category:"趣味・娯楽",type:"expense",priority:93},
  {id:"r113",keywords:["プレミアム商品券","商品券"],category:"その他",type:"expense",priority:70},
  // 新カテゴリ対応ルール
  {id:"r114",keywords:["美容院","理髪","ヘアカット","美容室","サロン","コスメ","化粧品","ユニクロ","gu","しまむら"],category:"衣服・美容",type:"expense",priority:88},
  {id:"r115",keywords:["家賃","地代","住宅ローン","管理費","積立金"],category:"住宅",type:"expense",priority:92},
  {id:"r116",keywords:["生命保険","医療保険","損保","火災保険","自動車保険"],category:"保険",type:"expense",priority:92},
  {id:"r117",keywords:["水道代","水道局","水道料金"],category:"水道・光熱費",type:"expense",priority:92},
  {id:"r118",keywords:["飲み会","合コン","冠婚葬祭","お祝い","プレゼント代"],category:"交際費",type:"expense",priority:88},
  {id:"r119",keywords:["スクール","習いごと","塾","学費","書籍","bookoff","ブックオフ"],category:"教養・教育",type:"expense",priority:88},
  {id:"r120",keywords:["家具","家電","引越し","リフォーム","ヤマダ","ケーズデンキ","ヨドバシ","ビックカメラ"],category:"特別な支出",type:"expense",priority:85},
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

      // 無視する行
      if (content === "ポイント、残高の獲得") return null;

      const dateRaw = (r["取引日"] || "").slice(0, 10);
      const date    = dateRaw.replace(/\//g, "-");
      if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) return null;

      const label   = (r["取引先"] || r["取引内容"] || "不明").trim();
      const outStr  = String(r["出金金額（円）"] || "").replace(/[,，\-\s]/g, "");
      const inStr   = String(r["入金金額（円）"] || "").replace(/[,，\-\s]/g, "");
      const out = parseFloat(outStr) || 0;
      const inc = parseFloat(inStr)  || 0;
      if (!out && !inc) return null;

      // 取引内容別に種類を設定
      if (content === "チャージ") {
        // チャージは収入（PayPay残高への入金）
        return { date, label: `PayPay チャージ（${label}）`, category: "その他収入", amount: inc, type: "income" };
      }
      if (content === "受け取った金額") {
        // 割り勘戻り・送金受取
        return { date, label, category: "割り勘戻り", amount: inc, type: "income" };
      }
      if (content === "送った金額") {
        // 送金は支出（個人費用として扱う）
        return { date, label: `PayPay送金（${label}）`, category: "その他", amount: -out, type: "expense", shareType: "personal" };
      }
      // 支払い・請求書払い → 通常支出
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

  // ── 三井住友カード・Amazonマスター（共通フォーマット）──────
  // 形式: YYYY/MM/DD,店舗名（全角）,金額,支払回数,今回回数,今回支払額,摘要
  // 1行目: カード名（ヘッダーなし）
  // 最終行: ,,,,,合計金額, （スキップ）
  smbc: {
    label: "三井住友カード / Amazonマスター",
    sampleColumns: ["日付（1行目カード名）","店舗名","金額"],
    normalize: (r) => {
      // Papa.parseでヘッダーなしの場合、フィールド名は0,1,2...
      const raw = r;
      // キー名が数字の場合とカラム名の場合両対応
      const col0 = raw[0] || raw["0"] || "";
      const col1 = raw[1] || raw["1"] || "";
      const col5 = raw[5] || raw["5"] || ""; // 今回支払額

      // 日付バリデーション
      const dateRaw = String(col0).trim();
      if (!dateRaw.match(/^\d{4}\/\d{2}\/\d{2}$/)) return null;
      const date = dateRaw.replace(/\//g, "-");

      // 店舗名（全角→半角変換）
      const label = String(col1 || "不明")
        .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
        .replace(/　/g, " ")
        .trim();
      if (!label) return null;

      // 金額（今回支払額を優先）
      const amtStr = String(col5 || "0").replace(/[,，\s]/g, "");
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


// デフォルトメンバー（2人）
export const DEFAULT_MEMBERS = [
  { id: "m1", name: "自分" },
  { id: "m2", name: "パートナー" },
];

// デフォルトポイント口座
export const DEFAULT_POINT_ACCOUNTS = [
  { id: "pa1", name: "Tポイント",   icon: "🟡", unit: "円", balance: 0 },
  { id: "pa2", name: "WAON",        icon: "🔵", unit: "円", balance: 0 },
  { id: "pa3", name: "楽天ポイント", icon: "🔴", unit: "円", balance: 0 },
  { id: "pa4", name: "PayPay",      icon: "💛", unit: "円", balance: 0 },
];

// 支払方法（現金 + ポイント口座）
export const PAYMENT_METHODS = {
  cash: { id: "cash", name: "現金/カード", icon: "💳" },
};

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

  {id:"c10",name:"給料",      emoji:"💴", type:"income"},
  {id:"c11",name:"副業",      emoji:"💻", type:"income"},
  {id:"c12",name:"ボーナス",  emoji:"🎁", type:"income"},
  {id:"c16",name:"割り勘戻り",emoji:"🔄", type:"income"},
  {id:"c17",name:"その他収入",emoji:"💰", type:"income"},
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

      // 無視する行
      if (content === "ポイント、残高の獲得") return null;

      const dateRaw = (r["取引日"] || "").slice(0, 10);
      const date    = dateRaw.replace(/\//g, "-");
      if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) return null;

      const label   = (r["取引先"] || r["取引内容"] || "不明").trim();
      const outStr  = String(r["出金金額（円）"] || "").replace(/[,，\-\s]/g, "");
      const inStr   = String(r["入金金額（円）"] || "").replace(/[,，\-\s]/g, "");
      const out = parseFloat(outStr) || 0;
      const inc = parseFloat(inStr)  || 0;
      if (!out && !inc) return null;

      // 取引内容別に種類を設定
      if (content === "チャージ") {
        // チャージは収入（PayPay残高への入金）
        return { date, label: `PayPay チャージ（${label}）`, category: "その他収入", amount: inc, type: "income" };
      }
      if (content === "受け取った金額") {
        // 割り勘戻り・送金受取
        return { date, label, category: "割り勘戻り", amount: inc, type: "income" };
      }
      if (content === "送った金額") {
        // 送金は支出（個人費用として扱う）
        return { date, label: `PayPay送金（${label}）`, category: "その他", amount: -out, type: "expense", shareType: "personal" };
      }
      // 支払い・請求書払い → 通常支出
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

  // ── 三井住友カード・Amazonマスター（共通フォーマット）──────
  // 形式: YYYY/MM/DD,店舗名（全角）,金額,支払回数,今回回数,今回支払額,摘要
  // 1行目: カード名（ヘッダーなし）
  // 最終行: ,,,,,合計金額, （スキップ）
  smbc: {
    label: "三井住友カード / Amazonマスター",
    sampleColumns: ["日付（1行目カード名）","店舗名","金額"],
    normalize: (r) => {
      // Papa.parseでヘッダーなしの場合、フィールド名は0,1,2...
      const raw = r;
      // キー名が数字の場合とカラム名の場合両対応
      const col0 = raw[0] || raw["0"] || "";
      const col1 = raw[1] || raw["1"] || "";
      const col5 = raw[5] || raw["5"] || ""; // 今回支払額

      // 日付バリデーション
      const dateRaw = String(col0).trim();
      if (!dateRaw.match(/^\d{4}\/\d{2}\/\d{2}$/)) return null;
      const date = dateRaw.replace(/\//g, "-");

      // 店舗名（全角→半角変換）
      const label = String(col1 || "不明")
        .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
        .replace(/　/g, " ")
        .trim();
      if (!label) return null;

      // 金額（今回支払額を優先）
      const amtStr = String(col5 || "0").replace(/[,，\s]/g, "");
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
