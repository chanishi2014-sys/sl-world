# ソル解析用JSONの軽量化（2026-09-08）

## 出力

- メインの「ソル解析用JSONを共有」は `SL_WORLD_ENGINE_LAB_SOL` / analysisSchemaVersion 2。ファイル名は `_sol.json`。UTF-8・空白なしで保存し、画面のサイズも同じシリアライズ結果から算出する。
- 「詳細出力・端末間移行」内の「完全ログJSONを保存」は従来の `SL_WORLD_ENGINE_LAB` / schemaVersion 1。ファイル名は `_full.json`。全trial、選手snapshot、保存seedを保持し、従来通り読み込める。
- CSV、IndexedDB履歴、seed再生、BEFORE/AFTERの内部形式は変更しない。軽量版を読み込もうとすると完全ログが必要な旨を表示する。

## 軽量版の内容と上限

テスト条件・A/B/C能力差・基準snapshot・試行数・主要指標・全指標集計・比較・診断理由・NEXT TESTを保持する。全trial配列は含めない。raw集計とBEFORE/AFTERからも全件の異常配列を除き、件数に置換する。

カテゴリごとに異常発生件数、重複排除した対象trial数、分母、発生率を出力する。比較全体の候補はscope=comparison、trial発生率はnullとし、個々のtrialの異常と混同しない。

カテゴリ・条件ごとに試行順の等間隔で最大5seed、全体60seedまで。カテゴリ・条件を一巡してから次の代表例を加える。手動保存seedも残り枠に含める。各seedの詳細は24,000 bytesを目安に、Situation → Options → Decision → Reasonを含む既存traces、operations、異常記録を保持する。異常と同じsequenceのtraceを優先する。入らない記録数をomittedRecordsに明示し、全文が必要なら完全ログを使用する。失敗結果を理由に新たな異常フラグを追加していない。

ENGINE、戦術、守備、LAB trial実行、Worker、既存検知ルールは変更していない。既存検知を超えた作戦妥当性の確定判定は行わない。

## 計測・回帰

`node engine-lab-sol.test.cjs` は修正前commit b6c8bc3eb1034631232aac70a3994550aa1b7983と同一条件・同一seedのtrial全文をSHA-256で比較する。盗塁・runnerSpeed、daily-001、half観測、A/S・B/C・C/G。3,000試行は各1,000、10,000試行は3,334/3,333/3,333。不均等な場合trialCountPerConditionはnull、各条件の正確な数は集計内に保持する。サイズ計測は同条件BEFORE/AFTER集計込み。最終値は test-artifacts/sol-export-sizes.json。

3,000試行: 242,286 bytes（236.6 KiB）、代表10seed。
10,000試行: 344,582 bytes（336.5 KiB）、代表10seed。

合計13,000試行の全文一致、入力非変更、主要指標一致、完全ログround trip、CSV一致を検査。異常500/1,000試行を50%として残して5seedに抑える検査、大きいtraceの省略表示、正常trial非出力、保存seed60件上限も追加。

既存検査: engine-lab-ui.test.cjs、engine-lab-regression.test.cjs、engine-lab-roads.test.cjs、engine-regression.test.cjs、tactics-regression.test.cjs、engine-lab.browser.test.cjs、engine-lab-ux.browser.test.cjs が通過。UI検査は320/375/390/430px、共有・キャンセル・ダウンロード・コピー、完全ログ読込、既存履歴非変更、seed再生、BEFORE/AFTER、Worker 1/100/1,000/10,000試行を確認。

ブラウザ検査にはPlaywrightとEdgeを使用。iPhone実機の共有シート操作は未検証。

## 変更ファイル

- engine-lab-presentation.js: 共有専用solReport、カテゴリ集計、代表抽出、詳細上限、軽量形式読込時の案内。
- engine-lab-ui.js: 共有・コピー・ダウンロードを軽量形式へ接続、完全ログ導線分離、サイズ・件数更新。
- engine-lab.html / engine-lab.css: メイン共有ボタン、サイズ・件数の行別表示、完全ログ詳細メニュー。
- engine-lab-sol.test.cjs: サイズ・旧commit同一seed・非変更・上限・大量異常・CSV/JSON互換性の追加検査。
- engine-lab-ux.browser.test.cjs / engine-lab.browser.test.cjs: 新しい共有と完全ログの導線検査、表示サイズと実ファイルサイズの一致検査。
- test-artifacts/sol-export-sizes.json: サイズ計測結果。
- test-artifacts/engine-lab-ux-phone-results.png / test-artifacts/engine-lab-ux-results.png: 更新UIの検査画像。
- ENGINE-LAB-SOL-EXPORT.md: 本報告。
