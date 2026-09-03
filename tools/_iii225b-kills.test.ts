// IIII225b 取证仪①：GFB #97 STRK 过冲回敛——巷杀逐类型普查 + 230/58 岩浆臂起爆坐标
// （x86 dmlog 同格式镜像；)_iii220diff 同构：段账(__swSeg)+掷流账(__swOnRoll)）。
// 用法：cd game && SW_I225B=1 npx vitest run tools/_iii225b-kills.test.ts
// 产物：/tmp/iii225b-out/kills-census.txt
import { it } from 'vitest';
import { writeFileSync, appendFileSync } from 'node:fs';

const RUN = process.env.SW_I225B === '1';
const OUT = process.env.SW_I225B_OUT ?? '/tmp/iii225b-out';

(RUN ? it : it.skip)('iii225b lane kill census (GFB)', { timeout: 1_200_000 }, async () => {
  const g = globalThis as Record<string, unknown>;
  writeFileSync(`${OUT}/kills-census.txt`, '');
  const log = (s: string) => appendFileSync(`${OUT}/kills-census.txt`, s + '\n');

  let rollN = 0;
  const oRoll = g.__swOnRoll as ((v: number) => void) | undefined;
  g.__swOnRoll = (v: number) => { rollN++; oRoll?.(v); };
  const oSeg = g.__swSeg as ((name: string, d?: unknown) => void) | undefined;
  const segBoundaries: Array<{ name: string; rc: number; detail: string }> = [];
  g.__swSeg = (name: string, detail?: unknown) => {
    if (/^(passStart|mbTree|mbTrack|longTrackCount|stdTrackCount|LTRK|STRK|mbLavaS|mbEnd)/.test(String(name))) {
      segBoundaries.push({ name: String(name), rc: rollN, detail: String(detail ?? '') });
      log(`SEG ${name} ${detail ?? ''} rc=${rollN}`);
    }
    oSeg?.(name, detail);
  };
  const { __setTrackKillProbe } = await import('../src/world/gen/vanilla/TrackPass');
  const bySheet = new Map<number, number>();
  __setTrackKillProbe((draws, x, y, sheet) => {
    bySheet.set(sheet, (bySheet.get(sheet) ?? 0) + 1);
    if (sheet === 230 || sheet === 58 || sheet === 57 || sheet === 51) {
      log(`KILL ${sheet} ${x},${y} draws=${draws}`);
    }
  }, () => rollN);

  const { generateWorld } = await import('../src/world/gen/WorldGen');
  try {
    await generateWorld({
      width: 4200,
      height: 1200,
      seedText: '9293480',
      evil: 0,
      seedFlags: { remix: true, drunkWorld: true, notTheBees: true, noTraps: true, theConstant: true, tenthAnniversary: true, getGoodWorld: true },
      onWorldPartial: () => {},
    } as Parameters<typeof generateWorld>[0]);
  } finally {
    g.__swSeg = oSeg;
    __setTrackKillProbe(undefined);
    g.__swOnRoll = oRoll;
  }
  log(`=== lane kill census by sheet (top 30) ===`);
  const all = [...bySheet.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
  for (const [sheet, n] of all) log(`sheet ${sheet}: ${n}`);
  log(`TOTAL lane kills=${[...bySheet.values()].reduce((a, b) => a + b, 0)}`);
});
