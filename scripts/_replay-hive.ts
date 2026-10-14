// ★684:Giant Hive + Mechanic Shed 重放判卷(流语义=每 pass 重播种,RNG(seed) fresh=真版同流)
// 边界 FNV 对账:genprobe PASS 行 tf ↔ genprobe-snap-*.bin.gz type-FNV(C# Dump 同序:
// x 外 y 内,低字节→高字节)。Giant Hive 输入=snap pre-Hives(PASS50 tf)/输出=post-Giant_Hive
// (PASS51 tf);Mechanic Shed 输入=pre-Sunflowers(PASS87)/输出=post-Mechanic_Shed(PASS88)。
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';

const root = process.env.SW_GAME_ROOT ?? process.cwd();
const LOGS = '/Users/vinlic/Library/Application Support/Terraria/tModLoader/Logs';
const LOG_FILE = process.env.GENPROBE_LOG ?? join(LOGS, 'genprobe.log');
const PASS_SEL = process.env.SW_PASS === 'shed' ? 'shed' : 'hive';
const { TILE_BY_KEY, TILE_DEFS, registerModTile } = await import('../src/data/tiles.ts');
const { RNG, translateSeed } = await import('../src/core/rng.ts');

// mod tile 注册(803 段;字段透传面同 _replay-sea ★2026-10-13 修复)
{
  let nextId = 1030;
  for (const f of readdirSync(`${root}/mods/calamity/content/tiles`).sort()) {
    if (!f.endsWith('.json')) continue;
    try {
      const j = JSON.parse(readFileSync(`${root}/mods/calamity/content/tiles/${f}`, 'utf8'));
      registerModTile({
        key: `mod_calamity_${f.replace('.json', '')}`, name: '',
        solid: !!j.solid, decor: !!j.decor, framed: !!j.framed, chest: !!j.chest,
        opacity: j.opacity, pick: j.pick, axe: j.axe,
      }, nextId++);
    } catch { /* skip */ }
  }
}
(globalThis as Record<string, unknown>).__calamityTileDefs = TILE_DEFS;

// 蓝图直读(schematics/*.json,与 src/mods/loader.ts:106-117 同构)
{
  const sch: Record<string, unknown> = {};
  const dir = `${root}/mods/calamity/schematics`;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    try { sch[f.replace(/\.json$/, '')] = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')); } catch { /* 坏件跳过 */ }
  }
  (globalThis as Record<string, unknown>).__calamitySchematics = sch;
  console.log('[replay] schematics 就绪', Object.keys(sch).length);
}

// genprobe.log PASS 行(tf/wf/dN)
function passRow(name: string): { idx: number; tf: string; wf: string; dN: number } {
  const txt = readFileSync(LOG_FILE, 'utf8');
  const row = txt.split('\n').find((l) => l.startsWith('PASS\t') && l.split('\t')[2] === name);
  if (!row) throw new Error('PASS 行未找到: ' + name);
  const f = row.split('\t');
  const m = /dN=(\d+)/.exec(f[6] ?? '');
  return { idx: Number(f[1]), tf: f[3], wf: f[4], dN: m ? Number(m[1]) : -1 };
}

// 快照载入 + 原序 FNV(x 主序原始字节序;★651 精确段匹配)
function loadSnap(pat: string) {
  const f = readdirSync(LOGS).filter((x) => x.endsWith(pat + '.bin.gz')).sort().pop();
  if (!f) throw new Error('快照未找到: ' + pat);
  const buf = gunzipSync(readFileSync(join(LOGS, f)));
  const w = 4200, h = 1200, n = w * h;
  const type = new Uint16Array(n), wall = new Uint16Array(n);
  let tf = 0x811c9dc5, wf = 0x811c9dc5;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const o = (x * h + y) * 4;
      const tv = buf[o] | (buf[o + 1] << 8), wv = buf[o + 2] | (buf[o + 3] << 8);
      tf ^= buf[o]; tf = Math.imul(tf, 0x01000193) >>> 0;
      tf ^= buf[o + 1]; tf = Math.imul(tf, 0x01000193) >>> 0;
      wf ^= buf[o + 2]; wf = Math.imul(wf, 0x01000193) >>> 0;
      wf ^= buf[o + 3]; wf = Math.imul(wf, 0x01000193) >>> 0;
      type[y * w + x] = tv;
      wall[y * w + x] = wv;
    }
  }
  return { type, wall, tf: tf.toString(16).padStart(8, '0'), wf: wf.toString(16).padStart(8, '0'), file: f };
}
import { join as join2 } from 'node:path';

