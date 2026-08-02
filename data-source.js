/**
 * data-source.js ―― まるっとコード データ取得の切り替え
 * -----------------------------------------------------------------
 * 2つのモードを持ちます。
 *
 *   'static'    … 従来どおり data/*.json を fetch する（認証なし）
 *                 ローカル開発と、万一のロールバック用。
 *   'firestore' … Cloud Firestore から取得する（認証必須・レベル2）
 *
 * モードは shared/auth/auth-config.js の dataSource で切り替えます。
 * どちらのモードでも、返すオブジェクトの形は同じです。
 * したがって index.html の検索ロジックは 1 行も変わりません。
 * -----------------------------------------------------------------
 */

/* secure-store.js は Firebase SDK（CDN）を読み込むため、
   静的 import にすると認証なしモードでも通信が発生します。
   認証ありモードのときだけ動的に読み込みます。 */
let _secure = null;
async function secure() {
  if (!_secure) _secure = await import('./shared/data/secure-store.js');
  return _secure;
}

let _mode = 'static';

export function setMode(mode) { _mode = mode; }
export function getMode() { return _mode; }

/** data/m382.json → m382 */
function fileToKey(file) {
  return String(file).replace(/^.*\//, '').replace(/\.json$/, '');
}

export async function loadCatalog() {
  if (_mode === 'firestore') return await (await secure()).loadCatalog();
  const r = await fetch('data/catalog.json');
  if (!r.ok) throw new Error('catalog');
  return await r.json();
}

/**
 * @param {string} file  catalog.json に書かれているパス（例 'data/m382.json'）
 * @param {(loaded:number,total:number)=>void} [onProgress]
 */
export async function loadSeries(file, onProgress) {
  if (_mode === 'firestore') return await (await secure()).loadSeries(fileToKey(file), onProgress);
  const r = await fetch(file);
  if (!r.ok) throw new Error(file);
  return await r.json();
}
