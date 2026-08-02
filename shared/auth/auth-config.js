/**
 * shared/auth/auth-config.js
 * -----------------------------------------------------------------
 * まるっとコード 実設定。
 *
 * 【apiKey について】
 *   これは「秘密鍵」ではありません。Firebase の Web設定値は
 *   ブラウザに配られる前提の公開値です。
 *   これが漏れても、Firestore セキュリティルールと Authentication が
 *   正しく設定されていればデータは守られます。
 *   守ってくれるのはルールであって、apiKey の秘匿ではありません。
 *
 * 【絶対に置かないもの】
 *   サービスアカウントの秘密鍵（*-firebase-adminsdk-*.json など）。
 *   今回の構成では最初から使いません。
 *
 * プロジェクト：airulock-marutto（Sparkプラン／無料）
 * Firestore   ：asia-northeast1（東京）
 * 作成日      ：2026-07-26
 * -----------------------------------------------------------------
 */

export const AUTH_CONFIG = {

  firebase: {
    apiKey:            'AIzaSyD1gM2S3dNFoKh5mWrXyLXiWDszjcvlC3E',
    authDomain:        'airulock-marutto.firebaseapp.com',
    projectId:         'airulock-marutto',
    storageBucket:     'airulock-marutto.firebasestorage.app',
    messagingSenderId: '830247872801',
    appId:             '1:830247872801:web:7bad8163a92e44ded33660'
  },

  /** 利用を許可する Google Workspace のドメイン（小文字） */
  allowedDomain: 'airulock.net',

  /** ログイン画面の見た目 */
  ui: {
    appName:    'まるっとコード',
    appIcon:    './icon-512.png',
    themeColor: '#1264a3',
    note:       '株式会社アイルロックアンドセキュリティー 社員専用'
  },

  /**
   * ログアウト時に消すキャッシュ／保管領域。
   * 保護対象データを端末に残さないために使います。
   */
  clearOnLogout: {
    cacheStoragePrefixes: ['marutto-'],    // Service Worker の Cache Storage
    indexedDbNames:       ['marutto-secure'],
    localStorageKeys:     []               // 検索履歴・お気に入りは残す
  }
};
