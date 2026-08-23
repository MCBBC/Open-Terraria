// 一次性诊断（ZZZZZZ 批）：NOTRAPS #59 流级反事实——AB 尝试日志 + vanilla/JS 箱位
// 对账。钩 __swChestEv/__swChestDbg（BuriedChestsPass 常驻钩）+ UnifiedRandom 计数器。
// 用毕即删。
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG, UnifiedRandom } from '../src/core/rng';
import { TILE_DEFS, TILE_BY_KEY } from '../src/data/tiles';

const RUN = process.env.SW_Z2 === '1';
const D = process.env.SW_Z2_D ?? '/tmp/sw-slp/g-secret-notraps/';
const W = Number(process.env.SW_Z2_W ?? 4200), H = Number(process.env.SW_Z2_H ?? 1200);
const SEED = process.env.SW_Z2_SEED ?? '1896728457';
const FLAGS = (process.env.SW_Z2_FLAGS ?? 'noTraps').split(',').filter(Boolean);
const EVIL = Number(process.env.SW_Z2_EVIL ?? 1);
const STOP_LINE_LO = Number(process.env.SW_Z2_LO ?? 978), STOP_LINE_HI = Number(process.env.SW_Z2_HI ?? 980);

const CHEST_T = TILE_BY_KEY['chest']!;
const CHEST2_T = TILE_BY_KEY['v_467_chests_group_2']!;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const sh = TILE_DEFS[i]?.vanilla?.sheet; if (typeof sh === 'number') SHEET[i] = sh; }
const le16 = (p: string) => { const b = readFileSync(p); return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1); };
const u8 = (p: string) => new Uint8Array(readFileSync(p), 0);

(RUN ? it : it.skip)('zzzzzz AB attempt log', async () => {
  const g = globalThis as never as Record<string, unknown>;
  const evs: string[] = [];
  let rollN = 0;
  const urp = UnifiedRandom.prototype as unknown as Record<string, (...a: never[]) => number>;
  for (const m of ['next', 'nextInt', 'nextIntRange'] as const) {
    const o = urp[m]!;
    urp[m] = function (this: unknown, ...a: never[]) { rollN++; (globalThis as never as Record<string, number>).__swRollN = rollN; return o.apply(this, a); };
  }
  g.__swChestEv = (p: string, i: number, j: number, x?: number) => {
    if (p === 'ab') evs.push(`AB#${evs.length + 1} @(${i},${j}) roll=${x}`);
    else evs[evs.length - 1] += ` → ${x === 1 ? 'OK' : 'FAIL'}`;
  };
  g.__swChestDbg = (i: number, gy: number, why: string) => {
    evs[evs.length - 1] += ` [${why} gy=${gy}]`;
  };
  const hst: string[] = [];
  g.__swHouseEv = (phase: string, x: number, y: number) => {
    hst.push(`${phase} (${x},${y}) roll=${rollN}`);
  };
  g.__swHouseStage = (tag: string, a: number, b: number, c: number, d: number) => {
    hst.push(`stage ${tag} (${a},${b}) c=${c} roll=${d}`);
  };
  let store: { type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array; liquidType: Uint8Array } | null = null;
  let stopped = false;
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    if (store && !stopped) {
      const stack = new Error().stack ?? '';
      const m = stack.match(/WorldGen\.ts:(\d+):\d+/);
      if (m && Number(m[1]) >= STOP_LINE_LO && Number(m[1]) <= STOP_LINE_HI) stopped = true;
    }
    return oReseed.call(this, s);
  };
  const seedFlags: Record<string, boolean> = {};
  for (const f of FLAGS) seedFlags[f] = true;
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
      seedFlags: Object.keys(seedFlags).length ? seedFlags : undefined,
      onWorldPartial: (w) => {
        if (!store) store = w.store as never;
        else if (stopped) throw new Error('__STOP__');
      },
    });
  } catch (e) {
    if (!(e instanceof Error && e.message.includes('__STOP__'))) console.log('[warn] end:', (e as Error).message);
  } finally {
    RNGp.reseed = oReseed;
    for (const m of ['next', 'nextInt', 'nextIntRange'] as const) delete urp[m];
    delete g.__swChestEv; delete g.__swChestDbg;
  }
  if (!store) { console.log('[probe] no store'); return; }
  // JS 箱位（21/467）
  const jsChests: string[] = [];
  const st = store;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if ((st.flags[i]! & 1) && (st.type[i] === CHEST_T || st.type[i] === CHEST2_T)) jsChests.push(`${x},${y}:${st.type[i] === CHEST_T ? 21 : 467}`);
  }
  // vanilla 059 箱位
  const nm = readdirSync(D).find(f => f.startsWith('059_') && f.endsWith('.typ'))!;
  const vt = le16(`${D}${nm.replace('.typ', '')}.typ`), va = u8(`${D}${nm.replace('.typ', '')}.act`);
  const vanChests: string[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (va[i] && (vt[i] === 21 || vt[i] === 467)) vanChests.push(`${x},${y}:${vt[i] === 21 ? 21 : 467}`);
  }
  const vanSet = new Set(vanChests.map(c => c.split(':')[0]));
  const jsSet = new Set(jsChests.map(c => c.split(':')[0]));
  const vanOnly = vanChests.filter(c => !jsSet.has(c.split(':')[0]));
  const jsOnly = jsChests.filter(c => !vanSet.has(c.split(':')[0]));
  console.log(`[chests] van=${vanChests.length} js=${jsChests.length} vanOnly=${vanOnly.length} jsOnly=${jsOnly.length}`);
  console.log('[vanOnly first 20]', vanOnly.slice(0, 20).join(' '));
  console.log('[jsOnly first 20]', jsOnly.slice(0, 20).join(' '));
  console.log(`[attempts] total=${evs.length}`);
  const fails = evs.filter(e => e.endsWith('FAIL') || e.includes('→ FAIL'));
  console.log(`[fails] ${fails.length}`);
  for (const f of fails.slice(0, 40)) console.log('  ', f);
  writeFileSync('/tmp/zzzzzz-ab.log', evs.join('\n'));
  writeFileSync('/tmp/zzzzzz-house.log', hst.join('\n'));
}, 600_000);
import { writeFileSync } from 'node:fs';
