# SL WORLD ENGINE LAB / 006 α1

## Version and boundaries

`test-match-006-engine-lab-alpha1`. Entry points: `engine-lab.html` (LAB), `engine006.html` (normal match), or HOME → シナリオ感度検査.

005 remains at `engine-test.html`, with its original fielding, tactics, replay, viewer and regression fixtures unchanged. No player database values, player-editor writes, existing storage keys, service-worker, manifest, management logic, team-name strength, scoring ceiling, rubber band, league, injuries or excluded baseball phenomena were added or adjusted. HOME only gains a navigation card. Not deployed by this change.

006 forks the engine intentionally. ENGINE produces results and replay facts; EVENT carries the result. The viewer renders supplied events. FULL/MINI/HIGHLIGHT/SKIP advance the same seeded engine. The LAB uses a dedicated Worker and the same 006 core. Wall-clock time is measured outside the engine.

## Files

- `index.html`: HOME link only.
- `engine006.js`, `engine006-tactics.js`, `engine006-fielding.js`: isolated 006 core, tactical routes and defensive facts.
- `engine006.html`, `engine006-match-ui.js`, `engine006-replay.js`, `engine006-viewer.js`: normal match and rendering adapters. Viewer tolerates LAB without normal-match-only controls.
- `engine-lab.html`, `engine-lab.css`, `engine-lab-ui.js`: mobile layout, setup, comparisons, history, exports and seed inspection.
- `engine-lab-core.js`, `engine-lab-worker.js`: deterministic scenario construction, execution, metrics and diagnostic candidates.
- `engine-lab-regression.test.cjs`, `engine-lab-roads.test.cjs`, `engine-lab.browser.test.cjs`, `engine006-viewer.browser.test.cjs`: regression, directed routes and real-browser checks.
- `serve-engine-lab.cjs`: optional localhost preview.

## Tactical routes

Existing normal batting, sacrifice bunt, stealing, throws and true holding remain. Added safety bunt, squeeze, hit-and-run, pinch hitter, pinch runner, defensive replacement, continuing pitcher, relief, closer, challenge, cautious challenge, intentional walk, normal/in/deep positioning.

These are a shared basic policy, not manager personalities. Batting, runner, opposing arm, next batter, outs, inning, score, fatigue and available bench determine options. Bunt traits affect both selection (sacrifice) and execution. Steal traits retain selection effects; existing steal execution probability is preserved. Cautious challenge lowers zone targeting for that pitch. An intentional walk advances through the engine's walk rules without a delivered pitch.

Substitutions consume a bench entry, replace the lineup entry, maintain runner identities/statistics, and prevent re-entry. Pitcher-slot pinch hitting/running requires an available reliever and schedules that replacement before the next defensive pitch. Closer selection uses stored closer roles in a late lead; ordinary relief uses fatigue and pitcher abilities. Defensive replacements require compatible position data. Registered alignment IDs and coordinate offsets are separate from the selection policy; no special shifts are registered.

## Secure return

Defense records `action: OUT_ATTEMPT` for a throw to retire a runner, `SECURE_RETURN` for a settled outfield ball, and `HOLD_BALL` for a real infield holding opportunity. A settled outfield hit produces a `kind: return` transfer to the infielder covering second. It does not invent a late putout or attempt a risky low-probability out. Normal out-attempt errors remain in execution. No FC-frequency multiplier was added.

## Daily use

1. Choose a scenario; change inning/half/score/outs/bases/order/fatigue with controls.
2. Select the edited role and either a TEST PRESET or a current DB player. DB values are copied, never written back. HIGH/MID/LOW controls edit one ability. CUSTOM JSON can express extra details and arbitrary supported numeric values.
3. Choose no comparison or a single A/B/C axis. Runner comparisons affect **one runner, on the shallowest occupied base**, preserving that player's other values and all other runners. Each group uses the same seed sequence.
4. Run 1, 100, 1000 or 10000 trials per group (CUSTOM 1–10000). Default horizon is the rest of the half-inning; one PA or the remainder of the game can also be selected. Cancellation terminates the worker; incomplete runs are not reported as completed.
5. Read initial decision rates, trial-level operation rates, execution success, scoring and diagnostic candidates. Inspect reasons or play an interesting seed.
6. Save a named history, export JSON, and after changes use history → BEFORE / 同じ条件を再実行. The AFTER table warns when scenario/seed prefix differ. Move between devices with JSON import/export.

