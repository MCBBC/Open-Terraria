// #103 钟乳石 pass 终审重放（env 门控=SW_165R=1）：
// ① 管线跑到 slot55 头，经 __swSpCap 钩抓全量 store（含 half/slope/frame/liquidType
//    ——dump 缺的通道）+ gs 深克隆；
// ② 重放 store = dump102 的 typ/act/wal/liq（原版真值）+ JS 侧 half/slope/frame
//    （近似，仅 dump 缺通道的二阶误差）；
// ③ runGemTreesPass(重放 store, fresh RNG(seed)) → 对拍 dump103：
//    v165only/j165only 小（几百级）= 实现干净、漂移全来自上游输入；大（万级）= 实现残留 bug。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { runGemTreesPass } from '../src/world/gen/vanilla/GemPasses';
import { growGemTree } from '../src/world/gen/vanilla/TreePass';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_165R === '1';
const VG = '/tmp/sw-num4/van_x86_g';
const W = 4200, H = 1200;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (s !== undefined && !REV.has(s)) REV.set(s, i);
}

function cloneGs(gs: GenState): GenState {
  const c = { ...gs } as unknown as Record<string, unknown>;
  for (const k of Object.keys(c)) {
    const v = c[k];
    if (Array.isArray(v)) c[k] = v.map((e) => (e && typeof e === 'object' ? { ...(e as object) } : e));
    else if (v instanceof Int32Array) c[k] = v.slice();
    else if (v instanceof Float32Array) c[k] = v.slice();
    else if (v && typeof v === 'object') c[k] = { ...(v as Record<string, unknown>) };
  }
  return c as unknown as GenState;
}

