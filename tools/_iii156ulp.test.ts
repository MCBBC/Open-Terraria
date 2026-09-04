// IIII156 ULP 定谳仪 v2（一次性诊断,SW_I156=1 启用;经 node tools/run-diag.mjs 跑;零主路径改动）。
// v1 结论：微光槽主体塑形环椭圆盒 x∈[222,446] 不含 (495,537) —— LXVIII「椭圆 fringe 翻脸」
// 前提被证伪。v2 扩展：①全抓六通道(type/wall/flags/half/slope/wire)②全图 wall 差集
// ③镜像 ShimmerMakeBiomeOpening 双谓词（weak=现盘 solidAt / strict=cs:70650 全五门）
// → 定谳 (495,537) 的真实写位与拒绝门,并证明 strict 化掷流中性。
import { it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { genSolidType, VAN_TILE_SOLID_EXTRA } from '../src/world/gen/vanilla/GenSolid';

const RUN = process.env.SW_I156 === '1';
const OUT = '/tmp/iii156-out';
const SEED_TEXT = 'tooeasy|20260911';
const W = 4200, H = 1200;
const TGT = { x: 495, y: 537 };

(RUN ? it : it.skip)('IIIII156 ULP adjudication capture+replay v2', async () => {
  const CRIM = TILE_BY_KEY['v_203_crimstone_block']!.id;
  const EBON = TILE_BY_KEY['v_25_ebonstone_block']!.id;
  const SHEET_OF_TYPE = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') SHEET_OF_TYPE[i] = s;
  }
  // cs:70650 SolidTile 全五门（对齐 SecretSeedDoEndsPass.solidTileGround 已认证实现）
  // genSolidType/VAN_TILE_SOLID_EXTRA 直取 GenSolid 模块实例（与真实 pass 同一覆写表状态）
  const genSolidLocal = (t: number): boolean => genSolidType(t);

  // ── 相 1：管线捕获 ──
  const g1 = globalThis as { __swOnRoll?: (v: number, inst: object) => void; __swI91Cap?: unknown };
  let capturing = false;
  const rolls: number[] = [];
  g1.__swOnRoll = (v: number) => { if (capturing) rolls.push(v); };
  let phase = 0;
  let cap: Record<string, Uint16Array> | null = null;
  let postWall: Uint16Array | null = null;
  let gEntry: Record<string, unknown> | null = null;
  let gPost: Record<string, unknown> | null = null;
  let seedNum = 0;
  g1.__swI91Cap = (stRaw: unknown, gRaw: unknown, _c: unknown, nm: string) => {
    const st = stRaw as { type: Uint16Array; wall: Uint16Array; flags: Uint8Array; half: Uint8Array; slope: Uint8Array; wire: Uint8Array };
    const g = gRaw as Record<string, unknown>;
    if (phase === 0 && nm === '微光') {
      phase = 1;
      cap = { type: st.type.slice(), wall: st.wall.slice(), flags: st.flags.slice(), half: st.half.slice(), slope: st.slope.slice(), wire: st.wire.slice() };
      seedNum = g.seed as number;
      gEntry = { worldSurface: g.worldSurface, rockLevel: g.rockLevel, dungeonSide: g.dungeonSide };
      capturing = true;
      rolls.length = 0;
    } else if (phase === 1 && nm === '清理') {
      phase = 2;
      postWall = st.wall.slice();
      gPost = { shimmerX: g.shimmerX, shimmerY: g.shimmerY };
      const e = new Error('SW_I156_ABORT') as Error & { swAbort?: boolean };
      e.swAbort = true;
      throw e;
    }
  };
  const t0 = Date.now();
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED_TEXT, evil: 0,
      seedFlags: { startInHardmode: true },
      onProgress: () => {},
    });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    if (!(e as { swAbort?: boolean })?.swAbort && !msg.includes('ABORT')) throw e;
  }
  delete g1.__swI91Cap;
  delete g1.__swOnRoll;
  expect(phase, '未到达『清理』槽头').toBe(2);
  const SX = gPost!.shimmerX as number, SY = gPost!.shimmerY as number;
  console.log(`[i156] phase1 ${((Date.now() - t0) / 1000).toFixed(1)}s slotRolls=${rolls.length} seed=${seedNum} shimmer=(${SX},${SY})`);

  // ── 流驱动 RNG（直接消费捕获流,结构性错误会立即表现为值错位/清除集不齐） ──
  let ri = 0;
  const rng = {
    next: (): number => rolls[ri++] * 4.656612875245797e-10,
    int: (minValue: number, maxValue: number): number => {
      const num = maxValue - minValue;
      if (num <= 2147483647) return (Math.trunc((rolls[ri++] * 4.656612875245797e-10) * num) + minValue) | 0;
      throw new Error('large-range 未支持');
    },
  };

  // ── 相 2a：caller+head+验证+主体环（表达式逐字复制） ──
  const ws = Math.floor(gEntry!.worldSurface as number);
  const rl = Math.floor(gEntry!.rockLevel as number);
  const h = H, w = W;
  const yLoBase = Math.trunc((ws + rl) / 2) + 50;
  let yHi = Math.trunc(((h - 250) * 2 + rl) / 3);
  if (yHi > h - 330 - 100 - 30) yHi = h - 330 - 100 - 30;
  if (yHi <= yLoBase) yHi = yLoBase + 50;
  const pickX = (wide: boolean): number =>
    (gEntry!.dungeonSide as number) < 1
      ? rng.int(Math.trunc(w * (wide ? 0.8 : 0.89)), w - 201)
      : rng.int(200, Math.trunc(w * (wide ? 0.2 : 0.11)) - 1);

  const type = cap!.type, flags = cap!.flags, half = cap!.half, slope = cap!.slope;
  const cleared: { l: number; k: number }[] = [];
  let X = 0, Y = 0;
  let head: Record<string, number> | null = null;

  const attempt = (): boolean => {
    const variant = rng.int(0, 1);
    let n2 = 0.6, n3 = 1.3, n4 = 0.3;
    if (variant === 0) { n2 = 0.55; n3 = 2.0; }
    n2 *= 1.05 - rng.next() * 0.1;
    n3 *= 1.05 - rng.next() * 0.1;
    n4 *= 1.0 - rng.next() * 0.1;
    const n5 = rng.int(105, 124);
    const n6 = Math.trunc(n5 * n4);
    const n7 = Math.trunc(n5 * n2);
    const n8 = rng.int(9, 12);
    const x0 = X - n5, x1 = X + n5, y0 = Y - n5, y1 = Y + n5;
    for (let k = y0; k <= y1; k++) {
      for (let l = x0; l <= x1; l++) {
        if (l < 50 || k < 50 || l >= w - 50 || k >= h - 50) return false;
        const t = type[k * w + l];
        if (t === CRIM || t === EBON) return false;
      }
    }
    let n13 = Y, n14 = Y - n8;
    if (rng.int(0, 3) === 0) n13 = Y - rng.int(0, 1);
    if (rng.int(0, 3) === 0) n14 = Y - n8 - rng.int(0, 1);
    head = { variant, n2, n3, n4, n5, n6, n7, n8, x0, x1, y0, y1, X, Y, n13_0: n13, n14_0: n14 };
    for (let k = y0; k <= y1; k++) {
      for (let l = x0; l <= x1; l++) {
        const i = k * w + l;
        if (rng.int(0, 3) === 0) n13 = Y - rng.int(0, 1);
        if (rng.int(0, 3) === 0) n14 = Y - n8 + rng.int(0, 1);
        const j1 = rng.next(); const j2 = rng.next();
        const a = Math.abs(l - X), b = Math.abs(k - Y);
        const f = k <= Y ? 1.4 : 1.2;
        let n15 = Math.trunc(Math.sqrt(
          (a * (1 + j1 * 0.02)) ** 2 + (b * f * (1 + j2 * 0.02)) ** 2,
        ));
        if (n15 < n5) {
          slope[i] = 0; half[i] = 0;
          type[i] = TILE_BY_KEY['stone']!.id;
          if (l > x0 + 5 + rng.int(0, 1) && l < x1 - 5 - rng.int(0, 1)) flags[i] = 1;
          if (n15 < n5 * 0.9) cleared.push({ l, k }); // wall=0 写在相 2c 统一应用
        }
        {
          const ja = rng.next(); const jb = rng.next();
          const n15b = Math.trunc(Math.sqrt(
            (a * (1 + ja * 0.02)) ** 2 + (b * n3 * (1 + jb * 0.02)) ** 2,
          ));
          if (k > n14 && k < n13) flags[i] = 0;
          if (k < n13) {
            const jc = rng.next();
            if (n15b < Math.trunc(n7 * (1 + jc * 0.02))) flags[i] = 0;
          }
        }
        {
          const ja = rng.next(); const jb = rng.next();
          const n15c = Math.trunc(Math.sqrt(
            (a * (1 + ja * 0.02)) ** 2 + ((b * 2) * (1 + jb * 0.02)) ** 2,
          ));
          if (!(k < Y - 1)) {
            const jd = rng.next();
            if (!(n15c >= Math.trunc(n6 * (1 + jd * 0.025)))) {
              let deact = true;
              if (!(k <= Y + 2) && n15c === n6 - 1) { deact = rng.int(0, 1) !== 0; }
              if (deact) flags[i] = 0;
            }
          }
        }
      }
    }
    return true;
  };

  let y = rng.int(yLoBase, yHi - 1);
  let x = pickX(false);
  let tries = 0;
  let ok = false;
  for (;;) {
    X = x; Y = y;
    if (attempt()) { ok = true; break; }
    tries++;
    if (tries > 20000) { y = rng.int(ws + 100 + 20, yHi - 1); x = pickX(true); }
    else { y = rng.int(Math.trunc((ws + rl) / 2) + 20, yHi - 1); x = pickX(false); }
  }
  expect(ok, '重放未收敛').toBe(true);
  expect([X, Y], `重放中心≠gs.shimmer`).toEqual([SX, SY]);
  console.log(`[i156] 主体环收敛 tries=${tries} head=${JSON.stringify(head)} 消费掷=${ri}/${rolls.length}`);

  // ── 相 2b：ShimmerMakeBiomeOpening 双谓词镜像（西臂先,东臂后;cs:35095-35125） ──
  const mkPred = (strict: boolean) => (tv: Uint16Array, fv: Uint8Array, hv: Uint8Array, sv: Uint8Array, wv: Uint8Array, xx: number, yy: number): boolean => {
    if (xx < 0 || yy < 0 || xx >= w || yy >= h) return false;
    const i = yy * w + xx;
    if (strict) {
      if ((fv[i] & 1) === 0) return false;                 // active()
      if ((wv[i] & 32) !== 0) return false;                // !inActive
      const sh = SHEET_OF_TYPE[tv[i]];
      if (sh < 0 || VAN_TILE_SOLID_EXTRA.has(sh)) return false; // !tileSolidTop∪非实心族
      return genSolidLocal(tv[i]) && hv[i] === 0 && sv[i] === 0;
    }
    // 现盘 ShimmerPass.shimmerOpening solidAt（弱谓词）
    return fv[i] !== 0 && genSolidLocal(tv[i]);
  };
  const scanDiv: { l: number; k: number; type: number; sheet: number; flags: number; half: number; slope: number; wire: number; weak: boolean; strict: boolean }[] = [];
  const walkOpenings = (strict: boolean): { writes: { l: number; k: number; row: string }[]; consumed: number; iterEast: number } => {
    // 独立工作副本（含主体环写面已应用的状态）
    const tv = cap!.type.slice(), fv = cap!.flags.slice(), hv = cap!.half.slice(), sv = cap!.slope.slice(), wv = cap!.wall.slice(), wr = cap!.wire.slice();
    // 主体环写面：椭圆内 type=stone/slope=0/half=0/flags=1（n15<n5 区）;wall 清除集;flags 清 0 区
    const hd = head!;
    let n13 = hd.n13_0, n14 = hd.n14_0;
    // 主体环的状态写已在上面的 attempt() 里直接应用到 cap 数组（flags/half/slope/type 被原位改写）
    // ——此处直接引用 cap 即可（attempt 已跑完）;wall 清除写入：
    for (const c of cleared) wv[c.k * w + c.l] = 0;
    const writes: { l: number; k: number; row: string }[] = [];
    let consumedTotal = 0;
    let iterEast = 0;
    const solidAt = mkPred(strict);
    const runOpening = (dir: number, Xo: number, Yo: number, size: number): number => {
      let num = Xo;
      let yy = Yo;
      size--;
      let iter = 0;
      const localRng = {
        int: (a: number, b: number): number => { consumedTotal++; return rng.int(a, b); },
      };
      for (;;) {
        iter++;
        num += dir;
        let open = true;
        for (let i = yy - size + 1; i < yy - 1; i++) {
          if (dir === 1) {
            for (const cx of [num, num + 1, num + 2]) {
              const wv1 = mkPred(false)(tv, fv, hv, sv, wr, cx, i);
              const sv1 = mkPred(true)(tv, fv, hv, sv, wr, cx, i);
              if (wv1 !== sv1 && scanDiv.length < 40) {
                const ii2 = i * w + cx;
                scanDiv.push({ l: cx, k: i, type: tv[ii2], sheet: SHEET_OF_TYPE[tv[ii2]], flags: fv[ii2], half: hv[ii2], slope: sv[ii2], wire: wr[ii2], weak: wv1, strict: sv1 });
              }
            }
          }
          if (solidAt(tv, fv, hv, sv, wr, num, i)) open = false;
          if (solidAt(tv, fv, hv, sv, wr, num + dir, i)) open = false;
          if (solidAt(tv, fv, hv, sv, wr, num + dir * 2, i)) open = false;
          if (num >= 0 && i >= 0 && num < w && i < h) fv[i * w + num] = 0; // st.flags[num,i]=0
        }
        for (let j = yy - size; j < yy; j++) {
          const px = num - dir;
          if (px >= 0 && j >= 0 && px < w && j < h) fv[j * w + px] = 0;
        }
        {
          const px = num - dir, py = yy - size - 1;
          if (px >= 0 && py >= 0 && px < w && py < h && solidAt(tv, fv, hv, sv, wr, px, py)) { writes.push({ l: px, k: py, row: 'top' }); wv[py * w + px] = 0; }
        }
        {
          const px = num - dir, py = yy;
          if (px >= 0 && py >= 0 && px < w && py < h && solidAt(tv, fv, hv, sv, wr, px, py)) { writes.push({ l: px, k: py, row: 'Y' }); wv[py * w + px] = 0; }
        }
        if (localRng.int(0, 1) === 0) yy += localRng.int(-1, 1);
        if (open || num < 50 || num > w - 50 || Math.abs(num - Xo) > 100) break;
      }
      return iter;
    };
    // 西臂(-1, X−n5, Y, n8) → 东臂(+1, X+n5, Y, n8)
    runOpening(-1, X - hd.n5, Y, hd.n8);
    iterEast = runOpening(1, X + hd.n5, Y, hd.n8);
    return { writes, consumed: consumedTotal, iterEast };
  };

  const weak = walkOpenings(false);
  const strict = walkOpenings(true);
  console.log(`[i156] 开口臂镜像: eastIter weak=${weak.iterEast} strict=${strict.iterEast} 开口掷 weak=${weak.consumed} strict=${strict.consumed}`);
  const key = (w: { l: number; k: number }) => `${w.l},${w.k}`;
  const wk = new Set(weak.writes.map(key));
  const st2 = new Set(strict.writes.map(key));
  const weakOnly = weak.writes.filter((v) => !st2.has(key(v)));
  const strictOnly = strict.writes.filter((v) => !wk.has(key(v)));
  console.log(`[i156] 开口 wall 写: weak=${weak.writes.length} strict=${strict.writes.length} weakOnly=${JSON.stringify(weak.writes.filter((v) => !st2.has(key(v))).map(key))} strictOnly=${JSON.stringify(strictOnly.map(key))}`);

  // 离线迭代档：相关窗六通道+head+rolls
  const wx0 = 100, wx1 = 560, wy0 = 400, wy1 = 700;
  const win = { w0: wx0, w1: wx1, h0: wy0, h1: wy1 };
  const sl = (a: Uint16Array | Uint8Array) => {
    const o: number[] = [];
    for (let k = wy0; k <= wy1; k++) for (let l = wx0; l <= wx1; l++) o.push(a[k * W + l]);
    return o;
  };
  writeFileSync(`${OUT}/ulp-state.json`, JSON.stringify({
    win, seed: seedNum, head, shimmer: [SX, SY],
    type: sl(cap!.type), wall: sl(cap!.wall), flags: sl(cap!.flags), half: sl(cap!.half), slope: sl(cap!.slope), wire: sl(cap!.wire),
    rolls, consumedMain: ri,
  }));
  // ── 相 2c：全图 wall 差集 vs 弱谓词全量写面（主体+开口） ──
  const pre = cap!.wall, post = postWall!;
  const delta: string[] = [];
  for (let i = 0; i < pre.length; i++) if (pre[i] !== 0 && post[i] === 0) delta.push(`${i % w},${Math.floor(i / w)}`);
  const deltaSet = new Set(delta);
  const weakAll = new Set<string>([...cleared.map((c) => `${c.l},${c.k}`), ...weak.writes.map(key)]);
  const missDelta = delta.filter((v) => !weakAll.has(v));
  const extraWeak = [...weakAll].filter((v) => !deltaSet.has(v));
  console.log(`[i156] 全图 wall 差集=${delta.length} 弱谓词全量写面=${weakAll.size} 差集独有=${JSON.stringify(missDelta)} 写面独有=${JSON.stringify(extraWeak.slice(0, 8))}`);
  expect(missDelta, '实测差集有镜像未覆盖格').toEqual([]);
  expect(extraWeak, '镜像多清除格').toEqual([]);

  // ── 相 3：目标格取证落盘 ──
  const ti = TGT.y * w + TGT.x;
  const tgtInfo = {
    cell: TGT, typeAtEntry: cap!.type[ti], sheet: SHEET_OF_TYPE[cap!.type[ti]],
    flags: cap!.flags[ti], half: cap!.half[ti], slope: cap!.slope[ti], wire: cap!.wire[ti],
    wallPre: pre[ti], wallPost: post[ti],
    inWeakWrites: wk.has(`${TGT.x},${TGT.y}`), inStrictWrites: st2.has(`${TGT.x},${TGT.y}`),
  };
  console.log(`[i156] 目标格取证: ${JSON.stringify(tgtInfo)}`);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/ulp-walk-v2.json`, JSON.stringify({ head, tries, tgtInfo, weakOnly: weakOnly.map(key), strictOnly: strictOnly.map(key), deltaCount: delta.length, consumedMain: ri, consumedOpeningWeak: weak.consumed, consumedOpeningStrict: strict.consumed, eastIterWeak: weak.iterEast, eastIterStrict: strict.iterEast, scanDiv: scanDiv }, null, 1));
  console.log(`[i156] done`);
}, 600_000);
