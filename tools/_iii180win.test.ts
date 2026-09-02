// IIII180 批一次性取证仪（源=_iii175win/_iii178win 范式）：REMIX #64 Gem_Caves
//   收口定域。窗=宝石洞槽头 reseed（WorldGen.ts :509 槽头重播,无注释锚,按 onWorldPartial
//   槽名序闭合——'雕像宝箱' 槽 onWorldPartial 后下一 reseed 即宝石洞槽头）开 →
//   '宝石洞' 槽 onWorldPartial 闭（=pass64 全部体掷）。
// 产出：
//   js-win64.txt      窗内值流（每行一值,首行 ---RESEED64 标记）
//   js-win64-sites.txt 对齐值流的调用站点（src 相对路径:行号,前 2 帧）
//   js-gemdump.bin    宝石洞槽末 (x0..x1,y0..y1) 盒快照（act/typ/wal 三通道,DumpBox 范式）
//   js-reseeds.txt    窗口前后各 4 个 reseed 标记（全局序号+站点）,闭合锚证据
// 用法：cd game && SW_I180WIN=1 npx vitest run tools/_iii180win.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG, UnifiedRandom } from '../src/core/rng';

const RUN = process.env.SW_I180WIN === '1';
const OUT = process.env.SW_I180_OUT ?? '/tmp/iii180-out';
const SEED = process.env.SW_I180_SEED ?? '1138154190';
// DumpBox 范式：宝石洞槽末盒快照（首差 (3913,375) 邻域+余量）
const BX0 = Number(process.env.SW_I180_BX0 ?? 3700);
const BY0 = Number(process.env.SW_I180_BY0 ?? 280);
const BX1 = Number(process.env.SW_I180_BX1 ?? 4100);
const BY1 = Number(process.env.SW_I180_BY1 ?? 470);

(RUN ? it : it.skip)('iii180 remix GemCaves window value stream', { timeout: 900_000 }, async () => {
  const g = globalThis as unknown as Record<string, unknown>;
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  const oRoll = g.__swOnRoll as ((v: number, inst?: object) => void) | undefined;

  mkdirSync(OUT, { recursive: true });
  const vals: number[] = [];
  const sites: string[] = [];
  const reseeds: string[] = [];
  let ln = 0;              // 窗内掷序
  let gln = 0;             // 全局掷序
  let cap = false;         // 窗开关
  let pendingOpen = false; // 已过'雕像宝箱'槽末,等宝石洞槽头 reseed 开采
  let opened = false;
  let closed = false;
  const siteOf = (): string => {
    const st = (new Error().stack ?? '').split('\n');
    let n = 0;
    const out: string[] = [];
    for (const line of st) {
      const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii180')) {
        out.push(`${m[1].replace(/^.*?(src\/)/, '$1')}:${m[2]}`);
        if (++n >= 2) break;
      }
    }
    return out.join(' | ');
  };
  const reseedSite = (): string => {
    const st = (new Error().stack ?? '').split('\n');
    for (const line of st) {
      const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii180')) {
        return `${m[1].replace(/^.*?(src\/)/, '$1')}:${m[2]}`;
      }
    }
    return '?';
  };

  RNGp.reseed = function (this: unknown, s: number) {
    const site = reseedSite();
    reseeds.push(`RS#${reseeds.length} gln=${gln} site=${site}`);
    if (pendingOpen && !opened) {
      // 宝石洞槽头 reseed（:509 槽头重播,无注释锚）——窗开采起点
      opened = true; pendingOpen = false; ln = 0;
      vals.length = 0; sites.length = 0;
      vals.push(-1); sites.push(`---RESEED64 ${site}`);
      console.log(`[I180] window opened at reseed ${site} gln=${gln}`);
    }
    return oReseed.call(this, s);
  };

  g.__swOnRoll = (v: number, inst?: object) => {
    gln++;
    if (opened && !closed) {
      ln++;
      vals.push(v);
      sites.push(siteOf());
    }
    oRoll?.(v, inst);
  };

  let store: unknown = null;
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: SEED, evil: -1 as -1 | 0 | 1,
      seedFlags: { remix: true },
      onWorldPartial: (w2, i, name) => {
        store = (w2 as unknown as { store: unknown }).store;
        if (name === '雕像宝箱' && !cap) {
          cap = true; pendingOpen = true;
          console.log(`[I180] cap on after slot '${name}' (#${i}) gln=${gln}`);
        } else if (name === '宝石洞' && opened && !closed) {
          closed = true;
          console.log(`[I180] cap off after slot '宝石洞' (#${i}) ln=${ln} gln=${gln}`);
          // DumpBox：宝石洞槽末盒快照（act/typ/wal 三通道行序=y 主序）
          const stt = store as unknown as {
            flags: Uint8Array; type: Uint16Array; wall: Uint16Array; w: number; idx: (x: number, y: number) => number;
          } | null;
          if (stt) {
            const bw = BX1 - BX0 + 1, bh = BY1 - BY0 + 1;
            const act = new Uint8Array(bw * bh), typ = new Uint16Array(bw * bh), wal = new Uint16Array(bw * bh);
            let k = 0;
            for (let y = BY0; y <= BY1; y++) for (let x = BX0; x <= BX1; x++, k++) {
              const ii = stt.idx(x, y);
              act[k] = stt.flags[ii]! & 1; typ[k] = stt.type[ii]!; wal[k] = stt.wall[ii]!;
            }
            writeFileSync(`${OUT}/js-gemdump.meta.txt`, `box ${BX0} ${BY0} ${BX1} ${BY1} w${bw} h${bh}\n`);
            writeFileSync(`${OUT}/js-gemdump.act.bin`, Buffer.from(act.buffer));
            writeFileSync(`${OUT}/js-gemdump.typ.bin`, Buffer.from(typ.buffer));
            writeFileSync(`${OUT}/js-gemdump.wal.bin`, Buffer.from(wal.buffer));
            console.log(`[I180] gemdump box (${BX0},${BY0})..(${BX1},${BY1}) ${bw}x${bh}`);
          }
          writeFileSync(`${OUT}/js-win64.txt`, vals.map((v) => (v < 0 ? `---RESEED64` : String(v))).join('\n') + '\n');
          writeFileSync(`${OUT}/js-win64-sites.txt`, sites.join('\n') + '\n');
          writeFileSync(`${OUT}/js-reseeds.txt`, reseeds.slice(-8).join('\n') + '\n');
        }
      },
    });
  } finally {
    if (opened && !closed) {
      writeFileSync(`${OUT}/js-win64.txt`, vals.map((v) => (v < 0 ? `---RESEED64` : String(v))).join('\n') + '\n');
      writeFileSync(`${OUT}/js-win64-sites.txt`, sites.join('\n') + '\n');
      writeFileSync(`${OUT}/js-reseeds.txt`, reseeds.slice(-8).join('\n') + '\n');
      console.log(`[I180] fallback close ln=${ln}`);
    }
    RNGp.reseed = oReseed;
    g.__swOnRoll = oRoll;
  }
});

