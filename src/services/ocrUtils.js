// ============================================================
// services/ocrUtils.js
// 17店舗のレシートサンプルを分析して作成した
// 実用的なOCRパーサー
//
// 対応フォーマット:
//   welcia  … ウエルシア（薬局）
//   plein   … プレム（スーパー）
//   bigday  … Every BIGDAY（スーパー）
//   cainz   … カインズ（ホームセンター）
//   nitori  … ニトリ（家具）
//   lemon   … 100えんハウスレモン（100円ショップ）
//   selva   … セルバ（スーパー）
//   aeon    … マックスバリュ/イオン（スーパー）
//   osima   … オーシマドーナツ（飲食）
//   generic … 上記以外の汎用パターン
// ============================================================

import { createWorker } from "tesseract.js";
import { todayStr, safeDate, safeAmount } from "../utils/format";
import { createTransactionItem } from "./transaction";

// ─── Tesseract 実行 ─────────────────────────────────────────
export const runTesseract = async (imageSource, onProgress) => {
  const worker = await createWorker("jpn+eng", 1, {
    logger: m => {
      if (m.status === "recognizing text" && onProgress)
        onProgress(Math.round(m.progress * 100));
    },
  });
  try {
    const { data } = await worker.recognize(imageSource);
    return { text: data.text, confidence: Math.round(data.confidence) };
  } finally {
    await worker.terminate();
  }
};

// ─── 店舗フォーマット検出 ────────────────────────────────────
const STORE_PATTERNS = {
  welcia:  /welcia|ウエルシア/i,
  plein:   /プレム|plein|ﾌﾟﾚﾑ/i,
  bigday:  /bigday|ビッグデイ/i,
  cainz:   /cainz|カインズ/i,
  nitori:  /ニトリ/i,
  lemon:   /100えんハウス|100円ハウス|ﾚﾓﾝ瀬名|レモン瀬名/i,
  selva:   /セルバ|selva/i,
  aeon:    /マックスバリュ|maxvalu|ＭＡＸＶＡＬＵ|イオン/i,
  osima:   /オーシマ|oshima|donut/i,
};

// 税区分: type='inner'=内税（価格に税込）, type='outer'=外税（価格は税抜）
const TAX_INFO = {
  welcia:  { type: "outer", defaultRate: 0.10, hasReduced: true  },
  plein:   { type: "outer", defaultRate: 0.08, hasReduced: false },
  bigday:  { type: "outer", defaultRate: 0.08, hasReduced: false },
  cainz:   { type: "outer", defaultRate: 0.10, hasReduced: false },
  nitori:  { type: "inner", defaultRate: 0.10, hasReduced: false },
  lemon:   { type: "outer", defaultRate: 0.10, hasReduced: false },
  selva:   { type: "outer", defaultRate: 0.10, hasReduced: true  },
  aeon:    { type: "outer", defaultRate: 0.08, hasReduced: true  },
  osima:   { type: "inner", defaultRate: 0.08, hasReduced: false },
  generic: { type: "outer", defaultRate: 0.10, hasReduced: false },
};

const detectStoreFormat = (text) => {
  for (const [fmt, pattern] of Object.entries(STORE_PATTERNS)) {
    if (pattern.test(text)) return fmt;
  }
  return "generic";
};

// ─── 金額・日付・店舗名の抽出（既存） ────────────────────────
export const extractAmount = (text) => {
  const patterns = [
    /合[　\s]*[計言十][^\d¥￥]*[¥￥]?\s*([\d,]+)/,  // 合計・合言十（ウエルシア）
    /合　計[^\d¥￥]*[¥￥]?\s*([\d,]+)/,
    /お会計[^\d¥￥]*[¥￥]?\s*([\d,]+)/,
    /TOTAL[^\d]*([\d,]+)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const num = parseInt(m[1].replace(/[,，]/g, ""));
      if (num > 0 && num < 10000000) return num;
    }
  }
  // ¥マーク付きの最大値
  const yens = [...text.matchAll(/[¥￥]([\d,，]+)/g)]
    .map(m => parseInt(m[1].replace(/[,，]/g, "")))
    .filter(n => n > 100 && n < 10000000);
  return yens.length ? Math.max(...yens) : null;
};

