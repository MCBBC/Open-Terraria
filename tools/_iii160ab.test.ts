// IIII160 批一次性取证仪（源=_iii112cap 拷贝，AMENDED）：REMIX UHBC 窗内【管线内直接】attempt 台账采集。
// 不经 hydrate 重放（° mem 备案：gs 快照携带发散结构 registry ⇒ 结构类 pass 重放不可信），
// 在全管线生成中以 RNG.reseed 栈的**调用点行号**为锚开窗：
//   WorldGen.ts ▶Statues(~1314) → ▶UHBC(~1318) 开窗 → ▶SurfaceChests(~1333) 关窗。
// 窗内捕获：ab/abx/lend(ChestEv)、HK 房屋组(Stage/Gate/Mk/Rooms/Ev)、ChestWrite、
// ChestDbg、每掷 rollN；窗闭时拍 store 八通道 face 快照并离线自校验 vs dump058/059。
// 用法：
//   cd game && SW_MB_1457=1 SW_I112CAP=1 npx vitest run tools/_iii112cap.test.ts
//   （可选 SW_I112_OUT=/tmp/iii112-out）
import { it } from 'vitest';
import { readFileSync, existsSync, readdirSync, mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I112CAP === '1';
const OUT = process.env.SW_I112_OUT ?? '/tmp/iii160-out/js';
const G2 = process.env.SW_TM_G2 ?? `${process.env.HOME}/GoldenChains/golden-remix/dumps`;
const SEED = process.env.SW_M8_SEED ?? '1138154190';

let SHEET_N = 0;

(RUN ? it : it.skip)('REMIX UHBC window in-pipeline attempt ledger', async () => {
  const DUMPNAME = new Map<number, string>();
  try {
    for (const f of readdirSync(G2)) {
      const m = f.match(/^(\d{3})_(.+)\.typ$/);
      if (m) DUMPNAME.set(Number(m[1]), m[2]);
    }
  } catch { /* */ }
  const le16 = (p: string): Uint16Array => {
    const b = readFileSync(p);
    return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
  };
  interface FaceArr { typ?: Uint16Array; act?: Uint8Array; wal?: Uint16Array }
  const loadDump = (idx: number): FaceArr | null => {
    if (!DUMPNAME.has(idx)) return null;
    const p = `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}`;
    if (!existsSync(`${p}.typ`)) return null;
    return { typ: le16(`${p}.typ`), act: readFileSync(`${p}.act`), wal: le16(`${p}.wal`) };
  };
  mkdirSync(OUT, { recursive: true });
  {
    const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
    for (let i = 0; i < TILE_DEFS.length; i++) SHEET[i] = TILE_DEFS[i]?.vanilla?.sheet ?? -1;
    writeFileSync(`${OUT}/sheet.bin`, Buffer.from(SHEET.buffer));
  }
  const winF = `${OUT}/win-attempts.txt`;
  const hkF = `${OUT}/win-hk.txt`;
  try { writeFileSync(winF, ''); writeFileSync(hkF, ''); } catch { /* */ }

  let curStore: { type: Uint16Array; flags: Uint8Array; wall: Uint16Array } | null = null;
  let evSince = 0;
  let rollN = 0;
  // ★行号锚定：读 WorldGen.ts 实测 ▶Statues/▶UHBC/▶SurfChests 三条 reseed 行号（源漂移免疫——运行时扫描行内容而非硬编码）
  const wgPath = new URL('../src/world/gen/WorldGen.ts', import.meta.url).pathname.replace(/^\/private/, '');
  const wgSrc = readFileSync(wgPath, 'utf8').split('\n');
  let LN_STAT = -1, LN_UHBC = -1, LN_SURF = -1, LN_JUNC = -1;
  for (let i = 0; i < wgSrc.length; i++) {
    const t = wgSrc[i]!;
    if (!t.includes('rng.reseed(gs.seed)')) continue;
    const seg = `${wgSrc.slice(Math.max(0, i - 1), i + 1).join(' ')}`;
    if (/▶Statues\b/.test(seg) && !LN_STAT) continue;
    if (LN_STAT < 0 && /▶Statues\s/.test(t) && t.includes('rng.reseed')) LN_STAT = i + 1;
    else if (LN_UHBC < 0 && /▶UndergroundHousesAndBuriedChests/.test(t) && t.includes('rng.reseed')) LN_UHBC = i + 1;
    else if (LN_SURF < 0 && /▶SurfaceChests/.test(t) && t.includes('rng.reseed')) LN_SURF = i + 1;
    else if (LN_JUNC < 0 && /▶ChestsInJungleShrines/.test(t) && t.includes('rng.reseed')) LN_JUNC = i + 1;
  }
  console.log(`anchors: Statues#${LN_STAT} UHBC#${LN_UHBC} Surf#${LN_SURF} Junc#${LN_JUNC}`);
  if (LN_UHBC < 0 || LN_STAT < 0) throw new Error('WorldGen.ts 行号锚失效——槽体注释可能被移动');

  const g = globalThis as unknown as Record<string, unknown>;
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  const oRoll = g.__swOnRoll as ((v: number, inst?: object) => void) | undefined;

  let winOn = false;
  let winSnapDone = false;
  let winRolls = 0;
  let openedAt = '';
  const winVals: string[] = [];

  const wr = (file: string, s: string): void => { try { appendFileSync(file, s + '\n'); } catch { /* */ } };

  RNGp.reseed = function (this: unknown, s: number) {
    // 记录本事件前已在窗口内的掷数关闭点（关窗时点=下一 reseed 行号命中或随后任意调用栈）
    const stack = new Error().stack ?? '';
    let siteLine = -1; let srcFile = '';
    for (const line of stack.split('\n')) {
      const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii112')) {
        srcFile = m[1]; siteLine = Number(m[2]); break;
      }
    }
    if (siteLine === LN_UHBC) {
      winOn = true;
      openedAt = `${srcFile.split('/').pop()}:${siteLine}`;
      console.log(`[WIN] opened at ${openedAt}`);
    } else if (siteLine === LN_SURF && !winSnapDone) {
      // ▶SurfaceChests reseed 时点 = UHBC 段末——八通道快照落盘（离线对拍真值基面）
      winSnapDone = true;
      try {
        const stt = curStore as unknown as Record<string, Uint8Array | Uint16Array> | null;
        if (stt) {
          const dir = `${OUT}/snap-surf`;
          mkdirSync(dir, { recursive: true });
          for (const c of ['type', 'flags', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire'] as const) {
            const arr = stt[c]!;
            writeFileSync(`${dir}/${c}.bin`, Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength));
          }
          console.log(`[SNAP] ${dir} (at Surf reseed, winRolls=${winRolls})`);
        }
      } catch (e) { console.log(`[SNAP] failed ${e}`); }
    } else if (siteLine === LN_JUNC) {
      // 关窗（Surf 段结束后的下一条独立 reseed——比 1333 本行更稳）
      if (winOn) {
        console.log(`[WIN] closed at ${srcFile.split('/').pop()}:${siteLine} winRolls=${winRolls}`);
        writeFileSync(`${OUT}/win-values.txt`, winVals.join('\n') + '\n');
        if (TRACE_ALL) writeFileSync(`${OUT}/die-sites.txt`, allSites.join('\n') + '\n');
        selfFaceCheck();
        winOn = false;
      }
    }
    return oReseed.call(this, s);
  };
  function selfFaceCheck(): void {
    if (!curStore) return;
    // 数 box 体差异：JS chest 型位集合 vs dump059
    const d59 = loadDump(59);
    if (!d59) return;
    let diff = 0;
    const N = curStore.flags.length;
    const shOf = (v: number): number => v;
    void shOf; void SHEET_N;
    for (let i = 0; i < N; i++) {
      const ja = curStore.flags[i]! & 1;
      const va = d59.act![i]!;
      if (va !== ja) { diff++; continue; }
      if (va && d59.typ![i] !== curStore.type[i]) {
        if (d59.typ![i] === 21 || d59.typ![i] === 467 || curStore.type[i] === 21 || curStore.type[i] === 467) diff++;
      }
    }
    console.log(`[SELF] active+chestcells diff vs dump059 = ${diff}`);
  }

  const TRACE_HEAD = Number(process.env.SW_I112_TRACEHEAD ?? '0');
  const TRACE_ALL = process.env.SW_I112_TRACEALL === '1';
  let headCount = 0;
  const allSites: string[] = [];
  g.__swOnRoll = (v: number) => {
    rollN++; evSince++;
    if (winOn) {
      winRolls++; winVals.push(`${rollN}|${v}`);
      if (TRACE_ALL || (TRACE_HEAD > 0 && headCount < TRACE_HEAD)) {
        headCount++;
        let site = '?'; let site2 = '?';
        const st = (new Error().stack ?? '').split('\n');
        for (const line of st) {
          const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
          if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii112')) { site = `${m[1].replace(/^.*?(src\/)/, '$1')}:${m[2]}`; break; }
        }
        let seen1 = false;
        for (const line of st) {
          const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
          if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii112')) {
            if (seen1) { site2 = `${m[1].replace(/^.*?(src\/)/, '$1')}:${m[2]}`; break; }
            seen1 = true;
          }
        }
        if (TRACE_ALL) allSites.push(`${rollN - 107452525}|${v}|${site} | ${site2}`);
        else wr(`${OUT}/head-trace.txt`, `${rollN}|${v}|${site}`);
      }
    }
    oRoll?.(v);
  };
  g.__swChestEv = (p: string, i: number, j: number, x?: number) => {
    if (!winOn) return;
    if (p === 'ab') { abOpen = abCid++; abOpenCalls.push(abOpen); wr(abF, `c${abOpen}|ab|${i}|${j}|n=${rollN}`); }
    else if (p === 'abx' && abOpen >= 0) { wr(abF, `c${abOpen}|abx|${i}|${j}|${x ?? ''}|n=${rollN}`); abOpen = -1; }
    wr(winF, `${p}|${i}|${j}|${x ?? ''}|n=${rollN}`);
  };

  g.__swChestWrite = (i: number, topY: number, tile: number, style: number, fx: number) => {
    if (!winOn) return;
    wr(hkF, `CW|${i},${topY}|t${tile}s${style}fx${fx}|n=${rollN}`);
  };
  g.__swChestDbg = (i: number, gy: number, why: string) => {
    if (!winOn) return;
    wr(hkF, `CD|${i},${gy}|${why}|n=${rollN}`);
  };
  g.__swHouseGate = (gate: string, x: number, y: number) => {
    if (!winOn) return;
    wr(hkF, `HKG|${gate}|${x},${y}|n=${rollN}`);
  };
  g.__swHouseRooms = (ox: number, oy: number, rooms: string) => {
    if (!winOn) return;
    wr(hkF, `HKR|${ox},${oy}|${rooms}|n=${rollN}`);
  };
  g.__swHouseEv = (phase: string, x: number, y: number) => {
    if (!winOn) return;
    wr(hkF, `HKE|${phase}|${x},${y}|n=${rollN}`);
  };
  g.__swHouseStage = (tag: string, a: number, b: number, c: number, d: number) => {
    if (!winOn) return;
    wr(hkF, `HKS|${tag}|${a},${b}|${c},${d}|n=${rollN}`);
  };
  g.__swHouseMk = (name: string, s?: unknown, t?: unknown) => {
    if (!winOn) return;
    wr(hkF, `HKM|${name}|${s ?? ''}|${t ?? ''}|n=${rollN}`);
  };
  g.__swAbGate = (tag: string, ai: number, aj: number, extra?: number) => {
    if (!winOn) return;
    wr(hkF, `G|${tag}|${ai},${aj}${extra !== undefined ? '|' + extra : ''}|n=${rollN}`);
  };
  const abF = `${OUT}/js-ablog2.txt`;
  try { writeFileSync(abF, ''); } catch { /* */ }
  let abCid = 0; let abOpen = -1; const abOpenCalls: number[] = [];
  g.__swAbRow = (rec: string) => {
    if (!winOn || abOpen < 0) return;
    wr(abF, `c${abOpen}|${rec}|n=${rollN}`);
  };
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: SEED, evil: 0,
      seedFlags: { remix: true },
      onWorldPartial: (w2) => {
        curStore = w2.store as never;
      },
    });
  } finally {
    RNGp.reseed = oReseed;
    g.__swOnRoll = oRoll;
    delete g.__swChestEv; delete g.__swChestWrite; delete g.__swChestDbg;
    delete g.__swHouseGate; delete g.__swHouseRooms; delete g.__swHouseEv; delete g.__swHouseStage; delete g.__swHouseMk;
    delete g.__swAbGate; delete g.__swAbRow;
  }
}, 600_000);
