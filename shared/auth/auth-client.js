/**
 * shared/auth/auth-client.js
 * -----------------------------------------------------------------
 * Google Workspace ログインの薄いラッパー。
 * アプリ固有の処理はここには書かないこと。
 *
 * 【設計上の約束】
 *   このファイルの isAllowed() は「画面を出すかどうか」を決めるだけです。
 *   保護対象データへのアクセス可否は、必ずサーバー側
 *   （Firestore セキュリティルール）で判定します。
 *   ブラウザ側の判定は、書き換えられる前提で扱ってください。
 * -----------------------------------------------------------------
 */

import { initializeApp }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup,
  getRedirectResult, onAuthStateChanged, signOut, setPersistence,
  browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

let _app  = null;
let _auth = null;
let _cfg  = null;

/** 初期化（アプリ起動時に1回だけ） */
export function initAuth(config) {
  if (_auth) return _auth;
  _cfg  = config;
  _app  = initializeApp(config.firebase);
  _auth = getAuth(_app);
  setPersistence(_auth, browserLocalPersistence).catch(() => {});
  return _auth;
}

export function getAuthInstance() {
  if (!_auth) throw new Error('initAuth() を先に呼んでください');
  return _auth;
}

export function getFirebaseApp() {
  if (!_app) throw new Error('initAuth() を先に呼んでください');
  return _app;
}

/**
 * アプリ内ブラウザ（LINE等）で開かれているかを判定。
 *
 * LINE の内蔵ブラウザはストレージ分離とポップアップ制限があるため、
 * Google ログインが完了できません。
 * 検知したら、先に案内を出して行き止まりを避けます。
 *
 * @returns {string|null} 検知したアプリ名。通常のブラウザなら null
 */
