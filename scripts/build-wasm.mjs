#!/usr/bin/env node
// WASM 管线构建脚本(2026-10-03 第二刀起多模块化):src/wasm/*.as.ts(AssemblyScript)
//   → src/wasm/gen/<id>.wasm(+.wat 反汇编,+ 构建指纹 stamp)。
//
// 纪律:
// - 产物入 git(金标纪律:tests/sm2-wasm.test.ts / tests/light-wasm.test.ts 的位级锁
//   以 gen/<id>.wasm 为输入,禁手改;改源必须走本脚本重编+全闸复跑)。
// - 幂等:按模块独立判定——源未变则跳过该模块(stamp 指纹对比),防无谓重编搅动
//   SW 缓存链;stamp 损坏/旧单模块形状 → 全量重编一次。
// - 主构建(build/build:release)不依赖本脚本(gen/ 已入库;asc 仅 devDep)。
// - 第三刀(水波)扩入 MODULES 表即可:一行登记 src/wasm/<id>.as.ts + 版本导出名。
// 运行:npm run build:wasm(或 node scripts/build-wasm.mjs)
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const GEN = join(ROOT, 'src/wasm/gen');
const STAMP = join(GEN, 'build-stamp.json');

/** 模块登记表(第三刀在此追加):id/src/abi 版本导出名。
 *  自检约定:每模块必须零 import(任意环境可实例化承诺)+ <versionExport>()===abi。 */
const MODULES = [
  // ★v2(2026-10-11):sm2 ABI 2=全 pass 化(s1/s2 纹理槽+t0Rect+宿主 Math 导入)。
  //   imports=['Math']——零 import 承诺放宽为「白名单 import」:超越函数走宿主 V8
  //   Math(与 JS 链逐位同源,AS stdlib musl 移植可差 1 ulp);加载器实例化时须供给
  //   同名导入对象。light/waves 保持零 import。
  { id: 'sm2', src: 'src/wasm/sm2.as.ts', abi: 2, versionExport: 'sm2Version', imports: ['Math'] },
  { id: 'light', src: 'src/wasm/light.as.ts', abi: 2, versionExport: 'lightVersion' },   // v2=scan 核扩入(2026-10-04)
  { id: 'waves', src: 'src/wasm/waves.as.ts', abi: 1, versionExport: 'wavesVersion' },
];

const ascBin = join(ROOT, 'node_modules/.bin/asc');
if (!existsSync(ascBin)) {
  console.error('[build-wasm] asc 不存在:先 npm i -D assemblyscript');
  process.exit(1);
}
const ascVersion = execFileSync(ascBin, ['--version'], { encoding: 'utf8' }).trim();

// stamp 读取(v2 形状={version:2,modules:{id:{...}}};v1 单模块形状/损坏 → 视为全陈旧)
let prev = { version: 0, modules: {} };
if (existsSync(STAMP)) {
  try {
    const raw = JSON.parse(readFileSync(STAMP, 'utf8'));
    if (raw.version === 2 && raw.modules) prev = raw;
  } catch { /* stamp 损坏 → 全量重编 */ }
}

mkdirSync(GEN, { recursive: true });
const built = {};
let anyChange = false;

for (const m of MODULES) {
  const srcPath = join(ROOT, m.src);
  const outWasm = join(GEN, `${m.id}.wasm`);
  const outWat = join(GEN, `${m.id}.wat`);
  const srcHash = createHash('sha256').update(readFileSync(srcPath)).digest('hex');
  const p = prev.modules[m.id];
  if (p && p.srcHash === srcHash && p.abi === m.abi && existsSync(outWasm)) {
    console.log(`[build-wasm] ${m.id}: 源未变,跳过(srcHash ${srcHash.slice(0, 12)})`);
    built[m.id] = p;
    continue;
  }
  anyChange = true;
  // --runtime minimal:无 GC 回收(分配只增;两模块分配均 init 期一次性,量级 MB)
  // --use abort=:abort 桩化为 unreachable → 模块零 import(任意环境可实例化)
  // -O3:热循环;--noAssert:去断言(金标闸兜底正确性;载荷几何由显式防御闸保证)
  execFileSync(ascBin, [
    srcPath,
    '--runtime', 'minimal',
    '--use', 'abort=',
    '--noAssert',
    '-O3',
    '-o', outWasm,
    '-t', outWat,
  ], { stdio: 'inherit', cwd: ROOT });

  // 导出面自检:import 须∈模块白名单(★v2 sm2=宿主 Math 逐位一致面;其余模块零
  // import)+ ABI 版本导出在场。白名单模块用宿主导入对象自检实例化。
  const bytes = readFileSync(outWasm);
  const mod = new WebAssembly.Module(bytes);
  const imports = WebAssembly.Module.imports(mod);
  const allow = m.imports ?? [];
  const bad = imports.filter((d) => !allow.includes(d.module));
  if (bad.length !== 0) {
    console.error(`[build-wasm] ${m.id}: 模块出现白名单外 import(允许:${allow.join(',') || '无'}):`, bad);
    process.exit(1);
  }
  const importObject = {};
  for (const name of allow) {
    if (name === 'Math') importObject.Math = Math;
    else { console.error(`[build-wasm] ${m.id}: 未知 import 白名单项 ${name}`); process.exit(1); }
  }
  const inst = new WebAssembly.Instance(mod, importObject);
  if (inst.exports[m.versionExport]?.() !== m.abi) {
    console.error(`[build-wasm] ${m.id}: ${m.versionExport}() != ${m.abi}(ABI 指纹缺失/漂移)`);
    process.exit(1);
  }
  built[m.id] = {
    srcHash,
    abi: m.abi,
    src: m.src,
    builtAt: new Date().toISOString(),
    wasmSha256: createHash('sha256').update(bytes).digest('hex'),
    wasmBytes: bytes.length,
  };
  console.log(`[build-wasm] ${m.id}: ok ${bytes.length} bytes, imports=[${allow.join(',') || '无'}], ${m.versionExport}=${m.abi}`);
}

// stamp 只在确有重编时落盘(纯跳过运行不搅动 mtime)
if (anyChange) {
  writeFileSync(STAMP, JSON.stringify({ version: 2, asc: ascVersion, modules: built }, null, 2) + '\n');
  console.log('[build-wasm] stamp 更新(gen/build-stamp.json v2 多模块形状)');
} else {
  console.log('[build-wasm] 全模块源未变,stamp 不动');
}
