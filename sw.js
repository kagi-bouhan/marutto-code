/**
 * sw.js ―― まるっとコード Service Worker（認証対応版）
 * -----------------------------------------------------------------
 * 変更点（v3 → v4）
 *
 *  1. index.html を network-first にした
 *     旧版は cache-first だったため、認証を入れても古いキャッシュが
 *     ログイン画面を素通りさせてしまう危険がありました。
 *
 *  2. 保護対象データ（data/*.json）をキャッシュ対象から外した
 *     認証後のデータは Cache Storage ではなく IndexedDB に置きます
 *     （shared/data/secure-store.js）。ログアウトで確実に消せるようにするためです。
 *
 *  3. Google / Firebase へのリクエストは絶対にキャッシュしない
 *     認証トークンを含む通信をキャッシュすると重大な事故になります。
 *
 *  4. SKIP_WAITING メッセージに対応
 *     新しい SW を即座に有効化して、古い画面を残さないようにしました。
 *
 *  ※ オフライン利用は維持されます。
 *     アプリのガワは Cache Storage、データは IndexedDB から読みます。
 * -----------------------------------------------------------------
 */

const CACHE = "marutto-code-v5-auth-20260728";

/** アプリのガワ（公開されても問題ないファイルだけ） */
const SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./boot.js",
  "./data-source.js",
  "./icon.png",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png"
];

/** 絶対にキャッシュしないもの */
function isNeverCache(url) {
  return /(^|\.)googleapis\.com$/.test(url.hostname)
      || /(^|\.)gstatic\.com$/.test(url.hostname)
      || /(^|\.)google\.com$/.test(url.hostname)
      || /(^|\.)firebaseapp\.com$/.test(url.hostname)
      || /(^|\.)firebaseio\.com$/.test(url.hostname)
      || /identitytoolkit/.test(url.hostname)
      || /\/data\//.test(url.pathname);          // 旧・保護対象データ
}

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // 1ファイルでも失敗したら install ごと失敗するのを避ける
      .then(c => Promise.allSettled(SHELL.map(f => c.add(f))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  let url;
  try { url = new URL(req.url); } catch (err) { return; }

  // 認証・データ系はキャッシュを一切挟まない
  if (isNeverCache(url)) return;

  const isDoc = req.mode === "navigate" ||
                req.destination === "document" ||
                url.pathname.endsWith("/index.html") ||
                url.pathname.endsWith("/");

  if (isDoc) {
    // ---- network-first（ログイン画面を確実に最新にする）----
    e.respondWith((async () => {
      try {
        const resp = await fetch(req);
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return resp;
      } catch (err) {
        const hit = await caches.match(req);
        return hit ||
               await caches.match("./index.html") ||
               new Response("オフラインです", { status: 503 });
      }
    })());
    return;
  }

  /* ---- プログラム（.js）はネットワーク優先 ----
     キャッシュ優先にすると、修正した認証コードが端末に永久に届かない。
     実際にこれで iPhone のログイン不具合の修正が反映されず、
     原因の切り分けに時間を要した。
     オフラインではキャッシュへ退避するので、機内モードでも動く。 */
  const isCode = /\.js$/.test(url.pathname) && url.origin === self.location.origin;
  if (isCode) {
    e.respondWith((async () => {
      try {
        const resp = await fetch(req);
        if (resp && resp.ok && resp.type === "basic") {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return resp;
      } catch (err) {
        const hit = await caches.match(req);
        return hit || new Response("", { status: 504 });
      }
    })());
    return;
  }

  // ---- cache-first（アイコン等、内容が変わらないファイル）----
  e.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    try {
      const resp = await fetch(req);
      if (resp && resp.ok && resp.type === "basic") {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return resp;
    } catch (err) {
      return new Response("", { status: 504 });
    }
  })());
});
