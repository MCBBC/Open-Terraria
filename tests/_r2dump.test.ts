import { it } from 'vitest';
import { generateWorld } from '../../src/world/gen/WorldGen';
import { auditWorld, formatViolations } from '../../src/world/audit';

it('dump R2', async () => {
  const world = await generateWorld({ width: 4200, height: 1200, seedText: '9293480', evil: 0 });
  const rep = auditWorld(world.store, { maxPerRule: 1_000_000 });
  const warns = rep.violations.filter((v) => v.rule === 'R2');
  console.log('R2 count:', warns.length);
  console.log(formatViolations({ ...rep, violations: warns.slice(0, 12) }, 12));
}, 300_000);