export const extractDate = (text) => {
  const patterns = [
    /(\d{4})[年\/\-](\d{1,2})[月\/\-](\d{1,2})/,
    /(\d{4})\/ ?(\d{1,2})\/ ?(\d{1,2})/,
    /令和(\d+)[年\.](\d{1,2})[月\.](\d{1,2})/,
    /(\d{2})[\/\-](\d{1,2})[\/\-](\d{1,2})/,
    /(\d{1,2})月(\d{1,2})日/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (!m) continue;
    let y, mo, d;
    if (p.source.includes("令和")) {
      y = 2018 + parseInt(m[1]); mo = parseInt(m[2]); d = parseInt(m[3]);
    } else if (m[1].length === 2 && parseInt(m[1]) < 50) {
      y = 2000 + parseInt(m[1]); mo = parseInt(m[2]); d = parseInt(m[3]);
    } else if (p.source.includes("月") && m.length === 3) {
      y = new Date().getFullYear(); mo = parseInt(m[1]); d = parseInt(m[2]);
    } else {
      y = parseInt(m[1]); mo = parseInt(m[2]); d = parseInt(m[3]);
    }
    if (y >= 2020 && y <= 2035 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return safeDate(`${y}-${String(mo).padStart(2,"0")}-${String(d).padStart(2,"0")}`);
    }
  }
  return todayStr();
};

export const extractStoreName = (text) => {
  return text.split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 1 && l.length < 30)
    .filter(l => !/^[\d\s\-\*\=\/\\TEL]+$/.test(l))
    .filter(l => !/^[A-Z0-9]{8,}$/.test(l))
    .filter(l => !/^T\d{13}/.test(l))
    .filter(l => !/\d{3}-\d{4}/.test(l))
    .slice(0, 2).join(" ").trim() || "";
};

// ─── 店舗別アイテムパーサー ──────────────────────────────────

/** 小計/合計行かどうかの判定（ノイズ除去） */
const isSummaryLine = (line) =>
  /^(小計|合計|合言十|お会計|外税|内税|消費税|10%|8%|軽減|税額|税率|ポイント|V会員|WAON|iD|現金|クレジット|お預|お釣|お買上|レジNo|登録|事業者|★|平常営業|URL|TEL|FAX|〒|\d{3}-\d{4}|T\d{13})/
    .test(line.trim());

/** 割引行の判定 */
const isDiscountLine = (line) =>
  /(-\d[\d,]+|★割引|まとめ値引|操作割引|W感謝|特別値引)/.test(line);

/** バーコード行（P+8桁以上 or 13桁数字のみ） */
const isBarcodeOnlyLine = (line) =>
  /^P\d{8,}/.test(line.trim()) ||
  /^\d{13,}$/.test(line.trim()) ||
  /^\d{6,}（?\d*）?$/.test(line.trim());

/** 金額を安全に取り出す */
const parsePrice = (str) => {
  const m = str.match(/[¥￥]?\s*([\d,]+)内?$/);
  return m ? parseInt(m[1].replace(/,/g, "")) : null;
};

/** 割引金額を取り出す（負の値） */
const parseDiscount = (line) => {
  const m = line.match(/-\s*([\d,]+)/);
  return m ? -parseInt(m[1].replace(/,/g, "")) : null;
};

// ── ウエルシア ──
// 形式: ※?商品名 特? ¥金額 内?
//       (@N × N個) [任意]
//       ★割引(XX%) -金額 / まとめ値引き (N個) -N
const parseWelciaItems = (lines) => {
  const items = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isSummaryLine(line) || isBarcodeOnlyLine(line)) continue;

    // ポイント行をスキップ (W:+60, W:+40 等)
    if (/^W:[+\-＋－]?\d/.test(line)) continue;

    // 数量行をスキップ
    if (/^\(@?\d+[×xX]\s*\d+個?\)/.test(line)) continue;

    // 割引行（★割引・まとめ値引き）- items.length に関係なく処理
    if (/[★☆]?割引|まとめ値引/.test(line)) {
      const disc = parseDiscount(line);
      if (disc) items.push({ name: "割引", amount: disc, quantity: 1, isDiscount: true });
      continue;
    }

    // 商品行: ¥ は \ や ￥ でも対応（OCRの誤読対策）
    // 末尾の「内」は税込表記なので除去
    const m = line.match(/^([※＊\s]*)(.*?)\s+(?:特\s+)?[¥￥\\]([\d,]+)(?:内)?\s*$/);
    if (m) {
      const name  = m[2].replace(/^[※＊\s]+/, "").replace(/\s+特$/, "").trim();
      const price = parseInt(m[3].replace(/,/g, ""));
      if (name.length >= 1 && price > 0 && price < 100000 && !isSummaryLine(name)) {
        const nextLine = lines[i + 1] || "";
        let qty = 1, unitPrice = price;
        const qtyM = nextLine.match(/\(?@?(\d[\d,]+)\s*[×xX]\s*(\d+)個?\)?/);
        if (qtyM) {
          unitPrice = parseInt(qtyM[1].replace(/,/g, ""));
          qty = parseInt(qtyM[2]);
          i++;
        }
        items.push({ name, amount: price, quantity: qty, unitPrice });
      }
    }
  }
  return items;
};