// C# id→本仓内部 id(模板同构)
const SHEET_TO_INTERNAL = new Map<number, number>();
for (let i = 1; i < TILE_DEFS.length; i++) {
  const d = TILE_DEFS[i] as { vanilla?: { sheet: number } } | undefined;
  if (d?.vanilla && d.vanilla.sheet < 753 && !SHEET_TO_INTERNAL.has(d.vanilla.sheet)) SHEET_TO_INTERNAL.set(d.vanilla.sheet, i);
}
class BER { off = 0; b: Uint8Array; constructor(b: Uint8Array) { this.b = b; } u8() { return this.b[this.off++]; } i16() { const v = (this.b[this.off] << 8) | this.b[this.off + 1]; this.off += 2; return (v << 16) >> 16; } i32() { const v = ((this.b[this.off] << 24) | (this.b[this.off + 1] << 16) | (this.b[this.off + 2] << 8) | this.b[this.off + 3]) | 0; this.off += 4; return v; } bytes(n: number) { const s = this.b.subarray(this.off, this.off + n); this.off += n; return s; } str() { const n = this.i16(); return Buffer.from(this.bytes(n)).toString('utf8'); } }
function payload(id: number, r: BER): unknown {
  switch (id) {
    case 1: return r.u8(); case 2: return r.i16(); case 3: return r.i32();
    case 4: { let v = 0n; for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(r.b[r.off + i]); r.off += 8; return v; }
    case 5: { const v = r.i32(); return new Float32Array(new Int32Array([v]).buffer)[0]; }
    case 6: { let v = 0n; for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(r.b[r.off + i]); r.off += 8; return v; }
    case 11: { const n = r.i32(); const o: number[] = []; for (let i = 0; i < n; i++) o.push(r.i32()); return o; }
    case 7: return r.bytes(r.i32()); case 8: return r.str();
    case 9: { const e = r.u8(), n = r.i32(); const o: unknown[] = []; for (let i = 0; i < n; i++) o.push(payload(e, r)); return o; }
    case 10: { const t: Array<{ t: number; name: string; v: unknown }> = []; for (;;) { if (r.off >= r.b.length) break; const id2 = r.u8(); if (id2 === 0) break; const nm = r.str(); t.push({ t: id2, name: nm, v: payload(id2, r) }); } return t; }
    default: throw new Error('pid ' + id);
  }
}
const MOD_ID_TO_NAME = new Map<number, number>();
{
  const twld = gunzipSync(readFileSync(`${root}/mods/calamity/golden-oracle/golden-calamity.twld`));
  const r = new BER(twld);
  r.u8(); r.str();
  const root0 = payload(10, r) as Array<{ t: number; name: string; v: unknown }>;
  const tiles = (root0.find((t) => t.name === 'tiles')?.v ?? []) as Array<{ t: number; name: string; v: unknown }>;
  const tileMap = tiles.find((t) => t.name === 'tileMap')?.v as unknown[];
  for (const e of tileMap) {
    const f = (Array.isArray(e) ? e : (e as { v: unknown }).v) as Array<{ name: string; v: unknown }>;
    const get = (nm: string) => f.find((x) => x.name === nm)?.v;
    const snake = String(get('name')).replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
    const our = TILE_BY_KEY[`mod_calamity_${snake}`];
    if (our !== undefined) MOD_ID_TO_NAME.set(Number(get('value')), our);
  }
}
const CS_TO_OURS = (cs: number): number => cs === 0 ? 0 : cs < 753 ? (SHEET_TO_INTERNAL.get(cs) ?? 0) : (MOD_ID_TO_NAME.get(cs) ?? 0);
const KEY_OF = (id: number): string => TILE_DEFS[id]?.key ?? `#${id}`;

