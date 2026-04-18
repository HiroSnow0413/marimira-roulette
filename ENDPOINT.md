# エンドポイント仕様書

マリミラルーレット バックエンド API（GAS ウェブアプリ）の仕様。実装は [Code.gs](Code.gs)、クライアント側の呼び出しは [src/script.js](src/script.js)。

## 1. 基本情報

| 項目 | 値 |
| :--- | :--- |
| 種別 | Google Apps Script ウェブアプリ |
| Base URL | `https://script.google.com/macros/s/AKfycbwf3zdLLHwcpHh7ZDsuamkl__s8YCySxb8c-A2ZKdKw2G_tuHIceW9std9RVfALY8HkBg/exec` |
| 実行ユーザー | 自分（デプロイ作成者） |
| アクセス権 | 全員（未ログイン可） |
| 通信 | HTTPS |
| レスポンス形式 | JSON（`application/json`） |
| エラー時のステータスコード | **常に 200**。業務エラーはボディの `{error, message}` で表現（GAS の `ContentService` がステータスコード制御できないため） |

### 認証

書き込み（POST）のみ簡易トークン認証あり。

- GAS 側はスクリプトプロパティ `API_TOKEN` に値が設定されている必要がある（GAS エディタ → プロジェクトの設定 → スクリプト プロパティ）。
- クライアント側はリクエストボディの `token` フィールドに同じ値を含める。
- トークン未設定・不一致時は `doPost` が 200 / `{error: ...}` を返す。

> `API_TOKEN` はフロントエンド JS にもベタ書きされるため、公開リポジトリでは内容が見える。完全な秘匿はできない。bot よけ程度の効果として運用する。

---

## 2. GET /exec — 項目取得

フロントエンド起動時に呼び出す。「ルーレット」シートからタイトルと項目一覧を返す。

### リクエスト

| 項目 | 値 |
| :--- | :--- |
| メソッド | `GET` |
| パス | `/exec` |
| クエリパラメータ | なし（未使用） |
| 必須ヘッダー | なし |

### レスポンス（成功）

```json
{
  "title": "マリミラルーレット",
  "items": ["当たりA", "当たりB", "当たりC"]
}
```