// ── プレム(スーパー) ──
// 形式: 外8  商品名  [特] ¥金額
//       P[バーコード]
//       ( N個 × @単価 ) [任意]
//       割引  XX%  -金額 [任意]
const parsePleinItems = (lines) => {
  const items = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isSummaryLine(line)) continue;
    if (isBarcodeOnlyLine(line)) continue;

    // 割引行
    if (/割引.*-\d/.test(line)) {
      const disc = parseDiscount(line);
      if (disc) items.push({ name: "割引", amount: disc, quantity: 1, isDiscount: true });
      continue;
    }

    // 数量行（括弧付き）
    if (/^\s*\(\s*\d+個/.test(line)) continue;

    // 商品行: 外8 or 外10 で始まる（¥を\でも認識）
    const m = line.match(/^外\d+\s+(.+?)\s+(?:特\s+)?[¥￥\\]([\d,]+)(?:内)?\s*$/);
    if (m) {
      const name  = m[1].trim().replace(/\s+特$/, "").trim();
      const price = parseInt(m[2].replace(/,/g, ""));
      if (name.length > 0 && price > 0 && price < 100000) {
        // 次の行がバーコードならスキップ
        if (isBarcodeOnlyLine(lines[i + 1] || "")) i++;
        // その次が数量行なら読む
        const nextLine2 = lines[i + 1] || "";
        let qty = 1, unitPrice = price;
        const qtyM = nextLine2.match(/\(\s*(\d+)個\s*[×x]\s*@?([\d,]+)\s*\)/);
        if (qtyM) {
          qty = parseInt(qtyM[1]);
          unitPrice = parseInt(qtyM[2].replace(/,/g, ""));
          i++;
        }
        items.push({ name, amount: price, quantity: qty, unitPrice });
      }
    }
  }
  return items;
};

// ── Every BIGDAY ──
// 形式: ※商品名 ¥金額  (※=軽減税率8%)
//       NコX単M  [任意]
//       操作割引  XX%  -金額 [任意]
const parseBigdayItems = (lines) => {
  const items = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isSummaryLine(line)) continue;

    // 割引行
    if (/操作割引|★割引/.test(line)) {
      const disc = parseDiscount(line);
      if (disc) items.push({ name: "割引", amount: disc, quantity: 1, isDiscount: true });
      continue;
    }

    // 数量のみの行
    if (/^\s*\d+コX単\d+/.test(line) || /^\d+コX単\d+/.test(line)) continue;

    // 商品行: ※商品名 ¥金額 / 商品名 ¥金額（¥を\でも認識）
    const m = line.match(/^[※\s]*(.+?)\s+[¥￥\\]([\d,]+)(?:内)?\s*$/);
    if (m) {
      const name  = m[1].replace(/^[※\s]+/, "").trim();
      const price = parseInt(m[2].replace(/,/g, ""));
      if (name.length > 0 && price > 0 && price < 100000
          && !isSummaryLine(name)) {
        // 次の行が数量行なら読む
        const nextLine = lines[i + 1] || "";
        let qty = 1, unitPrice = price;
        const qtyM = nextLine.match(/(\d+)コX単(\d+)/);
        if (qtyM) {
          qty = parseInt(qtyM[1]);
          unitPrice = parseInt(qtyM[2]);
          i++;
        }
        items.push({ name, amount: price, quantity: qty, unitPrice });
      }
    }
  }
  return items;
};

// ── カインズ(CAINZ) ──
// 形式: 番号  商品名  ¥金額
//       @単価  N  [任意]
const parseCainzItems = (lines) => {
  const items = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isSummaryLine(line)) continue;

    // 数量行
    if (/^@\d/.test(line.trim())) continue;

    // 商品行: 3桁コード 商品名 ¥金額（¥を\でも認識）
    const m = line.match(/^\d{3}\s+(.+?)\s+[¥￥\\]([\d,]+)(?:内)?\s*$/);
    if (m) {
      const name  = m[1].trim();
      const price = parseInt(m[2].replace(/,/g, ""));
      if (name.length > 0 && price > 0 && price < 100000) {
        // 次の行が @単価 N なら数量
        const nextLine = lines[i + 1] || "";
        let qty = 1, unitPrice = price;
        const qtyM = nextLine.match(/@([\d,]+)\s+(\d+)/);
        if (qtyM) {
          unitPrice = parseInt(qtyM[1].replace(/,/g, ""));
          qty = parseInt(qtyM[2]);
          i++;
        }
        items.push({ name, amount: price, quantity: qty, unitPrice });
      }
    }
  }
  return items;
};

