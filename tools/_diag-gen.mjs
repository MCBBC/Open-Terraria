// 诊断：主线程直跑 generateWorld（与 worker 同模块），验证生成代码本身是否挂死
console.log('[diag] 脚本启动, importing...');
import { generateWorld } from '../src/world/gen/WorldGen.ts';

console.log('[diag] import 完成, 开始生成');
const t0 = Date.now();
let last = '';
const w = await generateWorld({ width: 800, height: 300, seedText: 'diag', name: 'diag' }, (label, p) => {
  const key = `${label}|${(p * 100) | 0}`;
  if (key !== last) { last = key; console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${label} ${(p * 100) | 0}%`); }
});
console.log(`完成: ${w.w}x${w.h} spawn=(${w.spawnX},${w.spawnY}) 耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
