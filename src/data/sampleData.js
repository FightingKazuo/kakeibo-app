import { createTransaction } from "../services/transaction";

export const SAMPLE_TX = [
  createTransaction({date:"2025-05-21",category:"食費",   label:"スーパーマルエツ",amount:-3200, type:"expense",source:"manual"}),
  createTransaction({date:"2025-05-21",category:"給料",   label:"5月分 給与",     amount:280000,type:"income", source:"csv"}),
  createTransaction({date:"2025-05-20",category:"交通費", label:"Suicaチャージ",  amount:-2000, type:"expense",source:"manual"}),
  createTransaction({date:"2025-05-19",category:"食費",   label:"セブンイレブン",  amount:-526,  type:"expense",source:"ocr"}),
  createTransaction({date:"2025-05-18",category:"光熱費", label:"東京電力 5月",   amount:-6800, type:"expense",source:"csv"}),
  createTransaction({date:"2025-05-17",category:"娯楽",   label:"Netflix",       amount:-1490, type:"expense",source:"csv"}),
  createTransaction({date:"2025-05-15",category:"外食",   label:"マクドナルド",   amount:-850,  type:"expense",source:"manual"}),
  createTransaction({date:"2025-05-10",category:"ガソリン",label:"ENEOS 給油",   amount:-4922, type:"expense",source:"manual"}),
  createTransaction({date:"2025-04-25",category:"給料",   label:"4月分 給与",     amount:280000,type:"income", source:"csv"}),
  createTransaction({date:"2025-04-20",category:"食費",   label:"業務スーパー",   amount:-5200, type:"expense",source:"manual"}),
  createTransaction({date:"2025-03-25",category:"給料",   label:"3月分 給与",     amount:280000,type:"income", source:"csv"}),
  createTransaction({date:"2025-03-01",category:"ボーナス",label:"春ボーナス",    amount:150000,type:"income", source:"manual"}),
];