// ── ニトリ ──
// 形式: 商品名 ¥金額内  (内=内税10%)
//       8桁バーコード
//       (@単価 × N個) [任意]
const parseNitoriItems = (lines) => {
  const items = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isSummaryLine(line)) continue;
    if (/^\d{8}$/.test(line.trim())) continue; // バーコード

    // 商品行: 商品名 ¥金額内（¥を\でも認識）
    const m = line.match(/^(.+?)\s+[¥￥\\]([\d,]+)内?\s*$/);
    if (m) {
      const name  = m[1].trim();
      const price = parseInt(m[2].replace(/,/g, ""));
      if (name.length > 0 && price > 0 && price < 100000
          && !isSummaryLine(name)) {
        // バーコードをスキップ
        if (/^\d{8}$/.test((lines[i + 1] || "").trim())) i++;
        // 数量行
        const nextLine2 = lines[i + 1] || "";
        let qty = 1, unitPrice = price;
        const qtyM = nextLine2.match(/@([\d,]+)\s*[×x]\s*(\d+)個/);
        if (qtyM) {
          unitPrice = parseInt(qtyM[1].replace(/,/g, ""));
          qty = parseInt(qtyM[2]);
          i++;
        } else {
          // 同一行内に @単価 × N個 がある場合
          const inline = line.match(/@([\d,]+)\s*[×x]\s*(\d+)個/);
          if (inline) {
            unitPrice = parseInt(inline[1].replace(/,/g, ""));
            qty = parseInt(inline[2]);
          }
        }
        items.push({ name, amount: price, quantity: qty, unitPrice });
      }
    }
  }
  return items;
};

// ── AEON/マックスバリュ ──
// 形式: 商品名 金額※  (¥なし、末尾※=8%)
//       (N個 X 単価) [任意]
const parseAeonItems = (lines) => {
  const items = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isSummaryLine(line)) continue;

    // 数量行
    if (/^\(\d+個/.test(line.trim())) continue;

    // 商品行: 商品名 数字※  (¥なし)
    const m = line.match(/^(.+?)\s+([\d,]+)[※\s]*$/);
    if (m) {
      const name  = m[1].replace(/^[※\s]+/, "").trim();
      const price = parseInt(m[2].replace(/,/g, ""));
      if (name.length > 0 && price > 0 && price < 100000
          && !isSummaryLine(name)) {
        const nextLine = lines[i + 1] || "";
        let qty = 1, unitPrice = price;
        const qtyM = nextLine.match(/\((\d+)個\s*[Xx]\s*単([\d,]+)\)/);
        if (qtyM) {
          qty = parseInt(qtyM[1]);
          unitPrice = parseInt(qtyM[2].replace(/,/g, ""));
          i++;
        }
        items.push({ name, amount: price, quantity: qty, unitPrice });
      }
    }
  }
  return items;
};

// ── 100えんハウス レモン ──
// 形式: 商品名
//       バーコード N点 ¥金額
const parseLemonItems = (lines) => {
  const items = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isSummaryLine(line)) continue;

    // バーコード+金額行: 13桁 N点 ¥金額
    const m = line.match(/^(\d{10,})\s+(\d+)点\s+[¥￥]([\d,]+)/);
    if (m && i > 0) {
      const name  = lines[i - 1].trim();
      const qty   = parseInt(m[2]);
      const price = parseInt(m[3].replace(/,/g, ""));
      if (name.length > 0 && price > 0) {
        items.push({ name, amount: price, quantity: qty, unitPrice: Math.round(price / qty) });
      }
      continue;
    }
  }
  return items;
};