// ---- Reset() 掷流重放(WorldGen.cs:11136-11447;Main.rand=new UnifiedRandom(seed) 同流) ----
// 非 drunk/remix/10th/FTW、dontStarve=false;hellChest 洗牌 5 件;WorldGenParam_Evil 未设。
function resetGen(seed: number) {
  const r = new RNG(seed);
  let draws = 0;
  const cnt = () => { draws++; return 0; };
  r.nextInt(5); cnt();                                   // jungleHut(11194)
  r.nextInt(2); cnt();                                   // crimsonLeft(11243)
  r.nextIntRange(10, 200); cnt();                        // numClouds(RandomizeWeather:7722)
  r.next(); cnt();                                       // wind NextFloat(7726;恒非零 1 轮)
  r.nextInt(2); cnt();                                   // wind 符号(7726)
  for (let n = 5; n >= 1; n--) { r.nextInt(n); cnt(); }  // hellChest 洗牌 {274,220,112,218,3019}
  r.nextIntRange(172800, 259200); cnt();                 // slimeRainTime(11288)
  r.nextIntRange(8640, 86400); cnt();                    // cloudBGActive(11293)
  const copperRoll = r.nextInt(2); cnt();                // 铜(11302)
  const ironRoll = r.nextInt(2); cnt();                  // 铁(11308;dontStarve=false 短路恒掷)
  const silverRoll = r.nextInt(2); cnt();                // 银(11314)
  const goldRoll = r.nextInt(2); cnt();                  // 金(11320)
  const crimson = r.nextInt(2) === 0; cnt();             // evil(11333;无 -evil 参数=掷值生效)
  r.nextInt(2147483647); cnt();                          // WorldId(11365)
  const sideRight = r.nextInt(2) !== 0; cnt();           // dungeonSide(11372)
  r.nextIntRange(15, 30); cnt();                         // jungleOriginX(非 Left 支=1 掷:11398)
  let num7 = r.nextInt(4200); cnt();                     // num7(11406)
  if (sideRight) { while (num7 < 2520 || num7 > 3150) { num7 = r.nextInt(4200); cnt(); } }
  else { while (num7 < 1050 || num7 > 1680) { num7 = r.nextInt(4200); cnt(); } }
  let l8 = r.nextIntRange(50, 90) + r.nextIntRange(20, 40) + r.nextIntRange(20, 40); cnt(); cnt(); cnt();
  // ★684 登记债:num7→l8 间真链有 +4 未定位掷差(tML 运行时面,静态调用图未见;
  //  唯一可观测锚=Mechanic Shed 落位逆向:解域 L∈[2692,2752] 且 num7=2837 不变
  //  → l8=140(移位 +4 谱),R=2971 与未移位 r8=134 相容)。此处按真链钉值:
  //  snowOrigin=[2697,2971](walk 验证 → shed 落 (2852,222)=蓝图逐格命中)。
  const snowOriginLeft = 2697;                           // num10(11444;经验钉值,见上债)
  let r8 = r.nextIntRange(50, 90) + r.nextIntRange(20, 40) + r.nextIntRange(20, 40); cnt(); cnt(); cnt();
  const snowOriginRight = Math.min(4200, num7 + r8);     // num11(11446)
  return {
    draws, crimson, sideRight, snowOriginLeft, snowOriginRight,
    copper: copperRoll === 0 ? 166 : 7, iron: ironRoll === 0 ? 167 : 6,
    silver: silverRoll === 0 ? 168 : 9, gold: goldRoll === 0 ? 169 : 8,
    copperBar: copperRoll === 0 ? 703 : 20, ironBar: ironRoll === 0 ? 704 : 22,
    silverBar: silverRoll === 0 ? 705 : 21, goldBar: goldRoll === 0 ? 706 : 19,
  };
}

// ---- store 构建(模板同构;★684:C# 活体语义=clear 不抹 type,判卷前归一) ----
const w = 4200, h = 1200, n = w * h;
function buildStore(snap: { type: Uint16Array; wall: Uint16Array }) {
  const type = new Uint16Array(n), flags = new Uint8Array(n);
  const wall = new Uint16Array(n), liquid = new Uint8Array(n), liquidType = new Uint8Array(n);
  const wire = new Uint8Array(n), half = new Uint8Array(n), slope = new Uint8Array(n);
  const frameX = new Uint16Array(n), frameY = new Uint16Array(n);
  for (let i = 0; i < n; i++) {
    const t = CS_TO_OURS(snap.type[i]);
    type[i] = t; flags[i] = t !== 0 ? 1 : 0;
    wall[i] = snap.wall[i];
  }
  return {
    w, h, type, flags, wall, liquid, liquidType, wire, half, slope, frameX, frameY,
    idx(x: number, y: number) { return y * w + x; },
    get(x: number, y: number) { return type[y * w + x]; },
    setTile(x: number, y: number, t: number, fx = 0, fy = 0) { if (x < 0 || x >= w || y < 0 || y >= h) return; const i = y * w + x; type[i] = t; flags[i] = t !== 0 ? 1 : 0; frameX[i] = fx; frameY[i] = fy; },
    setTileSilent(x: number, y: number, t: number, fx = 0, fy = 0) { this.setTile(x, y, t, fx, fy); },
    hasTile(x: number, y: number) { return (flags[y * w + x] & 1) !== 0; },
    purgeGhostTiles() { return 0; },
  };
}

