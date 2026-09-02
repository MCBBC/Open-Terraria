// IIII177 批一次性取证仪：dontstarve (3845,280)-(3846,280) 宝箱 2 格瞬态残差——
//   「谁杀」单格写序追踪（I109 范式 JS 镜像）：__swKillCap（killTileGen 入口）+
//   __swFlCap（Flowers kill 门）双钩 + 槽末 (3840..3852,276..286) 窗态快照，
//   槽「地表花」末 .swAbort 停管。
// 用法：cd game && SW_I177CHEST=1 npx vitest run tools/_iii177chest.test.ts
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_I177CHEST === '1';
const OUT = process.env.SW_I177_OUT ?? '/tmp/iii177-out';

(RUN ? it : it.skip)('iii177 dsv chest kill-order trace', { timeout: 900_000 }, async () => {
  const g = globalThis as unknown as Record<string, unknown>;
  const killLog: string[] = [];
  const flLog: string[] = [];
  const slotSnaps: string[] = [];
  g.__swKillCap = (x: number, y: number, sheet: number) => {
    if (x >= 3840 && x <= 3852 && y >= 274 && y <= 288) {
      const stk = (new Error().stack ?? '').split('\n').slice(2, 10)
        .map((s) => { const m = s.match(/([^\s()/]*\.ts):(\d+):\d+/); return m ? `${m[1]!.split('/').pop()}:${m[2]}` : ''; })
        .filter(Boolean).join('<');
      killLog.push(`KILL ${x},${y} s${sheet} by=${stk}`);
    }
  };
  g.__swFlCap = (m: number, n: number, tag: string) => {
    if (m >= 3830 && m <= 3862 && n >= 264 && n <= 298) flLog.push(`FL ${m},${n} ${tag}`);
  };
  let armed = true;
  const t0 = Date.now();
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: 'theconstant|20260912', evil: 0,
      seedFlags: { theConstant: true },
      onWorldPartial: (w, _i, pn) => {
        const st = (w as unknown as { store: { type: Uint16Array; flags: Uint8Array; wall: Uint16Array; idx(x: number, y: number): number } }).store;
        const rows: string[] = [];
        for (let y = 276; y <= 286; y++) {
          for (let x = 3840; x <= 3852; x++) {
            const i = st.idx(x, y);
            if (st.flags[i] || st.type[i]) rows.push(`${x},${y}:t${st.type[i]}f${st.flags[i]}w${st.wall[i]}`);
          }
        }
        slotSnaps.push(`SLOT ${pn} >> ${rows.join(' ') || '(empty)'}`);
        if (pn === '地表花' && armed) {
          armed = false;
          const e = new Error('SW_I177_ABORT');
          (e as Error & { swAbort?: boolean }).swAbort = true;
          throw e;
        }
      },
    });
  } catch (e) {
    if (!((e as { swAbort?: boolean })?.swAbort || String((e as Error)?.message).includes('SW_I177_ABORT'))) throw e;
  } finally {
    delete g.__swKillCap;
    delete g.__swFlCap;
  }
  writeFileSync(`${OUT}/dsv-chest-killlog.txt`, killLog.join('\n') + '\n');
  writeFileSync(`${OUT}/dsv-chest-fllog.txt`, flLog.join('\n') + '\n');
  writeFileSync(`${OUT}/dsv-chest-slotsnaps.txt`, slotSnaps.join('\n') + '\n');
  console.log(`[iii177] kills=${killLog.length} fl=${flLog.length} slots=${slotSnaps.length} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  console.log(killLog.slice(0, 12).join('\n'));
  console.log(slotSnaps.slice(-6).join('\n'));
});