// ── セルバ ──
// 形式: 6桁コード※?商品名 ¥金額
//       NコX単M ¥金額 [数量行]
const parseSelvaItems = (lines) => {
  const items = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isSummaryLine(line)) continue;
    if (/^\d+コX単\d+/.test(line.trim())) continue;

    const m = line.match(/^\d{6}[※\s]*(.+?)\s+[¥￥\\]([\d,]+)(?:内)?\s*$/);
    if (m) {
      const name  = m[1].trim();
      const price = parseInt(m[2].replace(/,/g, ""));
      if (name.length > 0 && price > 0 && price < 100000) {
        const nextLine = lines[i + 1] || "";
        let qty = 1, unitPrice = price;
        const qtyM = nextLine.match(/(\d+)コX単(\d+)/);
        if (qtyM) {
          qty = parseInt(qtyM[1]);
          unitPrice = parseInt(qtyM[2]);
          i++;
        }
        items.push({ name, amount: price, quantity: qty, unitPrice });
      }
    }
  }
  return items;
};

// ── オーシマドーナツ ──
// 形式: *商品名
//       ¥単価 N点 ¥合計
const parseOsimaItems = (lines) => {
  const items = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // 価格+点数+合計行
    const m = line.match(/[¥￥]([\d,]+)\s+(\d+)点\s+[¥￥]([\d,]+)/);
    if (m && i > 0) {
      const name      = lines[i - 1].replace(/^\*/, "").trim();
      const unitPrice = parseInt(m[1].replace(/,/g, ""));
      const qty       = parseInt(m[2]);
      const price     = parseInt(m[3].replace(/,/g, ""));
      if (name.length > 0 && price > 0) {
        items.push({ name, amount: price, quantity: qty, unitPrice });
      }
    }
  }
  return items;
};

// ── 汎用パーサー ──
const parseGenericItems = (lines) => {
  const items = [];
  for (const line of lines) {
    if (isSummaryLine(line) || isBarcodeOnlyLine(line)) continue;
    if (isDiscountLine(line)) {
      const disc = parseDiscount(line);
      if (disc) items.push({ name: "割引", amount: disc, quantity: 1, isDiscount: true });
      continue;
    }
    const m = line.match(/^(.+?)\s+[¥￥\\]([\d,]+)(?:内)?\s*$/);
    if (m) {
      const name  = m[1].replace(/^外\d+\s*/, "").replace(/\s+特$/, "").trim();
      const price = parseInt(m[2].replace(/,/g, ""));
      if (name.length > 1 && name.length < 40 && price > 0 && price < 100000) {
        items.push({ name, amount: price, quantity: 1, unitPrice: price });
      }
    }
  }
  return items;
};

// ─── 税込変換（外税→内税へ変換） ────────────────────────────
const applyTax = (items, taxInfo) => {
  if (taxInfo.type === "inner") return items; // 内税はそのまま
  return items.map(item => {
    if (item.isDiscount) return item; // 割引はそのまま（既に負の値）
    const rate = taxInfo.defaultRate;
    return {
      ...item,
      amount:    Math.round(item.amount * (1 + rate)),
      unitPrice: Math.round((item.unitPrice || item.amount) * (1 + rate)),
    };
  });
};

// ─── 合計に合わせて端数調整 ────────────────────────────────
// 各商品の税込合計 ≒ 1番下の合計金額になるように調整
// ⚠️ 品目が少ししか抽出できていない場合はスケーリングしない
//    （3件→19件分に引き延ばすと金額が狂う）
const adjustToTotal = (items, total) => {
  if (!total || items.length === 0) return items;
  const positiveItems  = items.filter(i => !i.isDiscount);
  const discountSum    = items.filter(i => i.isDiscount).reduce((s, i) => s + i.amount, 0);
  const positiveSum    = positiveItems.reduce((s, i) => s + i.amount, 0);
  const targetPositive = total - discountSum;
  if (positiveSum === 0 || targetPositive <= 0) return items;

  const scale = targetPositive / positiveSum;

  // スケール比が 0.85〜1.15 の範囲外は「品目が大きく欠損している」と判断
  // → スケーリングせず元の金額をそのまま返す（誤魔化さない）
  if (scale > 1.15 || scale < 0.85) return items;

  let adjusted = items.map(item => {
    if (item.isDiscount) return item;
    return { ...item, amount: Math.round(item.amount * scale) };
  });
  const adjSum = adjusted.reduce((s, i) => s + i.amount, 0);
  const diff   = total - adjSum;
  if (diff !== 0) {
    const lastNonDisc = [...adjusted].reverse().find(i => !i.isDiscount);
    if (lastNonDisc) lastNonDisc.amount += diff;
  }
  return adjusted;
};

// ─── メイン: レシート商品明細の抽出 ────────────────────────
/**
 * extractReceiptItems
 * OCRテキストから商品明細を抽出し、税込金額に変換する。
 * 各商品合計 = レシートの合計金額 になるよう端数調整を行う。
 */
