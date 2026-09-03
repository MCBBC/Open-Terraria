// ★IIIII220 双侧段日志仪（JS 侧·GFB）：微群系全段 + 轨历史 TH/P1/P2（x86 rig 同格式）
// 用法: cd game && SW_I220DM=1 npx vitest run tools/_iii220dm.test.ts
// 产物: /tmp/iii220-out/js-dmlog220.txt
import { it } from 'vitest';
import { writeFileSync, appendFileSync } from 'node:fs';

const RUN = process.env.SW_I220DM === '1';
const OUT = process.env.SW_I220_OUT ?? '/tmp/iii220-out';

(RUN ? it : it.skip)('iii220 js segment log (GFB)', { timeout: 1_200_000 }, async () => {
  const g = globalThis as Record<string, unknown>;
  writeFileSync(`${OUT}/js-dmlog220.txt`, '');
  g.__swSeg = (name: unknown, detail?: unknown) => {
    const n = String(name);
    if (/^(passStart|deadCands|deadCount|DMPICK|DMPLACE|CHEST|CAND|GATE|ADDED|iceCount|118TI|swordAttempts|STRY|SOK|campCount|CAMP|MINE|trapCount|MINEDONE|treeCount|MAHOG|longTrackCount|LTRK|stdTrackCount|STRK|mbEnd|lavaJ|tAtt)/.test(n)) {
      appendFileSync(`${OUT}/js-dmlog220.txt`, `${n} ${detail ?? ''}\n`);
    }
  };
  const { __setTrackHistProbe, __setTrackColProbe, __setTrackDraws } = await import('../src/world/gen/vanilla/TrackPass');
  __setTrackHistProbe((tag, hist, len, dir, ox, oy) => {
    if (tag === 'TPFS') {
      appendFileSync(`${OUT}/js-dmlog220.txt`, `TPFS ${ox},${oy} rc=0\n`);
      return;
    }
    appendFileSync(`${OUT}/js-dmlog220.txt`, `${tag} len=${len} rc=0 dir=${dir} ph=0 origin=${ox},${oy}\n`);
    let buf = '';
    for (let i = 0; i < len; i++) {
      const c = hist[i]!;
      buf += `${i}:${c.x},${c.y},${c.slope},${c.mode};`;
      if ((i & 15) === 15) {
        appendFileSync(`${OUT}/js-dmlog220.txt`, `TH ${buf}\n`);
        buf = '';
      }
    }
    if (buf.length > 0) appendFileSync(`${OUT}/js-dmlog220.txt`, `TH ${buf}\n`);
  });
  let rollN = 0;
  const oRoll = g.__swOnRoll as ((v: number) => void) | undefined;
  g.__swOnRoll = (v: number) => { rollN++; oRoll?.(v); };
  __setTrackDraws(() => rollN);
  __setTrackColProbe((loop, k, x, y, ph, rc) => {
    appendFileSync(`${OUT}/js-dmlog220.txt`, `P${loop} ${k} rc=${rc} ph${ph} @${x},${y}\n`);
  });
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
    g.__swSeg = undefined;
    __setTrackHistProbe(undefined);
    __setTrackColProbe(undefined);
    g.__swOnRoll = oRoll;
  }
});
