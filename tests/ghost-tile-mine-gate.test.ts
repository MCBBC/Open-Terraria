// 挖掘分派 active() 门回归（Player.cs:46038-46042 `if (!tile.active()) return;` +
// CanKillTile 头 WorldGen.cs:62729-62731）：幽灵格（flags=0,type≠0 生成期残型）不可挖/
// 不可锤/不可整形；已致动格（flags=1+wire 32）active=真，分派放行。2026-09-03 蓝队自查实锤——
// 曾缺门 → tryMine 只看 type≠0，隔空挖掉隐形残型格（出掉落）/锤整形幽灵格。
import { describe, it, expect } from 'vitest';
import { Game } from '../src/core/Game';
import { World } from '../src/world/World';
import { T } from '../src/data/tiles';

const W = 160, H = 200;

/** Object.create(Game.prototype) 桩（同 kill-tier-audit mkDeathGame 模式）：
 *  只桩到 tryMine 门与拾取面，门后深链不打。 */
function mkGame(store: World['store']) {
  const sfx: string[] = [];
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  g.player = {
    x: 80 * 16, y: 186 * 16, w: 20, h: 42, equipStats: {}, dead: false,
    usedAmbrosia: false,
    buffs: { has: () => false, wellFedTier: 0 },
  };
  g.world = { store, flags: { hardMode: false, getGoodWorld: false }, isJourney: false };
  g.netCanEditTile = () => true;
  g.mining = null;
  g.tickCount = 1000;
  g.lastMineHitTick = 0;
  g.sfx = { play: () => {}, playWavFile: () => {}, playSfxFile: (n: string) => { sfx.push(n); } };
  g.particles = [];
  g.spawnParticles = () => {};
  g.addDamageNumber = () => {};
  g.spawnDrop = () => null;
  g.hitTiles = { addDamage: () => 0, getDamage: () => 0, clear: () => {}, prune: () => {} };
  g.canKillTile = () => true;
  g.killTileBreakSound = () => {};
  g.pruneHitTiles = () => {};
  return { g, sfx };
}

describe('挖掘分派 active() 门（Player.cs:46038-46042）', () => {
  it('幽灵格（flags=0,type≠0）：tryMine 整段短路——不掉落不变存盘无音', () => {
    const w = new World(W, H, 30, 'open');
    const tx = 80, ty = 188;
    w.store.setTile(tx, ty, T.DIRT);
    w.store.flags[w.store.idx(tx, ty)] = 0;              // 原版 active(false) 残型
    const { g, sfx } = mkGame(w.store);
    (g as { tryMine: (...a: unknown[]) => void }).tryMine(tx, ty, 40, 'pick', 20);
    expect(g.mining).toBeNull();
    expect(w.store.get(tx, ty)).toBe(T.DIRT);            // type 残留未清（门不硬清,只是不挖）
    expect(w.store.hasTile(tx, ty)).toBe(false);
    expect(sfx).toHaveLength(0);
  });

  it('已致动格（flags=1+wire32）：active()=真，分派放行（进入伤害积累,mining 落位）', () => {
    const w = new World(W, H, 30, 'open');
    const tx = 80, ty = 188;
    w.store.setTile(tx, ty, T.DIRT);
    w.store.wire[w.store.idx(tx, ty)] |= 32;             // WIRE_ACTUATED
    const { g } = mkGame(w.store);
    (g as { tryMine: (...a: unknown[]) => void }).tryMine(tx, ty, 40, 'pick', 20);
    // 门不拦——后续链走到伤害积累/击打面（mining 或音任一落地即证明放行）
    const mining = g.mining as unknown;
    const struck = mining !== null || (g.lastMineHitTick as number) === 1000;
    expect(struck).toBe(true);
  });

  it('普通在场格：门不误伤（分派照常放行）', () => {
    const w = new World(W, H, 30, 'open');
    const tx = 80, ty = 188;
    w.store.setTile(tx, ty, T.DIRT);                     // flags=1 正常在场
    const { g } = mkGame(w.store);
    (g as { tryMine: (...a: unknown[]) => void }).tryMine(tx, ty, 40, 'pick', 20);
    const mining = g.mining as unknown;
    const struck = mining !== null || (g.lastMineHitTick as number) === 1000;
    expect(struck).toBe(true);
  });
});
