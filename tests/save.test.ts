import { describe, it, expect } from 'vitest';
import { saveGame, loadSave } from '../src/save/SaveFile';
import { serializeSave } from '../src/save/serialize';
import type { SaveData, SaveMeta, SaveStoreView } from '../src/save/serialize';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { VANILLA_ITEM_KEY_BY_ID, ITEM_BY_KEY, ITEM_DEFS, ITEM_STABLE_OF_INTERNAL } from '../src/data/items';
import { T, W } from '../src/data/tiles';
import { BUFF_DEFS, BuffType, buffTypeByVanilla } from '../src/stats/Buffs';
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
    world.chests.push({ x: 5, y: 5, items: [{ id: ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[8]], stack: 3 }, null] });

    const inv = new Inventory();
    inv.add(ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[2]], 77);
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

  it('D1 稳定 id 窖洞回归：表外注册物品（敌旗/钓鱼族/1457 新三件）存读不蒸发（2026-08-21）', () => {
    // 曾病：稳定 id 表建在注册中途,敌旗 290/钓鱼 35/具名 5/1457 新三件落在
    // Uint16Array 外 → 存盘 `?? 0` 写 0 → 读档 id 0 静默丢物。表已移 items.ts 文件尾。
    const world = new World(64, 32, 42, '测试');
    const inv = new Inventory();
    const keys = [
      'vi_1615_banner_b1',          // 敌旗族（同 vid 与 vanilla.json 自动键双注册）
      'vi_2289_f2289',              // 钓鱼竿族
      'vi_5573_torch_gods_potion',  // 具名 5 件之一
      'vi_6156_SilverBracer',       // 1457 新（上锁盒 1/4）
      'vi_6158_MobiusStrip',        // 1457 新（石巨人袋 1/6）
      'vi_6165_PoisonBarb',         // 1457 新（木匣 1/20）
    ];
    for (const k of keys) {
      const id = ITEM_BY_KEY[k];
      expect(id, `键未注册: ${k}`).toBeDefined();
      inv.add(id, 5);
    }
    const player = new Player(100, 100, inv);
    const back = loadSave(saveGame(world, player, 0));
    const gotStacks = keys.map((k) => {
      const id = ITEM_BY_KEY[k];
      const slot = back.player.inventory.find((s) => s && ITEM_STABLE_OF_INTERNAL[s.id] === ITEM_STABLE_OF_INTERNAL[id]);
      return slot?.stack ?? 0;
    });
    expect(gotStacks, `有物品蒸发: ${keys.map((k, i) => `${k}=${gotStacks[i]}`).join(', ')}`)
      .toEqual([5, 5, 5, 5, 5, 5]);
    // 反查回的内部 id 必须是有效 vi_ def（读档链 ITEM_INTERNAL_OF_STABLE 归一）
    for (const s of back.player.inventory) {
      if (!s) continue;
      expect(ITEM_DEFS[s.id]?.key ?? '').toMatch(/^vi_/);
    }
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
    world.savedOreTiers = { cobalt: 221, mythril: 108, adamantite: -1 };
    world.shadowOrbCount = 1;
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
    expect(back.world.savedOreTiers).toEqual({ cobalt: 221, mythril: 108, adamantite: -1 }); // SavedOreTiers 往返
    expect(back.world.shadowOrbCount).toBe(1); // shadowOrbCount 往返（WF:1302/2099）
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
    // vanilla 26 → 本仓 WellFed(经 BUFF_DEFS 反查,不硬编码枚举值)。
    // ★须用 buffTypeByVanilla 取【数值】枚举键——Object.keys 返回字符串,
    // BuffState.active 以数值 BuffType 为键,字符串键 has() 恒 false
    // (2026-08-13 修复 Buffs.ts 反查表同陷阱后,此断言随之校正)
    const wellFed = buffTypeByVanilla(26)!;
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

  it('战争迷雾（explored）往返:散点+大片 1 逐格一致,0/1 位图 RLE 高压缩', () => {
    const world = new World(64, 32, 42, '迷雾');
    world.markExplored(32, 16, 3);   // 散点圆
    for (let x = 0; x < 64; x++) for (let y = 0; y < 10; y++) world.explored[y * 64 + x] = 1;  // 大片 1
    const before = world.explored.slice();

    const data = JSON.parse(saveGame(world, new Player(0, 0, new Inventory()), 0));
    expect(typeof data.explored).toBe('string');
    // 0/1 位图 RLE：2048 格只有几条游程 → base64 几十字节（曾缺段=重进存档全图迷雾）
    expect(data.explored.length).toBeLessThan(200);

    const back = loadSave(JSON.stringify(data));
    expect([...back.world.explored]).toEqual([...before]);
  });

  it('全图已探索的 explored 落盘仅几条游程(大世界全 1 段)', () => {
    const world = new World(2000, 600, 1, '大世界');  // 1.2M 格
    world.explored.fill(1);
    const data = JSON.parse(saveGame(world, new Player(0, 0, new Inventory()), 0));
    expect(data.explored.length).toBeLessThan(100);   // 1 条游程 = ~7 字节 + base64 膨胀
    const back = loadSave(JSON.stringify(data));
    expect(back.world.explored.every((v) => v === 1)).toBe(true);
  });

  it('旧档缺 explored 段 → 全 0 未探索（旧行为),不报错不迁移', () => {
    const world = new World(16, 8, 1, '旧档');
    world.explored.fill(1);   // 即便存前全探索
    const data = JSON.parse(saveGame(world, new Player(0, 0, new Inventory()), 0));
    delete data.explored;     // 抹成 v4 旧档形状
    const back = loadSave(JSON.stringify(data));
    expect(back.world.explored).toHaveLength(16 * 8);
    expect(back.world.explored.every((v) => v === 0)).toBe(true);
  });

  it('serializeSave:SaveStoreView.explored 缺省（save.worker 旧客户端 buf）不落段', () => {
    const n = 16;   // w=4 × h=4——视图长度须与 meta 尺寸一致
    const mkView = (explored?: Uint8Array): SaveStoreView => ({
      type: new Uint16Array(n), flags: new Uint8Array(n),
      frameX: new Uint16Array(n), frameY: new Uint16Array(n),
      wall: new Uint16Array(n), liquid: new Uint8Array(n), liquidType: new Uint8Array(n),
      wire: new Uint8Array(n), half: new Uint8Array(n), slope: new Uint8Array(n),
      paint: new Uint8Array(n), paintWall: new Uint8Array(n),
      explored,
    });
    const meta: SaveMeta = {
      name: 'w', seed: 1, w: 4, h: 4, spawnX: 1, spawnY: 1,
      groundLevel: 1, rockLevel: 2, timeOfDay: 0, dayCount: 1,
      chests: [], flags: {},
    };
    const player: SaveData['player'] = { hp: 100, x: 0, y: 0, inventory: [], selected: 0 };
    // 旧客户端缺 explored buffer → 键被丢弃（读档端按全 0 旧行为）
    expect('explored' in JSON.parse(serializeSave(mkView(), meta, player, 0))).toBe(false);
    // 有 buffer → RLE 落段且读档还原
    const ex = new Uint8Array(n);
    ex[0] = 1; ex[15] = 1;
    const data = JSON.parse(serializeSave(mkView(ex), meta, player, 0));
    expect(data.explored).toBeTypeOf('string');
    const back = loadSave(JSON.stringify(data));
    expect([...back.world.explored]).toEqual([...ex]);
  });

  it('worker 读档包往返:packWorld 回传 explored（worldPacket 曾只传 exploredVersion → 全图迷雾）', () => {
    const world = new World(64, 32, 42, 'packet-explored');
    world.markExplored(5, 5, 4);
    world.markExplored(40, 20, 6);
    const before = world.explored.slice();
    const { packet } = packWorld(world);
    expect(packet.buf.explored).toBeInstanceOf(ArrayBuffer);
    const w2 = World.fromPacket(packet);
    expect([...w2.explored]).toEqual([...before]);
  });

});
