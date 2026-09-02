// IIIII115b：藤写流全录 JS 镜像仪 —— TAPER 段（下掘 + num37 侧掘藤）零掷世界读/写点
// 逐行捕获（LivingTreePass.ts vnEmit → globalThis.__ltVn 池），与 x86 rig
// SW_SNAPLOG `MARK|VD/VN/VH/VV/VU|t|c|v|p|x|y|w|a` 同格式（/tmp/iii150-rig-src
// WorldGen.cs 织入，二进制 e8d0841b）。结构键 (t,c,v,p) 对齐；首分叉=两侧首个
// payload 异键行或读位差行（w=墙值 a=active 下格 s=SolidTile 位）。
// 用法：cd game && SW_MB_1457=1 SW_RFV=1 npx vitest run tools/_iii153rf.test.ts --no-file-parallelism
//   SW_RFV_OUT=/tmp/iii153-out  SW_RF_SEED='1.1.1.0.savetherainforest|106101'
import { it } from 'vitest';
import { mkdirSync, createWriteStream } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_RFV === '1';
const OUT = process.env.SW_RFV_OUT ?? '/tmp/iii153-out';
const SEED = process.env.SW_RF_SEED ?? '1.1.1.0.savetherainforest|106101';
const EVIL = Number(process.env.SW_RF_EVIL ?? -1);

(RUN ? it : it.skip)('iiiiii115b rf vine write stream capture', async () => {
  mkdirSync(OUT, { recursive: true });
  const ws = createWriteStream(`${OUT}/rf-vn-js.txt`);
  let n = 0;
  const g = globalThis as unknown as { __ltVn?: (line: string) => void; __ltVnT?: number };
  g.__ltVn = (line: string) => {
    ws.write(line + '\n');
    if (++n % 32768 === 0) console.log(`[vn] ${n}`);
  };
  g.__ltVnT = 0;
  await generateWorld({
    width: 4200, height: 1200, seedText: SEED, evil: EVIL as -1 | 0 | 1,
    seedFlags: undefined,
  });
  g.__ltVn = undefined;
  ws.end();
  console.log(`[vn] done out=${OUT}/rf-vn-js.txt lines=${n} trees=${g.__ltVnT}`);
}, 1_200_000);
