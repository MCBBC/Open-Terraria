// 版本号自动递增(2026-09-06):每次 build:release 前将 package.json 的 patch 段 +1。
// 同时直写 src/version.ts(消除 JSON import 的 vite 缓存面)。
// ★2026-09-23 用户令:版本号一律带 `-beta` 后缀(测试版标识)——旧三段式(如
//   0.1.34)升版后自动补缀,已带缀(如 0.1.35-beta)则保持;正式转正时摘本行即可。
import { readFileSync, writeFileSync } from 'node:fs';
const pkgPath = new URL('../package.json', import.meta.url);
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const [maj, min, pat] = String(pkg.version).split('-')[0].split('.').map(Number);
pkg.version = `${maj}.${min}.${pat + 1}-beta`;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
const tsPath = new URL('../src/version.ts', import.meta.url);
writeFileSync(tsPath, `// 自动生成(bump-version.mjs);禁手改——单一来源=package.json\n// build:release 链每次 deploy 前 patch+1(尾缀 -beta=测试版,2026-09-23 用户令)\nconst APP_VERSION = '${pkg.version}';\nexport default APP_VERSION;\n`);
console.log(`[version] v${pkg.version}`);
