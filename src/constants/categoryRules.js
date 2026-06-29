// ============================================================
// constants/categoryRules.js
// カテゴリ自動分類ルール・銀行カードマッピング
// ============================================================

// ── 銀行明細のカード引き落とし名称 → CSVフォーマットIDのマッピング ──
export const BANK_CARD_MAPPING = [
  { bankKeyword: "ミツイスミトモカード",  formatId: "smbc",     label: "三井住友カード" },
  { bankKeyword: "エポスカード",          formatId: "epos",     label: "エポスカード"   },
  { bankKeyword: "セゾン",               formatId: "saison",   label: "セゾンカード"   },
  { bankKeyword: "イデミツクレジツト",    formatId: "idemitsu", label: "出光クレジット" },
  { bankKeyword: "ポケットカード",        formatId: "pocket",   label: "ポケットカード" },
  { bankKeyword: "ジェーシービー",        formatId: "jcb",      label: "JCBカード"      },
  { bankKeyword: "ジエーシービー",        formatId: "jcb",      label: "JCBカード"      },
  { bankKeyword: "ＪＣＢ",              formatId: "jcb",      label: "JCBカード"      },
  { bankKeyword: "楽天カード",            formatId: "rakuten",  label: "楽天カード"     },
  { bankKeyword: "アマゾン",             formatId: "smbc",     label: "Amazonマスター" },
  { bankKeyword: "オリコ",              formatId: "orico",    label: "オリコカード"   },
];