HTTP(S) is required for Workers. Locally: `node serve-engine-lab.cjs`, then open `http://127.0.0.1:4173/engine-lab.html`. Existing hosting can serve the new static files. This change does not alter PWA precaching or deploy a site.

## Test player presets

Roles: RUNNER (speed), BATTER (meet), CATCHER (arm), PITCHER (control), plus ability-by-ability bench edits. HIGH/MID/LOW map to official S/C/G intervals in `lineup-display.js`, not a fabricated midpoint label. Other abilities stay at their C representative.

| Ability | S / HIGH | C / MID | G / LOW |
|---|---:|---:|---:|
| Meet | 10 | 7 | 1 |
| Speed / arm / fielding / catching | 20 | 14 | 2 |
| Power / control / stamina | 195 | 142 | 20 |
| Velocity | 160 | 122 | 82 |

Trait comparisons: runner steal○ / none / steal×; batter bunt○ / none / bunt×. Existing DB specials are retained. Additional stored traits can be supplied through CUSTOM JSON, but only implemented traits affect the engine; no generic buff is inferred from a name.

## Scenario presets

- Steal: bottom 8, tied, one out, first.
- Sacrifice: bottom 8, tied, no outs, first.
- Squeeze: bottom 9, tied, one out, third.
- Hit-and-run: top 5, one out, first.
- Challenge/cautious/IBB: bottom 8, tied, one out, second and third, high batter / low next batter.
- Pinch hit: bottom 8, one run behind, weak current batter / strong bench.
- Pinch run: bottom 8, tied, first, slow runner / fast bench.
- Relief: top 8, defending one-run lead, 140 pitches, relief available.
- Alignment: bottom 9, offense one run behind, one out, third.

Safety, closer and defensive replacement can be tested by editing these scenarios (clear first for safety, inning 9 for closer, defensive bench fielding S and matching position for replacement).

## Metrics and diagnostics

Initial decision rates have one observation per trial. Operation rates in UI mean at least one selection in that trial. Raw `decision` values count decision opportunities, so they are not percentages. Sacrifice succeeds on credited SH; safety on a bunt hit; squeeze on a run from the bunt play; hit-and-run on contact with a safe runner advance. Failure remains NORMAL unless a structural diagnostic fires. Bunt plans that end without reaching their objective count as failed plans; the execution map separately counts actual bunt attempts. A half-inning stop is not a drawn game. `tiedAtEnd` and actual `draw` are separate.

CRITICAL candidates: duplicate runners/illegal out count; two-out sacrifice; occupied-base steal; selected option marked illegal; impossible squeeze or hit-and-run; steal without execution; secure return without a return transfer.

REVIEW candidates: outfield HOLD; extreme low-speed/high-arm case accompanied by an incompatible high-success reason; intentional-walk decision/execution mismatch; near-identical initial steal/bunt/IBB rates across extreme comparisons with at least 100 samples. LOW_SENSITIVITY is a heuristic, not a statistical proof. Check opportunity and sample size manually. NORMAL includes legal failures, including caught stealing in a legitimate attempt.

Each trace preserves Situation → Options → Decision → Reason → Execution → Outcome and PA-end outcome. Operations retain incoming/outgoing identities and reasons. Selected out-attempt options retain ETA, chance and risk in replay events. No losing-result BAD PLAY classifier exists.

## JSON / CSV and saved data

JSON schema v1:

```text
format, schemaVersion, version, date, axis, seedPrefix, trialCount, elapsedMs
  groups[]: label, changed, bundle, summary, trials[]
    bundle: scenario, teams (adapted player snapshots), runnerIndices, config
    summary: initialDecision, decision, reason, execution, outcome, anomalies
    trial: seed, initial, initialDecision, intent, decision, reason, execution,
           outcome, traces, operations, anomalies, classification
  anomalies[] (comparison-level), savedSeeds[]
```