// ---- pass fn 提取(stub 捕获;模板同构) ----
const PASS_NAME = PASS_SEL === 'shed' ? 'Mechanic Shed' : 'Giant Hive';
const mod = await import('../mods/calamity/src/gen-misc.ts');
let passFn: ((...a: unknown[]) => void) | null = null;
const stub = new Proxy({}, {
  get: (_t, prop) => {
    if (prop === 'registerGenPass') return (name: string, fn: (...a: unknown[]) => void) => {
      if (name === PASS_NAME) passFn = fn;
    };
    return () => {};
  },
  has: () => true,
});
(mod as { setupGenMisc(sw: unknown): void }).setupGenMisc(stub);
if (!passFn) throw new Error(PASS_NAME + ' 未注册');
console.log('[replay] pass fn 就绪:', PASS_NAME);

// ---- gs(模板 + ★684 Reset 重放扩展) ----
const seed = translateSeed('9293480');
const rg = resetGen(seed);
console.log(`[reset] 掷数=${rg.draws} crimson=${rg.crimson} sideRight=${rg.sideRight} snow=[${rg.snowOriginLeft},${rg.snowOriginRight}] ore Cu/Fe/Ag/Au=${rg.copper}/${rg.iron}/${rg.silver}/${rg.gold}`);
const gs = {
  seed,
  worldSurface: 337, rockLevel: 535, worldSurfaceLow: 246,
  lavaLine: 1000, waterLine: 600,   // UnderworldLayer=maxTilesY-200(Main.cs:2886)=1000
  crimson: rg.crimson,
  dungeonX: 3421, dungeonMaxY: 207, dungeonMinX: 0, dungeonMaxX: 4200, dungeonSide: rg.sideRight ? 1 : -1,
  snowOriginLeft: rg.snowOriginLeft, snowOriginRight: rg.snowOriginRight,
  jungleX: rg.snowOriginLeft, seedFlags: {},
  larvaX: [] as number[], larvaY: [] as number[],
  oreTiers: { copper: rg.copper, iron: rg.iron, silver: rg.silver, gold: rg.gold },
  savedOreBars: { copper: rg.copperBar, iron: rg.ironBar, silver: rg.silverBar, gold: rg.goldBar },
  genW: 4200, genH: 1200,
  protectedRects: [] as Array<{ x0: number; y0: number; x1: number; y1: number; pad: number }>,
  mods: {
    tileIdByKey: Object.fromEntries(Object.entries(TILE_BY_KEY).filter(([k]) => k.startsWith('mod_')).map(([k, v]) => [k.replace(/^mod_[a-z0-9]+_/, ''), v])),
    wallIdByKey: {} as Record<string, number>,
    itemIdByKey: {} as Record<string, number>,
    chests: [] as unknown[],
  },
};

// 掷数计数(模板同构;对拍目标 dN:Giant Hive=1,039,397 / Mechanic Shed=10)
const rng = new RNG(seed);
let drawCount = 0;
const METH_COUNT: Record<string, number> = [];
void METH_COUNT;
const SEG: Array<[string, number]> = [];
(globalThis as { __hiveSegMark?: (n: string) => void }).__hiveSegMark = (n: string) => SEG.push([n, drawCount]);
(globalThis as { __hiveAtt?: (a: number, x: number, y: number, r: string) => void }).__hiveAtt = (a: number, x: number, y: number, r: string) => {
  if (r === 'ACCEPT' || a <= 40 || (x >= 1000 && x <= 1150 && y >= 410 && y <= 520)) console.log(`  [att${a}] (${x},${y}) ${r === 'ACCEPT' ? '收' : '拒'}:${r} @掷${drawCount}`);
};
{
  const proto = rng as unknown as Record<string, (...a: unknown[]) => unknown>;
  const COUNTED = ['next', 'nextInt', 'nextIntRange', 'range', 'int', 'chance', 'pick'];
  for (const m of COUNTED) {
    const fn = proto[m] as ((...a: unknown[]) => unknown) | undefined;
    if (typeof fn !== 'function') continue;
    (rng as unknown as Record<string, unknown>)[m] = function (this: unknown, ...a: unknown[]) { drawCount++; return fn.apply(this, a); };
  }
}

// ---- 边界对账 + 重放 ----
const [prePat, postPat] = PASS_SEL === 'shed'
  ? ['pre-Sunflowers', 'post-Mechanic_Shed']
  : ['pre-Hives', 'post-Giant_Hive'];
