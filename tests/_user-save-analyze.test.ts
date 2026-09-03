// 用户存档分析+转化复跑(饥饿的庄园:神圣带缺失归因)
import { it, expect } from 'vitest';
import * as fs from 'node:fs';
import { loadSave } from '../src/save/SaveFile';
import { RNG } from '../src/core/rng';

const SAVE = '/Users/vinlic/Downloads/map-饥饿的庄园.json';
const CONV = new Set([117, 116, 164, 402, 403, 203, 234, 200, 401, 399, 25, 112, 163, 400, 398, 60, 661, 662]);

it('analyze', () => {
  const { world } = loadSave(fs.readFileSync(SAVE, 'utf8'));
  const st = world.store;
  console.log('header:', world.name, st.w + 'x' + st.h, 'hardMode=', !!world.flags.hardMode,
    'convertedFlag=', !!world.flags.hardModeConverted, 'crimson=', world.crimson);
  const byType = new Map<number, number>();
  for (let i = 0; i < st.type.length; i++) {
    const t = st.type[i];
    if (CONV.has(t)) byType.set(t, (byType.get(t) ?? 0) + 1);
  }
  console.log('转化族瓦片计数:', JSON.stringify([...byType.entries()].sort((a, b) => b[1] - a[1])));
  const rng = new RNG(world.seed);
  const w = st.w;
  const num = rng.nextIntRange(300, 400) * 0.001;
  const num2 = rng.nextIntRange(200, 300) * 0.001;
  let num3 = Math.trunc(w * num), num4 = Math.trunc(w * (1 - num));
  let num5 = 1;
  if (rng.nextInt(2) === 0) { num4 = Math.trunc(w * num); num3 = Math.trunc(w * (1 - num)); num5 = -1; }
  const num6 = world.dungeonX < Math.trunc(w / 2) ? -1 : 1;
  if (num6 < 0) { if (num4 < num3) num4 = Math.trunc(w * num2); else num3 = Math.trunc(w * num2); }
  else if (num4 > num3) num4 = Math.trunc(w * (1 - num2));
  else num3 = Math.trunc(w * (1 - num2));
  console.log(`V 带位置: 神圣≈x${num3} 邪恶≈x${num4} (w=${w})`);
  for (const [label, cx0, types] of [
    ['神圣带', num3, new Set([117, 164, 402, 403, 109])],
    ['邪恶带', num4, new Set([25, 112, 163, 398, 400, 203, 234, 200, 401, 399])],
  ] as const) {
    let n = 0;
    const x0 = Math.max(0, cx0 - 300), x1 = Math.min(w - 1, cx0 + 300);
    for (let x = x0; x <= x1; x++) for (let y = 20; y < st.h - 20; y++) if (types.has(st.type[st.idx(x, y)])) n++;
    console.log(`${label} @x${cx0} ±300 列转化瓦片数: ${n}`);
  }
}, 240000);

it('force rerun on saved state', async () => {
  const { world } = loadSave(fs.readFileSync(SAVE, 'utf8'));
  const { hardmodeRepairJob } = await import('../src/world/gen/vanilla/HardmodePass');
  const CONVH = new Set([117, 164, 402, 403, 109]);
  const cnt = (st: World['store']) => { let n = 0; for (let i = 0; i < st.type.length; i++) if (CONVH.has(st.type[i])) n++; return n; };
  console.log('rerun 前神圣族:', cnt(world.store));
  // 神圣带区域方块直方图(x 2371-2971 全深度)
  const hist = new Map<number, number>();
  const st0 = world.store;
  for (let x = 2371; x <= 2971; x++) for (let y = 20; y < st0.h - 20; y++) {
    const t = st0.type[st0.idx(x, y)];
    hist.set(t, (hist.get(t) ?? 0) + 1);
  }
  const top = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  console.log('神圣带方块直方图:', JSON.stringify(top));
  try {
    const job = hardmodeRepairJob(world);
    let steps = 0;
    while (!job.step()) { if (++steps > 5000000) throw new Error('未收敛'); }
    console.log('rerun 完成 steps=', steps, '神圣族 after:', cnt(world.store));
  } catch (e) {
    console.log('★THROWN:', (e as Error).message, '| stack head:', (e as Error).stack?.split('\n').slice(1, 6).join(' ← '));
  }
}, 600000);

type World = ReturnType<typeof loadSave>['world'];
