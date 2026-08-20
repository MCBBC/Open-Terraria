// VVVVV #85 探针：WebsAndHoney 逐格事件账（wall86 PlaceTight / wall62 web）
// ——golden84 基座（_wwwrep buildHybrid 复用）上小窗日志。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { runWebsInSpiderCavesPass } from '../src/world/gen/vanilla/HiveSpiderPass';

const RUN = process.env.SW_VV2 === '1';
const W = 4200, H = 1200, N = W * H, SEED = 9293480;
const G2 = '/tmp/sw-slp/g';
const BDIR = '/tmp/www-b/s38';
const X0 = Number(process.env.SW_VV2_X ?? 3140), Y0 = Number(process.env.SW_VV2_Y ?? 415);
const RAD = Number(process.env.SW_VV2_R ?? 10);

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const b8 = (p: string) => new Uint8Array(readFileSync(p).buffer.slice(0));
const b16 = (p: string) => new Uint16Array(readFileSync(p).buffer.slice(0));
const gp = (idx: number, ext: string) => `${G2}/${String(idx).padStart(3, '0')}_${idx === 84 ? 'Dye_Plants' : 'Webs_And_Honey'}.${ext}`;

it('probe', async () => {
  if (!RUN) return;
  const { TileStore: TS } = await import('../src/world/TileStore');
  const st = new TS(W, H) as InstanceType<typeof TS>;
  // golden84 通道 + s38 边界帧/线
  const c84 = {
    t: b16(gp(84, 'typ')), a: b8(gp(84, 'act')), w: b16(gp(84, 'wal')), l: b8(gp(84, 'liq')),
    lt: b8(gp(84, 'lty')), hf: b8(gp(84, 'half')), sl: b8(gp(84, 'slope')), ia: b8(gp(84, 'inact')),
  };
  const fw = new Uint32Array(readFileSync(`${BDIR}/frames.bin`).buffer.slice(0));
  const wireB = new Uint8Array(N);   // s38 无 wire 快照（wire 通道本窗无消费，全 0）
  const gs = JSON.parse(readFileSync(`${BDIR}/gs.json`, 'utf8')) as GenState;
  const gensolid = new Map(JSON.parse(readFileSync(`${BDIR}/gensolid.json`, 'utf8')) as Array<[number, boolean]>);
  restoreGenSolid(gensolid);
  for (let i = 0; i < N; i++) {
    const act = c84.a[i]!;
    st.flags[i] = act;
    if (act || c84.t[i]) {
      const sh = c84.t[i]!;
      let id = -1;
      for (let k = 0; k < SHEET.length; k++) if (SHEET[k] === sh) { id = k; break; }
      st.type[i] = id >= 0 ? id : 0;
    } else st.type[i] = 0;
    st.wall[i] = c84.w[i]!;
    st.liquid[i] = c84.l[i]!;
    st.liquidType[i] = c84.l[i] ? c84.lt[i]! + 1 : 0;
    st.half[i] = c84.hf[i]!;
    st.slope[i] = c84.sl[i]!;
    st.wire[i] = (c84.ia[i] ? 0x20 : 0) | (wireB[i] & 0x1f);
    if (fw[i * 4 + 1] !== undefined) { st.frameX[i] = fw[i * 4 + 1]!; st.frameY[i] = fw[i * 4 + 2]!; }
  }
  // golden85（对账目标）
  const g85 = { t: b16(gp(85, 'typ')), a: b8(gp(85, 'act')) };

  // 日志：window 内的 165/51 与墙
  console.log('--- golden84/85 site map (x 3140..3160, y 415..425): w84|t84 | t85 ---');
  for (let y = Y0; y <= Y0 + RAD; y++) {
    let line = '';
    for (let x = X0; x <= X0 + RAD + 10; x++) {
      const i = y * W + x;
      line += `${String(c84.w[i]).padStart(3)}/${String(c84.a[i] ? c84.t[i] : -1).padStart(4)}|${String(g85.a[i] ? g85.t[i] : -1).padStart(4)} `;
    }
    console.log(`y${y}: ${line}`);
  }
  // 逐格事件（复刻 pass 逻辑手动走 window 外的格子不打印）——直接 hook RNG 计数
  let rolls = 0;
  const rng = new RNG(SEED);
  rng.reseed(SEED);
  const origInt = rng.int.bind(rng);
  (rng as unknown as { int: (a: number, b: number) => number }).int = (a: number, b: number) => {
    rolls++;
    return origInt(a, b);
  };
  // 快照前后对比 + 中途打印：包装 placeTight/webs 不可行（内部函数）——
  // 用前后 diff + 逐 roll 计数跑全 pass，然后窗口格对比
  const before = { t: st.type.slice(), f: st.flags.slice(), fx: st.frameX.slice(), fy: st.frameY.slice() };
  // PRE 帧明细（313,936-948 邻域）
  {
    console.log('--- PRE frames (x 310..318) ---');
    for (let y = 938; y <= 946; y++) {
      let line = '';
      for (let x = 310; x <= 318; x++) {
        const i = y * W + x;
        line += `${st.flags[i] ? String(SHEET[st.type[i]]) : 'air'}:${st.frameX[i]}/${st.frameY[i]} `;
      }
      console.log(`  y${y}: ${line}`);
    }
  }
  runWebsInSpiderCavesPass(st, rng, gs);
  console.log(`total rolls consumed: ${rolls}`);
  // JS placements in window vs golden85
  console.log('--- JS post vs golden85 (x, y, js, gold) ---');
  for (let y = Y0 - RAD; y <= Y0 + RAD; y++) {
    for (let x = X0 - RAD; x <= X0 + RAD + 10; x++) {
      const i = y * W + x;
      const jsT = st.flags[i] ? SHEET[st.type[i]] : -1;
      const gT = g85.a[i] ? g85.t[i] : -1;
      const wasT = before.f[i] ? SHEET[before.t[i]] : -1;
      if (jsT !== gT) console.log(`  DIFF (${x},${y}) wall${c84.w[i]} pre=${wasT} js=${jsT} gold=${gT}`);
    }
  }
  // ★全图首差（扫描序=列主）：golden85 写集 vs JS 写集
  console.log('--- first global divergence in scan order ---');
  let shown = 0;
  outerPrint:
  for (let x = 100; x < W - 100 && shown < 12; x++) {
    for (let y = Math.floor(gs.worldSurface); y < H - 100; y++) {
      const i = y * W + x;
      const jsT = st.flags[i] ? SHEET[st.type[i]] : -1;
      const gT = g85.a[i] ? g85.t[i] : -1;
      const pre = before.f[i] ? SHEET[before.t[i]] : -1;
      if (jsT !== gT) {
        console.log(`  ① (${x},${y}) wall${c84.w[i]} pre=${pre} js=${jsT} gold=${gT}`
          + ` ctx up=${ctx(x, y - 1)} self=${ctx(x, y)} dn=${ctx(x, y + 1)} lq${c84.l[i]}`);
        shown++;
        if (shown >= 12) break outerPrint;
      }
    }
  }
  function ctx(cx: number, cy: number): string {
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) return 'OoB';
    const i = cy * W + cx;
    return `${c84.a[i] ? String(c84.t[i]) : 'air'}s${c84.sl[i]}h${c84.hf[i]}`;
  }
  // 首差邻域帧明细（s38 JS 帧注入后的基座）
  {
    const fx = st.frameX, fy = st.frameY;
    for (let y = 936; y <= 948; y++) {
      let line = '';
      for (let x = 310; x <= 318; x++) {
        const i = y * W + x;
        const t = SHEET[st.type[i]];
        line += `${st.flags[i] ? String(t) : 'air'}:${fx[i]}/${fy[i]} `;
      }
      console.log(`  frame y${y}: ${line}`);
    }
  }
}, 3600000);
