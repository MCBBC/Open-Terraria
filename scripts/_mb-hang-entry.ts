// ★626e:mod 地形+vanilla MicroBiomes 卡死 node 复现(诊断报告抓栈)
// 运行:esbuild 打包→node --report-on-signal=SIGUSR2 /tmp/mb-hang.mjs;停摆后
//      kill -USR2 <pid> → /tmp/mb-report/report.*.json 内 jsStack=真凶栈
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// esbuild 打包后 bundle 内 import.meta.url 指向 /tmp/mb-hang.mjs——根锚定走
// SW_GAME_ROOT 环境变量(跑法:SW_GAME_ROOT=<game 绝对路径> node /tmp/mb-hang.mjs)
const root = process.env.SW_GAME_ROOT ?? process.cwd();

// ---- mod 数据 globals(重演 golden test 装配) ----
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
const modData: Record<string, unknown> = {};
const schematics: Record<string, unknown> = {};
const contentDir = join(root, 'mods/calamity/content');
for (const f of readdirSync(contentDir)) {
  if (f.endsWith('.json')) {
    try { modData[f.replace('.json', '')] = JSON.parse(readFileSync(join(contentDir, f), 'utf8')); } catch { /* skip */ }
  }
}
const schDir = join(root, 'mods/calamity/schematics');
try {
  for (const f of readdirSync(schDir)) {
    if (f.endsWith('.json')) {
      try { schematics[f.replace('.json', '')] = JSON.parse(readFileSync(join(schDir, f), 'utf8')); } catch { /* skip */ }
    }
  }
} catch { /* 无目录 */ }
// mod tile 注册(ids 1030+,与浏览器 loader 分配同型)
const tileDir = join(contentDir, 'tiles');
let nextId = 1030;
for (const f of readdirSync(tileDir).sort()) {
  if (!f.endsWith('.json')) continue;
  const k = `mod_calamity_${f.replace('.json', '')}`;
  if (TILE_BY_KEY[k] === undefined) TILE_BY_KEY[k] = nextId++;
}

const g = globalThis as Record<string, unknown>;
g.__calamityModData = modData;
g.__calamitySchematics = schematics;
g.__calamityTileDefs = TILE_DEFS;
g.__calamityTileIdByKey = TILE_BY_KEY;
g.__calamityGenTiles = {};
g.__calamityLoaded = true;

// ---- mod bundle eval(重演 worker 两步) ----
const noop = () => {};
const stubSw: Record<string, unknown> = new Proxy({}, {
  get: (_t, prop: string) => {
    if (prop === 'registerGenPass') return (name: string, fn: (...a: unknown[]) => void) => {
      modPasses.push({ name, fn });
      console.log(`[repro] gen pass 注册: ${name}`);
    };
    if (prop === 'rollPrefixFor') return () => 0;
    if (prop === 'log') return (...a: unknown[]) => console.log('[mod:gen]', ...a);
    if (prop === 'config') return { get: () => false, set: () => {} };
    return noop;
  },
  has: () => true,
});
const modPasses: Array<{ name: string; fn: (...a: unknown[]) => void }> = [];
const src = readFileSync(join(root, 'mods/calamity/scripts/main.js'), 'utf8');
const tail = /export\s*\{\s*(\w+)\s+as\s+default\s*\}\s*;?\s*$/.exec(src);
const cjs = src.replace(/export\s*\{[^}]*\}\s*;?\s*$/, '');
const entryName = tail ? tail[1] : 'main';
const entry = new Function('sw', cjs + '\nreturn ' + entryName + ';')(stubSw) as (sw: unknown) => void;
entry(stubSw);
console.log(`[repro] mod bundle eval 完成,gen passes=${modPasses.length}`);

// ---- 生成(注册 mod passes 后走标准 generateWorld=与 worker 域同构) ----
import { generateWorld } from '../src/world/gen/WorldGen';
console.log('[repro] generateWorld 开始', new Date().toISOString());
const t0 = Date.now();
const world = await generateWorld(
  { width: 4200, height: 1200, seedText: '', name: 'mbhang' },
  (label, p) => {
    const pct = (p * 100).toFixed(1);
    if (p > lastP + 0.005 || label !== undefined) console.log(`[repro] ${new Date().toISOString()} +${((Date.now() - t0) / 1000).toFixed(0)}s label=${label ?? ''} p=${pct}%`);
    lastP = p;
  },
);
let lastP = 0;
console.log(`[repro] 生成完成 ${((Date.now() - t0) / 1000).toFixed(0)}s`);
// mod tile 扫描
const st = world.store as { type: Uint16Array };
let sulph = 0;
const sid = TILE_BY_KEY['mod_calamity_sulphurous_sand'] ?? -1;
for (let i = 0; i < st.type.length; i++) if (st.type[i] === sid) sulph++;
console.log('[repro] sulphurous_sand:', sulph);
process.exit(0);
