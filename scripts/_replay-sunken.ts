// ★6xx:Sunken Sea(+Vernal Pass)pass 重放判卷(克隆 _replay-sea/_replay-crag;流语义定谳=每 pass 重播种)
// 边界定谳(genprobe.log + 快照增量 2026-10-13):
//   输入=snap-19-pre-Settle_Liquids_Again(Settle Liquids Again 完成态),
//   输出=snap-20-post-Sunken_Sea;真实增量=+30,569 mod 格:
//     EutrophicSand 21135 / Navystone 6843 / SeaPrism 378 / SeaPrismCrystals 505 /
//     SunkenStalactites 212 / SunkenStalagmites 200 / SmallStalact 97 / SmallStalag 130 /
//     BrainCoral 138 / SmallBrainCoral 152 / FanCoral 189 / TubeCoral 24 / SmallTubeCoral 64 /
//     SeaAnemone 128 / MediumCoral 92 / MediumCoral2 100 / SmallWideCoral 62 /
//     CoralPileLarge 36 / TableCoral 84(旧台账 17828/5924/480=陈值,勿引)。
// 几何定谳:DesertDescription.cs:59-91(DefaultBlockScale=(4,2) → CombinedArea 宽 320,
//   Inflate(10) 后 340 → Center.X=Left+170);Sunken Sea pass 只消费 ud.x0(扫墙列)与
//   Center.X(ox)→判卷注入合成 ud{x0:S, x1:S+340},S 以 diff 最低为准(SW_UD_X0 可钉)。
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const root = process.env.SW_GAME_ROOT ?? process.cwd();
const LOGS = '/Users/vinlic/Library/Application Support/Terraria/tModLoader/Logs';
const PASS = process.env.SW_PASS === 'vernal' ? 'vernal' : 'sunken';
const { TILE_BY_KEY, TILE_DEFS, registerModTile } = await import('../src/data/tiles.ts');
const { RNG, translateSeed } = await import('../src/core/rng.ts');

// mod tile 注册(803)——须透传 content json 字段(solid/framed/w/h…,_replay-crag 判例)
{
  let nextId = 1030;
  for (const f of readdirSync(`${root}/mods/calamity/content/tiles`).sort()) {
    if (!f.endsWith('.json')) continue;
    try {
      const spec = JSON.parse(readFileSync(`${root}/mods/calamity/content/tiles/${f}`, 'utf8')) as Record<string, unknown>;
      registerModTile({
        key: `mod_calamity_${f.replace('.json', '')}`,
        name: (spec.name as string) ?? '',
        solid: (spec.solid as boolean) ?? false,
        platform: (spec.platform as boolean) ?? false,
        decor: (spec.decor as boolean) ?? false,
        chest: (spec.chest as boolean) ?? false,
        framed: (spec.framed as boolean) ?? false,
        w: spec.w as number | undefined,
        h: spec.h as number | undefined,
        opacity: spec.opacity as number | undefined,
        pick: (spec.pick as number) ?? 0,
        mapColor: (spec.mapColor as string) ?? '#808080',
        blend: false,
      }, nextId++);
    } catch { /* skip */ }
  }
}
(globalThis as Record<string, unknown>).__calamityTileDefs = TILE_DEFS;
(globalThis as Record<string, unknown>).__calamityTileIdByKey = TILE_BY_KEY;

