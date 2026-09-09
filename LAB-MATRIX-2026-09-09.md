# LAB検証機能拡張（2026-09-09）

今回の対象はLABのみ。作業開始前から存在したTeams関連の変更は保持し、追加変更していない。

## 変更ファイル

|ファイル|変更内容|
|---|---|
|engine-lab-core.js|数値設定の共通定義・整数検証、比較方式と総試行数計算、2軸直積、実入力値の取得|
|engine-lab-ui.js|Custom入力、比較方式・独立した固定値操作、実条件プレビュー、9条件の結果表示、履歴／次テストの2軸復元|
|engine-lab.html|単一／1軸／2軸、軸A/B、固定ミート、条件・負荷表示の導線|
|engine-lab.css|9条件グリッド、入力エラー、結果ブロックのスタイル|
|engine-lab-worker.js|2軸条件の実行・進捗・axisB保存。試行処理は既存関数を呼び出す|
|engine-lab-presentation.js|A〜Iの識別、2軸ラベル、実入力・条件別差分・固定値のJSON追記、9条件読み込み、次テスト情報|
|engine-lab-ui.test.cjs|今回更新対象のLAB core/workerを旧バイト固定対象から外し、非LABは作業開始時ハッシュで保護。180試行の既存指紋検証は維持|
|engine-lab-matrix.test.cjs|必須A〜Gのモデル検証、旧1軸生成データとの完全一致検証|
|engine-lab-matrix.browser.test.cjs|実Worker、9,000試行、Custom、JSON、スマートフォン幅、次テストの検証|
|test-artifacts/lab-matrix-protected.json|作業開始時の非LABソースのSHA-256|
|test-artifacts/lab-matrix-mobile.png、lab-matrix-setup.png|マトリクス表示の検証画像|
|test-artifacts/engine-lab-ux-phone.png、engine-lab-ux-phone-results.png、engine-lab-ux-results.png|既存ブラウザ回帰テストの更新画像|
|test-artifacts/sol-export-sizes.json|既存軽量JSONサイズ検証の更新結果|
|LAB-MATRIX-2026-09-09.md|本報告|

## 実装方法

- 投球数は既存の0/40/80/110/140/180を残し、100とCustomを追加。通常は選択、Custom時のみ数値入力を表示する。0以上の安全な整数を受け付け、空欄・負数・小数・非数値・範囲外はエラー表示し実行不可。値・単位・代表値・範囲を持つ定義と描画関数を分離し、他の数値設定にも再利用できる。
- 比較軸と固定値は別に保持。固定側では選手コピーのミートだけを変更し、比較対象の切り替えでは固定側を連動変更しない。比較中の能力の固定操作は無効化。既存の詳細選手設定も利用可能。
- 2軸は既存の単軸比較をコピー上で順に適用し、Aの3値×Bの3値を直積生成する。S×S/S×C/S×G/C×S/…/G×Gの順でA〜Iを付ける。同一対象・同一能力はUI選択不可かつ実行時検証、打者ミート×打者パワーは許可する。
- 単一条件／1軸比較＋固定条件／2軸比較を選択可能。各軸の条件数、全条件数、1条件の回数、総試行数を実行前に表示する。総試行数は条件数×各条件回数。10,000試行以上では時間・保存サイズの負荷も表示。
- UIプレビューとWorkerは同じ比較関数を使う。比較後scenarioと選手snapshotから実値を取得し、JSONのcomparison.conditions[].effectiveInputsに保存。固定値は全条件で一致した非比較能力から作る。条件ごとのchangedPathsはA条件との実差分、fixedConditions.changedPathsはその和集合。referenceBundleは既存同様、全固定情報の参照snapshot。
- schemaVersion 1、既存フィールドと旧1軸JSON読み込みを維持し、axisB/mode/axes/conditionCount/effectiveInputs/条件別changedPathsを追加。9条件JSONは更新後LABで読み込める（旧版LABは9条件には未対応）。CSVの列形式も維持する。
- 1軸専用の感度警告は9条件をまとめて誤判定しないようマトリクスでは適用しない。各trialの既存構造・合法性チェックと全条件の実測集計は維持する。H&RのinitialDecision／観測全体／初期以降の集計式は変更していない。

## 必須テスト結果

|テスト|結果|
|---|---|
|A 打者S/C/G × 次打者C|3条件とも次打者の内部ミート7（C）で固定。ブラウザ実行も確認|
|B 次打者S/C/G × 打者C|3条件とも打者の内部ミート7（C）で固定。ブラウザ実行も確認|
|C 3×3|9組の実値10/7/1の直積を確認。実Workerで各1,000回、計9,000回完了|
|D 整合性|UI9条件、scenario、comparison、fixedConditions、実snapshot、engine入力、JSON往復を確認。差分は打者／次打者のmeet関連のみ|
|E Custom|85/90/95/100/105のブラウザ実行、engineの投球数初期値を確認。不正整数は実行不可|
|F 代表値|0/80/100/140のUI選択とCustom欄非表示を確認。その他既存値も維持|
|G 既存1軸|全プリセットの実行可能な全既存軸について変更前の生成bundleと完全一致|

## 回帰テスト

すべてPASS。

- `node engine-lab-matrix.test.cjs`：上記モデル検証と非LABハッシュ確認。
- `node engine-lab-matrix.browser.test.cjs`：実ブラウザ、9,000試行、完全JSONの9×1,000確認、9条件JSON読み込み、次テスト、Custom、320px幅。
- `node engine-lab-roads.test.cjs`：既存戦術の合法性・守備配置・交代・単軸同一性・ランク・再生。
- `node engine-lab-ui.test.cjs`：既存180試行の指紋一致、旧／拡張JSON往復、CSV、次テスト、BEFORE/AFTER。
- `node engine-lab-sol.test.cjs`：13,000試行の旧挙動比較、異常候補保持、軽量共有、完全保存。3,000回244,609 bytes、10,000回346,996 bytes。
- `node engine-lab-regression.test.cjs`：30通常試合、12モード試合、7,682イベント、900シナリオ試行、3,000感度試行、10,000大量試行、再現性・DB不変。
- `node engine-lab-ux.browser.test.cjs --quick`：既存履歴、JSON1ファイル共有／保存／キャンセル／コピー、完全JSON読み込み、次テスト、BEFORE/AFTER、320/375/390/430px、Worker1/100回。旧1軸10,000回UIの再実行は省略し、大量試行は上記回帰テストで確認。
- JavaScript構文検査、`git diff --check`。

## 未変更範囲

試合エンジン、HOLD_BALL/SECURE_RETURN、守備送球・守備位置・盗塁・H&R・代打・代走・継投・スクイズ・バント・投球・打撃AI、閾値／数値／重み、能力値バランス、特殊能力効果、チーム・SL/TL・History・CC・JC・国王杯・昇降格は未変更。非LABソースは今回の開始時点とのハッシュ一致で確認した。
