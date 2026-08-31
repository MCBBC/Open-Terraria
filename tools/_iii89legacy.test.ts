// IIII93 复归排查仪：同一 seed 以新/旧行为各跑一遍,输出每槽末四通道 FNV 对照。
import { it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
const CASES = [{ seed: '9293480', evil: 0 }, { seed: '1511931452', evil: 1 }];
const SLOT_STOP = Number(process.env.SW_I93_LEGACY_STOP ?? 200);
function fnv1a(a: Uint8Array | Uint16Array): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < a.length; i++) {
    h ^= a[i]! & 0xffff;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
(it as any).skip ? null : null;
for (const c of CASES) {
  it(`legacy-diff ${c.seed}`, async () => {
    const histNew: Record<string, string[]> = {};
    const histOld: Record<string, string[]> = {};
    for (const mode of ['new', 'old'] as const) {
      const histRef = mode === 'new' ? histNew : histOld;
      process.env.SW_I93_LEGACYSPIKE = mode === 'old' ? '1' : '';
      process.env.SW_I93_LEGACYP = mode === 'old' ? '1' : '';
      let last = -9;
      await generateWorld({
        width: 4200, height: 1200, seedText: c.seed, evil: c.evil as 0 | 1,
        onWorldPartial: (w, i, pn) => {
          if (i > SLOT_STOP) return;
          const st = w.store as never as { type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array };
          histRef[`#${i}_${pn}`] = [fnv1a(st.type), fnv1a(st.flags), fnv1a(st.wall), fnv1a(st.liquid)];
        },
      });
    }
    delete process.env.SW_I93_LEGACYSPIKE; delete process.env.SW_I93_LEGACYP;
    const keys = Object.keys(histNew);
    let ndiff = 0;
    for (const k of keys) {
      const nv = histNew[k]!, ov = histOld[k]!;
      if (!ov) continue;
      const d = nv.map((v, z) => v !== ov[z]);
      if (d.some(Boolean)) { console.log(`DIFF ${k} ch=${['typ','act','wal','liq'].filter((_, z) => d[z]).join(',')}`); ndiff++; }
    }
    console.log(`slots compared=${keys.length} diff=${ndiff}`);
    console.log('compare done');
  }, 400000);
}