function loadSnap(pat: string) {
  const f = readdirSync(LOGS).filter((x) => x.endsWith(pat + '.bin.gz')).sort().pop();
  if (!f) throw new Error('快照未找到: ' + pat);
  const buf = gunzipSync(readFileSync(join2(LOGS, f)));
  const w = 4200, h = 1200, n = w * h;
  const type = new Uint16Array(n), wall = new Uint16Array(n);
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    const o = (x * h + y) * 4;
    type[y * w + x] = buf[o] | (buf[o + 1] << 8);
    wall[y * w + x] = buf[o + 2] | (buf[o + 3] << 8);
  }
  return { type, wall };
}
import { join as join2 } from 'node:path';

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
  const ourByKey = (nm: string): number | undefined => {
    const s1 = nm.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
    for (const s of [s1, s1.replace(/([a-z])(\d)/g, '$1_$2')]) {
      const id = TILE_BY_KEY[`mod_calamity_${s}`];
      if (id !== undefined) return id;
    }
    return undefined;
  };
  for (const e of tileMap) {
    const f = (Array.isArray(e) ? e : (e as { v: unknown }).v) as Array<{ name: string; v: unknown }>;
    const get = (nm: string) => f.find((x) => x.name === nm)?.v;
    const our = ourByKey(String(get('name')));
    if (our !== undefined) MOD_ID_TO_NAME.set(Number(get('value')), our);
  }
  console.log('[replay] mod 名映射', MOD_ID_TO_NAME.size);
}
const CS_TO_OURS = (cs: number): number => cs === 0 ? 0 : cs < 753 ? (SHEET_TO_INTERNAL.get(cs) ?? 0) : (MOD_ID_TO_NAME.get(cs) ?? 0);
const KEY_OF = (id: number): string => (TILE_DEFS[id] as { key?: string } | undefined)?.key ?? `#${id}`;

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

// pass fn 提取(setupGenMisc 的 stub 捕获)
let passFn: ((...a: unknown[]) => void) | null = null;
let passName: string;
if (PASS === 'sunken') { passName = 'Sunken Sea'; }
else { passName = 'Vernal Pass'; }
{
  const mod = await import('../mods/calamity/src/gen-misc.ts');
  const stub = new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'registerGenPass') return (name: string, fn: (...a: unknown[]) => void) => {
        if (name === passName) passFn = fn;
      };
      if (prop === 'log') return (...a: unknown[]) => console.log('[gen-misc]', ...a);
      return () => {};
    },
    has: () => true,
  });
  (mod as { setupGenMisc(sw: unknown): void }).setupGenMisc(stub);
  if (!passFn) throw new Error(passName + ' 未注册');
}
console.log('[replay] pass fn 就绪:', passName);

// 神庙界带(Vernal 判卷用;从快照 lihzahrd 砖 226 bbox±10 近似)
function templeBounds(snap: { type: Uint16Array }) {
  let l = 1e9, r = -1, t = 1e9, b = -1;
  const lihz = SHEET_TO_INTERNAL.get(226);
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    if (snap.type[y * w + x] === 226 || (lihz !== undefined && snap.type[y * w + x] === lihz)) {
      if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y;
    }
  }
  return { tLeft: Math.max(0, l - 10), tRight: r + 10, tTop: Math.max(0, t - 10), tBottom: b + 10 };
}

