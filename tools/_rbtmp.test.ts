// IIII99e：rainbow #66 Temple 杀像事件取证（仅 JS 侧事件流,窗 x∈[3490..3545] y∈[650..710])
// 用法：SW_RBTMP=1 npx vitest run tools/_rbtmp.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_RBTMP === '1';
const W = Number(process.env.SW_M8_W ?? 4200), H = Number(process.env.SW_M8_H ?? 1200);
const X0 = 3470, X1 = 3560, Y0 = 640, Y1 = 720;

(RUN ? it : it.skip)('temple kill forensic', async () => {
  const evs: string[] = [];
  let n32 = 0;
  // A) 引擎九宫/击杀钩（FinalCleanupPass.__swFnt39 消费点）
  const G = globalThis as unknown as Record<string, any>;
  G.__swFntProbeI39 = {
    emit: (l: string) => {
      const m = l.match(/^(TF|TR184|TR72|K[^|]*)\|(\d+),(\d+)\|/);
      if (m) {
        const x = Number(m[2]), y = Number(m[3]);
        if (x >= X0 && x <= X1 && y >= Y0 && y <= Y1) evs.push(l);
      }
    },
    rc: () => n32,
  };
  // B) place3x2/placeStatueTemple 级写锚:借 __swP32 只覆盖 CorruptionPass;
  //    Temple 写锚自挂 monkey patch 到 FinalCleanupPass 的公开入口不可行——
  //    改从 genSquareTileFrame 调用源头抓:钩 SWEEP 内 __swSeg 不存在则无。
  //    依赖 TF/K 事件即可(每个 Place* 的 SquareTileFrame 必产生 ≥9 个 TF)。
  try {
    await generateWorld({
      width: W, height: H, seedText: '771006', evil: 0,
      seedFlags: { rainbowStuff: true },
      onWorldPartial: () => {},
    });
  } finally {
    delete G.__swFntProbeI39;
  }
  console.log(`window events=${evs.length}`);
  writeFileSync('/tmp/iii118-out/rbalt/tf-window.log', evs.join('\n') + '\n');
}, 900_000);
