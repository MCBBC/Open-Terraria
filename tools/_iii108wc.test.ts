// IIII99b：JS 沉降域 Keg 击杀观测仪（零源码改动，prototype 织入）。
// 在 waterCheckInner/addWater/KillTileAt 外围织入 KEV 窗口(2690..2740×880..930)事件：
// 每个 waterCheck 调用前打印窗口内液态格摘要；die 计算与实际 kill 对照。
// 用法：cd game && SW_MB_1457=1 SW_I08WC=1 npx vitest run tools/_iii108wc.test.ts
import { it } from 'vitest';
import { appendFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { LiquidSim } from '../src/world/liquid/LiquidSim';

const RUN = process.env.SW_I08WC === '1';
const OUT = '/tmp/iii108-out';
const LOG = `${OUT}/js-wc.txt`;
const RECT = { x0: 2690, x1: 2740, y0: 880, y1: 930 };
mkdirSync(OUT, { recursive: true });

(RUN ? it : it.skip)('III99b keg-region liquid-sim observation', async () => {
  appendFileSync(LOG, '');
  let wcN = 0;
  const proto = LiquidSim.prototype as unknown as Record<string, unknown>;
  const oWC = proto.waterCheckInner as () => void;
  proto.waterCheckInner = function (this: LiquidSim) {
    wcN++;
    const st = this.world.store;
    const lines: string[] = [];
    for (let y = RECT.y0; y <= RECT.y1; y++) {
      for (let x = RECT.x0; x <= RECT.x1; x++) {
        const i = y * st.w + x;
        if (st.liquid[i] > 0 || ((st.flags[i] & 1) === 1 && lines.length < 400 && ((y >= 900 && y <= 912 && x >= 2706 && x <= 2722)))) {
          if (y >= 900 && y <= 912 && x >= 2706 && x <= 2722) {
            lines.push(`(${x},${y})a${st.flags[i] & 1}${st.type[i]}l${st.liquid[i]}ty${st.liquidType[i]}`);
          }
        }
      }
    }
    if (lines.length) appendFileSync(LOG, `WC#${wcN}: ${lines.join(' | ')}\n`);
    oWC.call(this);
  };
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: '771002', evil: 0,
      seedFlags: { surfaceIsMushrooms: true },
    });
  } finally {
    proto.waterCheckInner = oWC;
  }
  console.log(`done; wcEvents logged to ${LOG}`);
}, 900_000);
