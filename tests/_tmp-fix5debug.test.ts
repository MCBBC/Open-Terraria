import { describe, it } from 'vitest';
import { World } from '../src/world/World';
import { TownNPC } from '../src/entities/TownNPC';
import { TILE_DEFS } from '../src/data/tiles';

const DIRT = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === 1);
const F = 100;
function ps(n: object, kv: Record<string, unknown>): void { Object.assign(n, kv); }
function pv(n: object, k: string): any { return (n as Record<string, unknown>)[k]; }
function placeOnFloor(w: World, n: TownNPC, tileX: number): void {
  n.x = tileX * 16;
  n.y = F * 16 - n.h;
}
describe('dbg exact runSide', () => {
  it('mirror', () => {
    const w = new World(240, 200, 100, 'mirror');
    for (let x = 20; x <= 230; x++) w.store.setTileSilent(x, F, DIRT);
    const st = w.store;
    const startTile = 104;
    const n = new TownNPC('guide', 0, 0);
    placeOnFloor(w, n, startTile);
    const fr = Math.floor((n.y + n.h - 16) / 16);
    console.log('h=', n.h, 'y=', n.y, 'fr=', fr, 'fr vs F-1:', fr === F - 1);
    ps(n, { vanillaId: 46, walkMode: 1, walkT: 30000, onGround: true, vx: 0.9, stepUp: false });
    n.facing = 1;
    for (let x = startTile + 2; x <= startTile + 6; x++) st.setTileSilent(x, fr, DIRT);
    console.log('lip row used=', fr, 'solid@106:', st.isSolid(106, fr));
    const g = {
      world: w, player: { x: -9999, y: -9999, w: 0, h: 0, dead: true },
      enemies: () => [], npcs: () => [], critters: () => [], projectiles: () => [],
      spawnTownShot: () => {}, spawnParticles: () => {}, playSfx: () => {}, playSfxFiles: () => {},
      addDamageNumber: () => {},
    } as never;
    n.rng = () => 0.999;
    let prevFacing = 1;
    for (let t = 0; t < 400; t++) {
      n.fixedUpdate(1 / 60, g);
      if (n.facing !== prevFacing) {
        console.log(`FLIP@t${t} walkT=${pv(n, 'walkT')} mode=${pv(n, 'walkMode')} stuck=${pv(n, 'stuckT')} cornered=${pv(n, 'corneredT')} sit=${n.sitting} walking=${n.walking}`);
        break;
      }
      if (t % 10 === 0 || t < 12) console.log(`t${t} x=${n.x.toFixed(1)} WT=${pv(n, 'walkT')} stuck=${pv(n, 'stuckT')} g=${n.onGround} mode=${pv(n, 'walkMode')} vy=${pv(n, 'vy')} vx=${n.vx.toFixed(2)} talk=${n.talking} social=${n.socialKind}`);
    }
  });
});
