import { describe, it, expect } from 'vitest';
import { saveGame, loadSave } from '../src/save/SaveFile';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { ITEM_BY_KEY } from '../src/data/items';
import { T, W } from '../src/data/tiles';
import { BUFF_DEFS, BuffType } from '../src/stats/Buffs';
import { packWorld } from '../src/workers/worldPacket';
import { World as WorldClass } from '../src/world/World';

describe('自有存档格式', () => {
  it('RLE 编解码往返一致', () => {
    const world = new World(64, 32, 42, '测试');
    world.spawnX = 30; world.spawnY = 10;
    const st = world.store;
    // 造点数据：地面 + 洞 + 火把 + 液体 + 墙
    for (let x = 0; x < 64; x++) {
      for (let y = 20; y < 32; y++) st.setTileSilent(x, y, y > 26 ? T.STONE : T.DIRT);
      st.setTileSilent(x, 18, T.TORCH, 0, 0);
      st.setWallSilent(x, 24, W.STONE);
    }
    st.setTileSilent(10, 21, 0);
    st.setTileSilent(10, 22, 0);
    st.setLiquid(10, 22, 255, 1);
    world.chests.push({ x: 5, y: 5, items: [{ id: ITEM_BY_KEY['torch'], stack: 3 }, null] });

    const inv = new Inventory();
    inv.add(ITEM_BY_KEY['dirt_block'], 77);
    const player = new Player(100, 100, inv);
    player.hp = 88;

    const json = saveGame(world, player, 1234);
    const back = loadSave(json);

    expect(back.world.w).toBe(64);
    expect(back.world.h).toBe(32);
    expect(back.world.store.get(0, 20)).toBe(T.DIRT);
    expect(back.world.store.get(0, 27)).toBe(T.STONE);
    expect(back.world.store.get(0, 18)).toBe(T.TORCH);
    expect(back.world.store.get(10, 21)).toBe(0);
    expect(back.world.store.liquid[st.idx(10, 22)]).toBe(255);
    expect(back.world.store.wall[st.idx(0, 24)]).toBe(W.STONE);
    expect(back.world.chests).toHaveLength(1);
    expect(back.world.chests[0].items[0]?.stack).toBe(3);
    expect(back.player.hp).toBe(88);
    expect(back.player.inventory[0]?.stack).toBe(77);
  });

  it('上限扩容进度（水晶之心/生命果/魔力水晶）往返保持', () => {
    const world = new World(64, 32, 42, '测试');
    const player = new Player(100, 100, new Inventory());
    player.baseMaxHp = 420;  // 400 水晶 + 4 颗生命果
    player.baseMaxMana = 160; // 7 颗魔力水晶
    player.mana = 88;
    player.hp = 400;

    const back = loadSave(saveGame(world, player, 0));
    expect(back.player.baseMaxHp).toBe(420);
    expect(back.player.baseMaxMana).toBe(160);
    expect(back.player.mana).toBe(88);
  });

  it('旧档缺省上限字段不炸（100/20/20 由加载方兜底）', () => {
    const data = JSON.parse(saveGame(new World(64, 32, 1, '测试'), new Player(0, 0, new Inventory()), 0));
    delete data.player.baseMaxHp;
    delete data.player.baseMaxMana;
    delete data.player.mana;
    const back = loadSave(JSON.stringify(data));
    expect(back.player.baseMaxHp).toBeUndefined();
    expect(back.player.baseMaxMana).toBeUndefined();
  });

  it('墓碑碑文（signs）往返保持', () => {
    const world = new World(64, 32, 42, '测试');
    world.signs.push({ x: 10, y: 20, text: '泰拉瑞亚人摔死了。\n2026年8月10日' });
    const back = loadSave(saveGame(world, new Player(0, 0, new Inventory()), 0));
    expect(back.world.signs).toHaveLength(1);
    expect(back.world.signs[0]?.text).toContain('摔死了');
    expect(back.world.signs[0]?.x).toBe(10);
  });

  it('存档体积可控', () => {
    const world = new World(4200, 1200, 1, '大世界');
    const st = world.store;
    for (let x = 0; x < st.w; x++) {
      for (let y = 0; y < st.h; y++) {
        st.setTileSilent(x, y, y > 500 ? T.STONE : (y > 300 ? T.DIRT : 0));
      }
    }
    const json = saveGame(world, new Player(0, 0, new Inventory()), 0);
    // 大世界规则地形应在数百 KB 量级（base64 会膨胀 ~1.33x）
    expect(json.length).toBeLessThan(8 * 1024 * 1024);
  });

  it('存档对齐批(2026-08-12):npcs/buffs/税金/死亡计数/血月日月相/moonType/箱锁 往返', () => {
    const world = new World(64, 32, 42, '测试');
    world.clock.bloodMoon = true;
    world.clock.moonPhase = 5;
    world.moonType = 3;
    world.invasionType = 1; world.invasionSize = 80; world.invasionSizeStart = 80;
    world.invasionX = 100; world.invasionDelay = 3600;
    world.altarCount = 2;
    world.chests.push({ x: 5, y: 5, locked: true, items: [null] });
    world.pendingTownNpcs = [
      { key: 'merchant', x: 800, y: 400, home: [10, 8], givenName: '阿三' },
      { key: 'nurse', x: 900, y: 400, home: null },
    ];
    const player = new Player(100, 100, new Inventory());
    player.taxMoney = 12345;
    player.deathsPve = 7;
    player.buffs.apply(/* Ironskin */ 1, 120);
    player.buffs.apply(/* Campfire=87 号光环型 buff,在 NO_SAVE 名单 → 不落盘 */ 5, 99);

    const npcs = world.pendingTownNpcs.slice();
    const back = loadSave(saveGame(world, player, 0, npcs));
    // 世界态
    expect(back.world.clock.bloodMoon).toBe(true);
    expect(back.world.clock.moonPhase).toBe(5);
    expect(back.world.moonType).toBe(3);
    expect(back.world.invasionType).toBe(1);
    expect(back.world.invasionSizeStart).toBe(80);
    expect(back.world.altarCount).toBe(2);
    expect(back.world.chests[0].locked).toBe(true);
    // 城镇 NPC 段(NPC 段 WF:1703-1750)
    expect(back.world.pendingTownNpcs).toHaveLength(2);
    expect(back.world.pendingTownNpcs![0].givenName).toBe('阿三');
    expect(back.world.pendingTownNpcs![1].home).toBeNull();
    // 玩家态
    expect(back.player.taxMoney).toBe(12345);
    expect(back.player.deathsPve).toBe(7);
    expect(back.player.buffs).toEqual([[5, 120]]);   // Ironskin→vanilla 5;Campfire 87 被过滤
  });

  it('BuffState.toSave/applySaved:buffNoSave 过滤(Main.cs:8896-8990)+未知 id 容忍', () => {
    const player = new Player(100, 100, new Inventory());
    player.buffs.applySaved([[26, 600], [999, 60], [87, 30]]); // 饱腹(26 可存)/未知/光环 87
    // vanilla 26 → 本仓 WellFed(经 BUFF_DEFS 反查,不硬编码枚举值)
    const wellFed = (Object.keys(BUFF_DEFS) as unknown as BuffType[])
      .find((t) => BUFF_DEFS[t].vanillaBuff === 26)!;
    expect(player.buffs.has(wellFed)).toBe(true);
    const saved = player.buffs.toSave();
    expect(saved.some(([v]) => v === 87)).toBe(false);   // 87 在 NO_SAVE 名单
    expect(saved.some(([v]) => v === 999)).toBe(false);  // 未知 id 无 BUFF_DEFS 条目
    expect(saved.some(([v]) => v === 26)).toBe(true);
  });


  it('worker packet 往返:invasion/altarCount/weather/bestiary/npcs/clock三件套/moonType 不蒸发(packWorld 黑洞回归)', () => {
    const world = new World(64, 32, 42, 'packet');
    world.clock.bloodMoon = true; world.clock.eclipse = false; world.clock.moonPhase = 3;
    world.moonType = 2;
    world.invasionType = 2; world.invasionSize = 60; world.invasionSizeStart = 60;
    world.invasionX = 55; world.invasionDelay = 1200;
    world.altarCount = 3;
    world.pendingTownNpcs = [{ key: 'goblin_tinkerer', x: 10, y: 20, home: null, bound: true }];
    const { packet } = packWorld(world);
    const w2 = World.fromPacket(packet);
    expect(w2.clock.bloodMoon).toBe(true);
    expect(w2.clock.moonPhase).toBe(3);
    expect(w2.moonType).toBe(2);
    expect(w2.invasionType).toBe(2);
    expect(w2.invasionDelay).toBe(1200);
    expect(w2.altarCount).toBe(3);
    expect(w2.pendingTownNpcs).toHaveLength(1);
    expect(w2.pendingTownNpcs![0].bound).toBe(true);
  });

});
