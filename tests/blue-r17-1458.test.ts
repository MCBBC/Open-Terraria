// 蓝队 R17 — 1.4.5.8 热补丁移植复核回归（红队报告 /tmp/recon/red-team-r17-1458.md 缺陷③）
// 催化指环 6185 ctx 九处缺口：applyProjStatus 调用点 WeaponProj×2/Dart/MissileProj×2/
//   proj1457×2/WhipProj×2 不传 ctx → 398 AcceleratePoisons 不上。原版 StatusNPC
//   :11192-11196 = `!npcProj && Main.player[owner].catalystBand` → AddBuff(398, 300)
//   （任意玩家弹命中,无弹型门;300t=5s）。本文件跨族断言：近战弹（回旋镖 6,表外型号
//   =唯一可见效应即 398）+ 鞭（841,同表外）两族 × 有/无指环两态。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TileStore } from '../src/world/TileStore';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { Boomerang } from '../src/entities/WeaponProj';
import { WhipProj } from '../src/entities/WhipProj';
import { writePlayerItems, readPlayerItems, ItemContainer, NetReader } from '../src/net/protocol';
import type { GameHooks } from '../src/entities/types';

const iid = (vid: number): number => {
  const k = vanillaItemKey(vid);
  const found = k ? ITEM_BY_KEY[k] : undefined;
  if (found === undefined) throw new Error(`vid ${vid} 未注册`);
  return found;
};

interface MockEnemy {
  id: number; x: number; y: number; w: number; h: number; dead: boolean;
  cx: number; cy: number; hp: number; acceleratePoisonsT?: number;
  hurt: (d: number, kx: number, ky: number, g: GameHooks) => boolean; hits: number[];
}
const mkEnemy = (id: number, cx: number, cy: number, w = 16, h = 24): MockEnemy => {
  const e: MockEnemy = {
    id, x: cx - w / 2, y: cy - h / 2, w, h, dead: false, cx, cy, hp: 100000, hits: [],
    hurt: (d: number) => { e.hp -= d; e.hits.push(d); return true; },
  };
  return e;
};

function makeHooks(enemies: MockEnemy[] = []) {
  const store = new TileStore(200, 120);
  for (let x = 0; x < 200; x++) for (let y = 100; y < 120; y++) store.setTileSilent(x, y, 1);
  const player = new Player(60 * 16, 90 * 16, new Inventory());
  const hooks: GameHooks = {
    world: { store } as never,
    player: player as never,
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
  };
  return { hooks, store, player };
}

describe('R17 缺陷③：催化指环 6185 → 398 AcceleratePoisons 跨族（StatusNPC :11192-11196）', () => {
  it('近战弹族（回旋镖 6,WeaponProj hitEnemies 共用路径）：戴 6185 命中上 398 300t=5s;不戴不上', () => {
    const run = (band: boolean): number | undefined => {
      const e = mkEnemy(1, 1030, 1006);        // 首拍移动后弹体(1010..1032)与敌重叠
      const { hooks, player } = makeHooks([e]);
      if (band) player.inv.armor[3] = { id: iid(6185), stack: 1 };
      const b = new Boomerang(1000, 1000, 10, 0, 15, 4, 6, 1);
      b.fixedUpdate(1 / 60, hooks);            // 命中判定在移动段后（fixedUpdate 尾）
      expect(e.hits.length).toBe(1);           // 命中已发生
      return (e as { acceleratePoisonsT?: number }).acceleratePoisonsT;
    };
    expect(run(true)).toBe(5);                 // AddBuff(398,300) → 5s
    expect(run(false)).toBeUndefined();        // 无指环 → 不上（!catalystBand 门）
  });

  it('鞭族（841,WhipProj 命中路径）：戴 6185 鞭中上 398;不戴不上（IsAWhip 无额外门）', () => {
    const run = (band: boolean): number | undefined => {
      const e = mkEnemy(1, 0, 0);
      const { hooks, player } = makeHooks([e]);
      if (band) player.inv.armor[3] = { id: iid(6185), stack: 1 };
      const w = new WhipProj(player.cx, player.cy, 0, 841, 4672, 14, 1, 30, 4, () => player);
      for (let i = 0; i < 9; i++) w.fixedUpdate(1, hooks);   // 伸展（同 a-batch2 鞭命中驱动）
      const p = w.pointsAt(20, true)[10];
      e.cx = p.x; e.cy = p.y; e.x = p.x - 8; e.y = p.y - 12;
      w.fixedUpdate(1, hooks);
      expect(e.hits.length).toBe(1);
      return (e as { acceleratePoisonsT?: number }).acceleratePoisonsT;
    };
    expect(run(true)).toBe(5);
    expect(run(false)).toBeUndefined();
  });
});

// ================= R17 缺陷④：R16-13 prefix 消费端（原版 MessageBuffer.cs:1478/1519
//  `if (prefix != item.prefix) Prefix(prefix)` 条件应用——R16-13 只接了线上格式,
//  上行漏带 + 下行丢弃 → 远端装备/箱子词缀归零） =================
describe('R17 缺陷④：msg5/msg32 prefix 全链（上行带/下行存）', () => {
  it('线上格式：writePlayerItems→readPlayerItems 往返保 prefix（R16-13 线格式回归锁）', () => {
    const frame = writePlayerItems([
      { playerSlot: 1, container: ItemContainer.Armor, itemSlot: 3, itemId: 6185, stack: 1, prefix: 66 },
      { playerSlot: 1, container: ItemContainer.Slots, itemSlot: 0, itemId: 0, stack: 0, prefix: 0 },
    ]);
    const back = readPlayerItems(new NetReader(frame.subarray(3)));   // 剥 [u16 len][u8 id] 头
    expect(back[0]).toMatchObject({ itemId: 6185, stack: 1, prefix: 66 });
    expect(back[1]).toMatchObject({ itemId: 0, stack: 0, prefix: 0 });
  });

  it('消费端接线：applyRemoteItems 落袋带 prefix / 上行两路（全量+差分）带 prefix / 差分键含 prefix', () => {
    const src = readFileSync(new URL('../src/net/ClientNet.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/arr\[e\.itemSlot\] = e\.itemId \? \{ id: e\.itemId, stack: e\.stack, prefix: e\.prefix \} : null/);
    expect(src).toMatch(/prefix: arr\[i\]\?\.prefix \?\? 0/);                       // sendFullInventory
    expect(src).toMatch(/\(a\?\.prefix \?\? 0\) !== \(b\?\.prefix \?\? 0\)/);        // syncInventory 差分键
    const game = readFileSync(new URL('../src/core/Game.ts', import.meta.url), 'utf8');
    expect(game).toMatch(/netApplyChest\(chestIdx: number, x: number, y: number, items: Array<\{ id: number; stack: number; prefix\?: number \} \| null>\)/);
    expect(game).toMatch(/chest\.items\[i\] = items\[i\] \? \{ \.\.\.items\[i\]! \} : null/);  // spread 透传
  });
});
