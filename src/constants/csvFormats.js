// ============================================================
// constants/csvFormats.js
// CSVフォーマット定義（各カード・銀行のパース設定）
// ============================================================

export const CSV_FORMATS = {
  generic: {
    label: "汎用（アプリ標準）",
    sampleColumns: ["date", "label", "amount", "type"],
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
    sampleColumns: ["日付", "摘要", "支払い金額（円）"],
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
    sampleColumns: ["日付", "内容", "出金金額(円)", "入金金額(円)"],
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
    sampleColumns: ["取引日", "出金金額（円）", "取引先", "取引内容"],
    normalize: (r) => {
      const content = (r["取引内容"] || "").trim();

      // 無視する行
      if (content === "ポイント、残高の獲得") return null;

      const dateRaw = (r["取引日"] || "").slice(0, 10);
      const date    = dateRaw.replace(/\//g, "-");
      if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) return null;

      const label  = (r["取引先"] || r["取引内容"] || "不明").trim();
      const outStr = String(r["出金金額（円）"] || "").replace(/[,，\-\s]/g, "");
      const inStr  = String(r["入金金額（円）"] || "").replace(/[,，\-\s]/g, "");
      const out = parseFloat(outStr) || 0;
      const inc = parseFloat(inStr)  || 0;
      if (!out && !inc) return null;

      if (content === "チャージ") {
        // 銀行→PayPayの振替。銀行CSV側で計上するためこちらはisTransfer=true
        return { date, label: `PayPay チャージ（${label}）`, category: "その他", amount: inc, type: "income", isTransfer: true };
      }
      if (content === "受け取った金額") {
        return { date, label, category: "割り勘戻り", amount: inc, type: "income" };
      }
      if (content === "送った金額") {
        return { date, label: `PayPay送金（${label}）`, category: "その他", amount: -out, type: "expense", shareType: "personal" };
      }
      // 支払い・請求書払い
      return { date, label, category: "その他", amount: out > 0 ? -out : inc, type: out > 0 ? "expense" : "income" };
    },
  },

  recruit: {
    label: "リクルートカード",
    sampleColumns: ["ご利用日", "ご利用先など", "ご利用金額(￥)"],
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
    sampleColumns: ["ご利用日", "ご利用先など", "ご利用金額(円)"],
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

  smbc: {
    label: "三井住友カード / Amazonマスター",
    sampleColumns: ["日付（1行目カード名）", "店舗名", "金額"],
    normalize: (r) => {
      const col0 = r[0] || r["0"] || "";
      const col1 = r[1] || r["1"] || "";

      const dateRaw = String(col0).trim();
      // 旧フォーマット: 2026/02/02（ゼロ埋めあり）
      // 新フォーマット: 2026/6/25（ゼロ埋めなし）→ 両方対応
      const dateMatch = dateRaw.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
      if (!dateMatch) return null;
      const date = `${dateMatch[1]}-${dateMatch[2].padStart(2,"0")}-${dateMatch[3].padStart(2,"0")}`;

      const label = String(col1 || "不明")
        .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
        .replace(/　/g, " ")
        .trim();
      if (!label) return null;

      // フォーマット判別: 列数で旧(7列)か新(13列)かを判定
      // 旧: col5=今回金額（"7444"）
      // 新: col5='26/07（支払月）、col7=今回金額（"130"）
      const col5 = String(r[5] || r["5"] || "").trim();
      const col7 = String(r[7] || r["7"] || "").trim();

      let amtStr;
      // col5が数字のみ → 旧フォーマット
      if (/^\d+$/.test(col5.replace(/,/g, ""))) {
        amtStr = col5;
      } else {
        // 新フォーマット: col7が今回金額
        amtStr = col7;
      }

      const amount = parseFloat(amtStr.replace(/[,，\s]/g, "")) || 0;
      if (!amount) return null;

      return { date, label, category: "その他", amount: -Math.abs(amount), type: "expense" };
    },
  },

  amazon: {
    label: "Amazon注文履歴",
    sampleColumns: ["Order Date", "Product Name", "Total Amount"],
    normalize: (r) => {
      // Cancelledは除外
      const status = (r["Order Status"] || "").trim();
      if (status === "Cancelled") return null;

      const rawDate = (r["Order Date"] || "").trim();
      // 2021-03-27T01:05:57Z → 2021-03-27
      const date = rawDate.slice(0, 10);
      if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) return null;

      // 商品名を短縮（最初の全角スペース or 半角スペース20文字まで）
      const fullName = (r["Product Name"] || "不明").trim();
      const label = "Amazon - " + (fullName.length > 40 ? fullName.slice(0, 40) + "..." : fullName);

      // Total Amount（税込合計）
      const amtStr = String(r["Total Amount"] || "0").replace(/[,，\s]/g, "");
      const amt = parseFloat(amtStr) || 0;
      if (amt <= 0) return null;

      return {
        date,
        label,
        category: "その他",
        amount:   -amt,
        type:     "expense",
      };
    },
  },
};
