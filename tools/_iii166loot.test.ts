import { it } from 'vitest';
// IIII166: REMIX UW 箱战利品内容取证——JS 生成全链后直读 world.chests,
// 对 x86 w.wld 直读清单逐件对拍（(337,1063)=UW#14 本体）。
const RUN = process.env.SW_I166_LOOT === '1';
const SEED = process.env.SW_I166_SEED ?? '1138154190';
it('iii166 remix uw chest contents', { timeout: 600_000 }, async () => {
  if (!RUN) return;
  const { generateWorld } = await import('../src/world/gen/WorldGen');
  const w = await generateWorld({
    width: 4200, height: 1200, seedText: SEED, evil: -1 as -1 | 0 | 1,
    seedFlags: { remix: true },
  });
  const chests = (w as unknown as { chests: Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null> }> }).chests;
  const uw = chests.filter((c) => c.y >= 995).sort((a, b) => a.x - b.x || a.y - b.y);
  console.log(`I166LOOT uw chests=${uw.length}`);
  for (const c of uw) {
    console.log(`I166LOOT chest@(${c.x},${c.y}) items=`, JSON.stringify(c.items.filter(Boolean).map((i) => `${i!.id}x${i!.stack}`)));
  }
  const t = chests.find((c) => c.x === 337 && c.y === 1063);
  console.log('I166LOOT UW14@337,1063 =', t ? JSON.stringify(t.items.filter(Boolean).map((i) => `${i!.id}x${i!.stack}`)) : 'ABSENT');
});
