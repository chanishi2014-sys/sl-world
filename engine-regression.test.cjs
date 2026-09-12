// The historical suite injected flyout/SB results and asserted pre-process hashes.
// Production now rejects those contracts; run the physical, temporal and bounded
// batch regressions instead. Pass --quick for ten games rather than 100.
require('./process-regression.test.cjs');
