// IIII186 批一次性取证仪（源=_iii184win 范式克隆改锚）：REMIX #67 Cave_Walls 定域。
// 窗=洞穴墙槽头 reseed（WorldGen.ts 槽头重播——'神庙陈设' 槽 onWorldPartial 后
// 下一 reseed 即 '洞穴墙' 槽头）开 → '洞穴墙' 槽 onWorldPartial 闭（=pass67 全部体掷）。
// 产出：
//   js-win67.txt       窗内值流（每行一值,首行 ---RESEED67 标记）
//   js-win67-sites.txt 对齐值流的调用站点（src 相对路径:行号,前 2 帧）
//   js-reseeds.txt     窗口前后各 8 个 reseed 标记（全局序号+站点）,闭合锚证据
// 用法：cd game && SW_I186WIN=1 SW_I186_OUT=/tmp/iii186-out npx vitest run tools/_iii186win.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG, UnifiedRandom } from '../src/core/rng';

const RUN = process.env.SW_I186WIN === '1';
const OUT = process.env.SW_I186_OUT ?? '/tmp/iii186-out';
const SEED = process.env.SW_I186_SEED ?? '1138154190';

(RUN ? it : it.skip)('iii186 remix CaveWalls window value stream', { timeout: 900_000 }, async () => {
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
  let pendingOpen = false; // 已过'神庙陈设'槽末,等洞穴墙槽头 reseed 开采
  let opened = false;
  let closed = false;
  const siteOf = (): string => {
    const st = (new Error().stack ?? '').split('\n');
    let n = 0;
    const out: string[] = [];
    for (const line of st) {
      const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii186')) {
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
      if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii186')) {
        return `${m[1].replace(/^.*?(src\/)/, '$1')}:${m[2]}`;
      }
    }
    return '?';
  };

  RNGp.reseed = function (this: unknown, s: number) {
    const site = reseedSite();
    reseeds.push(`RS#${reseeds.length} gln=${gln} site=${site}`);
    if (pendingOpen && !opened) {
      // 洞穴墙槽头 reseed（槽头重播）——窗开采起点
      opened = true; pendingOpen = false; ln = 0;
      vals.length = 0; sites.length = 0;
      vals.push(-1); sites.push(`---RESEED67 ${site}`);
      console.log(`[I186] window opened at reseed ${site} gln=${gln}`);
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

  let closedOk = false;
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: SEED, evil: -1 as -1 | 0 | 1,
      seedFlags: { remix: true },
      onWorldPartial: (w2, i, name) => {
        if (name === '神庙陈设' && !pendingOpen) {
          pendingOpen = true;
          console.log(`[I186] cap on after slot '${name}' (#${i}) gln=${gln}`);
        } else if (name === '洞穴墙' && opened && !closed) {
          closed = true; closedOk = true;
          console.log(`[I186] cap off after slot '洞穴墙' (#${i}) ln=${ln} gln=${gln}`);
          writeFileSync(`${OUT}/js-win67.txt`, vals.map((v) => (v < 0 ? `---RESEED67` : String(v))).join('\n') + '\n');
          writeFileSync(`${OUT}/js-win67-sites.txt`, sites.join('\n') + '\n');
          writeFileSync(`${OUT}/js-reseeds.txt`, reseeds.slice(-8).join('\n') + '\n');
        }
      },
    });
  } finally {
    if (opened && !closedOk) {
      writeFileSync(`${OUT}/js-win67.txt`, vals.map((v) => (v < 0 ? `---RESEED67` : String(v))).join('\n') + '\n');
      writeFileSync(`${OUT}/js-win67-sites.txt`, sites.join('\n') + '\n');
      writeFileSync(`${OUT}/js-reseeds.txt`, reseeds.slice(-8).join('\n') + '\n');
      console.log(`[I186] fallback close ln=${ln}`);
    }
    RNGp.reseed = oReseed;
    g.__swOnRoll = oRoll;
  }
});

/** 离线对拍（免 worldgen）：x86 rollwin67 值流 ↔ 普适流 UnifiedRandom(seed) 前缀 ↔
 *  JS js-win67.txt 三方逐位;报首差位与 Δlen。附 x86 侧剔尾（RunPass 簿记骰 +1,LXVI 判例）。
 *  用法：npx vitest run tools/_iii186win.test.ts -t 'offline' */
(it as (n: string, f: () => void) => void)('IIIII186 offline triple diff (no worldgen)', () => {
  const x86Path = `${OUT}/x86-rollwin67.txt`;
  const jsPath = `${OUT}/js-win67.txt`;
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
  console.log(`[i186-off] x86 窗值=${x86.length} (剔尾体=${x86.length - 1}) 普适流首差=${uniFirstDif < 0 ? '无(全等)' : uniFirstDif}`);
  let js: number[] = [];
  try {
    for (const l of readFileSync(jsPath, 'utf8').split('\n')) {
      const t = l.trim();
      if (t === '' || t.startsWith('---')) continue;
      js.push(Number(t));
    }
  } catch { console.log('[i186-off] js-win67.txt 缺失,跳过 JS 对拍'); js = []; }
  if (js.length) {
    let firstDif = -1;
    const n = Math.min(js.length, x86.length);
    for (let k = 0; k < n; k++) {
      if ((js[k]! >>> 0) !== (x86[k]! >>> 0)) { firstDif = k; break; }
    }
    console.log(`[i186-off] JS=${js.length} vs x86=${x86.length} (Δ=${js.length - x86.length}) 首差位=${firstDif}` +
      (firstDif >= 0 ? ` JS=${js[firstDif]} x86=${x86[firstDif]}` : ''));
    if (uniFirstDif < 0) {
      console.log(`[i186-off] JS vs 普适流首差=${(() => { const u2 = new UnifiedRandom(Number(SEED)); for (let k = 0; k < js.length; k++) if (u2.next() !== js[k]) return k; return -1; })()}`);
    }
  }
});
