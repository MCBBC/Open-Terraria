// QQQBC 探针（qqq-b 会话私有）：Tile_Cleanup 原版语义离线重放（诊断用，用完即删）。
// 输入：/tmp/jjj-out/g1457-s22222/099_*（8通道前态）+ /tmp/qqq-out/xd100.txt（x86 原始流）
// 输出：replay-ev.txt（事件流）+ 终态 vs 100_Tile_Cleanup 逐格校验 + 与 jsb-seg4.txt 首分叉
import { it } from 'vitest';
import { readFileSync, openSync, writeSync, closeSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_QQQBC === '1';
(RUN ? it : it.skip)('vanilla TileCleanup offline replay', async () => {
  const D = '/tmp/jjj-out/g1457-s22222';
  const W = 4200, H = 1200, N = W * H;
  const rd8 = (p: string) => new Uint8Array(readFileSync(p).buffer, 0, N);
  const rd16 = (p: string) => new Uint16Array(readFileSync(p).buffer, 0, N);
  const base = `${D}/099_Cactus__Palm_Trees____Coral`;
  const typ = rd16(`${base}.typ`), wal = rd16(`${base}.wal`);
  const act = rd8(`${base}.act`), liq = rd8(`${base}.liq`);
  const hf = rd8(`${base}.half`), sl = rd8(`${base}.slope`);
  const lt = rd8(`${base}.lty`);           // vanilla 0 基（0水1岩2蜜3微光）
  const inact = rd8(`${base}.inact`);

  // ── 静态表 ──
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let q = 0; q < TILE_DEFS.length; q++) {
    const s = TILE_DEFS[q]?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[q] = s;
  }
  void SHEET;
  const SOLID_TOP = new Set([14, 16, 18, 19, 87, 88, 101, 114, 134, 239, 275, 276, 277, 278, 279, 280, 281,
    285, 286, 296, 297, 298, 299, 309, 310, 339, 358, 359, 361, 362, 363, 364, 376, 380, 391, 392, 393, 394,
    405, 413, 414, 427, 469, 532, 533, 538, 542, 544, 550, 551, 553, 554, 555, 556, 558, 559, 582, 599, 600,
    601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 619, 629, 632, 640, 643, 644, 645, 710]);
  const NON_SOLID_SAVE = new Set([131, 351, 336, 340, 341, 342, 343, 344]);
  const SDIW = new Set([3, 20, 24, 27, 73, 201, 80, 110, 529, 530, 590, 595, 615, 637]);
  const SANDSTONE = new Set([396, 400, 403, 401]);
  const HARDENED = new Set([397, 398, 402, 399]);
  const solidOf = new Uint8Array(1024);
  /** Tile_Cleanup 时点仍生效的 GenSolid 覆写（GenSolid.ts 时间线逐条推演） */
  const TC_OVERRIDE: Record<number, number> = { 659: 0, 484: 0, 190: 0, 192: 0, 481: 0, 482: 0, 483: 0, 225: 0 };
  const PLATFORM_EXTRA = new Set([19, 239, 380, 427, 435, 436, 437, 438, 439]);
  for (let q = 0; q < TILE_DEFS.length; q++) {
    const sh = TILE_DEFS[q]?.vanilla?.sheet;
    if (typeof sh !== 'number' || sh >= 1024) continue;
    const ov = TC_OVERRIDE[sh];
    const eff = ov !== undefined ? ov === 1
      : (!!TILE_DEFS[q]?.solid || PLATFORM_EXTRA.has(sh));
    if (eff) solidOf[sh] = 1;
  }
  solidOf[379] = 0;   // ① pass 头翻转
  const saveSlope = new Uint8Array(1024);
  for (let t = 0; t < 1024; t++) saveSlope[t] = solidOf[t] || (NON_SOLID_SAVE.has(t) ? 1 : 0);

  // ── RNG：x86 原始 InternalSample 流 ──
  const rollLines = readFileSync('/tmp/qqq-out/xd100.txt', 'utf8').trim().split('\n');
  const rolls = rollLines.map(Number);
  let rp = 0;
  const K = 4.656612875245797e-10;
  const nxt = (): number => rolls[rp++]!;
  const nextInt = (maxValue: number) => Math.trunc(nxt() * K * maxValue);
  const nextRange = (minValue: number, maxValue: number) =>
    Math.trunc(nxt() * K * (maxValue - minValue)) + minValue;

  // ── 事件流 ──
  const evh = openSync('/tmp/qqq-out/replay-ev.txt', 'w');
  let ebuf: string[] = [];
  const ev = (s: string) => { ebuf.push(s + '\n'); if (ebuf.length >= 400_000) { writeSync(evh, ebuf.join('')); ebuf = []; } };

  const I = (x: number, y: number) => y * W + x;
  const A = (x: number, y: number) => act[I(x, y)]!;
  const TY = (x: number, y: number) => typ[I(x, y)]!;
  const solidTile = (x: number, y: number): boolean => {
    const i = I(x, y), t = typ[i]!;
    return act[i] === 1 && solidOf[t] === 1 && !SOLID_TOP.has(t) && hf[i] === 0 && sl[i] === 0 && inact[i] === 0;
  };
  const shimmer = (x: number, y: number) => lt[I(x, y)] === 3;

  const TREE_TRUNK = new Set([5, 72, 583, 584, 585, 586, 587, 588, 589, 596, 616, 634]);
  const UP_PROT = new Set([21, 26, 72, 77, 88, 467, 488]);
  const canKillTile = (x: number, y: number): boolean => {
    if (wal[I(x, y)] === 350) return false;
    const ui = I(x, y - 1);
    if (act[ui]) {
      const ut = typ[ui]!;
      if (UP_PROT.has(ut) && typ[I(x, y)] !== ut) return false;
      if (TREE_TRUNK.has(ut) || ut === 323) return false; // ★帧位例外未实现（无帧通道）——校验暴露再补
    }
    return true;
  };

  const killTile = (x: number, y: number): void => {
    const i = I(x, y);
    const t = typ[i]!;
    if (t === 24 || t === 27) { for (let q = 0; q < 10; q++) nextInt(2); ev(`KD ${x} ${y} ${t}`); }
    else ev(`K ${x} ${y} ${t}`);
    act[i] = 0; typ[i] = 0; hf[i] = 0; sl[i] = 0; inact[i] = 0;
  };

  // ── ② 全图清坡 ──
  for (let i = 0; i < N; i++) {
    if (!act[i] || !saveSlope[typ[i]!]) { sl[i] = 0; hf[i] = 0; }
  }

  // ── 主循环 ──
  for (let k = 40; k < W - 40; k++) {
    for (let l = 40; l < H - 40; l++) {
      const i = I(k, l);
      // ③
      if (act[i] && (sl[i] === 1 || sl[i] === 2)) {
        const s = sl[i]!;
        const leftSlope = s === 2 || s === 4, rightSlope = s === 1 || s === 3;
        if ((leftSlope && act[I(k + 1, l)] && hf[I(k + 1, l)]) || (rightSlope && act[I(k - 1, l)] && hf[I(k - 1, l)])) {
          sl[i] = 0; hf[i] = 1;
        }
      }
      // ④
      if (act[i] && liq[i]! > 0 && SDIW.has(typ[i]!)) killTile(k, l);
      // ⑤
      if (!act[i] && liq[i] === 0) {
        const r3 = nextInt(3);
        ev(`G ${k} ${l} ${r3}`);
        if (r3 !== 0 && solidTile(k, l - 1)) {
          let placed = false;
          const num = nextRange(15, 21);
          ev(`U ${k} ${l} ${num}`);
          for (let n2 = l - 2; n2 >= l - num; n2--) {
            if (liq[I(k, n2)]! >= 128 && !shimmer(k, n2)) {
              const maxValue = l - n2;
              const rv = nextInt(maxValue);
              ev(`UQ ${k} ${n2} ${maxValue} ${rv}`);
              if (rv <= 1) {
                const L = lt[I(k, n2)]!;
                let drip = L === 1 ? 374 : L === 2 ? 375 : L === 3 ? 709 : 373;
                if (wal[i] === 86) drip = 375;
                typ[i] = drip; hf[i] = 0; sl[i] = 0; inact[i] = 0; act[i] = 1;
                placed = true;
                break;
              }
            }
          }
          if (!placed) {
            const dn = nextRange(3, 11);
            ev(`D ${k} ${l} ${dn}`);
            for (let m = l + 1; m <= l + dn; m++) {
              if (liq[I(k, m)]! >= 200 && !shimmer(k, m)) {
                const arg = (m - l) * 3;
                const rv = nextInt(arg);
                ev(`DQ ${k} ${m} ${arg} ${rv}`);
                if (rv <= 1) {
                  const L = lt[I(k, m)]!;
                  typ[i] = L === 1 ? 374 : L === 2 ? 375 : L === 3 ? 709 : 373;
                  hf[i] = 0; sl[i] = 0; inact[i] = 0; act[i] = 1;
                  placed = true;
                  break;
                }
              }
            }
          }
          if (!placed) {
            const sv = nextInt(4);
            ev(`S4 ${k} ${l} ${sv}`);
            if (sv === 0 && (SANDSTONE.has(TY(k, l - 1)) || HARDENED.has(TY(k, l - 1)))) {
              typ[i] = 461; hf[i] = 0; sl[i] = 0; inact[i] = 0; act[i] = 1;
            }
          }
        }
      }
      // ⑥
      if (wal[i] === 13 || wal[i] === 14 || wal[i] === 87) liq[i] = 0;
      // ⑦162（1457 双邻门；137 雕像邻清需帧通道，跳过——校验暴露再补）
      if (act[i] && typ[i] === 162
        && !act[I(k, l - 1)] && !act[I(k, l + 1)] && liq[I(k, l + 1)] === 0
        && canKillTile(k, l)) {
        act[i] = 0;
      }
      // ⑪
      if (act[i] && typ[i] === 237 && typ[I(k, l + 1)] === 232) typ[I(k, l + 1)] = 226;
    }
  }

  if (ebuf.length) writeSync(evh, ebuf.join(''));
  closeSync(evh);
  console.log(`replay rolls consumed: ${rp} (x86 captured ${rolls.length})`);
  console.log(`replay events: ${rp > 0 ? 'ok' : '?'}`);

  // ── 校验：终态 vs dump#100 ──
  const vA = rd8(`${D}/100_Tile_Cleanup.act`), vT = rd16(`${D}/100_Tile_Cleanup.typ`);
  const vL = rd8(`${D}/100_Tile_Cleanup.liq`);
  let dA = 0, dT = 0, dL = 0;
  const badSamp: string[] = [];
  for (let i = 0; i < N; i++) {
    if (act[i] !== vA[i]) { dA++; if (badSamp.length < 12) badSamp.push(`A(${i % W},${(i / W) | 0}) r${act[i]} v${vA[i]} t${typ[i]}/${vT[i]}`); continue; }
    if (act[i] && typ[i] !== vT[i]) { dT++; if (badSamp.length < 12) badSamp.push(`T(${i % W},${(i / W) | 0}) r${typ[i]} v${vT[i]}`); }
    if (liq[i] !== vL[i]) dL++;
  }
  console.log(`replay vs dump100: dA=${dA} dT=${dT} dL=${dL}`);
  for (const s of badSamp) console.log('  ', s);
}, 600_000);
