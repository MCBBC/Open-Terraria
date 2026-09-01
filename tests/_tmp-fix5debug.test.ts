import { describe, it } from 'vitest';
import { World } from '../src/world/World';
import { TownNPC } from '../src/entities/TownNPC';
import { TILE_DEFS } from '../src/data/tiles';

const DIRT = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === 1);
const F = 100;
function rngQ(vals: number[], fb = 0.999) { let i = 0; return () => { const v = i < vals.length ? vals[i] : fb; i++; return v; }; }
function pv(n: object, k: string): any { return (n as Record<string, unknown>)[k]; }

function mkWorld(): World {
  const w = new World(240, 200, 100, 'dbg');
  for (let x = 20; x <= 230; x++) w.store.setTileSilent(x, F, DIRT);
  return w;
}
const GAME = (world: World) => ({
  world,
  player: { x: -9999, y: -9999, w: 0, h: 0, dead: true },
  enemies: () => [], npcs: () => [], critters: () => [],
  projectiles: () => [],
  spawnTownShot: () => {}, spawnParticles: () => {}, playSfx: () => {}, playSfxFiles: () => {},
  addDamageNumber: () => {},
}) as never;

describe('debug', () => {
  it('dirt id check', () => {
    console.log('DIRT id =', DIRT, 'sheet=', TILE_DEFS[DIRT]?.vanilla?.sheet);
  });

  it('A10a walkT write trap', () => {
    const w = mkWorld();
    const c = new TownNPC('guide', 104 * 16, F * 16 - 42);
    ps(c, { vanillaId: 300 });
    let val = pv(c, 'walkT');
    Object.defineProperty(c, 'walkT', {
      get() { return val; },
      set(v: number) {
        console.log(`SET walkT ${val} -> ${v} @${new Error().stack?.split('\n').slice(2, 5).map((s) => s.trim().replace(/^at |\(.*$/g, '')).join(' <- ')}`);
        val = v;
      },
      configurable: true,
    });
    ps(c, { walkMode: 0 });
    val = 1;
    ps(c, { onGround: true });
    const g = GAME(w);
    c.rng = (() => { let i = 0; const vals = [0.5, 0.5]; return () => i < vals.length ? vals[i++] : 0.999; })();
    for (let t = 0; t < 3; t++) c.fixedUpdate(1 / 60, g);
    console.log('final mode=', pv(c, 'walkMode'), 'walkT=', val);
  });

  it('rng consumption trace during one walking-air tick', () => {
    const w = mkWorld();
    const s = new TownNPC('town_slime_blue', 105 * 16, F * 16 - 40);
    let seq: number[] = [];
    s.rng = () => { const v = 0.999; seq.push(v); return v; };
    ps(s, { walkMode: 1, walkT: 5000, onGround: false, vy: -3, vx: 1, turnLock: 0 });
    s.facing = 1;
    // carve supports
    for (const col of [104, 105, 106]) for (let d = 0; d <= 8; d++) w.store.setTileSilent(col, F + d, 0);
    w.store.setTileSilent(106, F + 1, DIRT);
    w.store.setTileSilent(104, F + 2, DIRT);
    s.fixedUpdate(1 / 60, GAME(w));
    console.log('dice count:', seq.length, 'mode=', pv(s, 'walkMode'), 'turnLock=', pv(s, 'turnLock'), 'vx=', s.vx, 'onGround=', s.onGround, 'supportsHit=', seq.length > 1);
  });
});

function ps(n: object, kv: Record<string, unknown>): void { Object.assign(n, kv); }
