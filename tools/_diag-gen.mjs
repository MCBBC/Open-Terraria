// 诊断：主线程直跑 generateWorld（与 worker 同模块），验证生成代码本身是否挂死
import { generateWorld } from '../src/world/gen/WorldGen.ts';

const t0 = Date.now();
const w = await generateWorld({ width: 800, height: 300, seedText: 'diag', name: 'diag' }, (label, p) => {
  if (Math.random() < 0.08) console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${label} ${(p * 100) | 0}%`);
});
console.log(`完成: ${w.w}x${w.h} spawn=(${w.spawnX},${w.spawnY}) 耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