export const extractReceiptItems = (text) => {
  if (!text) return [];
  const format  = detectStoreFormat(text);
  const taxInfo = TAX_INFO[format] || TAX_INFO.generic;
  const lines   = text.split("\n").map(l => l.trim()).filter(Boolean);
  const total   = extractAmount(text);

  let rawItems;
  switch (format) {
    case "welcia":  rawItems = parseWelciaItems(lines); break;
    case "plein":   rawItems = parsePleinItems(lines);  break;
    case "bigday":  rawItems = parseBigdayItems(lines); break;
    case "cainz":   rawItems = parseCainzItems(lines);  break;
    case "nitori":  rawItems = parseNitoriItems(lines); break;
    case "lemon":   rawItems = parseLemonItems(lines);  break;
    case "selva":   rawItems = parseSelvaItems(lines);  break;
    case "aeon":    rawItems = parseAeonItems(lines);   break;
    case "osima":   rawItems = parseOsimaItems(lines);  break;
    default:        rawItems = parseGenericItems(lines);break;
  }

  // 外税フォーマットは税込に変換
  const taxedItems = applyTax(rawItems, taxInfo);

  // 合計に端数調整
  return adjustToTotal(taxedItems, total);
};

// ─── normalizeReceiptItems ──────────────────────────────────
export const normalizeReceiptItems = (rawItems, allRules = [], predict = null) => {
  if (!rawItems?.length) return [];
  return rawItems.map(item => {
    const category = predict
      ? predict(item.name, allRules)?.topCategory || "その他"
      : "その他";
    return createTransactionItem({
      name:      item.name,
      amount:    item.amount,
      quantity:  item.quantity || 1,
      unitPrice: item.unitPrice || item.amount,
      type:      "personal",
      category,
      memo:      item.isDiscount ? "割引" : "",
    });
  });
};

// ─── OCR.space API（高精度・無料）────────────────────────────

/**
 * compressImage
 * iPhoneのカメラ写真（3〜8MB）を OCR.space の上限（1MB）以内に圧縮する。
 * HEIC → JPEG 変換も自動で行う。
 */
const compressImage = (file, maxBytes = 900000) =>
  new Promise((resolve) => {
    // すでに小さければそのまま
    if (file.size <= maxBytes) { resolve(file); return; }

    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale  = Math.min(1, Math.sqrt(maxBytes / file.size));
      const canvas = document.createElement("canvas");
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      // quality を下げながら 1MB 以内に収める
      let quality = 0.85;
      const tryCompress = () => {
        canvas.toBlob(blob => {
          if (!blob) { resolve(file); return; }
          if (blob.size <= maxBytes || quality < 0.3) {
            resolve(blob);
          } else {
            quality -= 0.1;
            tryCompress();
          }
        }, "image/jpeg", quality);
      };
      tryCompress();
    };
    img.onerror = () => resolve(file);
    img.src = url;
  });

/**
 * runOCRSpace
 * Tesseract.js より高精度な日本語OCR
 * 無料API取得: https://ocr.space/ocrapi (月25,000回)
 * ※ iPhoneの写真は自動圧縮してから送信（1MB制限対応）
 */
export const runOCRSpace = async (imageFile, apiKey, onProgress) => {
  onProgress?.(10);

  // 圧縮（iPhone写真 3〜8MB → 1MB以内）
  const compressed = await compressImage(imageFile);
  onProgress?.(30);

  const formData = new FormData();
  formData.append("file",              compressed, "receipt.jpg");
  formData.append("language",          "jpn");
  formData.append("detectOrientation", "true");
  formData.append("scale",             "true");
  formData.append("OCREngine",         "2");

  const res = await fetch("https://api.ocr.space/parse/image", {
    method:  "POST",
    headers: { apikey: apiKey || "helloworld" },
    body:    formData,
  });
  onProgress?.(80);

  const data = await res.json();

  // エラー詳細をログに出す（デバッグ用）
  if (data.OCRExitCode !== 1 && data.OCRExitCode !== 2) {
    console.error("OCR.space error:", data);
    throw new Error(
      Array.isArray(data.ErrorMessage)
        ? data.ErrorMessage.join(" / ")
        : (data.ErrorMessage || `ExitCode:${data.OCRExitCode}`)
    );
  }

  const text = data.ParsedResults?.[0]?.ParsedText || "";
  onProgress?.(100);
  return { text, confidence: text.length > 20 ? 88 : 50 };
};
