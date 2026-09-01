// IIII114：rainforest #042 Living_Trees 窗内掷流镜像仪（x86 插桩 rig 对拍件）。
// 承 XXXVIII §⑤ 移交1 / XLII 链④「无 x86 侧对照物不可判」——x86 侧 rf 插桩 rig
// （/tmp/i150-rig.app，SW_FLAG_REFOREST 注入钩照 IIII80 先例）产 RollWin 窗流 +
// TagWriter 栈标签流；本仪在 JS 侧镜像同窗（▶LivingTrees → ▶LivingTreeWalls）：
//   ① 窗内 __swOnRoll 捕获主实例每掷 raw value（与 x86 RollWin 同格式逐行）
//   ② 每掷附带 JS 调用点栈标签（file:line，≤4 帧 src/ 域）
//   ③ 双锚八通道 face 快照（typ 折算 vanilla sheet 域）供 rf-cmp 直方图复验
// 用法：cd game && SW_MB_1457=1 SW_RF=1 npx vitest run tools/_iii150rf.test.ts --no-file-parallelism
//   SW_RF_OUT=/tmp/iii150-out/cap-rf2  SW_RF_SEED='1.1.1.0.savetherainforest|106101'
import { it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, createWriteStream } from 'node:fs';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_RF === '1';
const OUT = process.env.SW_RF_OUT ?? '/tmp/iii150-out/cap-rf2';
const SEED = process.env.SW_RF_SEED ?? '1.1.1.0.savetherainforest|106101';
const EVIL = Number(process.env.SW_RF_EVIL ?? -1);
const LABELS = (process.env.SW_RF_LABELS ?? 'LivingTrees,LivingTreeWalls').split(',');
const WANT_TAGS = process.env.SW_RF_TAGS !== '0';
const CHANS = ['flags', 'type', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire'] as const;
mkdirSync(OUT, { recursive: true });
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

(RUN ? it : it.skip)('iiiiii114 rf window roll mirror', async () => {
  let storeHolder: { st?: Record<string, Uint8Array | Uint16Array> } = {};
  const done = new Set<string>();
  const take = (nm: string): void => {
    const st = storeHolder.st!;
    for (const c of CHANS) {
      const srcA = st[c]!;
      if (c === 'type') {
        const out = new Int16Array(srcA.length);
        for (let i = 0; i < srcA.length; i++) out[i] = st.flags[i] ? SHEET[srcA[i]!] ?? 9999 : SHEET[srcA[i]!] ?? 9999;
        writeFileSync(`${OUT}/j_${nm}_typ.bin`, Buffer.from(out.buffer, out.byteOffset, out.byteLength));
      } else {
        writeFileSync(`${OUT}/j_${nm}_${c}.bin`, Buffer.from(srcA.buffer, srcA.byteOffset, srcA.byteLength));
      }
    }
    console.log(`[rf] snap ${nm}`);
  };

  // 窗口状态机：▶LivingTrees 开窗、▶LivingTreeWalls 关窗
  let winOpen = false;
  let winLabel = '';
  const rollWs = createWriteStream(`${OUT}/rf-rolls-js.txt`);
  const tagWs = createWriteStream(`${OUT}/rf-tags-js.txt`);
  let rollBuf: string[] = [];
  let tagBuf: string[] = [];
  let ln = 0;
  let mainTok: object | null = null;
  const tokCnt = new Map<object, number>();
  let xtraCnt = 0;
  const srcCache = new Map<string, string[]>();
  const framesOf = (): string => {
    if (!WANT_TAGS) return '';
    const st = new Error().stack ?? '';
    const parts: string[] = [];
    for (const line of st.split('\n')) {
      const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (!m) continue;
      if (m[1].includes('/core/rng') || m[1].includes('_iii150rf')) continue;
      let short = m[1].split('/').slice(-2).join('/') + ':' + m[2];
      parts.push(short);
      if (parts.length >= 4) break;
    }
    return parts.join('|');
  };

  const g = globalThis as unknown as { __swOnRoll?: (v: number, inst: object) => void };
  const oRoll = g.__swOnRoll;
  g.__swOnRoll = (v: number, inst: object) => {
    if (winOpen) {
      if (mainTok === null) mainTok = inst;
      if (inst === mainTok) {
        ln++;
        rollBuf.push(String(v));
        tagBuf.push(`${ln}|${v}||${framesOf()}`);
        if (rollBuf.length >= 16384) { rollWs.write(rollBuf.join('\n') + '\n'); rollBuf = []; }
        if (tagBuf.length >= 16384) { tagWs.write(tagBuf.join('\n') + '\n'); tagBuf = []; }
      } else {
        tokCnt.set(inst, (tokCnt.get(inst) ?? 0) + 1);
        xtraCnt++;
      }
    }
    oRoll?.(v, inst);
  };

  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    if (storeHolder.st) {
      const stack = new Error().stack ?? '';
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (!m || m[1].includes('/core/rng') || m[1].includes('_iii150rf')) continue;
        const src = (() => { try { return readFileSync(m[1], 'utf8').split('\n'); } catch { return []; } })();
        let lab = m[1];
        for (let l = Math.min(Number(m[2]), src.length) - 1; l >= 0 && l >= Number(m[2]) - 40; l--) {
          const mm = src[l]!.match(/▶([^（(]+?)[（(\s]/);
          if (mm) { lab = mm[1].trim(); break; }
        }
        if (LABELS.includes(lab) && !done.has(lab)) {
          done.add(lab);
          if (lab === 'LivingTrees') {
            winOpen = true; winLabel = lab; mainTok = null; ln = 0;
            console.log(`[rf] window open @${lab}`);
          } else if (winOpen) {
            if (rollBuf.length) { rollWs.write(rollBuf.join('\n') + '\n'); rollBuf = []; }
            if (tagBuf.length) { tagWs.write(tagBuf.join('\n') + '\n'); tagBuf = []; }
            rollWs.end(); tagWs.end();
            winOpen = false;
            console.log(`[rf] window close @${lab} rolls=${ln} xtraInsts=${xtraCnt} insts=${tokCnt.size}`);
          }
          take(lab);
        }
        break;
      }
    }
    return oReseed.call(this, s);
  };

  await generateWorld({
    width: 4200, height: 1200, seedText: SEED, evil: EVIL as -1 | 0 | 1,
    seedFlags: undefined,
    onWorldPartial: (w) => {
      if (!storeHolder.st) storeHolder.st = w.store as unknown as Record<string, Uint8Array | Uint16Array>;
    },
  });
  RNGp.reseed = oReseed;
  g.__swOnRoll = oRoll;
  if (rollBuf.length) { rollWs.write(rollBuf.join('\n') + '\n'); rollBuf = []; }
  if (tagBuf.length) { tagWs.write(tagBuf.join('\n') + '\n'); tagBuf = []; }
  rollWs.end(); tagWs.end();
  {
    const gs = lastGenState() as unknown as Record<string, unknown>;
    writeFileSync(`${OUT}/j_gs.json`, JSON.stringify({
      worldSurface: gs.worldSurface, worldSurfaceLow: gs.worldSurfaceLow,
      rockLevel: gs.rockLevel, undergroundDesert: gs.undergroundDesert,
    }));
  }
  console.log(`[rf] done out=${OUT} windowLabel=${winLabel} rolls=${ln}`);
}, 1_200_000);