(RUN ? it : it.skip)('#103 stalac replay on vanilla dump102 input', async () => {
  // ① 管线捕获 slot55 头全量状态
  let cap: { st: TileStore; gs: GenState } | null = null;
  const g0 = globalThis as { __swSpCap?: (gs: GenState, st: TileStore) => void };
  g0.__swSpCap = (gs, st) => {
    if (cap) return;
    const s2 = new TileStore(W, H);
    s2.type = st.type.slice(); s2.flags = st.flags.slice(); s2.wall = st.wall.slice();
    s2.liquid = st.liquid.slice(); s2.liquidType = st.liquidType.slice();
    s2.half = st.half.slice(); s2.slope = st.slope.slice();
    s2.frameX = st.frameX.slice(); s2.frameY = st.frameY.slice();
    cap = { st: s2, gs: cloneGs(gs) };
  };
  try {
    await generateWorld({ width: W, height: H, seedText: '9293480', evil: 0 });
  } finally { g0.__swSpCap = undefined; }
  if (!cap) throw new Error('slot55 head capture failed');
  console.log('captured slot55 head; ws=', cap.gs.worldSurface, 'rl=', cap.gs.rockLevel, 'beach=', cap.gs.beachDistance);

  // ② 重放 store：dump102 typ/act/wal/liq + JS half/slope/frame/liquidType
  const vt = new Uint16Array(readFileSync(`${VG}/102_Water_Plants.typ`).buffer.slice(0));
  const va = readFileSync(`${VG}/102_Water_Plants.act`);
  const vw = new Uint16Array(readFileSync(`${VG}/102_Water_Plants.wal`).buffer.slice(0));
  const vl = readFileSync(`${VG}/102_Water_Plants.liq`);
  const oT = new Uint16Array(readFileSync(`${VG}/103_Stalac.typ`).buffer.slice(0));
  const oA = readFileSync(`${VG}/103_Stalac.act`);
  const rs = new TileStore(W, H);
  let mixed = 0;
  for (let i = 0; i < W * H; i++) {
    rs.flags[i] = va[i] ? 1 : 0;
    rs.type[i] = va[i] ? (REV.get(vt[i]!) ?? 0) : 0;
    rs.wall[i] = vw[i]!;
    rs.liquid[i] = vl[i]!;
    rs.liquidType[i] = cap.st.liquidType[i]!;
    rs.half[i] = cap.st.half[i]!;
    rs.slope[i] = cap.st.slope[i]!;
    rs.frameX[i] = cap.st.frameX[i]!;
    rs.frameY[i] = cap.st.frameY[i]!;
    if (va[i] && SHEET[cap.st.type[i]] !== vt[i]) mixed++;
  }
  console.log(`replay store built; 输入 typ 分歧格=${mixed}`);

  // ③ 重放（fresh RNG(seed)，槽头 reseed 同构）——ur 层 draw 日志（所有 RNG 入口
  //    每次调用恰耗 1 个流采样；包装 nextDouble/nextInt/nextIntRange 全捕获）
  const rng = new RNG(cap.gs.seed);
  const draws: Array<{ n: number; kind: string; v: number }> = [];
  const urObj = (rng as unknown as { ur: { nextDouble: () => number; nextInt: (n: number) => number; nextIntRange: (a: number, b: number) => number } }).ur;
  const rawND = urObj.nextDouble.bind(urObj);
  const rawNI = urObj.nextInt.bind(urObj);
  const rawNIR = urObj.nextIntRange.bind(urObj);
  let logging = true;
  urObj.nextDouble = () => { const v = rawND(); if (logging) draws.push({ n: draws.length, kind: 'f', v: +v.toFixed(4) }); if (draws.length > 20000) logging = false; return v; };
  urObj.nextInt = (n: number) => { const v = rawNI(n); if (logging) draws.push({ n: draws.length, kind: `i${n}`, v }); if (draws.length > 20000) logging = false; return v; };
  urObj.nextIntRange = (a: number, b: number) => { const v = rawNIR(a, b); if (logging) draws.push({ n: draws.length, kind: `r${a}-${b}`, v }); if (draws.length > 20000) logging = false; return v; };
  {
    // 独立列段重放（x∈[20,23]，fresh 流）：验证 (22,671) 是否在无前序列时被放置
    const rs2 = new TileStore(W, H);
    for (let i = 0; i < W * H; i++) {
      rs2.flags[i] = va[i] ? 1 : 0;
      rs2.type[i] = va[i] ? (REV.get(vt[i]!) ?? 0) : 0;
      rs2.wall[i] = vw[i]!;
      rs2.liquid[i] = vl[i]!;
      rs2.liquidType[i] = cap.st.liquidType[i]!;
      rs2.half[i] = cap.st.half[i]!;
      rs2.slope[i] = cap.st.slope[i]!;
      rs2.frameX[i] = cap.st.frameX[i]!;
      rs2.frameY[i] = cap.st.frameY[i]!;
    }
    const rng2 = new RNG(cap.gs.seed);
    // 手工同构扫描（语义拷贝自 GemPasses/TreePass），树用真 growGemTree 保门与掷全同构
    const gs = cap.gs;
    const f = gs.seedFlags ?? {};
    const alwaysTry = !!(f.tenthAnniversary || f.drunkWorld);
    const oceanDepths = (x: number, y: number): boolean => {
      if (y > (gs.worldSurface + gs.rockLevel) / 2 + 40) return false;
      return x < gs.beachDistance || x > W - gs.beachDistance;
    };
    let placed22671 = false;
    let trees = 0;
    for (let x = 20; x <= 23; x++) {
      for (let y = Math.floor(gs.worldSurface); y < H - 20; y++) {
        const treeRoll = alwaysTry ? true : rng2.nextInt(5) === 0;
        if (treeRoll && rs2.liquid[rs2.idx(x, y - 1)] === 0) {
          const treeType = 583 + rng2.nextInt(7);
          if (growGemTree(rs2, rng2, x, y, treeType)) trees++;
        }
        if (!oceanDepths(x, y) && !rs2.flags[rs2.idx(x, y)] && rng2.nextInt(5) === 0) {
          if (x === 22 && y === 671) placed22671 = true;
          // placeTightInitial 语义（Next(2)/Next(3) 恒掷；放置门由 dump 输入决定）
          rng2.nextInt(2); rng2.nextInt(3);
        }
      }
      for (let k = 5; k < gs.worldSurface; k++) {
        const upA = rs2.flags[rs2.idx(x, k - 1)] ? SHEET[rs2.type[rs2.idx(x, k - 1)]] : -1;
        const dnA = rs2.flags[rs2.idx(x, k + 1)] ? SHEET[rs2.type[rs2.idx(x, k + 1)]] : -1;
        if ((upA === 147 || upA === 161) && rng2.nextInt(5) === 0) { rng2.nextInt(2); rng2.nextInt(3); }
        if ((upA === 25 || upA === 203) && rng2.nextInt(5) === 0) { rng2.nextInt(2); rng2.nextInt(3); }
        if ((dnA === 25 || dnA === 203) && rng2.nextInt(5) === 0) { rng2.nextInt(2); rng2.nextInt(3); }
      }
    }
    console.log(`列段[20,23] fresh 流: (22,671) roll==0 → ${placed22671}; 成树=${trees}`);
    // vanilla 侧同列可见事件（dump103）：165/树 位置
    const evts: string[] = [];
    for (let x = 20; x <= 23; x++) {
      for (let y = Math.floor(gs.worldSurface); y < H - 20; y++) {
        const i = y * W + x;
        const ov = oA[i] ? oT[i] : -1;
        const iv = va[i] ? vt[i] : -1;
        if (ov !== iv) evts.push(`(${x},${y}) ${iv}>${ov}`);
      }
    }
    console.log(`vanilla 列[20,23] 可见事件: ${evts.length} 个: ${evts.slice(0, 24).join(' ')}`);
  }
  runGemTreesPass(rs, rng, cap.gs);

  // ③b draw 序列解析：按扫描结构逐格消费（运行态 = 输入 + vanilla 本 pass 放置），
  //    找首个"vanilla 放置事件 ⇔ JS roll==0 事件"失配格 + 每事件掷窗结构
  {
    const gs = cap.gs;
    const oceanDepths = (x: number, y: number): boolean => {
      if (y > (gs.worldSurface + gs.rockLevel) / 2 + 40) return false;
      return x < gs.beachDistance || x > W - gs.beachDistance;
    };
    // vanilla 本 pass 置活格（dump102 空气 → dump103 165）
    const vanActive = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) vanActive[i] = va[i] || (oA[i] === 1 && oT[i] === 165) ? 1 : 0;
    let p = 0;
    const events: string[] = [];
    outer:
    for (let x = 20; x <= 22 && p < draws.length; x++) {
      for (let y = Math.floor(gs.worldSurface); y < H - 20 && p < draws.length; y++) {
        const i = y * W + x;
        const t1 = draws[p++]!;
        if (t1.kind !== 'i5') { events.push(`STRUCT 树掷位非i5 (${x},${y})@n${t1.n}:${t1.kind}=${t1.v}`); break outer; }
        if (t1.v === 0 && vl[(y - 1) * W + x] === 0) {
          const t2 = draws[p++]!;
          if (t2.kind !== 'i7') { events.push(`STRUCT 树型掷位非i7 (${x},${y})@n${t2.n}:${t2.kind}=${t2.v}`); break outer; }
          // growGemTree 门全败=0 追加掷；门过则吞树内部掷窗直到回到 i5 主轨
          if (draws[p]!.kind !== 'i5') {
            let q = p;
            while (q < draws.length && draws[q]!.kind !== 'i5') q++;
            if (q - p > 0) events.push(`TREE-DRAWS(${x},${y}) 窗长=${q - p}: ${draws.slice(p, Math.min(q, p + 8)).map((d) => `${d.kind}=${d.v}`).join(' ')}`);
            p = q;
          }
        }
        if (oceanDepths(x, y) || vanActive[i]) continue;
        const roll = draws[p++]!;
        if (roll.kind !== 'i5') { events.push(`STRUCT 钟乳石掷位非i5 (${x},${y})@n${roll.n}:${roll.kind}=${roll.v}`); break outer; }
        const vanPlaced = oA[i] === 1 && oT[i] === 165;
        const jsRolled = roll.v === 0;
        let tail = '';
        if (jsRolled) {
          const t: string[] = [];
          while (p < draws.length && draws[p]!.kind !== 'i5' && t.length < 8) { t.push(`${draws[p]!.kind}=${draws[p]!.v}`); p++; }
          tail = ` [${t.join(' ')}]`;
        }
        if (vanPlaced !== jsRolled) {
          events.push(`✗ 失配(${x},${y})@n${roll.n} roll=${roll.v} vanillaPlaced=${vanPlaced}${tail}`);
          if (events.filter((e) => e[0] === '✗').length > 4) break outer;
        } else if (jsRolled) {
          events.push(`✓ 双放(${x},${y})@n${roll.n}${tail}`);
        }
      }
    }
    console.log('draw 序列逐格对拍（列 20-22，掷窗=r0-2/r0-3）:');
    for (const e of events) console.log('  ', e);
    console.log(`  consumed draws=${p}/${draws.length}`);
    // raw 序列窗口 n265-285 + 输入态（列20 y555-565）
    console.log('raw draws n265-285:', draws.slice(265, 286).map((d) => `${d.n}:${d.kind}=${d.v}`).join(' '));
    // 静默树事件的基座格状态（门读 half/slope——JS 侧真值；非零=嫌疑）
    for (const [tx, ty] of [[20, 381], [20, 383], [20, 533], [20, 545], [20, 548], [20, 552], [20, 555]] as Array<[number, number]>) {
      const rows: string[] = [];
      for (let dy = -1; dy <= 1; dy++) {
        const y = ty + dy;
        const cells: string[] = [];
        for (let dx = -1; dx <= 1; dx++) {
          const i = y * W + tx + dx;
          cells.push(`${va[i] ? vt[i] : '·'}${cap.st.half[i] ? 'h' : ''}${cap.st.slope[i] || ''}`);
        }
        rows.push(cells.join(' '));
      }
      const wi = ty * W + tx;
      console.log(`  树事件(${tx},${ty}) typ/half/slope 3×3 [${rows.join(' | ')}] wall(上)=${vw[wi - W]} lq(上)=${vl[wi - W]}`);
    }
    for (let y = 555; y <= 565; y++) {
      const i = y * W + 20;
      console.log(`  (20,${y}) in=${va[i] ? vt[i] : '·'} lq=${vl[i]} van103=${oA[i] ? oT[i] : '·'} jsHalf=${cap.st.half[i]} jsSlope=${cap.st.slope[i]}`);
    }
  }

  // ④ 对拍 dump103（oT/oA 已前移加载）
  let v165 = 0, j165 = 0, vT = 0, both = 0;
  const pairM = new Map<string, number>();
  for (let i = 0; i < W * H; i++) {
    const ov = oA[i] ? oT[i] : -1;
    const jr = rs.flags[i] ? SHEET[rs.type[i]] : -1;
    if (ov === 165 && jr === 165) both++;
    else if (ov === 165) v165++;
    else if (jr === 165) j165++;
    if (ov !== jr) { vT++; const k = `${ov}>${jr}`; pairM.set(k, (pairM.get(k) ?? 0) + 1); }
  }
  console.log(`重放 vs dump103: typ总差=${vT} | 165 both=${both} vOnly=${v165} jOnly=${j165}`);
  console.log('top pairs:', JSON.stringify([...pairM.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)));

  // ⑤ 首分歧定位：列主序（x 升序，列内 y 升序）找第一个 165 差格，打印邻域
  //    输入三源：dump102 typ/act、JS half/slope/frame、liquid
  {
    const inT = vt, inA = va;
    const jsIn = cap.st;
    let fx = -1, fy = -1, fkind = '';
    for (let x = 20; x < W - 20 && fx < 0; x++) {
      for (let y = Math.floor(cap.gs.worldSurface); y < H - 20; y++) {
        const i = y * W + x;
        const ov = oA[i] ? oT[i] : -1;
        const jr = rs.flags[i] ? SHEET[rs.type[i]] : -1;
        if (ov !== jr && ov !== 165 && jr !== 165) { fx = x; fy = y; fkind = `non165 ${ov}>${jr}`; break; }
      }
      if (fx >= 0) break;
    }
    if (fx < 0) for (let x = 20; x < W - 20 && fx < 0; x++) {
      for (let y = Math.floor(cap.gs.worldSurface); y < H - 20; y++) {
        const i = y * W + x;
        const ov = oA[i] ? oT[i] : -1;
        const jr = rs.flags[i] ? SHEET[rs.type[i]] : -1;
        if ((ov === 165) !== (jr === 165)) { fx = x; fy = y; fkind = ov === 165 ? 'v165_jsNot' : 'js165_vNot'; break; }
      }
    }
    console.log(`首分歧格(typ 通道全类): (${fx},${fy}) ${fkind}`);
    if (fx >= 0) {
      const hdr = (s: string) => console.log(`  ${s}`);
      for (let dy = -3; dy <= 3; dy++) {
        const y = fy + dy;
        let rIn = '', rHS = '', rFr = '', rLq = '', rOut = '';
        for (let dx = -1; dx <= 1; dx++) {
          const x = fx + dx;
          const i = y * W + x;
          rIn += `${inA[i] ? inT[i] : '·'}${String.fromCharCode(97 + dy + 3)} `;
          const jHas = jsIn.flags[i] ? String(SHEET[jsIn.type[i]]) : '·';
          rHS += `${jHas}h${jsIn.half[i]}s${jsIn.slope[i]} `;
          rFr += `${jsIn.frameX[i]}/${jsIn.frameY[i]} `;
          rLq += `${jsIn.liquid[i]}t${jsIn.liquidType[i]} `;
          const jr = rs.flags[i] ? SHEET[rs.type[i]] : -1;
          rOut += `${jr} `;
        }
        hdr(`y${y}: dumpIn[${rIn}] jsTyp/half/slope[${rHS}] jsFrame[${rFr}] liq[${rLq}] out: dump=${oA[y * W + fx] ? oT[y * W + fx] : '·'} js=${(() => { const k = fy * 0 + y * W + fx; return rs.flags[k] ? SHEET[rs.type[k]] : '·'; })()}`);
      }
      void hdr;
    }
  }
}, 600_000);