// ── デフォルトカテゴリ分類ルール ──────────────────────────────
export const DEFAULT_CATEGORY_RULES = [
  // コンビニ
  { id: "r001", keywords: ["セブンイレブン", "7-eleven", "seven-eleven", "ｾﾌﾞﾝ"],           category: "食費",       type: "expense", priority: 90 },
  { id: "r002", keywords: ["ローソン", "lawson"],                                             category: "食費",       type: "expense", priority: 90 },
  { id: "r003", keywords: ["ファミリーマート", "familymart", "ファミマ"],                     category: "食費",       type: "expense", priority: 90 },
  // スーパー
  { id: "r010", keywords: ["イオン", "西友", "業務スーパー", "コストコ", "マルエツ", "スーパー"], category: "食費",    type: "expense", priority: 80 },
  { id: "r104", keywords: ["エブリビッグデイ", "bigday", "ビッグデイ"],                       category: "食費",       type: "expense", priority: 90 },
  { id: "r105", keywords: ["マックスバリュ", "maxvalu", "イオン", "aeon"],                    category: "食費",       type: "expense", priority: 88 },
  { id: "r106", keywords: ["セルバ", "selva"],                                                category: "食費",       type: "expense", priority: 88 },
  { id: "r103", keywords: ["プレム", "plein", "ﾌﾟﾚﾑ"],                                       category: "食費",       type: "expense", priority: 90 },
  // 外食
  { id: "r020", keywords: ["マクドナルド", "mcdonald", "マック", "マクド"],                   category: "外食",       type: "expense", priority: 90 },
  { id: "r021", keywords: ["すき家", "吉野家", "松屋", "なか卯"],                             category: "外食",       type: "expense", priority: 90 },
  { id: "r022", keywords: ["スターバックス", "starbucks", "スタバ"],                          category: "外食",       type: "expense", priority: 90 },
  { id: "r023", keywords: ["はま寿司", "くら寿司", "スシロー", "サイゼリヤ", "ガスト"],       category: "外食",       type: "expense", priority: 88 },
  { id: "r108", keywords: ["オーシマ", "oshima", "ドーナツ"],                                 category: "外食",       type: "expense", priority: 88 },
  // 交通
  { id: "r030", keywords: ["suica", "pasmo"],                                                 category: "交通費",     type: "expense", priority: 92 },
  { id: "r031", keywords: ["タクシー", "taxi", "uber", "新幹線", "jr", "駐車場"],             category: "交通費",     type: "expense", priority: 88 },
  { id: "r111", keywords: ["レンタカー", "ニコニコレンタカー"],                               category: "交通費",     type: "expense", priority: 88 },
  // 自動車
  { id: "r040", keywords: ["eneos", "エネオス", "出光", "コスモ", "ガソリン", "給油"],        category: "自動車",     type: "expense", priority: 93 },
  // 水道・光熱費
  { id: "r050", keywords: ["東京電力", "関西電力", "電気代", "電力"],                         category: "水道・光熱費", type: "expense", priority: 92 },
  { id: "r051", keywords: ["東京ガス", "大阪ガス", "ガス代"],                                 category: "水道・光熱費", type: "expense", priority: 92 },
  // 通信費
  { id: "r060", keywords: ["ドコモ", "au", "ソフトバンク", "楽天モバイル", "ラクテンモバイル", "ラクテンモバイルツウシンリヨウ", "ＲＡＫＵＴＥＮ"], category: "通信費", type: "expense", priority: 92 },
  { id: "r110", keywords: ["rakuten mobile", "RAKUTEN MOBILE"],                               category: "通信費",     type: "expense", priority: 92 },
  // 趣味・娯楽
  { id: "r070", keywords: ["netflix", "NETFLIX", "ＮＥＴＦＬＩＸ", "ネットフリックス", "spotify", "SPOTIFY", "amazon prime", "disney+", "YOUTUBE", "ＹＯＵＴＵＢＥ", "youtubepremium", "ＹＯＵＴＵＢＥＰＲＥＭＩＵＭ"], category: "趣味・娯楽", type: "expense", priority: 95 },
  { id: "r071", keywords: ["映画", "シネマ", "toho"],                                         category: "趣味・娯楽", type: "expense", priority: 88 },
  { id: "r112", keywords: ["google play", "googleplay"],                                       category: "趣味・娯楽", type: "expense", priority: 93 },
  // 健康・医療
  { id: "r080", keywords: ["病院", "クリニック", "薬局", "マツキヨ"],                         category: "健康・医療", type: "expense", priority: 88 },
  // 収入
  { id: "r090", keywords: ["給与", "給料", "月給"],                                           category: "給料",       type: "income",  priority: 95 },
  { id: "r091", keywords: ["ボーナス", "賞与"],                                               category: "ボーナス",   type: "income",  priority: 95 },
  { id: "r092", keywords: ["フリーランス", "業務委託", "報酬"],                               category: "副業",       type: "income",  priority: 90 },
  // 日用品
  { id: "r100", keywords: ["ニトリ", "nitori"],                                               category: "日用品",     type: "expense", priority: 92 },
  { id: "r101", keywords: ["カインズ", "cainz"],                                              category: "日用品",     type: "expense", priority: 92 },
  { id: "r102", keywords: ["ウエルシア", "welcia"],                                           category: "日用品",     type: "expense", priority: 92 },
  { id: "r107", keywords: ["100えんハウス", "レモン", "100円"],                               category: "日用品",     type: "expense", priority: 88 },
  // 衣服・美容
  { id: "r114", keywords: ["美容院", "理髪", "ヘアカット", "美容室", "サロン", "コスメ", "化粧品", "ユニクロ", "gu", "しまむら"], category: "衣服・美容", type: "expense", priority: 88 },
  // 住宅
  { id: "r115", keywords: ["家賃", "地代", "住宅ローン", "管理費", "積立金"],                 category: "住宅",       type: "expense", priority: 92 },
  // 保険
  { id: "r116", keywords: ["生命保険", "医療保険", "損保", "火災保険", "自動車保険"],         category: "保険",       type: "expense", priority: 92 },
  // 水道代
  { id: "r117", keywords: ["水道代", "水道局", "水道料金"],                                   category: "水道・光熱費", type: "expense", priority: 92 },
  // 交際費
  { id: "r118", keywords: ["飲み会", "合コン", "冠婚葬祭", "お祝い", "プレゼント代"],         category: "交際費",     type: "expense", priority: 88 },
  // 教養・教育
  { id: "r119", keywords: ["スクール", "習いごと", "塾", "学費", "書籍", "bookoff", "ブックオフ"], category: "教養・教育", type: "expense", priority: 88 },
  // 特別な支出
  { id: "r120", keywords: ["家具", "家電", "引越し", "リフォーム", "ヤマダ", "ケーズデンキ", "ヨドバシ", "ビックカメラ"], category: "特別な支出", type: "expense", priority: 85 },
  // 投資
  { id: "r109", keywords: ["sbi証券", "sbi", "投信積立"],                                     category: "投資",       type: "expense", priority: 95 },
  // ガソリン・自動車
  { id: "r126", keywords: ["エネオス", "ＥＮＥＯＳ", "ENEOS", "イデミツ", "アポロステーション", "出光", "コスモ石油", "ガソリン", "SS"], category: "自動車", type: "expense", priority: 91 },
  // 投資・証券
  { id: "r127", keywords: ["SBI証券", "ＳＢＩ証券", "投信積立", "投資信託", "積立サービス"], category: "投資", type: "expense", priority: 96 },
  // ETC・高速道路
  { id: "r121", keywords: ["etc", "ＥＴＣ", "ETC", "高速道路", "首都高", "阪神高速", "名古屋高速", "中日本高速", "東日本高速", "西日本高速", "中部地区", "東京支社", "深夜割引", "特割"], category: "交通費", type: "expense", priority: 93 },
  // ホームセンター・雑貨
  { id: "r122", keywords: ["ダイソー", "セリア", "キャンドゥ", "百均", "100均", "リヨウヒンシヨツプ", "雑貨"], category: "日用品", type: "expense", priority: 88 },
  // 飲食店
  { id: "r123", keywords: ["藍屋", "キクドコロ", "卓", "Cafe", "cafe", "カフェ", "居酒屋", "酒場", "食堂", "レストラン"], category: "外食", type: "expense", priority: 85 },
  // ドラッグストア
  { id: "r124", keywords: ["ウエルシア", "マツキヨ", "ツルハ", "クスリ", "薬", "ドラッグ"], category: "健康・医療", type: "expense", priority: 90 },
  // 税金・公共料金
  { id: "r125", keywords: ["eLTAX", "ｅＬＴＡＸ", "地方税", "国民健康保険", "市民税", "固定資産税"], category: "税・社会保障", type: "expense", priority: 95 },
  // その他
  { id: "r113", keywords: ["プレミアム商品券", "商品券"],                                     category: "その他",     type: "expense", priority: 70 },
];
