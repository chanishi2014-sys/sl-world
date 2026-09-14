# 二塁盗塁ベースカバー修正（3-A）

2026-09-14。ENGINE: process-engine-20260914-v2。PWAキャッシュ: v23。

一塁から二塁への盗塁は、二塁手がBASE COVER・受球・タッチを担当する共通守備割当へ変更しました。ショートは二塁の後方32座標単位でBACKUPを担当します。

## 実装

- engine-fielding.js / engine006-fielding.js: stealCoverageで担当、現在のシフト位置、移動先、移動開始、走力から到達時刻を算出。盗塁の時間競争・移動・assignedRoles・捕手送球target・receiver・tagger・TAG履歴を同じ割当から生成します。ヒットエンドラン空振り後の盗塁にも適用します。
- カバーが遅い場合は、受球に間に合う送球開始時刻を使用します。release + throwTravel = ballETAを維持し、受球後のタグ時刻と走者到達を比較します。最終SAFE率への加算や能力係数の変更はありません。
- match-replay.js / engine006-replay.js: 明示的な送球相手を優先。相手情報がない二塁盗塁の補完先を二塁手へ変更しました。
- engine006.js / service-worker.js: エンジン版とキャッシュ版を更新。
- steal-cover-regression.test.cjs: 担当・移動・送球・タグ・リプレイ・時間競争・各試合入口の回帰検査を追加。
- engine-lab-regression.test.cjs / final-lab-stress.browser.test.cjs: 版の検査を更新。ブラウザーLABの保存JSONにも担当検査を追加。

通常守備のreceiverIndexは変更していません。併殺時の二塁カバー、三塁盗塁の三塁手受球は従来の経路を維持します。

## 検証結果

- 直接盗塁300件: SAFE 241件、OUT 59件。全件で二塁手のカバー・受球・タッチと時間判定が一致。
- LABで発生した27件、CUSTOM MATCHで10件、通常試合で15件、ヒットエンドラン経由1件を検査。通常試合の検証用打線は走力20・盗塁○として発生機会を確保。
- 二塁手の位置・走力を変更するとカバーETAが変わり、ショートの走力変更では変わらないことを確認。シフトで遠い場合の受球時刻も確認。
- 受球時に二塁手が二塁に到達し、ショートがベースから離れていること、アニメーションのタッチ担当が二塁手のみであることを自動検査。
- night-regression.test.cjs: PASS（併殺・ベースカバー・FC等）。process-regression.test.cjs --quick: PASS（712イベント、10試合）。
- 実ブラウザーの盗塁LAB900試行: 結果表示、IndexedDB保存、全件JSONダウンロード、再読込がPASS。約17.1秒、JSON 2,061,835 bytes。保存した代表工程中の二塁盗塁34件も二塁手担当を確認。

## 証跡・未確認

- test-artifacts/steal-cover-0914.json
- test-artifacts/final-0914-steal-900-browser.json

今回は役割修正後の45,000試行を再実行していません。先行報告の45,000試行はv1時点の証跡です。通常試合の人による目視観戦は未実施で、移動位置と描画状態は自動検査による確認です。
