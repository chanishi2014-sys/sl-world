# 守備Decision Trace・責任診断LAB 完了報告

## 1–11 診断基盤と実戦

- 観測専用の `SL_DECISION_TRACE` を追加。守備AIの候補選択、責任配分、送球、走塁、DP、FC、得点分類は変更していない。
- 実戦playIdは `seed-投球sequence`。gameId、seed、回、表裏、アウト、スコア、走者、打者、投手を関連付ける。
- 試合画面の「実戦プレー Decision Trace」で診断をONにし、必要ならイニング/playIdを限定。対象インプレー一覧の「診断JSON保存」で保存する。
- 打球方向、初速、角度、軌道、予測落下点、処理点、滞空時間、既存ball timeline、打球種別、守備初期位置を保存。エンジンにない値はnullまたは理由文字列。
- 守備者ごとに時刻、現在/目標位置、naturalCandidateと理由、catchability、interceptETA、roleと理由を保存。
- `previousResponsibility / newResponsibility / changeTime / changeReason` を保存。
- 1B/2B/3B/HOMEの requiredState、reason、assignedFielder、assignmentReasonを保存。
- RELAY/CUTOFFは候補、選択担当、理由、目標、不要時理由を保存。
- 送球は候補として現行送球履歴、対象塁/守備者/走者、force、到着予測、結果、DP継続可否を保存。現行エンジンが候補スコアを公開しない場合はその旨を明記。
- FC/scoringはraw result、アウト、進塁、送球履歴、fieldingChoice、分類、既存classificationReasonを保存。
- OFF時はトレース構築を行わない。ON時のみ確定済みイベントから生成する。

## 12–24 LAB/UI

- `responsibility-lab.html` に「守備責任・打球条件診断」を追加。スマホ縦画面で「場面→打球→方法→実行→結果」の順に表示。
- 場面: アウト、走者、守備/肩/捕球能力。打球: 方向、初速、角度、滞空時間、seed。役割そのものは入力できない。
- 1回詳細、10/100/500/1000/任意回数に対応。
- 1回詳細は既存2Dビュー、最終role、日本語役割、Decision Timeline、baseNeeds、relay、throw、scoringを表示。
- 大量試行は roleDistribution、responsibilityTransitions、baseNeedsDistribution、relayDistribution、結果分布を逐次集計。
- 最終role構成の出現率が `max(2件, 1%)` 以下の試行を「要確認」とする。野球上の異常とは断定しない。
- 要確認seedの「この試行を詳しく見る」で同じ初期条件+seedを1回詳細再実行。
- 打球条件を少しずつ変更し、「前回結果と違う項目」で最終role差分を確認できる。
- 実戦JSONは将来読込用 `replayInput` を持つが、実戦JSON→LAB自動読込UIは未実装。engineVersion一致時も完全再現とは表示しない。

## 25–30 fixture・性能・回帰

- FIXTURE-A RF方向、B LF方向、C 外野フライ、D 一塁走者ありゴロ、E scoring/FC trace、F 100回、G 1000回、H seed詳細再実行: すべてPASS。
- 100回: 約0.89秒、集計JSON 5,058 bytes。
- 1000回: 約5.98秒、集計JSON 5,101 bytes（実行環境で変動）。
- 大量試行は詳細timelineを0本保持。compact trialは集計終了時に破棄し、代表8件と要確認最大100件だけを残す。
- `second-cover-hold.test.cjs` PASS。既存のnatural candidate、責任再配分、到着後HOLD、分類、戦術、描画コードのbyte-for-byte保護もPASS。
- `emergency-fielding.test.cjs`、`final-2026-09-15.test.cjs`、`steal-cover-regression.test.cjs` の実行部分はPASS。既存 `tactics-regression.test.cjs` は `outChance` fixtureで失敗（今回変更していない戦術コード上の既存テスト条件）。

## 31 変更ファイル

- 新規: `decision-trace-core.js`, `decision-trace-ui.js`, `responsibility-lab.html`, `responsibility-lab.css`, `responsibility-lab-core.js`, `responsibility-lab-ui.js`, `responsibility-lab-worker.js`, `responsibility-lab.test.cjs`
- 導線/統合: `engine006.html`, `engine006-match-ui.js`, `engine-lab.html`, `service-worker.js`
- 計測結果: `test-artifacts/responsibility-lab-performance.json`

## 32 未解決事項

- 実戦JSON→LABのファイル読込UIと完全な試合状態復元は未実装。
- 2D上への役割文字オーバーレイは未実装。2Dの直下に同時点のrole一覧を表示する。
- ground系は既存エンジンが空中追球と同じ再評価履歴を持たないため、既存defensivePlan/track/throw/recordから初期判断を構成する。
- 送球候補のうち、現行エンジンが最終送球履歴に残さない棄却候補の内部評価値は捏造せず未記録。