function runPass(snapPre: { type: Uint16Array; wall: Uint16Array }, udX0: number, force?: { ox: number; oy: number }) {
  const store = buildStore(snapPre);
  if (force) {
    // 合成几何:扫墙列=udX0,该列伪造 187 墙带使上扫停于 force.oy-50;
    // ud.x1 撑到 2*(force.ox-udX0) 使 Center.X=force.ox(解耦 ox/oy 供 2D 扫描)。
    const wallY = force.oy - 50;   // pass: oy=foundY+50
    for (let y = 0; y < h; y++) {
      const wl = store.wall[y * w + udX0];
      if (y > wallY && (wl === 187 || wl === 216)) store.wall[y * w + udX0] = 0;
      if (y === wallY) store.wall[y * w + udX0] = 187;
    }
  }
  const gs = {
    seed: translateSeed('9293480'),
    worldSurface: 337, worldSurfaceLow: 246, rockLevel: 535, lavaLine: h - 200, waterLine: 330,
    crimson: false, dungeonX: 3421, dungeonSide: 1 as const,
    dungeonMinX: 0, dungeonMaxX: 4200, dungeonMaxY: 207,
    jungleX: 0, snowOriginLeft: 0, snowOriginRight: 0,
    tLeft: 0, tRight: 0, tTop: 0, tBottom: 0, tRooms: 0,
    undergroundDesert: { x0: udX0, y0: 300, x1: force ? udX0 + 2 * (force.ox + 160 - udX0) : udX0 + 340, y1: 1000 },
    shimmerX: -1, shimmerY: -1,
    larvaX: [] as number[], larvaY: [] as number[],
    oreTiers: { copper: 7, iron: 6, silver: 9, gold: 8 },
    genW: w, genH: h,
    protectedRects: [] as Array<{ x0: number; y0: number; x1: number; y1: number; pad: number }>,
    seedFlags: {},
    mods: {
      tileIdByKey: Object.fromEntries(Object.entries(TILE_BY_KEY).filter(([k]) => k.startsWith('mod_')).map(([k, v]) => [k.replace(/^mod_[a-z0-9]+_/, ''), v])),
      itemIdByKey: {},
      // ★判卷仪墙 id 接线(刀3):replay 的 store 用真链 snap 的 wall id 域(twld wallMap
      //   实值 NavystoneWall=394/EutrophicSandWall=381)——引擎段注册后的域内值。
      wallIdByKey: { navystone_wall: 394, eutrophic_sand_wall: 381 },
      chests: [] as unknown[],
    },
  };
  if (PASS === 'vernal') {
    const tb = templeBounds(snapPre);
    Object.assign(gs, tb);
  }
  {
    // 几何自检(复算 pass 内 ox/oy 公式)
    let sx = (gs.undergroundDesert as { x0: number }).x0, sy = h - 400, f2 = false;
    for (let y = sy; y >= 337; y--) {
      const wl = store.wall[y * w + sx];
      if (wl === 187 || wl === 216) { sy = y + 50; f2 = true; break; }
    }
    const ox2 = (gs.undergroundDesert as { x0: number }).x0 + Math.floor(((gs.undergroundDesert as { x1: number }).x1 - (gs.undergroundDesert as { x0: number }).x0) / 2) - 160;
    console.log(`[replay] 几何自检 scanCol=${sx} found=${f2} oy=${sy} ox=${ox2}`);
  }
  const rng = new RNG(gs.seed as number);
// ★671:掷数计数(对拍真链 SPY 谱 genprobe.log PASS106 dN=1,606,423)
(globalThis as { __drawN?: number }).__drawN = 0;
// ★G 流 FNV 对拍(DrawSpy gh 语义:bits 按 Next 系返回值;NextDouble=double 低 32 位;
//   剔除 CanPlace rs 掷=Main.rand 桶,由 gen-misc __sunkenSkipFNV 旗控制)
//   真链校验点:PASS105 后 gh=a3d332d0,PASS106 后 gh=e245f582(同种子 clean run)。
(globalThis as { __sunkenGH?: { v: number; skip: number } }).__sunkenGH = { v: 0xa3d332d0, skip: 0 };
{
  const dv = new DataView(new ArrayBuffer(8));
  const fold = (bits: number) => {
    const gh = (globalThis as { __sunkenGH?: { v: number; skip: number } }).__sunkenGH!;
    if ((globalThis as { __sunkenSkipFNV?: boolean }).__sunkenSkipFNV) { gh.skip++; return; }
    gh.v = (Math.imul((gh.v ^ (bits >>> 0)) >>> 0, 16777619)) >>> 0;
  };
  const proto = rng as unknown as Record<string, (...a: unknown[]) => unknown>;
  for (const m of Object.getOwnPropertyNames(Object.getPrototypeOf(rng))) {
    const fn = proto[m];
    if (typeof fn === 'function' && /^(next|int|intRange|nextBool|nextFloat|nextDouble)/i.test(m)) {
      const isDbl = /^(next|nextDouble)$/i.test(m) && m !== 'next' ? true : m === 'nextDouble';
      proto[m] = function (this: unknown, ...a: unknown[]) {
        (globalThis as { __drawN?: number }).__drawN = ((globalThis as { __drawN?: number }).__drawN ?? 0) + 1;
        const v = fn.apply(this, a);
        if (m === 'next' || m === 'nextDouble') { dv.setFloat64(0, v as number, true); fold(dv.getUint32(0, true)); }
        else fold(v as number);
        return v;
      };
      void isDbl;
    }
  }
}
// ★分段掷数谱(gen-misc __sunkenSeg 观测钩;中立=不消费/不改写流)
(globalThis as { __sunkenSegs?: Array<[string, number]> }).__sunkenSegs = [];
(globalThis as { __sunkenSeg?: (name: string) => void }).__sunkenSeg = (name: string) => {
  (globalThis as { __sunkenSegs?: Array<[string, number]> }).__sunkenSegs!.push([name, (globalThis as { __drawN?: number }).__drawN ?? 0]);
};
// ★细粒度事件计数(__sunkenCnt;环墙/环tile/尾相中心等无法用段边界切分的面)
(globalThis as { __sunkenCnts?: Map<string, number> }).__sunkenCnts = new Map();
(globalThis as { __sunkenRunSR?: number[] }).__sunkenRunSR = [];
(globalThis as { __sunkenCnt?: (n: string) => void }).__sunkenCnt = (n: string) => {
  const m = (globalThis as { __sunkenCnts?: Map<string, number> }).__sunkenCnts!;
  m.set(n, (m.get(n) ?? 0) + 1);
};
  (passFn as unknown as (...a: unknown[]) => void)(store, rng, gs);
  // 存档域归一(模板 ★652 同式):post 快照=已保存世界视图,未激活 tile type 恒 0
  for (let i = 0; i < n; i++) { if (!(store.flags[i] & 1) && store.type[i] !== 0) store.type[i] = 0; }
  return store;
}

