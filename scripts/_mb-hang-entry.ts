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
// ★693b:mod tile 注册(双环形态=工作态;单环 registerModTile 曾因字段校验全 throw)
const tileDir = join(contentDir, 'tiles');
let nextId = 1030;
for (const f of readdirSync(tileDir).sort()) {
  if (!f.endsWith('.json')) continue;
  const k = `mod_calamity_${f.replace('.json', '')}`;
  if (TILE_BY_KEY[k] === undefined) TILE_BY_KEY[k] = nextId++;
}
// content json 字段透传(chest 旗→TILE_DEFS.chest→FCP 箱保护);重复键=skip(幂等)
import { registerModTile as regTileFull } from '../src/data/tiles';
{
  let rid = 1030;
  for (const f of readdirSync(tileDir).sort()) {
    if (!f.endsWith('.json')) continue;
    try {
      const j = JSON.parse(readFileSync(join(tileDir, f), 'utf8')) as Record<string, unknown>;
      regTileFull({ key: `mod_calamity_${f.replace('.json', '')}`, name: '', chest: j.chest === true, solid: j.solid === true, framed: j.framed === true, w: (j.w as number) ?? 1, h: (j.h as number) ?? 1 }, rid++);
    } catch { /* skip */ }
  }
}

const g = globalThis as Record<string, unknown>;
g.__calamityModData = modData;
g.__calamitySchematics = schematics;
g.__calamityTileDefs = TILE_DEFS;
g.__calamityTileIdByKey = TILE_BY_KEY;
g.__calamityGenTiles = {};
g.__calamityLoaded = true;

