/**
 * shared/data/secure-store.js
 * -----------------------------------------------------------------
 * 認証済みユーザーだけが取得できるデータの読み込み。
 *
 * 【これが「レベル2（データ保護）」の本体です】
 *   データは公開ディレクトリ（GitHub Pages / Firebase Hosting）には置かず、
 *   Cloud Firestore に入れます。Firestore は Google のサーバー側で
 *   セキュリティルールを強制するため、ブラウザのJSを書き換えても
 *   @airulock.net 以外は 1バイトも取得できません。
 *
 * 【速度への配慮】
 *   34,390件を1件1ドキュメントにすると読み取り回数が跳ね上がるので、
 *   系列ごとに JSON文字列を 1MiB 未満のチャンクへ分割して格納します。
 *   ログイン1回あたりの読み取りは十数回で済みます。
 *   取得後は IndexedDB にキャッシュし、検索は今までどおり端末内で行います。
 * -----------------------------------------------------------------
 */

import { getFirestore, doc, getDoc, collection, getDocs, query, orderBy }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getFirebaseApp } from '../auth/auth-client.js';

let _db = null;
function db() {
  if (!_db) _db = getFirestore(getFirebaseApp());
  return _db;
}

/* ---------------- IndexedDB（端末キャッシュ） ---------------- */

const DB_NAME  = 'marutto-secure';
const STORE    = 'blobs';
const DB_VER   = 1;

function openIdb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function idbGet(key) {
  try {
    const d = await openIdb();
    return await new Promise((resolve) => {
      const tx = d.transaction(STORE, 'readonly');
      const rq = tx.objectStore(STORE).get(key);
      rq.onsuccess = () => resolve(rq.result || null);
      rq.onerror   = () => resolve(null);
    });
  } catch { return null; }
}

async function idbPut(key, value) {
  try {
    const d = await openIdb();
    await new Promise((resolve) => {
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
    });
  } catch { /* キャッシュ失敗は致命的ではない */ }
}

/** 指定の接頭辞で始まるキーを列挙（オフライン時の版探しに使う） */
async function idbKeys(prefix) {
  try {
    const d = await openIdb();
    return await new Promise((resolve) => {
      const tx = d.transaction(STORE, 'readonly');
      const rq = tx.objectStore(STORE).getAllKeys();
      rq.onsuccess = () => resolve((rq.result || [])
        .map(String).filter((k) => k.startsWith(prefix)));
      rq.onerror   = () => resolve([]);
    });
  } catch { return []; }
}

/** seriesKey@vN のうち N が最大のキャッシュを返す（オフライン用） */
async function idbGetNewest(seriesKey) {
  const keys = await idbKeys(seriesKey + '@v');
  if (!keys.length) return null;
  const ver = (k) => parseInt(k.slice(k.lastIndexOf('@v') + 2), 10) || 0;
  keys.sort((a, b) => ver(b) - ver(a));
  return await idbGet(keys[0]);
}

export async function clearSecureCache() {
  await new Promise((resolve) => {
    const rq = indexedDB.deleteDatabase(DB_NAME);
    rq.onsuccess = rq.onerror = rq.onblocked = () => resolve();
  });
}

/* ---------------- Firestore からの取得 ---------------- */

const CATALOG_CACHE_KEY = 'catalog@latest';

/**
 * カタログ（メーカー／キーブランク一覧）を取得。
 * Firestore: /catalog/current  { json: "<JSON文字列>" }
 *
 * オフライン（機内モード等）のときは端末キャッシュから返します。
 * これがないと PWA のオフライン利用が壊れます。
 */
export async function loadCatalog() {
  if (!navigator.onLine) {
    const offlineHit = await idbGet(CATALOG_CACHE_KEY);
    if (offlineHit) return offlineHit;
  }
  try {
    const snap = await getDoc(doc(db(), 'catalog', 'current'));
    if (!snap.exists()) throw new Error('カタログが見つかりません');
    const parsed = JSON.parse(snap.data().json);
    await idbPut(CATALOG_CACHE_KEY, parsed);
    return parsed;
  } catch (e) {
    const cached = await idbGet(CATALOG_CACHE_KEY);
    if (cached) {
      console.warn('[secure-store] カタログをキャッシュから読みました', e && e.code);
      return cached;
    }
    throw e;
  }
}

/**
 * 系列データを取得（チャンク結合）。
 * Firestore: /series/{seriesKey}          { meta: "<JSON文字列>", chunks: 3, version: 1 }
 *            /series/{seriesKey}/parts/000 { json: "<records配列の一部のJSON文字列>" }
 *
 * @param {string} seriesKey  例 'm382'
 * @param {(loaded:number,total:number)=>void} [onProgress]
 */
export async function loadSeries(seriesKey, onProgress) {
  const headRef = doc(db(), 'series', seriesKey);

  /* オフラインなら Firestore を待たずに端末キャッシュを使う。
     ここで getDoc を先に呼ぶと機内モードで固まり、オフライン検索が
     できなくなる（旧版は data/*.json を Service Worker が
     キャッシュしていたため、オフラインでも使えていた）。 */
  if (!navigator.onLine) {
    const offlineHit = await idbGetNewest(seriesKey);
    if (offlineHit) {
      if (onProgress) onProgress(1, 1);
      return offlineHit;
    }
  }

  let headSnap;
  try {
    headSnap = await getDoc(headRef);
  } catch (e) {
    // 通信できないときは、持っている中で最も新しい版で代替する
    const fallback = await idbGetNewest(seriesKey);
    if (fallback) {
      console.warn('[secure-store] オフラインのためキャッシュを使用', seriesKey, e && e.code);
      if (onProgress) onProgress(1, 1);
      return fallback;
    }
    throw e;
  }
  if (!headSnap.exists()) throw new Error('データが見つかりません: ' + seriesKey);

  const head    = headSnap.data();
  const version = head.version || 1;
  const cacheKey = `${seriesKey}@v${version}`;

  // 端末キャッシュに同じバージョンがあればそれを使う（Firestore読み取り0回）
  const cached = await idbGet(cacheKey);
  if (cached) {
    if (onProgress) onProgress(1, 1);
    return cached;
  }

  const meta = JSON.parse(head.meta);
  const partsSnap = await getDocs(
    query(collection(headRef, 'parts'), orderBy('__name__'))
  );

  const records = [];
  let i = 0;
  partsSnap.forEach((p) => {
    const arr = JSON.parse(p.data().json);
    for (const r of arr) records.push(r);
    i++;
    if (onProgress) onProgress(i, partsSnap.size);
  });

  const result = Object.assign({}, meta, { records });

  // 件数の自己検証（データ欠損の早期発見）
  if (meta.expected_count != null && records.length !== meta.expected_count) {
    console.error('[secure-store] 件数不一致', seriesKey,
                  '期待:', meta.expected_count, '実際:', records.length);
    throw new Error(
      `データ件数が一致しません（${seriesKey}: 期待 ${meta.expected_count} 件 / ` +
      `取得 ${records.length} 件）。管理者にご連絡ください。`
    );
  }

  await idbPut(cacheKey, result);
  return result;
}