Trials reference their group's frozen bundle; full player/config snapshots are not duplicated 10,000 times. `outcome.finalScore` means score at the selected horizon, while `gameFinished`, `finishReason`, and `trialEndReason` distinguish real match ending from observation ending. Seeds are `seedPrefix:index` and identical across groups.

CSV is UTF-8 BOM, RFC-style quoted fields, one row per condition/seed, with structured cells serialized as JSON. JSON is the authoritative re-import/replay format, including complete bundles and summaries; CSV is a flattened analysis view.

History is in dedicated IndexedDB `sl_world_engine_lab_006` / `reports`. Existing localStorage is only read for the player DB. Quota errors are shown; JSON export remains available. A saved seed includes its full report/bundle. Replay uses the saved scenario, config and player copies with the current **matching version**, not current DB values. A different version is rejected instead of pretending to reproduce it. Full event lists are regenerated only for inspection, rather than stored for every bulk trial.

## Validation and limits

See the test files and implementation report. Bulk performance is device-dependent. Large three-way 10,000-trial JSON reports consume substantial memory; mobile Safari and actual iPhone hardware were not tested. Browser tests use headless Edge at 390px and desktop width.

Alpha limits: one relief entry and one attacking bench entry through the simple LAB UI; actual team DB matches can use multiple bench players. CUSTOM supplies individual roles. No DH system or advanced bullpen rules. Hit-and-run is a one-pitch start, with existing steal execution on a miss; foul resets and fly/line-out advancement retain the existing simplified rules. Defensive alignment influences ground-throw arrival and rendering; this is not a complete spatial fly-catch/range simulator. Secure return is a safe infield return, without a new return-error/extra-base simulation. Trial-limit/Worker failures stop visibly and are not silently labeled finished trials. No cross-device automatic history sync or offline cache additions.

First recommended checks: steal / speed S-C-G at 1000 each; then fix runner S and compare catcher arm; then runner S fixed with steal traits. Follow with next-batter meet on the IBB preset, bunt traits, and fatigue with a reliever available. Do not tune frequencies just to separate C/G where the shared policy currently rejects both.

## 実行結果（2026-09-08）

- `engine-regression.test.cjs`: PASS — 150試合、40モード比較、2,400ゴロ状況、34,143 EVENT、既存30 seed fingerprint不変。
- `tactics-regression.test.cjs`: PASS — 100試合、40モード再生、240バント打席。
- `lineup-display.test.cjs`: PASS — 776能力値・境界・DB非破壊。
- `match-viewer.browser.test.cjs --samples-only`: PASS — 既存005、9プレー種別・499フレーム。
- `engine-lab-regression.test.cjs`: PASS — 006の30試合、12モード比較、7,682 EVENT、900シナリオ、3,000感度比較、10,000大量試行。seed再現と再生時の結果一致。最終10,000半イニング試行は約27.2秒（Node VM / この端末）。
- `engine-lab-roads.test.cjs`: PASS — 各戦術の成立条件、敬遠、抑え、守備固め、守備3配置、異常の人工注入、一条件差、H&R複合再生、公式S/C/G、投手枠代打→救援。
- `engine-lab.browser.test.cjs`: PASS — 390px/PC、Worker各100回×3、DB実選手選択と元データ不変、JSON download、保存seed、IndexedDB再読込、2D/DEBUG、006 SKIP、page errorなし。
- `engine006-viewer.browser.test.cjs`: 2 seed × FULL/MINI/HIGHLIGHT/SKIP の8試合結果一致。追加した長文DEBUGの幅問題を修正後、`--samples-only` 再実行PASS（9種別・527フレーム）。
- `git diff --check`: PASS。既存ファイル変更はHOMEの5行追加のみ。

標準盗塁シナリオ・同一seed群1,000回ずつの初回盗塁選択: S 14/1000 (1.4%)、C 0/1000、G 0/1000。C/Gを分離するための選択率調整は実施していません。次の感度確認対象として残しています。

スクリーンショットは `test-artifacts/engine-lab-mobile-top.png`、`engine-lab-mobile.png`、`engine-lab-desktop.png`。これはブラウザ検査成果物であり、iPhone実機検査ではありません。

