# 2026-09-09 制作本部 修正・検証記録

## 変更範囲

- `engine006-fielding.js`: 既存の安打後返球に加え、走者が残り3アウト未満の外野インプレーで、アウトを狙う送球がない場合にSECURE RETURNを記録する。送球先は既存の二塁カバー。乱数・進塁・得点・アウト処理は変更しない。内野HOLD BALL、既存のアウト送球、005系を保持。
- `engine-lab-ui.js`: ファイル共有のtitleを除去し、JSON 1ファイルだけを渡す。CSV・履歴・コピー・完全ログの経路を維持。能力セレクトは実値に対応するS/C/Gを表示。個別走者は共通走者の上書きを表示・継承する。代走控えはRUNNERプリセット、救援の既定値はエンジンと同じC。プリセット切替時は選手ソース表示をリセット。警戒勝負の次打者等の固定条件を補足。
- `engine-lab-presentation.js`, `engine-lab.css`: H&Rの初手選択率、観測全体の発生試行率と回数、初期判断後の発生試行率と回数を分離。回数表示は狭い画面で折り返す。

## JSONの互換性と能力の読み方

`initialDecision`は最初の判断、`decision`は初期判断を含む観測全体の回数。既存項目・schemaVersionを保持し、表示指標に`observed:HIT_AND_RUN`と`later:HIT_AND_RUN`を追加。発生率の分母は試行数であり、回数/試行数ではない。`occurrences`が発生回数。

scenarioの`*Grade`はプリセット基準値。`players`の明示指定が優先し、比較軸は指定した能力のみ上書きする。保存JSONの`groups[].bundle.scenario.players`と`groups[].bundle.teams`（解析用JSONでは`comparison.conditions[].scenario`と`comparison.fixedConditions.referenceBundle`）に実条件を保持する。UIでCへ個別変更しても基準のG自体は過去JSONとの互換性のため残る。固定表示・能力セレクトは上書き後の実値を参照する。

## 制作本部提供の観測結果（再測定値ではない）

| 対象 | 2026-09-09の観測 | 扱い |
| --- | --- | --- |
| 代打・代走 | 各100 / 100 / 0 | 閾値変更なし。将来のバランス調整候補 |
| スクイズ×バント○/なし/× | 成功率に差、選択率は約14.5%で同一 | 入力感度レビュー。選択判断に能力差を入れるかはデザイン検討 |
| 継投×制球S/C/G | 80球は全条件続投、140球は全条件交代。投球結果には能力差あり | 閾値維持。80～140球間の境界探索を将来のテスト項目にする |
| 守備位置 | 1点差・1死三塁=前進100%、2点差=通常100%、2死=深め100% | 正常、回帰基準 |
| 盗塁/H&R | 走力・ミート変化に選択率が反応 | 正常、入力感度を維持。元のseed/試行数/JSONは未提供 |

## 検証

- `daily-corrections.test.cjs`: 変更前revision `be73bb264fd062117fb91414c60b57d5d669265f`との9プリセット×100 seed比較。返球に関する集計と理由を除いて初期判断、攻撃判断、trace、交代、実行、結果、異常判定の一致を検査。3外野位置×5結果の返球・状態不変、H&R初手/後続の集計、継投・守備位置基準を検査。
- `engine-lab-ux.browser.test.cjs`: 全9プリセットで能力CのUI/シナリオ/セットアップ/比較/JSON round-tripを検査。共有payloadはfilesのみ・JSON 1件、ダウンロード件数、CSV以外の既存履歴/再生/コピー経路、320pxを含む画面幅を検査。
- `engine-lab-ui-baseline.json`: 返球イベント追加に伴うfielding hashと180 trial fingerprintを更新。戦術ファイルのhashは変更しない。
- `engine-lab-sol.test.cjs`: 新旧共有処理の比較では双方に同じ返球注釈を適用。元の返球注釈との差はdailyテストで独立検査する。

## 未完了：チームデータ

SL 12チーム・TLの確定した「旧名称→新名称・地域」一覧がリポジトリにも指示本文にもないため回答待ち。現行の名称キー、過去大会・選手所属・ニュース等は未変更。確定一覧を受領してから対応ID/別名・当時名称の保持を実装し参照の回帰確認を行う。改名を推測して適用しない。

## 最終実行結果

すべてPASS:

- `node daily-corrections.test.cjs` — 900新旧比較、15外野返球条件、H&R分離、継投/守備位置基準。
- `node engine-lab-roads.test.cjs` — 戦術成立条件、能力ランク、交代と救援の継続性。
- `node engine-lab-regression.test.cjs` — 30試合、12表示モード試合、7,682イベント、900シナリオ、3,000感度試行、10,000連続試行。
- `node engine-lab-ui.test.cjs` — 更新済み返球基準180 fingerprint、旧/新JSON往復、CSV不変、入力非破壊。
- `node engine-lab-ux.browser.test.cjs` — 全プリセット、単一JSON、旧履歴/DB保持、1/100/1,000/10,000回Worker実行、320/375/390/430px。最後の代走控え修正後も再実行してPASS。
- `node engine-lab-sol.test.cjs` — 同じ返球注釈下で13,000試行が旧戦術と一致。3,000試行JSON 243,315 bytes、10,000試行JSON 345,702 bytes。大量異常の集計・省略・CSV/完全ログ互換。
- `node engine-regression.test.cjs` — 旧系150試合、40モード比較、2,400ゴロ状況、34,143イベント。
- `node tactics-regression.test.cjs` — 旧戦術100試合、40リプレイ、25,165イベント、240バント打席。
- 変更JavaScriptの構文検査、`git diff --check`。

ブラウザテストが既存の `test-artifacts/engine-lab-ux-phone.png`、`engine-lab-ux-phone-results.png`、`engine-lab-ux-results.png`を更新。出力サイズ記録は`test-artifacts/sol-export-sizes.json`。共有APIへのpayloadとブラウザダウンロードを検証済みだが、実機OS共有先での保存操作は未実施。公開・デプロイは未実施。
