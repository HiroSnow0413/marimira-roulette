# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

スプレッドシート連動型の Web ルーレット。**フロントエンド（GitHub Pages 等の静的ホスティング）とバックエンド（GAS ウェブアプリ）を完全分離した構成**。当選時に GPS 緯度・経度を記録する「不正防止」機能付き。以前は GAS の `HtmlService` でサーバーサイドレンダリングしていたが、GAS の「このアプリケーションは Google Apps Script のユーザーによって作成されたものです」警告を回避するためフロントを静的化した経緯がある。

## 開発フロー

ローカルビルド・テストランナーは無し。`.html` / `.css` / `.js` と `.gs` を直接編集して各ホスティングへ反映する運用：

- **フロント**: 静的ファイルなのでローカルで `python3 -m http.server` 等で開いて動作確認可能。ただし GAS API を叩くため、[src/script.js](src/script.js) の `API_URL` が公開デプロイ URL になっていないと動かない。
- **バックエンド**: [Code.gs](Code.gs) を GAS エディタに貼り付け → 「デプロイを管理」で既存デプロイを更新（URL 維持）。新規デプロイすると URL が変わり、フロントの `API_URL` も更新が必要。
- **GPS（Geolocation API）は HTTPS 必須**。GitHub Pages も GAS も HTTPS なので本番は問題なし。ローカル検証時は `localhost` なら HTTPS 扱いで動く。

## アーキテクチャ

```
[ユーザー ブラウザ]
     │
     ├─ GET  https://<user>.github.io/<repo>/        ← 静的HTML/CSS/JS（GitHub Pages 等）
     │
     ├─ GET  https://script.google.com/.../exec     ← 起動時に fetch。{title, items} を取得
     │
     └─ POST https://script.google.com/.../exec     ← 保存時に fetch。token + ログデータを送信
                  (Content-Type: text/plain)
```

### ファイル構成と責務

- **[Code.gs](Code.gs)（GAS バックエンド）**:
  - `doGet`（[Code.gs:27-42](Code.gs#L27-L42)）: 「ルーレット」シートから `{title, items}` を JSON で返す。
  - `doPost(e)`（[Code.gs:52-82](Code.gs#L52-L82)）: `e.postData.contents` を JSON パース → トークン検証 → `comment` を 120 字で切り詰めて `saveLog` を呼ぶ。
  - `saveLog`（[Code.gs:88-104](Code.gs#L88-L104)）: 「ログ」シートを遅延生成して JST で追記。既存 6 列ヘッダーのシートには G1 に「コメント」を自動追加する後方互換処理あり。
  - `getApiToken`（[Code.gs:19-21](Code.gs#L19-L21)）: `PropertiesService.getScriptProperties()` から `API_TOKEN` を読む。未設定なら POST は全て拒否。
- **[index.html](index.html)（エントリー）**: 完全な静的 HTML。Bootstrap 5 と [src/styles.css](src/styles.css) / [src/script.js](src/script.js) を `<link>` / `<script src>` で参照するだけ。GAS スクリプトレット（`<?= ?>` / `<?!= ?>`）は一切無い。
- **[src/styles.css](src/styles.css)**: ページ固有の CSS。
- **[src/script.js](src/script.js)**: クライアント JS。冒頭に `API_URL` と `API_TOKEN` の 2 定数。

### 重要な設計判断

- **フロント/バックエンド分離の理由**: 以前は GAS の `HtmlService` でサーバーサイドレンダリングしていたが、ユーザーに「このアプリケーションは Google Apps Script のユーザーによって作成されたものです」という Google の警告ページが表示される問題があった。これを回避するためフロントを静的サイトに切り出した。項目データと書き込みのみ GAS API を叩く。
- **`Content-Type: text/plain` で POST する理由**: GAS ウェブアプリは CORS preflight (OPTIONS) リクエストに応答しない。`application/json` で POST するとブラウザが preflight を送って失敗する。`text/plain` は "simple request" 扱いで preflight を飛ばさないため POST が通る。ボディには JSON 文字列をそのまま入れ、サーバー側で `JSON.parse(e.postData.contents)` する（[Code.gs:59-62](Code.gs#L59-L62), [src/script.js:167-180](src/script.js#L167-L180)）。この hack を外すとブラウザから書き込みできなくなるので、新たに POST エンドポイントを足す場合も同じ約束を守る。
- **GAS は常に 200 を返す**: `ContentService` からエラー HTTP ステータスを返す手段が無いため、業務エラーは `{error, message}` を JSON ボディに乗せて 200 で返す設計。クライアントは `res.ok` だけでなくレスポンスボディ側の `error` フィールドも確認する（[src/script.js:31](src/script.js#L31)）。
- **トークンのセキュリティ限界**: `API_TOKEN` はフロント JS にベタ書きされるため公開リポジトリでは内容が見える。完全な秘匿はできない前提で、bot よけ程度の効果と理解する。GAS 側は `PropertiesService` から読むので GAS プロジェクト自体からは漏れないが、フロントを見れば分かる。気になる改修要望が来たら「サーバー側で OAuth/IDトークン検証する」等の正攻法に切り替える話になる。
- **GPS 先読み戦略**: `spin()`（[src/script.js:134-153](src/script.js#L134-L153)）開始と同時に `prefetchLocation()`（[src/script.js:113-131](src/script.js#L113-L131)）を呼び、ルーレット回転の 5.1 秒間に非同期で位置情報を取得。初回の許可ダイアログ待ちを体感ゼロにするための意図的な設計。失敗時は `"許可なし"` / `"非対応"` などの文字列がそのままシートに記録される。
- **Optimistic UI（fire-and-forget）**: [src/script.js:158-183](src/script.js#L158-L183) の `handleSave()` は `fetch(...).catch(...)` だけで成功ハンドラを持たない。即モーダルを閉じる UX を壊さないよう、POST のレスポンスに依存する実装は避ける。
- **当選判定**: `(360 - currentRotation % 360) % 360` で針（上 12 時方向）が指す実角度を出し、`sliceAngle` で割ってインデックスを得る（[src/script.js:145-147](src/script.js#L145-L147)）。スライスは 12 時から時計回りに 0, 1, 2... の順に並んでいる前提。
- **SVG 放射状描画**: [src/script.js:59-102](src/script.js#L59-L102) で扇形と文字を生成。左半分（midAngle 90〜270°）は文字を 180° 反転させて可読性を確保（[src/script.js:83-87](src/script.js#L83-L87)）。フォントサイズは `30 / items.length^0.6` で 1.2〜3.5px にクランプ。

## スプレッドシート側の前提

- シート名は固定で `ルーレット` と `ログ`。`ルーレット` が無いと [Code.gs:33](Code.gs#L33) で `{error: 'sheet_not_found'}` を返す。`ログ` は無ければ自動生成される。
- ログ列の順序（日付, 時間, 項目, 名前, 緯度, 経度, コメント）も固定。順序を変えるなら [Code.gs](Code.gs) の `saveLog` と [README.md](README.md) 両方を更新する。旧 6 列シートには G1 に「コメント」ヘッダーを初回書き込み時に自動追加する。
- デプロイは「実行ユーザー: 自分 / アクセス: 全員」運用。再デプロイ時は**「デプロイを管理」から既存デプロイを更新**して URL を維持する（新規デプロイすると URL が変わりフロントの `API_URL` も差し替えが必要）。
