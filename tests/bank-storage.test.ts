// 玩家储物（bank×4：存钱罐/保险箱/守护者熔炉/虚空保险库）持久化测试
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { saveGame, loadSave } from '../src/save/SaveFile';
import { TILE_BY_KEY } from '../src/data/tiles';

describe('玩家储物 bank×4', () => {
  it('默认 4 组 × 40 槽全空', () => {
    const p = new Player(0, 0, new Inventory());
    expect(p.banks.length).toBe(4);
    for (const b of p.banks) {
      expect(b.length).toBe(40);
      expect(b.every((s) => s === null)).toBe(true);
    }
  });

  it('saveGame → loadSave 往返：bank 内容完整保留（旧档缺省兼容全空）', () => {
    const w = new World(60, 40, 42, 'bank-test');
    const p = new Player(100, 100, new Inventory());
    p.banks[0][0] = { id: 1, stack: 99 };   // 存钱罐
    p.banks[1][39] = { id: 2, stack: 50 };  // 保险箱末槽
    p.banks[2][20] = { id: 3, stack: 7 };   // 守护者熔炉
    p.banks[3][5] = { id: 4, stack: 1 };    // 虚空保险库
    const json = saveGame(w, p, 0);

    const { player } = loadSave(json);
    expect(player.banks?.[0][0]).toEqual({ id: 1, stack: 99 });
    expect(player.banks?.[1][39]).toEqual({ id: 2, stack: 50 });
    expect(player.banks?.[2][20]).toEqual({ id: 3, stack: 7 });
    expect(player.banks?.[3][5]).toEqual({ id: 4, stack: 1 });
    expect(player.banks?.[3][6]).toBeNull();
    // 旧档兼容：手工剥掉 banks 字段
    const raw = JSON.parse(json) as { player: Record<string, unknown> };
    delete raw.player.banks;
    const legacy = loadSave(JSON.stringify(raw));
    expect(legacy.player.banks).toBeUndefined();
  });

  it('四个储物 tile 注册齐全（含 463 管线/映射补全）', () => {
    for (const key of ['v_29_piggy_bank', 'v_97_safe', 'v_463_defenders_forge', 'v_491_void_vault']) {
      expect(TILE_BY_KEY[key]).toBeDefined();
    }
  });
});
