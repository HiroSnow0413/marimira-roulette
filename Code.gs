/**
 * マリミラルーレット - バックエンド API
 *
 * GET  /exec → { title, items }
 * POST /exec → { ok: true } | { error, message }
 *
 * 書き込み（POST）は PropertiesService の API_TOKEN と
 * リクエストボディの token フィールドが一致する場合のみ受け付ける。
 */

const SHEET_ROULETTE = 'ルーレット';
const SHEET_LOG = 'ログ';

/**
 * 認証トークンをスクリプトプロパティから取得。
 * GAS エディタ右上の「プロジェクトの設定」→「スクリプト プロパティ」で
 * キー `API_TOKEN` に任意のランダム文字列を設定する。
 */
function getApiToken() {
  return PropertiesService.getScriptProperties().getProperty('API_TOKEN');
}

/**
 * ルーレット項目を JSON で返す。
 * レスポンス: { title: string, items: string[] }
 */
function doGet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_ROULETTE);
  if (!sheet) {
    return jsonResponse({ error: 'sheet_not_found', message: 'シート「ルーレット」が見つかりません' });
  }

  const data = sheet.getDataRange().getValues();
  const title = data[0] && data[0][0] ? String(data[0][0]) : 'マリミラルーレット';
  const items = data.slice(1)
    .map(row => row[0])
    .filter(v => v !== '' && v !== null && v !== undefined)
    .map(String);

  return jsonResponse({ title, items });
}

/**
 * 当選ログを「ログ」シートに追記する。
 *
 * リクエストボディ（Content-Type: text/plain で JSON 文字列を送る想定。
 * application/json だと CORS preflight が走り、GAS は OPTIONS に応答しないので失敗する）:
 *   { token, item, name, lat, lng }
 * レスポンス: { ok: true } | { error, message }
 */
function doPost(e) {
  const token = getApiToken();
  if (!token) {
    return jsonResponse({ error: 'server_misconfigured', message: 'API_TOKEN が未設定です' });
  }

  let payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (_) {
    return jsonResponse({ error: 'invalid_json', message: 'ボディの JSON パースに失敗しました' });
  }

  if (!payload || payload.token !== token) {
    return jsonResponse({ error: 'unauthorized', message: '認証トークンが一致しません' });
  }

  const item = payload.item;
  const name = payload.name;
  const lat = payload.lat;
  const lng = payload.lng;
  if (typeof item !== 'string' || typeof name !== 'string' || name.trim() === '') {
    return jsonResponse({ error: 'bad_request', message: 'item / name が必須です' });
  }

  saveLog(item, name, lat, lng);
  return jsonResponse({ ok: true });
}

/**
 * 「ログ」シートへの実際の書き込み。シートが無ければ作成してヘッダー行も追加する。
 */
function saveLog(itemName, userName, lat, lng) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let logSheet = ss.getSheetByName(SHEET_LOG);
  if (!logSheet) {
    logSheet = ss.insertSheet(SHEET_LOG);
    logSheet.appendRow(['日付', '時間', '項目', '名前', '緯度', '経度']);
  }

  const now = new Date();
  const date = Utilities.formatDate(now, 'JST', 'yyyy/MM/dd');
  const time = Utilities.formatDate(now, 'JST', 'HH:mm:ss');
  logSheet.appendRow([date, time, itemName, userName, lat, lng]);
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