function diffScore(store: { type: Uint16Array }, snapPost: { type: Uint16Array }) {
  let diff = 0;
  for (let i = 0; i < n; i++) if (store.type[i] !== CS_TO_OURS(snapPost.type[i])) diff++;
  return diff;
}

const prePath = PASS === 'sunken' ? 'snap-19-pre-Settle_Liquids_Again' : 'snap-17-pre-Muds_Walls_In_Jungle';
const postPath = PASS === 'sunken' ? 'snap-20-post-Sunken_Sea' : 'snap-18-post-Vernal_Pass';
const pre = loadSnap(prePath);
const post = loadSnap(postPath);

// S 搜索(Sunken):DesertDescription (4,2) 缩放→Center.X=Left+170;ox=Center-160=S+10。
// 首选 SW_UD_X0;否则在沙漠墙带候选域内以 diff 最低扫出。
let bestS = Number(process.env.SW_UD_X0 ?? -1);
let bestDiff = -1;
if (PASS === 'sunken' && bestS < 0) {
  const cands: number[] = [];
  for (let s = 1590; s <= 1680; s++) cands.push(s);
  for (const s of cands) {
    const d = diffScore(runPass(pre, s), post);
    if (bestDiff < 0 || d < bestDiff) { bestDiff = d; bestS = s; }
  }
  console.log(`[replay] S 扫描最优=${bestS} diff=${bestDiff}`);
}
if (bestS < 0) bestS = 1638;