export function detectInAppBrowser() {
  const ua = String(navigator.userAgent || '');
  if (/\bLine\//i.test(ua))            return 'LINE';
  if (/FBAN|FBAV|FB_IAB/.test(ua))      return 'Facebook';
  if (/Instagram/i.test(ua))            return 'Instagram';
  if (/\bTwitter\b/i.test(ua))         return 'X（Twitter）';
  if (/MicroMessenger/i.test(ua))       return 'WeChat';
  return null;
}

/**
 * LINE で外部ブラウザを強制的に開かせるURL。
 * LINE公式のパラメータ openExternalBrowser=1 を付けます。
 * ※ LINEのトーク上のリンクに付けておくのが最も確実です。
 */
export function externalBrowserUrl(url) {
  const u = String(url || location.href);
  return u + (u.indexOf('?') >= 0 ? '&' : '?') + 'openExternalBrowser=1';
}

/** ホーム画面（PWA）から起動されているか */
export function isStandalone() {
  return (window.navigator.standalone === true) ||
         (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
}

function buildProvider() {
  const p = new GoogleAuthProvider();
  p.setCustomParameters({
    // Workspace ドメインのヒント。アカウント選択画面が社用に絞られます。
    // ※ これは「便利さ」のための指定です。ドメイン制限そのものではありません。
    hd: _cfg.allowedDomain,
    prompt: 'select_account'
  });
  return p;
}

/**
 * ログイン（ポップアップ方式のみ）。
 * リダイレクト方式は iOS / Safari で壊れるため使いません（下のコメント参照）。
 */
export async function signIn() {
  const auth = getAuthInstance();
  const provider = buildProvider();

  /* ★ signInWithRedirect は使わない。
     iOS / Safari など「ストレージ分離」があるブラウザでは、
     リダイレクト先の <project>.firebaseapp.com とアプリのドメインが
     別オリジンになるため、戻ってきたときに状態を復元できず
     "Unable to process request due to missing initial state" で失敗する。

     Firebase 公式でも、この環境では signInWithPopup を使うか、
     authDomain をアプリと同じドメインにすることが対策とされている。
     参照: firebase.google.com/docs/auth/web/redirect-best-practices

     いまは GitHub Pages のサブパス配信なので authDomain を揃えられない。
     したがってポップアップ方式に一本化する。 */
  try {
    const cred = await signInWithPopup(auth, provider);
    return cred.user;
  } catch (err) {
    const code = (err && err.code) || '';

    /* ポップアップが開けなかった場合。
       ここでリダイレクト方式に切り替えてはいけない。
       iOS では「missing initial state」で必ず失敗し、
       原因の分かりにくい行き止まりになる。
       代わりに、人が対処できる案内を投げる。 */
    if (/popup-blocked|operation-not-supported/.test(code)) {
      const e = new Error(
        'ポップアップが開けませんでした。\n' +
        'ブラウザ（Safari / Chrome）でこのページを開いてからログインしてください。');
      e.code = 'app/popup-unavailable';
      throw e;
    }
    throw err;
  }
}

/** リダイレクト方式から戻ってきたときの受け取り（起動時に1回呼ぶ） */
export async function consumeRedirect() {
  try {
    const res = await getRedirectResult(getAuthInstance());
    return res ? res.user : null;
  } catch (err) {
    console.error('[auth] redirect result error', err);
    return null;
  }
}

/**
 * 社員判定（画面制御用）。
 * 「末尾一致」ではなく「@ より後ろが完全一致」で見ます。
 * endsWith('@airulock.net') だと evil-airulock.net を通してしまうため。
 */
export function isAllowed(user) {
  if (!user) return false;
  if (!user.emailVerified) return false;
  const email = String(user.email || '').toLowerCase();
  const at = email.lastIndexOf('@');
  if (at < 0) return false;
  return email.slice(at + 1) === String(_cfg.allowedDomain).toLowerCase();
}

/** ログイン状態の監視 */
export function watchUser(callback) {
  return onAuthStateChanged(getAuthInstance(), (user) => {
    callback(user, isAllowed(user));
  });
}

/** IDトークン（サーバーへ送る場合に使う。Firestore直アクセスなら不要） */
export async function getIdToken(forceRefresh = false) {
  const u = getAuthInstance().currentUser;
  return u ? await u.getIdToken(forceRefresh) : null;
}

/** ログアウト＋端末に残った保護データの掃除 */
export async function signOutAndClear() {
  const clear = (_cfg && _cfg.clearOnLogout) || {};

  // 1) Cache Storage（Service Worker が保存したもの）
  try {
    if (self.caches && Array.isArray(clear.cacheStoragePrefixes)) {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter(k => clear.cacheStoragePrefixes.some(p => k.startsWith(p)))
            .map(k => caches.delete(k))
      );
    }
  } catch (e) { console.warn('[auth] cache clear failed', e); }

  // 2) IndexedDB（保護データの端末保存先）
  try {
    for (const name of (clear.indexedDbNames || [])) {
      await new Promise((resolve) => {
        const req = indexedDB.deleteDatabase(name);
        req.onsuccess = req.onerror = req.onblocked = () => resolve();
      });
    }
  } catch (e) { console.warn('[auth] idb clear failed', e); }

  // 3) localStorage（指定キーのみ。履歴やお気に入りは残す）
  try {
    for (const k of (clear.localStorageKeys || [])) localStorage.removeItem(k);
  } catch (e) { /* noop */ }

  await signOut(getAuthInstance());
}

/**
 * ログインユーザーが変わったら、前のユーザーのデータを消す。
 * 共用端末で別の社員がログインしたときに、前の人のキャッシュが
 * 見えてしまうのを防ぎます。
 */
const LAST_UID_KEY = 'sharedAuthLastUid';
export async function ensureCacheIsolation(user) {
  const uid  = user ? user.uid : '';
  const last = localStorage.getItem(LAST_UID_KEY) || '';
  if (last && uid && last !== uid) {
    const clear = (_cfg && _cfg.clearOnLogout) || {};
    try {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter(k => (clear.cacheStoragePrefixes || []).some(p => k.startsWith(p)))
            .map(k => caches.delete(k))
      );
      for (const name of (clear.indexedDbNames || [])) {
        await new Promise((resolve) => {
          const req = indexedDB.deleteDatabase(name);
          req.onsuccess = req.onerror = req.onblocked = () => resolve();
        });
      }
    } catch (e) { console.warn('[auth] isolation clear failed', e); }
  }
  if (uid) localStorage.setItem(LAST_UID_KEY, uid);
}