/** 离线对拍（免 worldgen）：x86 rollwin64 值流 ↔ 普适流 UnifiedRandom(seed) 前缀 ↔
 *  JS js-win64.txt 三方逐位;报首差位与 Δlen。附 x86 侧剔尾（RunPass 簿记骰 +1,LXV 判例）。
 *  用法：npx vitest run tools/_iii180win.test.ts -t 'offline' */
(it as (n: string, f: () => void) => void)('IIIII180 offline triple diff (no worldgen)', () => {
  const x86Path = `${OUT}/x86-rollwin64.txt`;
  const jsPath = `${OUT}/js-win64.txt`;
  const x86: number[] = [];
  for (const l of readFileSync(x86Path, 'utf8').split('\n')) {
    const t = l.trim();
    if (t === '' || t.startsWith('---')) continue;
    x86.push(Number(t));
  }
  const ur = new UnifiedRandom(Number(SEED));
  let uniFirstDif = -1;
  for (let k = 0; k < x86.length; k++) {
    if (ur.next() !== x86[k]) { uniFirstDif = k; break; }
  }
  console.log(`[i180-off] x86 窗值=${x86.length} (剔尾体=${x86.length - 1}) 普适流首差=${uniFirstDif < 0 ? '无(全等)' : uniFirstDif}`);
  let js: number[] = [];
  try {
    for (const l of readFileSync(jsPath, 'utf8').split('\n')) {
      const t = l.trim();
      if (t === '' || t.startsWith('---')) continue;
      js.push(Number(t));
    }
  } catch { console.log('[i180-off] js-win64.txt 缺失,跳过 JS 对拍'); js = []; }
  if (js.length) {
    let firstDif = -1;
    const n = Math.min(js.length, x86.length);
    for (let k = 0; k < n; k++) {
      if ((js[k]! >>> 0) !== (x86[k]! >>> 0)) { firstDif = k; break; }
    }
    console.log(`[i180-off] JS=${js.length} vs x86=${x86.length} (Δ=${js.length - x86.length}) 首差位=${firstDif}` +
      (firstDif >= 0 ? ` JS=${js[firstDif]} x86=${x86[firstDif]}` : ''));
    if (uniFirstDif < 0) {
      console.log(`[i180-off] JS vs 普适流首差=${(() => { const u2 = new UnifiedRandom(Number(SEED)); for (let k = 0; k < js.length; k++) if (u2.next() !== js[k]) return k; return -1; })()}`);
    }
  }
});