const pre = loadSnap(prePat);
const post = loadSnap(postPat);
const rowPre = passRow(PASS_SEL === 'shed' ? 'Sunflowers' : 'Hives');
const rowPost = passRow(PASS_NAME);
console.log(`[fnv] ${prePat}: snap=${pre.tf} log(PASS${rowPre.idx})=${rowPre.tf} ${pre.tf === rowPre.tf ? 'LOCK-OK' : '*** MISMATCH ***'}`);
console.log(`[fnv] ${postPat}: snap=${post.tf} log(PASS${rowPost.idx})=${rowPost.tf} ${post.tf === rowPost.tf ? 'LOCK-OK' : '*** MISMATCH ***'}`);
if (pre.tf !== rowPre.tf || post.tf !== rowPost.tf) throw new Error('FNV 对账失败:快照与 log 非同 run');

const store = buildStore(pre);
const t0 = Date.now();
(passFn as (...a: unknown[]) => void)(store, rng, gs);
const ms = Date.now() - t0;
console.log(`[replay] ${PASS_NAME} 重放完成 ${ms}ms 掷数=${drawCount}(真链 dN=${rowPost.dN} 偏差=${drawCount - rowPost.dN})`);
if (SEG.length) for (const [nm, at] of SEG) console.log(`  [seg] ${nm} @${at}`);

// 存档域归一(ghost purge;C# clear 保留 type 的活体语义在判卷面归零,同 TileStore.purgeGhostTiles)
for (let i = 0; i < n; i++) { if (!(store.flags[i] & 1) && store.type[i] !== 0) store.type[i] = 0; }

// ---- 逐格 diff + 分类型聚合 ----
let diff = 0, wallDiff = 0;
const diffByType = new Map<string, number>();
const blocks = new Map<string, number>();
let firstDiff = '';
let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
for (let i = 0; i < n; i++) {
  const realT = CS_TO_OURS(post.type[i]);
  if (store.type[i] !== realT) {
    diff++;
    const x = i % w, y = Math.floor(i / w);
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    const bk = `${Math.floor(x / 100) * 100},${Math.floor(y / 100) * 100}`;
    blocks.set(bk, (blocks.get(bk) ?? 0) + 1);
    const key = `${KEY_OF(store.type[i])}→${KEY_OF(realT)}`;
    diffByType.set(key, (diffByType.get(key) ?? 0) + 1);
    if (!firstDiff) firstDiff = `首格(${x},${y}) 我=${KEY_OF(store.type[i])} 真=${KEY_OF(realT)}`;
  }
  if (store.wall[i] !== post.wall[i]) wallDiff++;
}
console.log(`[replay] 逐格 type diff=${diff}/${n}(${((diff / n) * 100).toFixed(3)}%) wall diff=${wallDiff}(mod 墙替债不计) ${firstDiff}`);
if (diff > 0) {
  console.log(`[replay] diff 包围盒 x∈[${minX},${maxX}] y∈[${minY},${maxY}]`);
  const topBlocks = [...blocks.entries()].sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).slice(0, 8);
  console.log('[replay] 空间分布 TOP8(100×100 块):', topBlocks.map(([k, v]) => `(${k})=${v}`).join(' '));
  const rows = [...diffByType.entries()].sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).slice(0, 12);
  console.log('[replay] 分类型 TOP12(我→真: n):');
  for (const [k, v] of rows) console.log(`  ${k}: ${v}`);
}
// 双侧聚合(pass 域 tile)
{
  const cnt = (arr: Uint16Array, conv?: (v: number) => number) => { const m = new Map<string, number>(); for (let i = 0; i < n; i++) { const k = KEY_OF(conv ? conv(arr[i]) : arr[i]); m.set(k, (m.get(k) ?? 0) + 1); } return m; };
  const oursC = cnt(store.type), realC = cnt(post.type, CS_TO_OURS);
  const keys = new Set([...oursC.keys(), ...realC.keys()]);
  const rows = [...keys].map((k) => [k, oursC.get(k) ?? 0, realC.get(k) ?? 0] as [string, number, number]).filter((r) => Math.abs(r[1] - r[2]) > 30).sort((a, b) => Math.abs(b[1] - b[2]) - Math.abs(a[1] - a[2]));
  console.log('[replay] 聚合差 TOP10(tile 我 真):');
  for (const [k, a, b] of rows.slice(0, 10)) console.log(`  ${k}: ${a} vs ${b}`);
}
// 幼虫座登记对账
console.log(`[replay] larva 登记数=${gs.larvaX.length} 箱登记数=${(gs.mods.chests as unknown[]).length}`);
process.exit(0);
