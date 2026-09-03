// IIII196 批一次性取证仪（源=_iii195win 范式压缩版）：REMIX 尾段逐 pass 掷流对拍。
// 产出 js-reseeds196.txt：每个 reseed 事件一行（序号|站点|自上个 reseed 起掷数），
// 并可选把某个 reseed 起的值流落盘（SW_I196_WINLN=序号 → js-win196.txt）。
// 用法：cd game && SW_I196WIN=1 SW_I196_OUT=/tmp/iii196-out npx vitest run tools/_iii196win.test.ts
import { it } from 'vitest';
import { writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_I196WIN === '1';
const OUT = process.env.SW_I196_OUT ?? '/tmp/iii196-out';
const SEED = process.env.SW_I196_SEED ?? '1138154190';

(RUN ? it : it.skip)('iii196 per-reseed roll census', { timeout: 1_200_000 }, async () => {
  const g = globalThis as unknown as Record<string, unknown>;
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/js-reseeds196.txt`, '');
  let gln = 0;            // 全局掷序
  let segStart = 0;       // 当前 reseed 段起点
  let seg = -1;           // reseed 序号
  const winLn = Number(process.env.SW_I196_WINLN ?? -999);
  const vals: number[] = [];
  let winOpen = false;
  const rollSite = (): string => {
    const st = (new Error().stack ?? '').split('\n');
    for (const line of st) {
      const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii196')) {
        return `${m[1].replace(/^.*?(src\/)/, '$1')}:${m[2]}`;
      }
    }
    return '?';
  };
  const segSites = new Map<string, number>();
  const SITE_CAP = Number(process.env.SW_I196_SITECAP ?? 4000);
  const siteOf = (): string => {
    const st = (new Error().stack ?? '').split('\n');
    for (const line of st) {
      const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii196')) {
        return `${m[1].replace(/^.*?(src\/)/, '$1')}:${m[2]}`;
      }
    }
    return '?';
  };
  RNGp.reseed = function (this: unknown, s: number) {
    seg++;
    const site = siteOf();
    if (segSites.size) {
      const top = [...segSites.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
        .map(([k, n]) => `${k}×${n}`).join(' ');
      appendFileSync(`${OUT}/js-reseeds196.txt`, `  ^seg${seg - 1} sites: ${top}\n`);
    }
    segSites.clear();
    appendFileSync(`${OUT}/js-reseeds196.txt`, `${seg}|${gln - segStart}|${site}|seed=${s}\n`);
    segStart = gln;
    winOpen = seg === winLn;
    if (winOpen) vals.length = 0;
    return oReseed.call(this, s);
  };
  const oRoll = g.__swOnRoll as ((v: number, inst?: object) => void) | undefined;
  g.__swOnRoll = (v: number) => {
    gln++;
    if (gln - segStart <= SITE_CAP) {
      const s = rollSite();
      segSites.set(s, (segSites.get(s) ?? 0) + 1);
    }
    if (winOpen) vals.push(v >>> 0);
    oRoll?.(v);
  };
  await generateWorld({
    width: 4200, height: 1200, seedText: SEED, evil: -1,
    seedFlags: { remix: true },
  });
  if (winLn >= 0) writeFileSync(`${OUT}/js-win196.txt`, vals.map((v) => String(v)).join('\n') + '\n');
  console.log(`[i196] total rolls=${gln} reseeds=${seg + 1}`);
});
