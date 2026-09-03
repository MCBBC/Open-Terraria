// IIII203 批一次性取证仪（源=_iii196win 范式）：REMIX 尾段 #97-#99 掷流对拍。
// 产出 js-reseeds203.txt（reseed 段普查）+ 可选窗口值流（SW_I203_WINLN=段号 →
// js-win203.txt）+ 可选窗口内 [FROM,TO) 逐掷站点日志（SW_I203_FROM/TO → js-sites203.txt）。
// 用法：cd game && SW_I203WIN=1 SW_I203_OUT=/tmp/iii203-out npx vitest run tools/_iii203win.test.ts
import { it } from 'vitest';
import { writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_I203WIN === '1';
const OUT = process.env.SW_I203_OUT ?? '/tmp/iii203-out';
const SEED = process.env.SW_I203_SEED ?? '1138154190';
const EVIL = process.env.SW_I203_EVIL !== undefined ? Number(process.env.SW_I203_EVIL) : 0;

(RUN ? it : it.skip)('iii203 per-reseed roll census', { timeout: 1_200_000 }, async () => {
  const g = globalThis as unknown as Record<string, unknown>;
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/js-reseeds203.txt`, '');
  let gln = 0;
  let segStart = 0;
  let seg = -1;
  const winLn = Number(process.env.SW_I203_WINLN ?? -999);
  const winFrom = Number(process.env.SW_I203_FROM ?? -1);   // 窗口内站点日志起（0 基掷序）
  const winTo = Number(process.env.SW_I203_TO ?? -1);       // 终（不含）
  const vals: number[] = [];
  const sites: string[] = [];
  let winOpen = false;
  const stackSite = (): string => {
    const st = (new Error().stack ?? '').split('\n');
    for (const line of st) {
      const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii203')) {
        return `${m[1].replace(/^.*?(src\/)/, '$1')}:${m[2]}`;
      }
    }
    return '?';
  };
  const segSites = new Map<string, number>();
  const SITE_CAP = Number(process.env.SW_I203_SITECAP ?? 4000);
  RNGp.reseed = function (this: unknown, s: number) {
    seg++;
    if (segSites.size) {
      const top = [...segSites.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
        .map(([k, n]) => `${k}×${n}`).join(' ');
      appendFileSync(`${OUT}/js-reseeds203.txt`, `  ^seg${seg - 1} sites: ${top}\n`);
    }
    segSites.clear();
    appendFileSync(`${OUT}/js-reseeds203.txt`, `${seg}|${gln - segStart}|seed=${s}\n`);
    segStart = gln;
    winOpen = seg === winLn;
    if (winOpen) { vals.length = 0; sites.length = 0; }
    return oReseed.call(this, s);
  };
  const oRoll = g.__swOnRoll as ((v: number, inst?: object) => void) | undefined;
  g.__swOnRoll = (v: number) => {
    gln++;
    if (gln - segStart <= SITE_CAP) {
      const s = stackSite();
      segSites.set(s, (segSites.get(s) ?? 0) + 1);
    }
    if (winOpen) {
      vals.push(v >>> 0);
      const wi = gln - segStart - 1;      // 窗口内掷序（0 基）
      if (winFrom >= 0 && wi >= winFrom && wi < winTo) sites.push(`${wi}|${v >>> 0}|${stackSite()}`);
    }
    oRoll?.(v);
  };
  await generateWorld({
    width: 4200, height: 1200, seedText: SEED, evil: EVIL as -1 | 0 | 1,
    seedFlags: { remix: true },
  });
  if (winLn >= 0) writeFileSync(`${OUT}/js-win203.txt`, vals.map((v) => String(v)).join('\n') + '\n');
  if (winFrom >= 0) writeFileSync(`${OUT}/js-sites203.txt`, sites.join('\n') + '\n');
  console.log(`[i203] total rolls=${gln} reseeds=${seg + 1}`);
});
