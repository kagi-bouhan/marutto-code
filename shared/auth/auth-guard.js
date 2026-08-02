/**
 * shared/auth/auth-guard.js
 * -----------------------------------------------------------------
 * 「ログインが済むまでアプリ本体を動かさない」ための入口。
 *
 * 使い方（アプリ側は原則この3行だけ）：
 *
 *   import { AUTH_CONFIG } from '../shared/auth/auth-config.js';
 *   import { guard }       from '../shared/auth/auth-guard.js';
 *   guard(AUTH_CONFIG, { onReady: (user) => startApp(user) });
 *
 * 【重要な但し書き】
 *   これは「画面制限（レベル1）」です。
 *   保護対象データは、必ずサーバー側で守られた場所（Firestore＋ルール）に置き、
 *   公開ディレクトリに置かないでください。
 *   このガードだけでは、URLを知っている人のデータ取得は防げません。
 * -----------------------------------------------------------------
 */

import {
  initAuth, watchUser, signIn, signOutAndClear, consumeRedirect,
  ensureCacheIsolation, isAllowed
} from './auth-client.js';
import { createAuthUI } from './auth-ui.js';

/**
 * @param {Object} cfg      AUTH_CONFIG
 * @param {Object} options
 * @param {(user:Object)=>void} options.onReady    社員と確認できたら呼ばれる
 * @param {()=>void}            [options.onSignedOut] ログアウト後に呼ばれる
 */
export async function guard(cfg, options) {
  const onReady     = options.onReady;
  const onSignedOut = options.onSignedOut || (() => location.reload());

  initAuth(cfg);

  /* 「社員ではないアカウントで入ろうとした」ことを、このタブの間だけ覚えておく。
     Google 側の都合でログイン状態が直後に解除されても、
     ログイン画面に戻さず理由を出し続けるため。
     （これは案内のための記憶であって、権限の判定には一切使いません） */
  const DENIED_KEY = 'sharedAuthDeniedEmail';
  const ss = {
    set: (v) => { try { sessionStorage.setItem(DENIED_KEY, v || ''); } catch (e) {} },
    get: () => { try { return sessionStorage.getItem(DENIED_KEY); } catch (e) { return null; } },
    clear: () => { try { sessionStorage.removeItem(DENIED_KEY); } catch (e) {} }
  };

  const ui = createAuthUI(cfg, {
    onSignIn:        () => { ss.clear(); return signIn().catch(e => ui.showError(describe(e))); },
    onSwitchAccount: () => { ss.clear(); return signOutAndClear().then(() => signIn()).catch(e => ui.showError(describe(e))); },
    onSignOut:       () => { ss.clear(); return signOutAndClear().then(onSignedOut); }
  });

  ui.showLoading('確認しています…');

  // リダイレクト方式で戻ってきた場合の受け取り
  await consumeRedirect();

  let started = false;

  watchUser(async (user, allowed) => {
    if (!user) {
      started = false;
      const denied = ss.get();
      if (denied !== null) {
        // 直前に社員以外での試行があった → 理由を表示したまま止める
        ui.showDenied({ email: denied });
        return;
      }
      ui.showLogin();
      return;
    }

    // 別の社員がログインしたら前の人のキャッシュを消す
    await ensureCacheIsolation(user);

    if (!allowed) {
      started = false;
      ss.set(user.email || '');
      ui.showDenied(user);
      return;
    }

    ss.clear();

    if (started) return;
    started = true;
    ui.hide();
    try {
      await onReady(user);
    } catch (e) {
      console.error('[auth-guard] app start failed', e);
      ui.showError(describe(e));
    }
  });
}

/** ログアウト（アプリ側のボタンから呼ぶ） */
export async function logout(afterward) {
  await signOutAndClear();
  if (typeof afterward === 'function') afterward();
  else location.reload();
}

export { isAllowed };

function describe(e) {
  if (!e) return '不明なエラーです。';
  const code = e.code || '';
  if (code.includes('network'))            return 'ネットワークに接続できませんでした。電波の良い場所で再度お試しください。';
  if (code.includes('popup-blocked'))      return 'ポップアップがブロックされました。ブラウザの設定をご確認ください。';
  if (code.includes('unauthorized-domain'))return 'このドメインは Firebase に登録されていません（承認済みドメインの設定が必要です）。';

  /* アカウント選択画面が閉じられた場合。
     会社ドメイン以外のアカウントを選んだときも Google はここで閉じるため、
     「失敗」ではなく「選び直してください」と案内する。 */
  if (code.includes('popup-closed-by-user') || code.includes('cancelled-popup-request') ||
      code.includes('user-cancelled')) {
    return 'ログインが完了しませんでした。\n' +
           '会社のGoogleアカウント（@airulock.net）を選んでください。\n' +
           '個人のアカウントではご利用いただけません。';
  }
  return (e.message || String(e));
}
