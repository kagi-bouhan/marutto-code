まるっとコード 完成版

対応データ: 7ブランク・34,390件
- ダイハツ M424
- トヨタ M382
- 日産 M396
- 日産・スバル M397
- スバル M403
- スズキ M382（旧）
- スズキ M421

GitHub Pages公開先（リポジトリ名 marutto-code の場合）
https://kagi-bouhan.github.io/marutto-code/

公開方法: このフォルダの中身をリポジトリ直下へアップロードし、Settings > Pages で main / root を指定。

【2026-08-30 トヨタ M382 H/L逆引き 追加】
- トヨタ M382 を選んだときだけ「H/L逆引き」モードが出ます。他ブランクには出ません。
- 従来のM382（50000〜69999・20,000件）の逆引き／コード検索は一切変更していません。
- H/L用データは別系列として扱います（コード 10001〜26200・8位置・6,200件）。
    認証あり（本番）: Firestore の series/m382_hl
    認証なし（開発） : data/m382_hl.json
  Firestore への投入は tools/upload-series.mjs を使ってください。
    node tools/upload-series.mjs m382_hl ./m382_hl.json --dry-run
    node tools/upload-series.mjs m382_hl ./m382_hl.json
- 検索できる入力：2L2L3H4H ／ 2234 LLHH ／ 2234（数字だけ）／ LLHH（H/Lだけ）
  いずれも途中の位置からの一致で検索します。数字とH/Lを両方指定した場合は
  位置関係を保ったまま照合するため、位置がズレた誤ヒットは出ません。
- H/Lデータは 2026-08-30 修正版Excel を取り込み済み。6,200件すべてH/Lが8文字・段差数字も8桁で、
  文字数異常は0件です。万一8文字でないデータが入った場合は、画面上で文字数バッジを出して注意喚起します。
- Service Worker のキャッシュ版数を marutto-code-v6-hl-20260830 に更新しました。
