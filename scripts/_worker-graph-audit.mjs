// 一次性诊断（纯 node,静态 import 图追踪,无需 vite/dev server）:
// 判定 src/workers/{LightWorker,WaveWorker,BakeWorker}.ts 的传递 import 图是否
// 回连页面入口（main.ts / mainFlow.ts / core/Game.ts）,以及图内含 DOM 触点/游戏
// boot 签名的模块。用法: node scripts/_worker-graph-audit.mjs
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const EXTS = ['.ts', '.mts', '.mjs', '.js', '.tsx', '.json'];

function resolveSpec(fromFile, spec) {
  if (!spec.startsWith('.') && !spec.startsWith('/')) return { external: spec };
  const base = spec.startsWith('/')
    ? join(ROOT, spec)
    : resolve(dirname(fromFile), spec);
  for (const e of EXTS) if (existsSync(base + e) && !existsSync(base) ) return { file: base + e };
  if (existsSync(base) && !existsSync(join(base, '.'))) {
    // 目录:试 index.ts
    for (const e of EXTS) if (existsSync(join(base, 'index' + e))) return { file: join(base, 'index' + e) };
  }
  for (const e of EXTS) if (existsSync(base + e)) return { file: base + e };
  return { missing: base };
}

// 静态 import / re-export 抽取(type-only 导入不入运行时图,单列统计)
function parseDeps(file) {
  const src = readFileSync(file, 'utf8');
  const rt = [], ty = [], dyn = [];
  // 单行/多行去注释(粗粒度,足够本判读)
  const clean = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const staticRe = /import\s+(type\s+)?([\s\S]*?)\s*from\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = staticRe.exec(clean))) {
    // 混合导入（{ A, type B }）是运行时导入——只有整句 `import type` 才不入图
    const isType = m[1] === 'type ';
    (isType ? ty : rt).push(m[3]);
  }
  const exportFromRe = /export\s+(type\s+)?([\s\S]*?)\s*from\s*['"]([^'"]+)['"]/g;
  while ((m = exportFromRe.exec(clean))) {
    const isType = m[1] === 'type ';
    (isType ? ty : rt).push(m[3]);
  }
  const dynRe = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = dynRe.exec(clean))) dyn.push(m[1]);
  // 裸 side-effect import: import './x';
  const seRe = /import\s+['"]([^'"]+)['"]/g;
  while ((m = seRe.exec(clean))) rt.push(m[1]);
  return { rt, ty, dyn };
}

function trace(entry) {
  const seen = new Map(); // file -> {via}
  const queue = [[entry, '(entry)']];
  const edges = [];
  const dynEdges = [];
  while (queue.length) {
    const [file, via] = queue.shift();
    if (seen.has(file)) continue;
    seen.set(file, via);
    const { rt, ty, dyn } = parseDeps(file);
    for (const spec of rt) {
      const r = resolveSpec(file, spec);
      if (r.external || r.missing) { edges.push([file, `?${r.external ?? r.missing}`]); continue; }
      edges.push([file, r.file]);
      queue.push([r.file, file]);
    }
    for (const spec of dyn) {
      const r = resolveSpec(file, spec);
      dynEdges.push([file, r.file ?? `?${r.external ?? r.missing}`]);
    }
  }
  return { seen, edges, dynEdges };
}

const PAGE_ENTRIES = ['main.ts', 'mainFlow.ts'].map((f) => join(ROOT, f));
const GAME_CORE = ['core/Game.ts', 'core/GameTime.ts'].map((f) => join(ROOT, f));
const WORKERS = ['LightWorker.ts', 'WaveWorker.ts', 'BakeWorker.ts', 'save.worker.ts', 'worldGen.worker.ts', 'asset-warm.worker.ts']
  .map((f) => join(ROOT, 'workers', f))
  .concat([join(ROOT, 'net', 'asset-warm.worker.ts')]);

// DOM/游戏 boot 签名(模块级可执行触点)
const BOOT_SIGNS = [
  [/document\./, 'document.'],
  [/requestAnimationFrame/, 'requestAnimationFrame'],
  [/new Game\(/, 'new Game('],
  [/getElementById/, 'getElementById'],
  [/window\./, 'window.'],
  [/createFlow\(/, 'createFlow('],
];

for (const w of WORKERS) {
  if (!existsSync(w)) continue;
  const { seen, edges, dynEdges } = trace(w);
  console.log(`\n═══ ${w.replace(ROOT + '/', '')} ═══  运行时模块 ${seen.size} 个,动态 import ${dynEdges.length}`);
  // 回连检查
  const hits = [...seen.keys()].filter((f) => PAGE_ENTRIES.includes(f) || f.endsWith('/main.ts') || f.endsWith('/mainFlow.ts'));
  console.log(hits.length ? `  ❌ 回连页面入口: ${hits.join(', ')}` : `  ✓ 无 main.ts/mainFlow.ts 回连`);
  const gameHits = [...seen.keys()].filter((f) => GAME_CORE.some((g) => f === g));
  console.log(gameHits.length ? `  ⚠ 含游戏核心: ${gameHits.map((f) => f.replace(ROOT + '/', '')).join(', ')}` : `  ✓ 无 core/Game.ts / core/GameTime.ts`);
  // DOM/boot 签名扫描(逐模块)
  const signHits = [];
  for (const f of seen.keys()) {
    const src = readFileSync(f, 'utf8');
    for (const [re, name] of BOOT_SIGNS) {
      if (re.test(src)) signHits.push(`${f.replace(ROOT + '/', '')} ← ${name}`);
    }
  }
  if (signHits.length) {
    console.log(`  ⚠ DOM/boot 签名 ${signHits.length} 模块:`);
    for (const s of signHits.slice(0, 25)) console.log(`     ${s}`);
    if (signHits.length > 25) console.log(`     …共 ${signHits.length}`);
  } else {
    console.log(`  ✓ 无 DOM/boot 签名`);
  }
  if (dynEdges.length) console.log(`  动态 import: ${dynEdges.map(([a, b]) => `${a.replace(ROOT + '/', '')}→${String(b).replace(ROOT + '/', '')}`).join('; ')}`);
  // 图尺寸 top10
  const sizes = [...seen.keys()].map((f) => [f, readFileSync(f, 'utf8').length]).sort((a, b) => b[1] - a[1]).slice(0, 5);
  console.log(`  图内最大模块: ${sizes.map(([f, n]) => `${f.replace(ROOT + '/', '')}(${(n / 1024).toFixed(0)}KB)`).join(', ')}`);
}
