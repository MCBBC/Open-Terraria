// 版本号自动递增(2026-09-06):每次 build:release 前将 package.json 的 patch 段 +1。
// 同时直写 src/version.ts(消除 JSON import 的 vite 缓存面)。
import { readFileSync, writeFileSync } from 'node:fs';
const pkgPath = new URL('../package.json', import.meta.url);
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const [maj, min, pat] = pkg.version.split('.').map(Number);
pkg.version = `${maj}.${min}.${pat + 1}`;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
const tsPath = new URL('../src/version.ts', import.meta.url);
writeFileSync(tsPath, `// 自动生成(bump-version.mjs);禁手改——单一来源=package.json\n// build:release 链每次 deploy 前 patch+1\nconst APP_VERSION = '${pkg.version}';\nexport default APP_VERSION;\n`);
console.log(`[version] v${pkg.version}`);
