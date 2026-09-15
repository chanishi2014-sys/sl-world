# iPhone / PWA 横画面GAME VIEW制御 — 追加修正報告

**表示制御の実装・自動回帰は完了。実機iPhone/PWAによる最終確認は未実施です。**

今回のボタンは「横画面で最大領域を使って観戦するモード」の入口です。Fullscreen API成功だけを完了条件にしていません。

## 変更ファイル

- `match-viewer.js` / `engine006-viewer.js`：観戦モード、API呼出し、案内、向き／解除の監視。
- `game-view.css`：API不要の画面最大化、明示的な横画面レイアウト、安全領域、小さいviewport用の表示。
- `service-worker.js`：表示資産更新のためキャッシュ版のみv24→v25。
- `spectator-orientation.browser.test.cjs`：今回の方向制御回帰。

試合エンジン、守備／走塁、リプレイ工程、LAB、CUSTOM、基準能力、チーム選択、manifestのorientationには変更を加えていません。

## 1. 横画面にならなかった原因

従来のボタンはrequestFullscreenを呼ぶだけでした。方向ロック要求、portraitのまま残った場合の案内、横向きになるまでの要求状態がありませんでした。

従来CSSは「既にlandscapeで、高さ600px以下」のときにだけ最大化する仕組みでした。Fullscreen APIは端末方向の変更を保証しないため、縦向きのままAPIが成功した場合にも処理が終わっていました。

## 2. Fullscreen APIの扱い

標準APIとWebKit接頭辞付きAPIの存在を確認し、利用可能ならユーザー操作内から要求します。存在しない、拒否される、同期例外が発生する場合も観戦モードを維持します。

`isFullscreen`はdocumentの実際のfullscreenElementから取得します。PWA standaloneをこの値の代用にしません。`isStandalone`はnavigator.standaloneまたはdisplay-modeのメディアクエリーで別途取得します。

## 3. Screen Orientation APIの扱い

Fullscreen要求後、screen.orientation.lockが関数として存在すればlandscapeを要求します。Standalone等でfullscreenを使えない場合も、lock自体が利用可能なら試みます。

存在だけで成功とみなさず、Promiseの拒否を捕捉します。取得できたロックだけを解除時にunlockします。APIが成功してもviewportがportraitなら案内は消しません。

