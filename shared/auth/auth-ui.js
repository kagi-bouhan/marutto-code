/**
 * shared/auth/auth-ui.js
 * -----------------------------------------------------------------
 * まるっとシリーズ共通ログイン画面。
 * 見た目だけを担当します。判定ロジックは auth-client.js / auth-guard.js。
 *
 * 将来のアプリ（まるっとデータ／発電／給与／図面／ポータル）でも
 * このファイルをそのままコピーして使えます。変わるのは AUTH_CONFIG.ui だけ。
 * -----------------------------------------------------------------
 */

import { detectInAppBrowser } from './auth-client.js';

const STYLE_ID = 'shared-auth-style';

function injectStyle(themeColor) {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
  .sa-screen{position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;
    align-items:center;justify-content:center;gap:16px;padding:28px;box-sizing:border-box;
    text-align:center;background:#fff;color:#183247;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif}
  .sa-screen[hidden]{display:none}
  .sa-icon{width:104px;height:104px;border-radius:24px;box-shadow:0 8px 24px rgba(0,0,0,.13)}
  .sa-title{font-size:21px;font-weight:800;margin:6px 0 0}
  .sa-note{font-size:13px;color:#71899a;margin:0;line-height:1.7}
  .sa-msg{font-size:14px;color:#5f6368;margin:0;max-width:340px;line-height:1.8;white-space:pre-line}
  .sa-inapp{background:#fff6df;border:1px solid #e8d49a;color:#775915;border-radius:12px;padding:13px 15px;margin:4px 0 6px;font-size:13.5px;line-height:1.75;max-width:340px;text-align:left}
  .sa-btn{margin-top:6px;display:inline-flex;align-items:center;gap:10px;
    padding:14px 24px;border:0;border-radius:13px;background:${themeColor};color:#fff;
    font-size:16px;font-weight:800;cursor:pointer;text-decoration:none;
    box-shadow:0 8px 18px rgba(18,100,163,.22)}
  .sa-btn:disabled{opacity:.55;cursor:default}
  .sa-btn-ghost{background:#fff;color:#2d526d;border:1px solid #bfd0dc;box-shadow:none;
    font-size:14px;padding:11px 18px}
  .sa-g{width:20px;height:20px;background:#fff;border-radius:3px;display:grid;place-items:center;
    color:#4285f4;font-weight:900;font-size:14px}
  .sa-spin{width:26px;height:26px;border:3px solid #dfe3e8;border-top-color:${themeColor};
    border-radius:50%;animation:sa-rot .8s linear infinite}
  @keyframes sa-rot{to{transform:rotate(360deg)}}
  .sa-deny{width:64px;height:64px;border-radius:50%;background:#fdecea;color:#c5221f;
    display:grid;place-items:center;font-size:32px;font-weight:800}
  .sa-mail{font-weight:800;color:#183247;word-break:break-all}
  .sa-foot{position:fixed;bottom:18px;font-size:11px;color:#a7b6c2}
  `;
  document.head.appendChild(s);
}

function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * ログイン画面コンポーネントを作る。
 * @returns {{showLoading:Function, showLogin:Function, showDenied:Function, hide:Function}}
 */
export function createAuthUI(cfg, handlers) {
  const ui = cfg.ui || {};
  const theme = ui.themeColor || '#1264a3';
  injectStyle(theme);

  const root = el('div', 'sa-screen');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  document.body.appendChild(root);

  function render(nodes) {
    root.innerHTML = '';
    nodes.forEach(n => root.appendChild(n));
    root.hidden = false;
  }

  return {
    /** 判定中 */
    showLoading(text) {
      render([
        el('div', 'sa-spin'),
        el('p', 'sa-msg', esc(text || '確認しています…'))
      ]);
    },

    /** 未ログイン */
    showLogin() {
      const icon = el('img', 'sa-icon');
      icon.src = ui.appIcon || '';
      icon.alt = ui.appName || '';

      const btn = el('button', 'sa-btn');
      btn.type = 'button';
      btn.appendChild(el('span', 'sa-g', 'G'));
      btn.appendChild(document.createTextNode('Googleでログイン'));
      btn.onclick = () => {
        btn.disabled = true;
        btn.textContent = 'ログイン中…';
        handlers.onSignIn();
      };

      /* LINE等のアプリ内ブラウザではGoogleログインが完了できない。
         押しても失敗するだけなので、先に対処法を出す。 */
      const inApp = detectInAppBrowser();
      const nodes = [
        icon,
        el('h1', 'sa-title', esc(ui.appName || '')),
        el('p', 'sa-note', esc(ui.note || ''))
      ];

      if (inApp) {
        const copy = el('button', 'sa-btn sa-btn-ghost');
        copy.type = 'button';
        copy.textContent = 'このページのURLをコピー';
        copy.onclick = async () => {
          try {
            await navigator.clipboard.writeText(location.href.split('#')[0]);
            copy.textContent = 'コピーしました';
          } catch (e) {
            copy.textContent = 'コピーできません。URLを長押ししてください';
          }
        };
        nodes.push(
          el('div', 'sa-inapp',
            '<b>' + esc(inApp) + 'の中で開いています。</b><br>' +
            'このままではログインできません。<br><br>' +
            '画面のメニュー（iPhoneは右下、Androidは右上）から<br>' +
            '<b>「ブラウザで開く」</b>を選んでください。'),
          copy);
      }

      nodes.push(
        el('p', 'sa-msg',
          '会社のGoogleアカウント<br><b>@' + esc(cfg.allowedDomain) + '</b><br>でログインしてください。'),
        btn,
        el('div', 'sa-foot', '社員以外は利用できません'));

      render(nodes);
    },

    /** ログインはしたが社員ではない */
    showDenied(user) {
      const email = user ? (user.email || '') : '';
      const again = el('button', 'sa-btn');
      again.type = 'button';
      again.textContent = '別のアカウントでログイン';
      again.onclick = () => { again.disabled = true; handlers.onSwitchAccount(); };

      const out = el('button', 'sa-btn sa-btn-ghost');
      out.type = 'button';
      out.textContent = 'ログアウト';
      out.onclick = () => { out.disabled = true; handlers.onSignOut(); };

      render([
        el('div', 'sa-deny', '!'),
        el('h1', 'sa-title', 'このアプリは社員専用です'),
        el('p', 'sa-msg',
          (email
            ? '現在ログイン中：<span class="sa-mail">' + esc(email) + '</span><br><br>'
            : '') +
          '会社のGoogleアカウント（<b>@' + esc(cfg.allowedDomain) +
          '</b>）に切り替えてください。'),
        again,
        out
      ]);
    },

    /** エラー */
    showError(message) {
      const retry = el('button', 'sa-btn');
      retry.type = 'button';
      retry.textContent = 'もう一度試す';
      retry.onclick = () => location.reload();
      render([
        el('div', 'sa-deny', '!'),
        el('h1', 'sa-title', 'ログインできませんでした'),
        el('p', 'sa-msg', esc(message || '')),
        retry
      ]);
    },

    hide() { root.hidden = true; }
  };
}

/**
 * ヘッダーなどに置くログアウトボタンを作る。
 * @returns {HTMLElement}
 */
export function createLogoutButton(cfg, onLogout) {
  injectStyle((cfg.ui && cfg.ui.themeColor) || '#1264a3');
  const b = el('button', 'sa-btn sa-btn-ghost');
  b.type = 'button';
  b.textContent = 'ログアウト';
  b.onclick = () => { b.disabled = true; onLogout(); };
  return b;
}
