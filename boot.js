/**
 * boot.js ―― まるっとコード 起動処理
 * -----------------------------------------------------------------
 * 認証が済むまでアプリ本体（index.html の init()）を呼びません。
 *
 * 【AUTH_MODE の切り替え】
 *   shared/auth/auth-config.js が存在すれば認証あり（Firestore）で起動。
 *   存在しなければ、従来どおり data/*.json を読む「認証なしモード」で起動します。
 *
 *   これは移行期間中の安全装置です。
 *   Firebase の設定が終わるまでは今までどおり動き、
 *   auth-config.js を置いた瞬間に社員限定モードへ切り替わります。
 * -----------------------------------------------------------------
 */

import * as DataSource from './data-source.js';

const els = (id) => document.getElementById(id);

/** 認証なしモードで起動（従来どおりの動作） */
async function bootStatic(reason) {
  console.warn('[boot] 認証なしモードで起動します:', reason);
  DataSource.setMode('static');
  window.MaruttoData = DataSource;
  try {
    await window.__maruttoInit();
  } catch (e) {
    console.error(e);
    alert('初期データの読み込みに失敗しました。');
  }
}

/** 認証ありモードで起動 */
async function bootSecure(AUTH_CONFIG) {
  const { guard, logout } = await import('./shared/auth/auth-guard.js');
  const { createLogoutButton } = await import('./shared/auth/auth-ui.js');

  DataSource.setMode('firestore');
  window.MaruttoData = DataSource;

  guard(AUTH_CONFIG, {
    onReady: async (user) => {
      // ヘッダーにログイン中のアカウントとログアウトボタンを出す
      const who = els('whoami');
      if (who) who.textContent = user.email || '';
      const slot = els('logoutSlot');
      if (slot && !slot.firstChild) {
        slot.appendChild(createLogoutButton(AUTH_CONFIG, () => logout()));
      }
      await window.__maruttoInit();
    }
  });
}

(async () => {
  let cfg = null;
  try {
    const mod = await import('./shared/auth/auth-config.js');
    cfg = mod.AUTH_CONFIG;
  } catch (e) {
    return bootStatic('shared/auth/auth-config.js が見つかりません');
  }

  if (!cfg || !cfg.firebase || !cfg.firebase.apiKey ||
      cfg.firebase.apiKey.indexOf('_____') >= 0) {
    return bootStatic('auth-config.js が未設定（ひな形のまま）です');
  }

  try {
    await bootSecure(cfg);
  } catch (e) {
    console.error('[boot] 認証ありモードの起動に失敗', e);
    alert('ログイン処理を開始できませんでした。ネットワークをご確認ください。');
  }
})();
