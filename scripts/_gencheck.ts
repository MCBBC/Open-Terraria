// 诊断：直跑世界生成确认是否挂起（scripts/_gencheck.ts）
import { generateWorld } from '../src/world/gen/WorldGen';

const t0 = Date.now();
const w = await generateWorld({ width: 4200, height: 1200, seedText: 'dash-probe' });
console.log('GEN OK', Date.now() - t0, 'ms', w.store.w, 'x', w.store.h, 'spawn', w.spawnX, w.spawnY);
