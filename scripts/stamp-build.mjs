// 仅刷新构建时间戳(2026-09-30 用户令):本地 analyze/dev/build 构建链前缀——
// 不升版本号,只把 src/version.ts 的 BUILD_STAMP 刷成本次构建时刻(YYMMDDHHMM),
// 肉眼辨认「跑的是不是最新构建」。升版走 bump-version.mjs(build:release 专用)。
import { readFileSync } from 'node:fs';
import { buildStampNow, writeVersionTs } from './versionStamp.mjs';
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const stamp = buildStampNow();
writeVersionTs(pkg.version, stamp);
console.log(`[stamp] v${pkg.version} ${stamp}`);
