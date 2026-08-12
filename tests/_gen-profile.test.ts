// 临时:逐 pass 耗时剖析(用现成 onWorldPartial 钩子,零产品代码改动)。终验后删除。
import { it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';

it('逐 pass 耗时', async () => {
  const marks: Array<[string, number]> = [];
  let last = performance.now();
  await generateWorld({
    width: 4200, height: 1200, seedText: '9293480', name: 'p', evil: -1,
    onWorldPartial: (_w, _i, name) => {
      const now = performance.now();
      marks.push([name, Math.round(now - last)]);
      last = now;
    },
  }, () => {});
  marks.sort((a, b) => b[1] - a[1]);
  const total = marks.reduce((s, m) => s + m[1], 0);
  console.log(`PROFILE total=${Math.round(total)}ms`);
  for (const [name, ms] of marks.slice(0, 18)) console.log(`PROFILE ${String(ms).padStart(6)}ms ${name}`);
}, 900000);
