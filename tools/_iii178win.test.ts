// IIIII178：GFB #46 Jungle_Temple @Beehives 定域仪（LXV 章）。
// 掷窗账延至 46 窗——__swOnRoll 织入 + RNG.reseed 栈标签界定，捕 ▶LihzahrdTemple..
// ▶Beehives 段样本流（=LihzahrdTemple pass 体掷），与 x86 rig SW_ROLLWIN=44-47 的
// ---PASS 45..---PASS 46 段（=体掷+尾 RandNext）对拍：JS 流 = x86 段去尾；
// FNV(JS 流 ⊕ 尾样本) 应闭合 x86 P|46 RollHash。（快照对拍走 mile8 主闸。）
// 用法：cd game && SW_I178=1 SW_I178_G2=~/GoldenChains/golden-gfb-c \
//        SW_I178_OUT=/tmp/iii178-out npx vitest run tools/_iii178win.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG, UnifiedRandom } from '../src/core/rng';

const RUN = process.env.SW_I178 === '1';
const G2 = process.env.SW_I178_G2 ?? `${process.env.HOME}/GoldenChains/golden-gfb-c`;
const OUT = process.env.SW_I178_OUT ?? '/tmp/iii178-out';
const SEED = '9293480';
const EVIL = 0;
const W = 4200, H = 1200;
const FLAGS: Record<string, boolean> = {};
for (const f of 'everything,remix,drunkWorld,notTheBees,noTraps,theConstant,tenthAnniversary,getGoodWorld'.split(',')) FLAGS[f] = true;

// 样本值逐个 32 位折叠 FNV（与 x86 JJHook / _iii173sh __swOnRoll 同式：h=imul(h^v,P)）
const fnvVals = (vals: number[]): number => {
  let h = 2166136261 >>> 0;
  for (const v of vals) h = (Math.imul(h ^ (v >>> 0), 16777619)) >>> 0;
  return h >>> 0;
};

(RUN ? it : it.skip)('IIIII178 temple-window roll stream + snapshot probe', { timeout: 1_200_000 }, async () => {
  // ── 掷窗账（A）──
  // ★IIIII178 首跑教训：全量攒数组会在 GFB underworld 掷爆 2^32（RangeError Invalid
  //   array length @push）——改为计数器 + 窗口开关（只在 46 窗内存样本）。
  let cnt = 0;
  let capture = false;
  const win: number[] = [];
  (globalThis as { __swOnRoll?: (v: number, inst: object) => void }).__swOnRoll = (v) => {
    cnt++;
    if (capture && win.length < 5_000_000) win.push(v);
  };
  // reseed 边界标签（mile8 labelOf 同式）
  const srcCache = new Map<string, string[]>();
  const labelOf = (file: string, line: number): string => {
    let src = srcCache.get(file);
    if (!src) { try { src = readFileSync(file, 'utf8').split('\n'); } catch { src = []; } srcCache.set(file, src); }
    for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
      const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
      if (m) return m[1].trim();
    }
    return `${file.split('/').pop()}:${line}`;
  };
  const marks: Array<{ label: string; at: number }> = [];
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    const stack = new Error().stack ?? '';
    for (const line of stack.split('\n')) {
      const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii178')) {
        const lab = labelOf(m[1], Number(m[2]));
        marks.push({ label: lab, at: cnt });
        if (lab === 'LihzahrdTemple') capture = true;
        else if (lab === 'Beehives') capture = false;
        break;
      }
    }
    return oReseed.call(this, s);
  };
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1, seedFlags: FLAGS,
      onWorldPartial: () => { /* 槽界不需；边界由 reseed 标签承载 */ },
    });
  } finally {
    delete (globalThis as { __swOnRoll?: unknown }).__swOnRoll;
    RNGp.reseed = oReseed;
  }
  const iTp = marks.findIndex((m) => m.label === 'LihzahrdTemple');
  const iBv = marks.findIndex((m) => m.label === 'Beehives');
  console.log(`[i178] marks: LihzahrdTemple@${iTp} Beehives@${iBv} (of ${marks.length}); total rolls=${cnt}`);
  // 逐 pass 掷数表（前 60）——underworld 等大掷 pass 与 x86 pc R 对读
  console.log('[i178] per-pass rolls: ' + marks.map((m, k) => {
    const n = (k + 1 < marks.length ? marks[k + 1]!.at : cnt) - m.at;
    return `${m.label}=${n}`;
  }).join(' '));
  if (iTp < 0 || iBv < 0 || iBv <= iTp) throw new Error(`边界缺失: LihzahrdTemple=${iTp} Beehives=${iBv}`);
  const seg = win;
  console.log(`[i178] JS 46 窗(▶LihzahrdTemple..▶Beehives) 掷数=${seg.length} 头 12=[${seg.slice(0, 12).join(',')}]`);
  writeFileSync(`${OUT}/js-win46.txt`, seg.join('\n'));

  // ── x86 侧读入 ──
  let x86R46: { cnt: number; hash: number } | null = null;
  const pcPath = `${G2}/pc.txt`;
  if (existsSync(pcPath)) {
    for (const ln of readFileSync(pcPath, 'utf8').split('\n')) {
      const m = ln.match(/^P\|46\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|R:(\d+):(\d+)$/);
      // pc 每 pass 两行（R:cnt:hash + R:0 复位行）——取首个非零计数行
      if (m && Number(m[1]) > 0) { x86R46 = { cnt: Number(m[1]), hash: Number(m[2]) >>> 0 }; break; }
    }
  }
  const rwPath = process.env.SW_I178_RW ?? `${OUT}/rig178/rollwin.txt`;
  let x86seg: number[] = [];
  if (existsSync(rwPath)) {
    const lines = readFileSync(rwPath, 'utf8').split('\n');
    let inWin = false;
    for (const ln of lines) {
      if (ln.startsWith('---PASS 45 ')) { inWin = true; continue; }
      if (ln.startsWith('---PASS 46 ')) { break; }
      if (inWin && ln.trim() !== '') x86seg.push(Number(ln));
    }
  }
  console.log(`[i178] x86 P|46 R=${x86R46?.cnt ?? '?'} hash=${x86R46?.hash ?? '?'}; rollwin 46 段=${x86seg.length} 样本`);
  if (x86seg.length > 0) {
    const body = x86seg.slice(0, -1);      // 去尾 RandNext
    const tail = x86seg[x86seg.length - 1]!;
    const dLen = seg.length - body.length;
    let firstDif = -1;
    for (let k = 0; k < Math.min(seg.length, body.length); k++) {
      if ((seg[k]! >>> 0) !== (body[k]! >>> 0)) { firstDif = k; break; }
    }
    console.log(`[i178] 流对拍: JS=${seg.length} vs x86体=${body.length} (Δlen=${dLen}) 首差样本位=${firstDif}` +
      (firstDif >= 0 ? ` JS=${seg[firstDif]} x86=${body[firstDif]}` : ''));
    // FNV 闭合：JS 体 ⊕ 尾样本 → 应=x86 P|46 hash（若流逐位恒等则自然闭合）
    const hJsTail = fnvVals([...seg, tail]);
    console.log(`[i178] FNV(JS流⊕尾${tail})=${hJsTail} vs x86 P|46 hash=${x86R46?.hash} → ${hJsTail === x86R46?.hash ? '闭合' : '不闭合'}`);
    writeFileSync(`${OUT}/x86-win46.txt`, body.join('\n'));
  }
  if (x86R46) {
    console.log(`[i178] 掷数对拍(判例 x86 R−1 vs JS): JS=${seg.length} vs R−1=${x86R46.cnt - 1} → ${seg.length === x86R46.cnt - 1 ? '✓' : '✗ Δ=' + (seg.length - (x86R46.cnt - 1))}`);
  }
  void N;
  console.log(`[i178] dumps: js-win46.txt / x86-win46.txt`);
});

