# ENGINE LAB 006 — iPhone向けUI/UX改修

## 変更範囲

ENGINE version は `test-match-006-engine-lab-alpha1` のままです。戦術判断・確率・能力計算・バランス・乱数・005には変更を加えていません。UIを利用して選ぶ比較軸はpresetに応じて初期選択しますが、同じscenario・axis・seedを渡したENGINE結果は不変です。

変更：
- `engine-lab.html`：簡単設定／詳細設定、主要結果、診断、共有、履歴の構成。
- `engine-lab.css`：320px以上の縦画面、固定幅の比較表、Safe Area、standalone用余白。
- `engine-lab-ui.js`：日本語要約、操作導線、共有フォールバック、履歴の非上書き保存、保存結果と再生結果の比較。
- `engine-lab-presentation.js`（追加）：表示・集計の読み取り専用アダプター。ENGINEを実行せず、記録済み結果から主要指標・観測診断・推奨設定・解析JSONを生成。
- `engine-lab.browser.test.cjs`：折りたたみ・日本語表示に合わせた既存ブラウザテストの更新。
- `engine-lab-ui-baseline.json` / `engine-lab-ui.test.cjs` / `engine-lab-ux.browser.test.cjs`（追加）：改修前指紋、互換性、iPhone幅、共有、履歴、実行の検査。
- `test-artifacts/engine-lab-ux-*.png`：新しい画面の検査画像。従来の画像は変更していません。

## 操作

1. 「何を確かめる？」からpresetを選択します。状況、今回変わるもの、A/B/C、固定条件が表示されます。
2. 必要なら「詳細設定を開く」で状況・選手・能力・特殊能力・比較軸・seed・観測範囲を変更します。
3. 各条件の回数と合計試行数を確認し、実行します。Worker・中止・CUSTOM回数は従来どおりです。
4. 主要結果 → LAB診断 → 要確認候補の順に読みます。全指標とtrial一覧は折りたたみ内にあります。
5. 個別候補は「2Dで再生」、条件全体の候補は「この条件のseedを見る」から確認します。集計候補の代表seedを「異常確定seed」とは扱いません。
6. 「次のテストを準備」は設定だけを反映し、自動実行しません。走力比較後は走力S固定・捕手肩比較を提示します。
7. 結果上部の「ソル解析用JSONを作る」で共有します。結果末尾には通常のJSON/CSV出力・履歴保存もあります。
8. 履歴の要約をタップすると結果が開きます。「BEFOREに指定」「同じ条件を準備」で修正前後を比較できます。

## 指標の意味

選択率は各試行の最初の判断、交代率は観測範囲内に一度以上選択した試行の割合です。投手対打者・守備位置の主要表示は最初の判断を使います。全指標では従来のtrial内指標も残しています。

盗塁選択率は二塁・三塁盗塁の合計。盗塁成功率は観測範囲全体の実行が分母で、途中の盗塁・H&R空振り後の盗塁も含みます。したがって初回選択0%でも成功率の記録がある場合があります。バント成功は既存の打席内計画結果の記録をそのまま使います。表示は小数1桁ですが、JSONは分子・分母・0〜1のrateを保持します。対象実行がない成功率は `—` / JSON `null` です。

## 診断

従来のENGINE異常検知はそのままです。日本語の見出し・理由・対象条件・seedを付けて表示します。

UIの追加観測は、S/C/G比較で100回以上ずつ試し、C/Gとも初回盗塁選択が0件だった場合の「閾値挙動の可能性」です。これは作戦の間違い・異常の確定ではありません。少数試行では感度確認を保留する説明を出します。結果の失敗、盗塁死、敗戦だけを異常扱いしません。

保存seedの2D再生が観測終了に到達した時、再実行ENGINEの終了スコア・実際の試合終了フラグ・終了理由と保存値を照合します。不一致は `REPLAY_RESULT_MISMATCH` 候補として表示・exportします。全seedを二重実行したり、画面ピクセルとENGINEを照合したりするものではありません。VIEWER本体は変更していません。

## 履歴の維持

IndexedDB名 `sl_world_engine_lab_006`、version `1`、object store `reports`、key `name` は変更していません。移行・削除・既存レコードの自動書き換えをしません。同名の保存は `daily-001 (2)` のように連番を付け、既存履歴を保持します。履歴一覧はcursorで要約を取り、詳細レポートは開く時に読み込みます。

旧形式の `daily-001` を入れたテスト用DBについて、読込・共有・JSON再読込・同名保存・seed再生後にもレコード全体が同一であることを確認しました。ユーザーの実際の保存DBにはアクセス・書き込みしていません。

