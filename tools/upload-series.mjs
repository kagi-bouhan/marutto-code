#!/usr/bin/env node
/**
 * tools/upload-series.mjs
 * -----------------------------------------------------------------
 * 系列データ（data/*.json 形式）を Cloud Firestore へ投入します。
 *
 * shared/data/secure-store.js が期待する形に合わせて書き込みます。
 *
 *   /series/{seriesKey}            { meta: "<JSON文字列>", chunks: N, version: M }
 *   /series/{seriesKey}/parts/000  { json: "<records配列の一部のJSON文字列>" }
 *   /series/{seriesKey}/parts/001  ...
 *
 * meta には records 以外の全項目に expected_count（件数）を足したものを入れます。
 * secure-store.js 側で件数の自己検証に使われます。
 *
 * version は実行のたびに +1 されます。
 * これにより端末の IndexedDB キャッシュ（seriesKey@vN）が自動で入れ替わります。
 *
 * -----------------------------------------------------------------
 * 【使い方】
 *
 *   1) サービスアカウントの秘密鍵は使いません（この構成の方針どおり）。
 *      Google アカウントの資格情報で認証します。
 *
 *        gcloud auth application-default login
 *        gcloud config set project airulock-marutto
 *
 *   2) 依存をインストール
 *
 *        npm install firebase-admin
 *
 *   3) 実行（--dry-run を付けると書き込まずに内容だけ確認できます）
 *
 *        node tools/upload-series.mjs m382_hl ./m382_hl.json --dry-run
 *        node tools/upload-series.mjs m382_hl ./m382_hl.json
 *
 * -----------------------------------------------------------------
 * 注意：data/*.json は GitHub リポジトリには置きません。
 *       手元のファイルを指定して実行してください。
 * -----------------------------------------------------------------
 */

import { readFileSync } from 'node:fs';
/* firebase-admin は書き込み時にだけ読み込む。
   --dry-run は npm install なしで確認できるようにするため。 */

const PROJECT_ID = 'airulock-marutto';
/** 1チャンクの上限。Firestore の1ドキュメント上限（1MiB）に対して十分な余裕をとる。 */
const CHUNK_BYTES = 700 * 1024;

const [, , seriesKey, filePath, ...flags] = process.argv;
const dryRun = flags.includes('--dry-run');

if (!seriesKey || !filePath) {
  console.error('使い方: node tools/upload-series.mjs <seriesKey> <path/to/xxx.json> [--dry-run]');
  console.error('例    : node tools/upload-series.mjs m382_hl ./m382_hl.json --dry-run');
  process.exit(1);
}

/* ---------------- 読み込みと検証 ---------------- */

const raw = JSON.parse(readFileSync(filePath, 'utf8'));
if (!Array.isArray(raw.records)) {
  console.error('!! records 配列がありません:', filePath);
  process.exit(1);
}

const { records, ...meta } = raw;
meta.expected_count = records.length;

const codes = records.map((r) => r.code);
const dup = codes.length - new Set(codes).size;
if (dup) {
  console.error(`!! コードが ${dup} 件重複しています。中止します。`);
  process.exit(1);
}

/* ---------------- チャンク分割 ---------------- */

const chunks = [];
let cur = [];
let curBytes = 2;
for (const r of records) {
  const s = JSON.stringify(r);
  const b = Buffer.byteLength(s) + 1;
  if (cur.length && curBytes + b > CHUNK_BYTES) {
    chunks.push(cur);
    cur = [];
    curBytes = 2;
  }
  cur.push(r);
  curBytes += b;
}
if (cur.length) chunks.push(cur);

console.log('系列キー      :', seriesKey);
console.log('入力ファイル  :', filePath);
console.log('件数          :', records.length);
console.log('コード範囲    :', codes[0], '〜', codes[codes.length - 1]);
console.log('チャンク数    :', chunks.length);
chunks.forEach((c, i) =>
  console.log(`  parts/${String(i).padStart(3, '0')} : ${c.length}件 / ${(Buffer.byteLength(JSON.stringify(c)) / 1024).toFixed(1)} KiB`)
);

if (dryRun) {
  console.log('\n--dry-run のため書き込みは行いませんでした。');
  process.exit(0);
}

/* ---------------- Firestore へ書き込み ---------------- */

const { initializeApp, applicationDefault, getApps } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');
if (!getApps().length) {
  initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
}
const db = getFirestore();
const headRef = db.collection('series').doc(seriesKey);

const prev = await headRef.get();
const version = ((prev.exists && prev.data().version) || 0) + 1;

// 旧チャンクを消してから書き直す（件数が減ったときに残骸が残らないように）
const oldParts = await headRef.collection('parts').listDocuments();
if (oldParts.length) {
  console.log(`\n旧 parts を削除します（${oldParts.length}件）`);
  for (let i = 0; i < oldParts.length; i += 400) {
    const batch = db.batch();
    oldParts.slice(i, i + 400).forEach((d) => batch.delete(d));
    await batch.commit();
  }
}

console.log(`\n書き込み中… version=${version}`);
const batch = db.batch();
batch.set(headRef, { meta: JSON.stringify(meta), chunks: chunks.length, version });
chunks.forEach((c, i) => {
  batch.set(headRef.collection('parts').doc(String(i).padStart(3, '0')), { json: JSON.stringify(c) });
});
await batch.commit();

console.log('完了しました。');
console.log('※ 端末側は version が変わったことで自動的に再取得します。');