(globalThis as Record<string, unknown>).__sunkenBurn = Number(process.env.SW_BURN ?? 0);
if (process.env.SW_NOFROUND) (globalThis as Record<string, unknown>).__sunkenNoFround = true;
(globalThis as Record<string, unknown>).__sunkenPreBurn = Number(process.env.SW_PREBURN ?? 0);
if (process.env.SW_XNADIST) (globalThis as Record<string, unknown>).__sunkenXnaDist = true;
if (process.env.SW_CLAIMMODE) (globalThis as Record<string, unknown>).__sunkenClaimMode = Number(process.env.SW_CLAIMMODE);
if (process.env.SW_AX) (globalThis as Record<string, unknown>).__sunkenAX = Number(process.env.SW_AX);
if (process.env.SW_AY) (globalThis as Record<string, unknown>).__sunkenAY = Number(process.env.SW_AY);
if (process.env.SW_FILLBURN) (globalThis as Record<string, unknown>).__sunkenFillBurn = process.env.SW_FILLBURN;
if (process.env.SW_DFO) (globalThis as Record<string, unknown>).__sunkenDfo = Number(process.env.SW_DFO);
if (process.env.SW_NORUNNER) (globalThis as Record<string, unknown>).__sunkenNoRunner = true;
if (process.env.SW_GATE) (globalThis as Record<string, unknown>).__sunkenGate = true;
const SW_OX = process.env.SW_OX ? Number(process.env.SW_OX) : -1;
const SW_OY = process.env.SW_OY ? Number(process.env.SW_OY) : -1;
const force = SW_OX > 0 && SW_OY > 0 ? { ox: SW_OX, oy: SW_OY } : undefined;
const store = runPass(pre, force ? force.ox - 170 : bestS, force);
// 平移互相关:region 内我 vs 真 type 全等计数在 (dx,dy)∈[-10,10]² 的峰值=区域偏移定谳
{
  const X0 = 1550, X1 = 2050, Y0 = 650, Y1 = 1000;
  let best = { dx: 0, dy: 0, hit: -1 };
  for (let dx = -10; dx <= 10; dx++) {
    for (let dy = -10; dy <= 10; dy++) {
      let hit = 0;
      for (let x = X0; x < X1; x++) {
        for (let y = Y0; y < Y1; y++) {
          const a = store.type[y * w + x];
          const b = CS_TO_OURS(post.type[(y + dy) * w + (x + dx)]);
          if (a === b) hit++;
        }
      }
      if (hit > best.hit) best = { dx, dy, hit };
    }
  }
  console.log(`[replay] 平移互相关最优 (dx,dy)=(${best.dx},${best.dy}) hit=${best.hit}/${(X1 - X0) * (Y1 - Y0)}`);
}
let diff = 0, modDiff = 0;
const diffByType = new Map<string, number>();
let firstDiff = '';
const regionDiffs: string[] = [];
const isMod = (id: number) => id >= 1030;
for (let i = 0; i < n; i++) {
  const realT = CS_TO_OURS(post.type[i]);
  if (store.type[i] !== realT) {
    diff++;
    if (isMod(store.type[i]) || isMod(realT)) modDiff++;
    const key = `${KEY_OF(store.type[i])}→${KEY_OF(realT)}`;
    diffByType.set(key, (diffByType.get(key) ?? 0) + 1);
    const x = i % w, y = Math.floor(i / w);
    if (!firstDiff) { firstDiff = `首格(${x},${y}) 我=${KEY_OF(store.type[i])} 真=${KEY_OF(realT)}`; }
    if (regionDiffs.length < 12 && x >= 1628 && x <= 1988 && y >= 720 && y <= 960) regionDiffs.push(`(${x},${y}) 我=${KEY_OF(store.type[i])} 真=${KEY_OF(realT)}`);
  }
}
console.log(`[replay] ud.x0=${bestS} 逐格 diff=${diff}/${n}(${((diff / n) * 100).toFixed(3)}%) mod 差格=${modDiff} ${firstDiff}`);
const rows = [...diffByType.entries()].sort((a, b) => b[1] - a[1]);
if (regionDiffs.length) console.log('[replay] 区内首批差(扫描序):\n  ' + regionDiffs.join('\n  '));
{
  const perRow = new Map<number, number>();
  const perCol = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const x = i % w, y = (i / w) | 0;
    if (x < 1628 || x > 1988 || y < 715 || y > 965) continue;
    if (store.type[i] !== CS_TO_OURS(post.type[i])) {
      perRow.set(y, (perRow.get(y) ?? 0) + 1);
      perCol.set(x >> 4, (perCol.get(x >> 4) ?? 0) + 1);
    }
  }
  const rows = [...perRow.entries()].sort((a, b) => a[0] - b[0]).map(([y, c]) => y + ':' + c).join(' ');
  console.log('[replay] 行差分布(y:count): ' + rows);
  const cols = [...perCol.entries()].sort((a, b) => a[0] - b[0]).map(([b16, c]) => (b16 * 16) + ':' + c).join(' ');
  console.log('[replay] 列差分布(16px 桶): ' + cols);
}
console.log('[replay] diff 分类型 TOP24:');
for (const [k, c] of rows.slice(0, 24)) console.log(`  ${k}: ${c}`);

