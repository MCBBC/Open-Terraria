// IIIII214: RNG 边界态捕获 v2（实例链范式：reseed 换实例 → 边界态=「边界末实例」或
// 「边界后首掷实例」双候选对拳）+ gs 常量 + sheet/solid 映射
// 用法：SW_I214CAP=1 SW_I81_SEED='nightofthelivingdead|20260903' SW_I81_EVIL=0 \
//   SW_I81_SAVEOUT=/tmp/iii214-out npx vitest run tools/_iii214cap.test.ts
import { it } from 'vitest';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

it('iii214 capture', { timeout: 600000 }, async () => {
  if (process.env.SW_I214CAP !== '1') { console.log('[i214cap] skip'); return; }
  const OUT = process.env.SW_I81_SAVEOUT ?? '/tmp/iii214-out';
  mkdirSync(OUT, { recursive: true });
  const SEED = process.env.SW_I81_SEED ?? 'nightofthelivingdead|20260903';
  const EVIL = Number(process.env.SW_I81_EVIL ?? 0);
  const W = 4200, H = 1200;

  type Snap = { arr: number[]; inext: number };
  const snap = (u: { seedArray: Int32Array; inext: number }): Snap => ({ arr: Array.from(u.seedArray), inext: u.inext });
  // 阶段机：0=跑；1=已过快清理边界(待捕首掷)；2=完成；3=已过罐段入口(待捕首掷)；4=完成
  let phase = 0;
  let lastAtGrv: { inst: object; st: Snap } | null = null;
  let firstAfterGrv: { raw: number; st: Snap; sameAsLast: boolean } | null = null;
  let lastAtPots: { inst: object; st: Snap } | null = null;
  let firstAfterPots: { raw: number; st: Snap; sameAsLast: boolean } | null = null;
  let capGs: unknown = null;
  let potsendFrames: Buffer | null = null;

  const g0 = globalThis as { __swOnRoll?: (v: number, inst: object) => void };
  g0.__swOnRoll = (v, inst) => {
    if (phase === 1) {
      const u = inst as { seedArray: Int32Array; inext: number };
      firstAfterGrv = { raw: v, st: snap(u), sameAsLast: lastAtGrv?.inst === inst };
      phase = 2;
    } else if (phase === 3) {
      const u = inst as { seedArray: Int32Array; inext: number };
      firstAfterPots = { raw: v, st: snap(u), sameAsLast: lastAtPots?.inst === inst };
      phase = 4;
    }
  };

  (globalThis as { __swPotCap?: (gs: unknown, store: unknown) => void }).__swPotCap = (gs, store) => {
    // runPotsPass 入口 = 罐段流位置（墓园+巨石段已跑完）
    const u = (globalThis as { __swUrLast?: { seedArray: Int32Array; inext: number } }).__swUrLast;
    if (u) lastAtPots = { inst: u, st: snap(u) };
    const g = gs as { worldSurface: number; worldSurfaceHigh: number; worldSurfaceLow: number; beachDistance: number; rockLevel: number; remix: unknown; seed: number };
    capGs = {
      worldSurface: g.worldSurface, worldSurfaceHigh: g.worldSurfaceHigh,
      worldSurfaceLow: g.worldSurfaceLow, beachDistance: g.beachDistance,
      rockLevel: g.rockLevel, remix: !!g.remix, seed: g.seed,
    };
    const st = store as { frameX: Uint16Array; frameY: Uint16Array };
    potsendFrames = Buffer.from(st.frameX.buffer, st.frameX.byteOffset, st.frameX.byteLength);
  };

  // __swUrLast：最近滚动实例（PotsPass 钩读取用）
  (globalThis as { __swUrLast?: unknown }).__swUrLast = undefined;
  const setUrLast = (inst: object) => { (globalThis as { __swUrLast?: unknown }).__swUrLast = inst; };
  const baseRoll = g0.__swOnRoll;
  g0.__swOnRoll = (v, inst) => {
    setUrLast(inst);
    baseRoll?.(v, inst);
  };

  await generateWorld({
    width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
    onWorldPartial: (w, _i, pn) => {
      if (pn === '快清理' && phase === 0) {
        const u = (globalThis as { __swUrLast?: { seedArray: Int32Array; inext: number } }).__swUrLast as { seedArray: Int32Array; inext: number } | undefined;
        if (u) lastAtGrv = { inst: u, st: snap(u) };
        phase = 1;
        const stv = w.store as unknown as Record<string, Uint8Array | Uint16Array>;
        mkdirSync(`${OUT}/js-qc`, { recursive: true });
        for (const c of ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'coat']) {
          const a = stv[c]!;
          writeFileSync(`${OUT}/js-qc/base_${c}.bin`, Buffer.from(a.buffer, a.byteOffset, a.byteLength));
        }
      }
      if (pn === '瓦罐' && !potsendFrames) {
        const stv2 = w.store as unknown as Record<string, Uint8Array | Uint16Array>;
        potsendFrames = Buffer.from((stv2.frameX as Uint16Array).buffer, (stv2.frameX as Uint16Array).byteOffset, (stv2.frameX as Uint16Array).byteLength);
      }
    },
  });
  writeFileSync(`${OUT}/js-potsend-frames.bin`, potsendFrames ?? Buffer.alloc(0));
  writeFileSync(`${OUT}/cap2.json`, JSON.stringify({
    lastAtGrv: lastAtGrv?.st, firstAfterGrv,
    lastAtPots: lastAtPots?.st, firstAfterPots, gs: capGs,
  }, null, 1));
  const map: Record<string, [number, number]> = {};
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const d = TILE_DEFS[i];
    if (d?.vanilla && typeof d.vanilla.sheet === 'number') map[i] = [d.vanilla.sheet, (d as unknown as { solid?: number }).solid ? 1 : 0];
  }
  writeFileSync(`${OUT}/tilemap.json`, JSON.stringify(map));
  try {
    const pack = JSON.parse(readFileSync('public/l10n/zh-Hans.json', 'utf8'));
    const epit = pack.Epitaph ? Object.keys(pack.Epitaph).length : 0;
    writeFileSync(`${OUT}/epitaph-count.txt`, String(epit));
  } catch { writeFileSync(`${OUT}/epitaph-count.txt`, '-1'); }
  console.log('[i214cap] done; firstAfterGrv.sameAsLast =', firstAfterGrv?.sameAsLast, '; firstAfterPots.sameAsLast =', firstAfterPots?.sameAsLast);
});