// ---- mod bundle eval(重演 worker 两步) ----
// ★registerGenPass 必须用 WorldGen 的真注册器(worker 域 stub 同款)——推本地数组=
//  genPasses 空=passes 不跑=复现不出卡死
import { registerGenPass } from '../src/world/gen/WorldGen';
const noop = () => {};
const stubSw: Record<string, unknown> = new Proxy({}, {
  get: (_t, prop: string) => {
    if (prop === 'registerGenPass') return (name: string, fn: (...a: unknown[]) => void, opts?: Record<string, unknown>) => {
      try {
        registerGenPass({
          name, ...(opts ?? {}),
          fn: (...a: unknown[]) => {
            const t0 = Date.now();
            console.log(`[repro] ▶ mod pass 开始: ${name}`);
            fn(...a);
            const vc = TILE_BY_KEY['mod_calamity_void_chest'] ?? -1;
            const st2 = (globalThis as { __vcStore?: { type: Uint16Array } }).__vcStore;
            let vcN = -1;
            if (st2 && vc >= 0) { vcN = 0; for (let i = 0; i < st2.type.length; i++) if (st2.type[i] === vc) vcN++; }
            console.log(`[repro] ✓ mod pass 完成: ${name} ${Date.now() - t0}ms void_chest=${vcN} atc=${(() => { const a = TILE_BY_KEY["mod_calamity_abyss_treasure_chest"] ?? -1; if (a < 0 || !st2) return -1; let n = 0; for (let i = 0; i < st2.type.length; i++) if (st2.type[i] === a) n++; return n; })()}`);; 
            if (name === 'Abyss' && st2) { console.log(`[abyss-probe] (170,850)=${st2.type[850 * 4200 + 170]} (170,851)=${st2.type[851 * 4200 + 170]} flags=${st2.flags ? st2.flags[850 * 4200 + 170] : '?'}`); }
          },
        } as never);
        modPasses.push({ name, fn });
        console.log(`[repro] gen pass 注册: ${name}${opts ? ' ⚓' + JSON.stringify(opts) : ''}`);
      } catch (e) { console.log(`[repro] 注册失败 ${name}: ${e}`); }
    };
    if (prop === 'rollPrefixFor') return () => 0;
    if (prop === 'log') return (...a: unknown[]) => console.log('[mod:gen]', ...a);
    if (prop === 'config') return { get: () => false, set: () => {} };
    return noop;
  },
  has: () => true,
});
const modPasses: Array<{ name: string; fn: (...a: unknown[]) => void }> = [];
// ★626f:挂 __swSeg 段探针(MicroBiomes 全程插桩)+mod pass 起止打印
(g as { __swSeg?: (name: string, detail?: unknown) => void }).__swSeg = (name, detail) => {
  console.log(`[seg] ${name}`, detail !== undefined && typeof detail !== 'object' ? JSON.stringify(detail) : '');
};
// ★626g:沉降相位+逐迭代探针(冻结点分辨:quickWater/waterCheck/轮环+活量走势)
let tickN = 0;
(g as { __swSettleMark?: (s: string) => void }).__swSettleMark = (s) => {
  console.log(`[settle] 相位: ${s}`);
};
(g as { __swI159OT?: (x: number, y: number) => void }).__swI159OT = (x, y) => {
  const st = g as { __otn?: number };
  st.__otn = (st.__otn ?? 0) + 1;
  if (st.__otn % 200 === 0) console.log(`[piles-ot] #${st.__otn} ${x},${y}`);
};
(g as { __swI148Att?: (x: number, y: number, bl: number, wl: number) => void }).__swI148Att = (x, y, bl, wl) => {
  const st = g as { __attn?: number };
  st.__attn = (st.__attn ?? 0) + 1;
  if (st.__attn % 200 === 0) console.log(`[piles-att] #${st.__attn} ${x},${y} bl=${bl} wl=${wl}`);
};
(g as { __swSettleTick?: (r: number, it: number, liq: number, max: number) => void }).__swSettleTick = (r, it, liq, max) => {
  if (++tickN % 200000 === 0) console.log(`[settle] round=${r} iter=${it} liq=${liq} maxIter=${max}`);
};
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
let lastP = 0;
const SEED = process.env.SW_SEED ?? '9293480';   // ★金标固定种子(与 vanilla 金标同族)
const world = await generateWorld(
  {
    width: 4200, height: 1200, seedText: SEED, name: 'mbhang', evil: 0,
    onWorldPartial: (w2, passIndex, passName) => {
      (globalThis as { __vcStore?: unknown }).__vcStore = w2.store;
      console.log(`[repro] pass 完成 #${passIndex} ${passName} +${((Date.now() - t0) / 1000).toFixed(1)}s`);
    },
  },
  (label, p) => {
    const pct = (p * 100).toFixed(1);
    if (p > lastP + 0.005 || label !== undefined) console.log(`[repro] ${new Date().toISOString()} +${((Date.now() - t0) / 1000).toFixed(0)}s label=${label ?? ''} p=${pct}%`);
    lastP = p;
  },
);
console.log(`[repro] 生成完成 ${((Date.now() - t0) / 1000).toFixed(0)}s`);
// mod tile 扫描
const st = world.store as { type: Uint16Array; wall: Uint16Array };
// ★金标采集:固定种子→签名 tile 精确计数+全图 FNV-1a(type/wall)
const SIGNATURE = [
  'sulphurous_sand', 'abyss_gravel', 'sulphurous_shale', 'voidstone', 'scoria_ore',
  'brimstone_slag', 'infernal_suevite', 'aerialite_ore_disenchanted', 'astral_dirt',
  'abyss_treasure_chest', 'void_chest', 'astral_chest_locked',
];
const counts: Record<string, number> = {};
for (const k of SIGNATURE) {
  const id = TILE_BY_KEY[`mod_calamity_${k}`] ?? -1;
  let n = 0;
  if (id >= 0) for (let i = 0; i < st.type.length; i++) if (st.type[i] === id) n++;
  counts[k] = n;
}
const fnv = (arr: Uint16Array): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < arr.length; i++) {
    h ^= arr[i] & 0xff; h = Math.imul(h, 0x01000193) >>> 0;   // ★imul=精确 32 位(×有双精度舍入,曾与测试面分歧)
    h ^= (arr[i] >>> 8) & 0xff; h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
};
console.log('[golden] seed =', process.env.SW_SEED ?? '9293480');
console.log('[golden] counts =', JSON.stringify(counts));
console.log('[golden] fnvType =', fnv(st.type), ' fnvWall =', fnv(st.wall));
process.exit(0);