| フィールド | 型 | 説明 |
| :--- | :--- | :--- |
| `title` | string | 「ルーレット」シート A1 セル。空なら `"マリミラルーレット"` にフォールバック（[Code.gs:36](Code.gs#L36)） |
| `items` | string[] | A2 以降 A 列。空・null は除外（[Code.gs:37-40](Code.gs#L37-L40)） |

### レスポンス（エラー）

| 条件 | ボディ |
| :--- | :--- |
| 「ルーレット」シートが存在しない | `{"error": "sheet_not_found", "message": "シート「ルーレット」が見つかりません"}` |

### 呼び出し例

```js
const res = await fetch(API_URL);
if (!res.ok) throw new Error('HTTP ' + res.status);
const data = await res.json();
if (data.error) throw new Error(data.message || data.error);
// data.title / data.items を使用
```

参考実装: [src/script.js:24-34](src/script.js#L24-L34)

---

## 3. POST /exec — ログ追記

当選時に呼び出す。「ログ」シートに 1 行追加する。

### リクエスト

| 項目 | 値 |
| :--- | :--- |
| メソッド | `POST` |
| パス | `/exec` |
| `Content-Type` | **`text/plain;charset=utf-8` 必須**（理由は下記） |
| ボディ | JSON 文字列 |

#### Content-Type を `text/plain` にする理由

GAS ウェブアプリは CORS preflight (OPTIONS) リクエストに応答しない。`application/json` で POST するとブラウザが事前に OPTIONS を投げて失敗する。`text/plain` / `application/x-www-form-urlencoded` / `multipart/form-data` のいずれかなら "simple request" 扱いで preflight を飛ばさないため POST が通る。本 API は `text/plain` 固定で運用し、ボディには JSON 文字列をそのまま入れる。サーバー側で `JSON.parse(e.postData.contents)` する（[Code.gs:59-62](Code.gs#L59-L62)）。

### リクエストボディ

```json
{
  "token": "<API_TOKEN>",
  "item": "当たりA",
  "name": "山田太郎",
  "lat": 35.6812,
  "lng": 139.7671
}
```

| フィールド | 型 | 必須 | 値の例・制約 |
| :-- | :--- | :--- | :--- |
| `token` | string | yes | GAS の `API_TOKEN` と一致していないと `unauthorized` が返る |
| `item` | string | yes | 当選した項目名 |
| `name` | string | yes | 空文字（trim 後）は `bad_request`。クライアント側でも [src/script.js:163-167](src/script.js#L163-L167) で弾く |
| `lat` | number \| string | yes | 緯度。取得成功時は `number`、失敗時は `"未取得"` / `"許可なし"` / `"非対応"` のいずれか文字列 |
| `lng` | number \| string | yes | 経度。`lat` と同様 |

> **入力サニタイズなし**: `item` / `name` は `appendRow` にそのまま渡る。先頭が `=` / `+` / `-` / `@` の値を入れると Google Sheets が数式として解釈する（CSV インジェクション類似）。入力に制約を設けるならサーバー側で行う。

### レスポンス

**成功時** (`{ok: true}`):

```json
{ "ok": true }
```

**エラー時**:

| 条件 | ボディ |
| :--- | :--- |
| `API_TOKEN` が GAS に未設定 | `{"error": "server_misconfigured", "message": "API_TOKEN が未設定です"}` |
| JSON パース失敗 | `{"error": "invalid_json", "message": "ボディの JSON パースに失敗しました"}` |
| `token` 不一致 | `{"error": "unauthorized", "message": "認証トークンが一致しません"}` |
| `item` / `name` が無効 | `{"error": "bad_request", "message": "item / name が必須です"}` |

ステータスコードは全て 200。エラー判定は `data.ok === true` で行うこと。

### 副作用

`ss.getSheetByName('ログ')` を取得し、無ければ `insertSheet('ログ')` した上でヘッダー行を追加（[Code.gs:87-90](Code.gs#L87-L90)）：

```
日付 | 時間 | 項目 | 名前 | 緯度 | 経度
```

その後、1 行追加（[Code.gs:92-95](Code.gs#L92-L95)）：

| 列 | 値 | フォーマット |
| :--- | :--- | :--- |
| 日付 | サーバー現在時刻 | `yyyy/MM/dd`（JST） |
| 時間 | サーバー現在時刻 | `HH:mm:ss`（JST） |
| 項目 | `item` | そのまま |
| 名前 | `name` | そのまま |
| 緯度 | `lat` | そのまま（数値または文字列） |
| 経度 | `lng` | そのまま（数値または文字列） |

### 呼び出し例

```js
fetch(API_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
  body: JSON.stringify({
    token: API_TOKEN,
    item: '当たりA',
    name: '山田太郎',
    lat: 35.6812,
    lng: 139.7671,
  }),
}).catch(err => console.error('保存失敗:', err));
```

参考実装: [src/script.js:174-184](src/script.js#L174-L184)

クライアントは Optimistic UI 運用（fire-and-forget）なので成功レスポンスは受け取らない。失敗時だけ `console.error` に流す設計。

---

## 4. データモデル

### 入力シート「ルーレット」

| セル | 内容 | 必須 |
| :--- | :--- | :--- |
| A1 | ページタイトル | 任意（空なら既定値） |
| A2, A3, ... | ルーレット項目（A 列のみ読む） | 1 件以上推奨 |

- B 列以降は無視。
- 空セルはスキップされるが、途中の空行があってもインデックスは詰められる（`filter(v => v !== '' && ...)`）。

### 出力シート「ログ」

列順序は上記の通り固定。行は追記のみ。

---

## 5. セキュリティ・運用上の注意

- **`API_TOKEN` は完全な秘匿不可**: フロント JS にベタ書きされるため公開リポジトリから読める。悪用されたらローテーション（GAS スクリプトプロパティ＋フロント `API_TOKEN` 定数を同じ値に更新）する運用を想定。
- **位置情報の精度は信頼できない**: クライアント送信値をそのまま保存するだけで、サーバー検証はなし。「不正防止」と謳っているが技術的な防止はブラウザの Geolocation 取得に依存。
- **レート制限なし**: 同じトークンで連打すれば連続書き込み可能。アイドル用途では問題ない想定。
- **再デプロイ時は URL 維持**: 新規デプロイ（新しい URL）にするとフロント [src/script.js](src/script.js) の `API_URL` も更新が必要。変更を避けるため「デプロイを管理」から既存デプロイを更新する運用にする。