履歴は同じ端末・ブラウザ・オリジンに属します。本番サイトとlocalhostの履歴は共有されません。別端末／別URLへの移動はJSONを読み込み、必要に応じて新しいLAB履歴として保存してください。player-editor領域には書き込みません。

## ソル解析用JSON・CSV互換性

従来の `format: SL_WORLD_ENGINE_LAB`、`schemaVersion: 1`、`version`、`date`、`groups`、各trial・bundleを保持した1ファイルです。既存のJSON読込も引き続き動作します。

追加キー：

```text
analysisSchemaVersion: 1
engineVersion, testId, testName, timestamp
scenario: inning, half, score, outs, runners, battingOrder,
          pitcherFatigue, observationRange
comparison: axis, target, ability, label, conditions[], fixedConditions
trialCountPerCondition, totalTrialCount, executionTimeMs, seedPrefix
primaryMetrics[]: id, label, basis, values[]
  values[]: conditionId, numerator, denominator, rate
allMetrics: rates[], rawByCondition[]
anomalySummary: criticalCount, reviewCount, candidates[]
labDiagnosis: status, label, facts[], scope, replayChecks[], reproducibilityCoverage
recommendedNextTest: label, reason, scenario, axis, trialCountPerCondition, autoRun:false
interestingSeeds[]: conditionId, seed, evidenceRole, anomalyType[], reason[],
                    intent, decision, execution, outcome
beforeAfter: before, after, conditions[]  (なければnull)
```

`interestingSeeds.evidenceRole` は `flagged`（個別候補）、`saved`（保存seed）、`representative`（集計候補の代表例）を区別します。A/B/Cの具体的な選手・固定条件はbundleおよびchangedPathsから確認できます。主観的な戦術評価は追加しません。

ファイル名例：`sl-world-lab_daily-001_steal-runner-speed_2026-09-08.json`。

CSVの列・内容生成は変更していません。解析JSONも旧JSONもLAB側で再読込でき、表示時にはtrialから集計を再構成します。JSONを読むだけでは履歴や選手DBへ書き込みません。

## iPhone共有・PWA

ユーザーのボタン操作から `navigator.canShare({files})` を確認し、ファイル共有対応時は `navigator.share({files})` を呼びます。非対応・共有失敗時はJSONダウンロードとコピーボタンを用意します。共有キャンセルでは勝手にダウンロードしません。Clipboard APIが利用できなければ選択可能なJSON欄を表示します。

`viewport-fit=cover`、Safe Areaの上下左右余白、standalone時の下余白、46px以上の操作ボタン、reduced-motionへの配慮を追加しました。manifest・service-worker・PWA保存領域は変更していません。オフラインcacheの追加は今回行っていません。

ブラウザ検査はWindows上のheadless Edge、320/375/390/430pxです。iPhone実機、Safari/WebKit、実際のiOS共有シート・インストール済みPWAの検査は未実施です。共有・Clipboardの分岐はブラウザテストでAPIを模擬し、渡されるJSONファイルの内容も検証しています。

## 回帰結果

- `engine-lab-ui.test.cjs`：PASS。ENGINE/005/Worker/保存関連15ファイルのSHA-256不変、改修前180試行の結果指紋一致。旧/新JSON往復、CSV完全一致、主要指標、診断、次設定、BEFORE/AFTER、入力非破壊。
- `engine-lab-ux.browser.test.cjs`：PASS。旧daily-001保持、320/375/390/430pxの主要結果・全指標・BEFORE/AFTERで横スクロールなし。1/100/1000/10000回の実Worker実行、共有/キャンセル/ダウンロード/コピー/再読込、次設定の非自動実行、要確認seed再生、DB非破壊。
- 同テスト `--quick`：履歴連番保存、正しいseed再生の一致、人工的な保存結果不一致の検出を追加確認しPASS。quickは1/100回のみで、1000/10000回は上のfull runで確認。
- `engine-lab.browser.test.cjs`：既存の実DB選手選択、各100×3 Worker、JSON download、保存seed、履歴、2D、006 SKIP検査PASS。
- `engine-regression.test.cjs`：PASS。150試合・40モード比較・2400ゴロ状況・既存seed fingerprint不変。
- `engine-lab-regression.test.cjs`：PASS。006の30試合・12モード比較・900シナリオ・3000感度試行・10000大量試行。
- `engine006-viewer.browser.test.cjs`：PASS。2 seed × FULL/MINI/HIGHLIGHT/SKIPの8試合一致、9種別・527フレーム。
- `git diff --check`：PASS。

未デプロイ。UI表示はローカルの `node serve-engine-lab.cjs` でも確認できます。