{
  // ASCII 对照窗:左=我 右=真(E=esand N=navy P=prism C=crystal .=空 #=vanilla)
  const CLS = (t: number): string => {
    const k = KEY_OF(t);
    if (k.endsWith('eutrophic_sand')) return 'E';
    if (k.endsWith('navystone')) return 'N';
    if (k.endsWith('sea_prism')) return 'P';
    if (k.endsWith('crystals')) return 'C';
    if (t === 0) return ' ';
    return '#';
  };
  const lines: string[] = [];
  for (let y = 740; y < 860; y += 2) {
    let row = '';
    for (let x = 1800; x < 1920; x += 1) row += CLS(store.type[y * w + x]);
    row += ' | ';
    for (let x = 1800; x < 1920; x += 1) row += CLS(CS_TO_OURS(post.type[y * w + x]));
    lines.push(row);
  }
  console.log('[win] 我|真 (x1800-1920, y740-860 step2):\n' + lines.join('\n'));
}
// 双侧聚合(全图)
const cnt = (arr: Uint16Array) => { const m = new Map<string, number>(); for (let i = 0; i < n; i++) { const k = KEY_OF(arr[i]); m.set(k, (m.get(k) ?? 0) + 1); } return m; };
const oursC = cnt(store.type), realC = cnt(Array.from(post.type, CS_TO_OURS));
console.log('[replay] mod 族 我 vs 真(snap 增量判据):');
const modKeys = [...new Set([...oursC.keys(), ...realC.keys()])].filter((k) => k.startsWith('mod_')).sort();
for (const k of modKeys) {
  const a = oursC.get(k) ?? 0, b = realC.get(k) ?? 0;
  if (a > 0 || b > 0) console.log(`  ${k.replace('mod_calamity_', '')}: ${a} vs ${b}${a !== b ? '  ←Δ' + (b - a) : ''}`);
}
{
  // ★区域 tile 普查(BetterGemspark 掷面定谳用):窗口=环域外扩
  const census = (arr: Uint16Array, tag: string) => {
    const m = new Map<string, number>();
    for (let x = 1550; x < 2050; x++) for (let y = 650; y < 1000; y++) {
      const k = KEY_OF(arr[y * w + x]);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    console.log(`[census] ${tag} TOP28: ` + [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 28).map(([k, c]) => `${k.replace('mod_calamity_', 'M:')}:${c}`).join(' '));
  };
  census(pre.type, 'pre');
  census(post.type, 'post');
}
{
  const segs = (globalThis as { __sunkenSegs?: Array<[string, number]> }).__sunkenSegs ?? [];
  const drawN = (globalThis as { __drawN?: number }).__drawN ?? 0;
  console.log(`[replay] 掷数总 __drawN=${drawN} (真链 SPY dN=1,606,423, Δ我-真=${drawN - 1606423})`);
  {
    const gh = (globalThis as { __sunkenGH?: { v: number; skip: number } }).__sunkenGH;
    if (gh) console.log(`[replay] G流 FNV=${gh.v.toString(16)} (真链 PASS106 终=e245f582, 起点=a3d332d0;M桶剔除=${gh.skip})`);
  }
  const agg = new Map<string, number>();
  const cnts = new Map<string, number>();
  let prev = 0;
  for (const [name, cum] of segs) {
    agg.set(name, (agg.get(name) ?? 0) + (cum - prev));
    cnts.set(name, (cnts.get(name) ?? 0) + 1);
    prev = cum;
  }
  for (const [name, c] of agg) console.log(`[replay]   seg ${name}: ${c} (n=${cnts.get(name)})`);
  if (drawN !== prev) console.log(`[replay]   seg (未标注尾段): ${drawN - prev}`);
  // ★真链对拍:逐事件累计掷数(runEnter/kill 对齐真链 SEGTRACE ent 值)
  for (const want of ['runEnter', 'kill', 'tileRunner']) {
    const evs = segs.filter(([nm]) => nm === want).map(([, cum]) => cum);
    if (evs.length) console.log(`[replay]   ev ${want}(${evs.length}): ${evs.slice(0, 45).join(',')}`);
  }
  const runSR = (globalThis as { __sunkenRunSR?: number[] }).__sunkenRunSR;
  if (runSR && runSR.length) console.log(`[replay]   runSR(${runSR.length}): ${runSR.join(',')}`);
  const evts = (globalThis as { __sunkenCnts?: Map<string, number> }).__sunkenCnts;
  if (evts && evts.size) for (const [n, c] of [...evts.entries()].sort()) console.log(`[replay]   cnt ${n}: ${c}`);
}
process.exit(0);
