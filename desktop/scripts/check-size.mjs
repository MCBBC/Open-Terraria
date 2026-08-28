// 安装器体积闸门。
// 预算口径沿革：
//   2026-08-29 早版（薄壳远程形态）：红线 <100MiB；
//   同日用户定案改为【自包含】形态（assets-zip 全量随包,本地加载）→ 总包
//   预算重定为 ≤550MiB（Electron 壳 ~210MiB 解压 + 游戏产物 ~412MiB,压缩后
//   实测 ~430MiB）。SIZE_LIMIT_MB 环境变量可临时收紧做回归对锚。
// 用法：electron-builder 打包完成后运行 `npm run size-gate`，
// 扫描 release/<version>/ 下所有产物安装包，任一超限即非零退出。
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LIMIT_MB = Number(process.env.SIZE_LIMIT_MB || 550);
const DIR = join(fileURLToPath(new URL('..', import.meta.url)), 'release');
const EXTS = ['.exe', '.dmg', '.AppImage'];

let found = [];
for (const verDir of listDirs(DIR)) {
  for (const name of readdirSync(verDir)) {
    const p = join(verDir, name);
    const st = statSync(p);
    if (!st.isFile()) continue;
    if (!EXTS.some((e) => name.toLowerCase().endsWith(e))) continue;
    found.push([p, st.size]);
  }
}

if (!found.length) {
  console.error('[size-gate] 未找到任何安装器产物（先跑 pack:*）');
  process.exit(64);
}

let fail = false;
console.log(`[size-gate] 上限 ${LIMIT_MB} MiB`);
for (const [p, size] of found) {
  const mb = size / 1048576;
  const ok = mb <= LIMIT_MB;
  if (!ok) fail = true;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${mb.toFixed(1)} MiB  ${p}`);
}
process.exit(fail ? 1 : 0);

function listDirs(root) {
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => join(root, d.name));
  } catch {
    return [];
  }
}