方向ロックの前提条件やfullscreenとの関係はブラウザーの実装・許可条件に依存するため、能力検出と失敗時の継続処理を併用しています。[W3C Screen Orientation仕様](https://www.w3.org/TR/screen-orientation/)

## 4. iOS / PWA用フォールバック

ボタン押下直後に観戦モードへ入り、portraitなら「端末を横向きにしてください」を表示します。API応答待ちの間にも案内と解除ボタンを使えます。

案内中は背後のコントロールをinertにして誤操作を防ぎ、案内内の「全画面解除」へフォーカスします。端末が横向きになれば案内を消し、追加クリックなしで横画面観戦へ移ります。再び縦向きに戻れば、要求モードを保持して案内を再表示します。

これはiOSのAPI対応をUA文字列で決め打ちする実装ではありません。iOS Safari/PWAを含む、同じ制約を持つ環境で機能します。WebKitでもホーム画面WebアプリとFullscreen APIの前提条件は別の論点として扱われています。[WebKitの関連課題](https://bugs.webkit.org/show_bug.cgi?id=246528)

## 5. portrait→landscape検出

- 最終的な向きはinnerWidth > innerHeightで判断。
- orientationメディアクエリーは補助に使用。
- resize、orientationchange、screen.orientationのchangeを監視。
- visualViewportのresize／scroll、pageshow、visibilitychangeでも再同期。
- イベント直後と次の描画フレームで再評価し、回転途中の寸法更新に追従。

orientationchangeが発火しない条件でも、resizeだけで案内解除とレイアウト切替が成立することを検査しました。visualViewportの寸法・オフセットはSafariの操作バー等を考慮した表示領域の大きさに使います。ズーム等を端末回転と誤認しないよう、方向判定と表示領域寸法の用途を分けています。

## 6. landscape GAME VIEW発動条件

`isSpectatorFullscreenMode && isLandscape`を条件に、明示的なspectator-landscapeクラスを設定します。isFullscreenはこの条件に含めません。

| 観戦モード | viewport | 挙動 |
|---|---|---|
| OFF | 縦／横 | 従来の通常GAME VIEW |
| ON | portrait | 横向き案内＋解除操作 |
| ON | landscape | 既存の横長構成を最大領域へ展開 |

上部スコア／B/S/O／塁状況、左2D、右VISITOR・HOME、下部情報と操作を維持します。高さ600pxという従来の制限に依存せず、タブレット相当の高さでも要求モードが発動します。

safe-area-insetを余白に反映し、表示高さが小さい場合は表・スコア・操作の間隔を縮めます。画面全体を回転transformしたり、portrait表示を横へ引き伸ばしたりする方式ではありません。

## 7. 解除処理

- 観戦モードをOFF。
- 取得済みorientation lockをunlock。
- 横向き案内と背後のinertを解除。
- アプリの最大化クラスを解除。
- このViewerがnative fullscreen中ならexitFullscreenを要求。
- fullscreenchange／WebKit版イベント、resize等からOS操作による解除も同期。
- メニュー／LOG VIEWへ戻る場合も解除。

非同期要求には世代番号を付け、解除後に遅れてfullscreenやlockが成功しても後処理します。素早く解除→再入場し、古いlockだけが後から成功するケースでも、次の解除でロックが残らないことを検査しています。回転・全画面操作は試合を進める処理を呼びません。

## 8. 両入口への反映

通常入口はmatch-viewer.js、ENGINE006入口はengine006-viewer.jsを利用します。両Viewerに同じ追加制御を反映し、ファイルの一致を確認しています。game-view.cssは共通です。

PWAの更新配信対象が変わるため、Service Workerのキャッシュ版をv25に更新しました。公開済みURLへのデプロイは今回実施していません。実機確認では、新しい資産が配信されたURLで確認する必要があります。

## 9. ブラウザー回帰

Playwright + 実ブラウザーMicrosoft Edgeで、通常入口／ENGINE006入口それぞれに次の11条件を実行しました。

1. PWA standalone、両APIなし。
2. Safari相当、standaloneではなく両APIなし。
3. Fullscreen／lockの拒否。
4. lock成功後、プラットフォームが横viewportへ変える経路の模擬。
5. lock成功を返してもviewportがまだ縦向き。
6. native fullscreen成功後、fullscreenchangeなしのOS解除をresizeから検出。
7. screen.orientation自体が存在しない。
8. native fullscreen成功、orientation lock拒否。
9. 解除後にlock成功が遅れて返る。
10. 解除後にfullscreen成功が遅れて返る。
11. 解除→再入場中に古いlockが成功し、新しいlockは拒否される。

この22ケースと、実Fullscreen APIの開始・外部解除1ケース、計23ケースが成功。pageerrorは0です。

縦390×844から開始し、押下→案内→回転→自動切替→縦へ戻す→解除を検査しました。横画面は844×390に加え、667×375、844×320、667×280、568×320、1024×768で、領域内の配置と不要な縦横スクロールがないことを検査しています。案内と横画面の画像も確認しました。

既存のGAME VIEWブラウザー回帰（final-2026-09-15.browser.test.cjs）も成功しました。通常入口のC対C、ENGINE006入口のS対Gで、試合完走・一時停止・縦横表示・Fullscreen・Renderer分離を確認しています。対象外ファイルに差分がないこと、両Viewerの一致、構文とdiffチェックも確認しました。

証跡：

- test-artifacts/spectator-orientation-regression.json
- test-artifacts/orientation-engine-test.html-prompt.png
- test-artifacts/orientation-engine-test.html-landscape.png
- test-artifacts/orientation-engine006.html-prompt.png
- test-artifacts/orientation-engine006.html-landscape.png

## 10. 実機iPhoneで必要な最終確認

自動テストのiPhone UA、standaloneフラグ、API非対応／拒否は模擬です。実iOS WebKit、ホーム画面起動、OSの方向変更許可を完全再現したものではありません。今回のPCテスト通過を「iPhone実機で確認済み」とは扱いません。

実機では通常入口とENGINE006入口それぞれで、以下を確認してください。

- 更新後のPWA／Safariを縦向きで開き、全画面ボタンから案内が出ること。
- 端末の画面回転ロックをOFFにし、横へ持ち替えるだけで案内が消えること。
- ノッチ／Dynamic Island／ホームインジケーター／Safari操作バーを含め、試合と操作が見切れないこと。
- 横→縦で案内へ戻り、解除で通常表示へ復帰すること。
- OS操作によるfullscreen解除、PWAのバックグラウンド復帰でも状態が整合すること。
- 再生中の回転・解除でも試合の進行や表示が操作不能にならないこと。

OSの画面回転ロック自体をWebアプリから解除する機能は実装していません。SafariのブラウザーUIを、非対応のFullscreen APIに代わって強制的に消せると保証するものでもありません。その場合は利用できるviewportの最大領域を使用します。
