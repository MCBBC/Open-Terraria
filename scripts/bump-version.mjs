// 版本号自动递增(2026-09-06):每次 build:release 前将 package.json 的 patch 段 +1。
// 同时直写 src/version.ts(消除 JSON import 的 vite 缓存面)。
// ★2026-09-23 用户令:版本号一律带 `-beta` 后缀(测试版标识)——旧三段式(如
//   0.1.34)升版后自动补缀,已带缀(如 0.1.35-beta)则保持;正式转正时摘本行即可。
// ★2026-09-30 用户令:同时写构建时间戳(YYMMDDHHMM,与 stamp-build.mjs 共用
//   versionStamp.mjs 模板)——本地 analyze/dev 构建经 stamp-build.mjs 仅刷戳不升版。
import { readFileSync, writeFileSync } from 'node:fs';
import { buildStampNow, writeVersionTs } from './versionStamp.mjs';
const pkgPath = new URL('../package.json', import.meta.url);
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const [maj, min, pat] = String(pkg.version).split('-')[0].split('.').map(Number);
pkg.version = `${maj}.${min}.${pat + 1}-beta`;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
writeVersionTs(pkg.version, buildStampNow());
console.log(`[version] v${pkg.version} ${buildStampNow()}`);