/** 离线闭合检（免 worldgen）：js-win46.txt 应逐位=普适流前缀 [0..n)；FNV(流⊕尾样本)
 *  应闭合金标 pc P|46 RollHash（判例：x86 R=体掷+尾 RandNext 恒 +1）。
 *  用法：npx vitest run tools/_iii178win.test.ts -t 'offline' */
(it as (n: string, f: () => void) => void)('IIIII178 offline FNV closure (no worldgen)', () => {
  const winPath = `${OUT}/js-win46.txt`;
  if (!existsSync(winPath)) { console.log('[i178-fnv] js-win46.txt 缺失,跳过'); return; }
  const vals = readFileSync(winPath, 'utf8').split('\n').filter(Boolean).map(Number);
  const ur = new UnifiedRandom(Number(SEED));
  const tailIdx = vals.length;               // 尾样本=普适流第 n+1 个样本（0 基 n）
  let firstDif = -1;
  for (let k = 0; k < vals.length; k++) {
    if (ur.next() !== vals[k]) { firstDif = k; break; }
  }
  const tail = ur.next();
  let h = 2166136261 >>> 0;
  for (const v of vals) h = (Math.imul(h ^ (v >>> 0), 16777619)) >>> 0;
  h = (Math.imul(h ^ (tail >>> 0), 16777619)) >>> 0;
  // 金标 pc P|46 首个非零计数行
  let x86: { cnt: number; hash: number } | null = null;
  if (existsSync(`${G2}/pc.txt`)) {
    for (const ln of readFileSync(`${G2}/pc.txt`, 'utf8').split('\n')) {
      const m = ln.match(/^P\|46\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|R:(\d+):(\d+)$/);
      if (m && Number(m[1]) > 0) { x86 = { cnt: Number(m[1]), hash: Number(m[2]) >>> 0 }; break; }
    }
  }
  console.log(`[i178-fnv] JS流=${vals.length} 普适流逐位=${firstDif < 0 ? '恒等' : `首差@${firstDif}`} ` +
    `尾样本(普适流[${tailIdx}])=${tail} FNV(流⊕尾)=${h} x86 P|46=${x86 ? `${x86.cnt}:${x86.hash}` : '(无)'} → ` +
    `${x86 && h === x86.hash ? '闭合 ✓' : '不闭合 ✗'}`);
});
