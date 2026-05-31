# ⑥ localStorage 容量レビュー

## 現在のデータサイズ推計

| 構造 | 1件あたり | 1,000件 | 5,000件 | 10,000件 |
|---|---|---|---|---|
| 旧（シンプル） | ~200 byte | ~195 KB | ~977 KB | ~1.95 MB |
| 新（items なし） | ~350 byte | ~342 KB | ~1.7 MB | ~3.4 MB |
| 新（items 5件/tx） | ~900 byte | ~879 KB | ~4.4 MB | 8.8 MB ⚠️ |
| 新（items 20件/tx） | ~2.5 KB | ~2.4 MB | ~12 MB ❌ | — |

**localStorage の上限: 5〜10 MB（ブラウザ・デバイスにより異なる）**

## 想定利用シナリオ

| ユーザー種別 | 月間取引数 | OCR明細 | 1年後 | 5年後 |
|---|---|---|---|---|
| ライト（手動中心） | 20〜50件 | なし | ~120 KB | ~600 KB ✅ |
| スタンダード（CSV＋手動） | 50〜150件 | 週1〜2回 | ~400 KB | ~2 MB ✅ |
| ヘビー（全OCR・明細あり） | 200〜400件 | 毎日 | ~2.5 MB | 12.5 MB ❌ |

## 結論・推奨タイミング

```
localStorage 継続可能:  items が少ない or 利用頻度が低いユーザー
IndexedDB 移行推奨:     以下いずれかを満たす場合

  ① transactions が 3,000件 を超えたとき
  ② OCR明細（items 10件以上/tx）を本格運用するとき
  ③ receiptText（生テキスト）を全件保存するとき
  ④ QuotaExceededError が発生したとき（storage.js が alert 済み）
```

## IndexedDB 移行計画（Day10 想定）

```
移行ステップ:
  1. services/db.js を新規作成（idb ライブラリ使用）
  2. STORAGE_KEYS を DB スキーマに対応させる
  3. storage.js の loadStorage / saveStorage を DB 版に差し替え
  4. 初回起動時に localStorage → IndexedDB へ自動マイグレーション
  5. localStorage の旧データは migration 完了後に削除

推奨ライブラリ: idb （3 KB gzip、Promise API）
  npm install idb
```

## receiptText の扱い

現在 `receiptText` は transaction に直接保存している。
OCR 明細を本格運用する場合:

```
推奨: receiptText を別テーブル（IndexedDB）に分離

transactions テーブル: id, date, label, amount, ...
receipts テーブル:      txId, rawText, confidence, createdAt

メリット:
  - transactions の一覧取得が軽量になる
  - receiptText は閲覧時のみ取得（遅延ロード）
```
