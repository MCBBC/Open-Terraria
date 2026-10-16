// ★BJ285 清债刀（红蓝 S6/S7 普查案清偿批）四件回归：
//   ① BJ232 死亡段割面批量修形（S7）——「无内置割+命中即亡」弹类死亡拍照割批量前置
//     （CutTiles P.cs:12517 先于 Damage_PVE :12523;BJ260 叶弹 227 单件习语推广）。
//     13 修复站：977 村正斩波 / 524 血舌球 / 978 火山爆焰 / 964 骸骨幻影 /
//     16·34·79 可控导弹 / 9 天降星体 / 634·635 星云烈焰弹 / 715-718 烟花弹 /
//     MagicProj / 405 飞鱼泡泡 / 523 水晶蛇弹 / 回旋镖族 / 悠悠球族。
//     备案锁（原版不割,禁止补割）：535 MedusaHead（Damage_CanDealDamage :12461 无条件
//     排除）、69/70/621 圣水族（CanCutTiles :15407 显式排除）、567/568 孢子云
//     （aiStyle 105 排除）、358/1042/406 黏球族（AI_060 :29476 重叠即 AI-Kill——
//     死亡拍 active=false 无 Damage,原版本就无割）。
//   ② C1 永久旗标消耗品（S6）——5289 矿车升级套件消耗+返还 3353 对齐;5326 面包旗标。
//   ③ C3 Game.ts window 直读守卫普查（BJ259 连坐根治）——node-safe 全数标注+守卫。
//   ④ 702 LifeFruitReplica 放置通路定谳（S7）。
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { MuramasaSlashProj } from '../src/entities/meleeOnHitProjs';
import { VolcanoBlastProj } from '../src/entities/VolcanoBlastProj';
import { InsanityShadowFriendly } from '../src/entities/InsanityShadowFriendly';
import { Game } from '../src/core/Game';
import { ITEM_BY_KEY } from '../src/data/items';
import { TILE_BY_KEY } from '../src/data/tiles';
import { exportPlr, parsePlr } from '../src/save/PlrImport';
import { createDecipheriv } from 'node:crypto';
import type { GameHooks } from '../src/entities/types';
import { languageManager } from '../src/i18n/LanguageManager';
import { newWiresRadialState } from '../src/stats/wiresRadial';

languageManager.loadPackJson(JSON.parse(readFileSync('public/l10n/zh-Hans.json', 'utf8')));

// ================================================================
// ② C1 永久旗标消耗品（S6）——★BJ690（2026-10-16）改判：5289 使用域自右键分派
//    迁回左键 ItemCheck（原版 Player.cs:43933 调用位,右键零使用面）——本 describe
//    随迁左键链驱动,消耗+返还+解锁断言面（BJ285-② 原判）不变。右键臂已整撤
//    （持套件右键门/拉杆误耗+格交互劫持面,判别锁=tests/bj690-minecart-upgrade-kit.test.ts）。
// ================================================================
describe('BJ285-② 5289 矿车升级套件（ItemCheck_UseMinecartPowerUp Player.cs:45587-45599;★BJ690 域迁左键）', () => {
  /** BJ568 stubGame 同构（updateUse 可驱动最小 Game 桩）——左键使用链 */
  function makeKitHarness(kits: number) {
    const kitId = ITEM_BY_KEY['vi_5289_minecart_upgrade_kit'];
    const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
    const player = new Player(50 * 16, 90 * 16, new Inventory());
    player.inv.slots[0] = { id: kitId, stack: kits };
    player.inv.selected = 0;
    g.player = player;
    g.world = new World(120, 120, 30, 'bj285-kit');
    g.entities = { critters: [], npcs: [], enemies: [], projectiles: [], add: () => {} };
    g.input = {
      mouseDown: false, mouseHeld: false, mouseX: 700, mouseY: 300,
      rightDown: false, uiBlocking: false, downAction: () => false,
    };
    g.camera = { tileUnder: () => [60, 60], screenToWorld: () => [800, 0], x: 800, y: 0 };
    g.renderer = { canvas: { width: 800, height: 600 }, fullMap: { open: false }, timeUiHover: false, weatherUiHover: false };
    g.smartCursor = { showing: false };
    g.wiresRadial = newWiresRadialState();
    g.annotateMode = false;
    g.prevSwingMouse = false;
    g.mining = null;
    g.swingHitSet = new Set<number>();
    g.swingTileCutSet = new Set<number>();
    g.achievements = { handleSpecialEvent: () => {} };
    g.sfx = { play: () => {}, playWav: () => {}, playWavFile: () => {}, playFiles: () => {} };
    g.playSfxFile = () => {};
    g.playSfxWav = () => {};
    g.playSfxFiles = () => {};
    g.playUseSound = () => {};
    const cb = { onInventoryChanged: vi.fn(), onToast: vi.fn() };
    g.cb = cb;
    g.spawnDrop = vi.fn();
    const useLeft = () => {
      player.useTime = 0;
      (g.input as { mouseDown: boolean }).mouseDown = true;
      (g as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60);
      (g.input as { mouseDown: boolean }).mouseDown = false;
    };
    return { g, w: g.world as World, inv: player.inv, useLeft, cb };
  }

  it('每次使用都消耗 1 并返还 3353 机械矿车（旧=仅解锁时消耗+无返还;BJ690 前左键整缺）', () => {
    const { w, inv, useLeft } = makeKitHarness(2);
    const cartId = ITEM_BY_KEY['vi_3353_mechanical_cart'];
    // 首用：解锁 + 消耗 + 返还
    useLeft();
    expect(inv.slots[0]!.stack).toBe(1);                       // 套件 −1（首用）
    expect(inv.slots.find((s) => s && s.id === cartId)?.stack).toBe(1);  // +1 机械矿车
    expect((w.flags as Record<string, boolean>).superCart).toBe(true);   // 解锁旗（unlockedSuperCart）
    // 次用：已解锁仍消耗+返还（原版 :45597 QuickSpawnItem 在解锁门外=矿车兑换机）
    useLeft();
    expect(inv.slots[0]).toBeNull();                           // 套件 −1（次用,旧实现=不耗）
    expect(inv.slots.find((s) => s && s.id === cartId)?.stack).toBe(2);  // +1 机械矿车
  });

  it('末枚套件使用：套件消失且仍返还矿车（消耗先于返还,QuickSpawnItem 同拍）', () => {
    const { inv, useLeft } = makeKitHarness(1);
    const cartId = ITEM_BY_KEY['vi_3353_mechanical_cart'];
    useLeft();
    expect(inv.slots[0]).toBeNull();                           // 套件耗尽
    expect(inv.slots.find((s) => s && s.id === cartId)?.stack).toBe(1);  // 返还照常
  });
});

describe('BJ285-② 5326 匠师面包（ItemCheck_UseArtisanLoaf Player.cs:45601-45609 + Chest.cs:2953）', () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const shopStockFor = (Game.prototype as any).shopStockFor as
    (this: any, npc: { npcKey: string; vanillaId: number }) => Array<[number, number]>;

  function stockCtx(ateBread: boolean): Record<string, unknown> {
    const ctx: Record<string, unknown> = {
      world: {
        flags: { ateArtisanBread: ateBread },
        clock: { isDay: false, moonPhase: 3, timeOfDay: 0.5 },
        seedFlags: {}, crimson: false, groundLevel: 1000,
      },
      scene: { belowSurface: true, zoneSnow: false, zoneJungle: false, zoneGraveyard: false,
        zoneHallow: false, zoneDesert: false, zoneSkyHeight: false, zoneBeach: false,
        zoneGlowshroom: false, zoneCorrupt: false, zoneCrimson: false,
        zoneUnderworldHeight: false, zoneDungeon: false },
      player: { cx: 0, cy: 0, y: 0, maxHp: 100, maxMana: 20, inv: { slots: [] } },
      entities: { npcs: [] },
      playerHasVanillaItem: () => false,
      travelStock: [] as Array<[number, number]>,
      partyState: { manualParty: false, genuineParty: false, daysOnCooldown: 0, celebratingNpcs: [] },
    };
    (ctx as { shopCondOk: unknown }).shopCondOk =
      (Game.prototype as unknown as { shopCondOk: unknown }).shopCondOk;   // this.shopCondOk 内联调用面
    return ctx;
  }

  it('骷髅商相 3-5 上货门：未吃=上架,已吃（ateArtisanBread）=下架（Chest.cs:2953）', () => {
    const stockOf = (ate: boolean) => shopStockFor.call(stockCtx(ate),
      { npcKey: 'skeleton_merchant', vanillaId: 453 }).map((e) => e[0]);
    expect(stockOf(false)).toContain(5326);
    expect(stockOf(true)).not.toContain(5326);
  });

  it('.plr 旗位 roundtrip：导出字节 off+2=真值（fx38b 独立账:unlockedBiomeTorches+2）', () => {
    const mkState = (ate: boolean) => ({
      hp: 100, x: 0, y: 0, inventory: [], selected: 0, ateArtisanBread: ate,
    }) as unknown as Parameters<typeof exportPlr>[1];
    const KEY = Buffer.from('h3y_gUyZ', 'utf16le');
    const decryptAll = (cipher: Uint8Array): Buffer => {
      const d = createDecipheriv('aes-128-ecb', KEY, null);
      d.setAutoPadding(false);
      return Buffer.concat([d.update(Buffer.from(cipher)), d.final()]);
    };
    // off（unlockedBiomeTorches 位）按 fx38b 独立字段账:version+meta+名+difficulty+
    // playTime+hair+hairDye+team+hideVisible×2+hideMisc+skinVariant+四维+extraAccessory
    const off = 4 + 20 + 1 + 1 + 1 + 8 + 4 + 1 + 1 + 2 + 1 + 1 + 16 + 1;
    for (const ate of [true, false]) {
      const plain = decryptAll(exportPlr({
        name: 'A', hair: 0, skinVariant: 0,
        hairColor: { r: 1, g: 2, b: 3 }, skinColor: { r: 4, g: 5, b: 6 }, eyeColor: { r: 7, g: 8, b: 9 },
        shirtColor: { r: 10, g: 11, b: 12 }, undershirtColor: { r: 13, g: 14, b: 15 },
        pantsColor: { r: 16, g: 17, b: 18 }, shoeColor: { r: 19, g: 20, b: 21 },
        difficulty: 0, voiceVariant: 1, voicePitchOffset: 0,
      } as never, mkState(ate)));
      expect(plain[off], `unlockedBiomeTorches 邻位(未置)`).toBe(0);
      expect(plain[off + 1], 'UsingBiomeTorches 会话态').toBe(0);
      expect(plain[off + 2], `ateArtisanBread=${ate}`).toBe(ate ? 1 : 0);
      // 读回（parsePlr 同字节流）→ 旗出档
      const parsed = parsePlr(exportPlr({
        name: 'A', hair: 0, skinVariant: 0,
        hairColor: { r: 1, g: 2, b: 3 }, skinColor: { r: 4, g: 5, b: 6 }, eyeColor: { r: 7, g: 8, b: 9 },
        shirtColor: { r: 10, g: 11, b: 12 }, undershirtColor: { r: 13, g: 14, b: 15 },
        pantsColor: { r: 16, g: 17, b: 18 }, shoeColor: { r: 19, g: 20, b: 21 },
        difficulty: 0, voiceVariant: 1, voicePitchOffset: 0,
      } as never, mkState(ate)));
      expect((parsed.playerState as { ateArtisanBread?: boolean }).ateArtisanBread).toBe(ate);
    }
  });
});

// ================================================================
// ① BJ232 死亡段割面批量修形（S7）——命中即亡弹死亡拍照割
// ================================================================
describe('BJ285-① BJ232 死亡段割面（CutTiles :12517 先于 Damage_PVE :12523 批量前置）', () => {
  const makeGame = (log: string[]) => {
    const victim = {
      x: 400, y: 400, w: 24, h: 42, id: 777, dead: false, vanillaId: 21,
      hurt: vi.fn(() => { log.push('hurt'); return true; }),
    };
    const g = {
      enemies: () => [victim],
      world: new World(160, 160, 33, 'bj285-cut'),
      player: new Player(200, 500, new Inventory()),
      spawnDust: vi.fn(), playSfx: vi.fn(), playSfxWav: vi.fn(), playSfxFiles: vi.fn(),
      bannerNpcActive: () => false,
      cutTile: (_x: number, _y: number) => { log.push('cut'); },
    } as never;
    (g as { player: Player }).player.critChance = () => 0;
    return { g, victim };
  };

  it('977 村正斩波：penetrate=1 首中即亡拍,割面先于 hurt（旧=死亡拍整缺）', () => {
    const randSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const log: string[] = [];
    const { g, victim } = makeGame(log);
    const w = (g as { world: World }).world;
    const shot = new MuramasaSlashProj(400, 416, 2, 0, 20, 3, 0);
    (shot as unknown as { critChanceFn: () => number }).critChanceFn = () => 0;
    for (let x = 12; x <= 140; x++) w.store.setTileSilent(x, 30, 1);
    w.store.setTileSilent(25, 26, 1);                   // 弹盒 (400..420,416..436) 含 (25,26)
    shot.fixedUpdate(1 / 60, g);
    expect(shot.dead).toBe(true);                       // penetrate=1 命中即亡
    expect(victim.hurt).toHaveBeenCalledTimes(1);
    const cutIdx = log.indexOf('cut');
    expect(cutIdx).toBeGreaterThanOrEqual(0);           // ★死亡拍照割（旧=整缺）
    expect(log.indexOf('hurt')).toBeGreaterThan(cutIdx);// 原版序：割（:12517）→ 伤（:12523）
    randSpy.mockRestore();
  });

  it('964 骸骨幻影：penetrate 末次命中即亡拍,割面先于 hurt', () => {
    const randSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const log: string[] = [];
    const { g, victim } = makeGame(log);
    const w = (g as { world: World }).world;
    const shot = new InsanityShadowFriendly({ x: 400, y: 416, vx: 0, vy: 0, ai0: 0, ai1: 0 }, 18);
    (shot as unknown as { pierceLeft: number }).pierceLeft = 1;   // 末击即亡档
    for (let x = 12; x <= 140; x++) w.store.setTileSilent(x, 30, 1);
    w.store.setTileSilent(25, 26, 1);                   // 弹盒 (400..440,416..456) 含 (25,26)
    shot.fixedUpdate(1 / 60, g);
    expect(shot.dead).toBe(true);                       // pierceLeft 耗尽即亡
    expect(victim.hurt).toHaveBeenCalledTimes(1);
    const cutIdx = log.indexOf('cut');
    expect(cutIdx).toBeGreaterThanOrEqual(0);
    expect(log.indexOf('hurt')).toBeGreaterThan(cutIdx);
    randSpy.mockRestore();
  });

  it('978 火山爆焰：penetrate 末次命中即亡拍,割面先于 hurt（160×160 盒）', () => {
    const randSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const log: string[] = [];
    const { g, victim } = makeGame(log);
    const w = (g as { world: World }).world;
    const shot = new VolcanoBlastProj(412, 437, 0, -1, 20, 3, 1);
    (shot as unknown as { penLeft: number }).penLeft = 1;   // 末击即亡档
    // 978 走 ownerHitCheck LOS（:12659）——可砍格放 (20,24)=(320..336,384..400)（盒内、
    //   玩家→受害者视线外）;玩家位 (450,480) 亦在盒 (332..492,357..517) 内、视线无格。
    (g as { player: Player }).player.x = 450;
    (g as { player: Player }).player.y = 480;
    w.store.setTileSilent(20, 24, 1);                   // cutTilesBox x0=20..30 / y0=22..32 含
    shot.fixedUpdate(1 / 60, g);
    expect(shot.dead).toBe(true);
    expect(victim.hurt).toHaveBeenCalledTimes(1);
    const cutIdx = log.indexOf('cut');
    expect(cutIdx).toBeGreaterThanOrEqual(0);
    expect(log.indexOf('hurt')).toBeGreaterThan(cutIdx);
    randSpy.mockRestore();
  });

  it('结构锁：13 修复站全数在位（源锚）+备案站零补割', () => {
    const src = (f: string) => readFileSync(resolve(__dirname, '..', 'src', 'entities', f), 'utf8');
    // 修复站：各文件 cutTilesBox( 调用位（≥1=本刀前置站;WeaponProj 4 站/MissileProj 2 站/
    // meleeOnHitProjs 2 站）
    expect(src('meleeOnHitProjs.ts')).toContain('cutTilesBox(game, this.x');
    expect(src('VolcanoBlastProj.ts')).toContain('cutTilesBox(game, this.x');
    expect(src('InsanityShadowFriendly.ts')).toContain('cutTilesBox(game, this.x');
    expect(src('MissileProj.ts').match(/cutTilesBox\(game, this\.x/g)!.length).toBeGreaterThanOrEqual(2);
    expect(src('LunarNebula.ts')).toContain('cutTilesBox(game, this.x');
    expect(src('Celeb2.ts')).toContain('cutTilesBox(game, this.x');
    expect(src('MagicProj.ts')).toContain('cutTilesBox(game, this.x');
    expect(src('WeaponProj.ts').match(/cutTilesBox\(game, this\.x/g)!.length).toBeGreaterThanOrEqual(4);
    // 备案锁（原版不割——禁止未来误补）：
    //  · WaterSplashProj 69/70/621（SolutionProj.ts 内）=CanCutTiles :15407 显式排除
    //  · MedusaHeadProj 535 =Damage_CanDealDamage :12461 无条件排除（Damage() 整缺）
    //  · SporeSacCloud 567/568 =aiStyle 105 排除（SporeSacProj.ts）
    expect(src('SolutionProj.ts')).not.toContain('cutTilesBox(');
    expect(src('MedusaHeadProj.ts')).not.toContain('cutTilesBox(');
    expect(src('SporeSacProj.ts')).not.toContain('cutTilesBox(');
    // 原版锚（排除表字面仍含 535 与 69/70/621——备案依据活证）
    const cs = readFileSync(resolve(__dirname, '..', '..', 'Terarria1457', 'Terraria', 'Projectile.cs'), 'utf8');
    expect(cs).toContain('type == 535 ||');
    expect(cs).toContain('type != 69 && type != 70 && type != 621');
  });
});

// ================================================================
// ③ C3 window 直读守卫普查（BJ259 连坐根治）
// ================================================================
describe('BJ285-③ C3 Game.ts window 直读守卫普查（node 环境）', () => {
  it('node 环境 import Game 模块冒烟（模块求值+原型面零 window 触碰）', () => {
    expect(typeof Game).toBe('function');
    expect(typeof (Game.prototype as unknown as Record<string, unknown>).fixedUpdate).toBe('function');
    expect(typeof (Game.prototype as unknown as Record<string, unknown>).shopStockFor).toBe('function');
  });

  it('守卫账：__swUI 布尔旗读走 swUIFlag 统一口;遗留裸读=已守卫 4 站（typeof 门内）', () => {
    const src = readFileSync(resolve(__dirname, '..', 'src', 'core', 'Game.ts'), 'utf8');
    expect(src).toContain('function swUIFlag(');   // 统一读口在位
    // 裸 `__swUI?: { inventoryOpen|housingUiActive` 直读余量=4——全部在 typeof window
    // 门内（:8296 滚轮门/:8919 背包支/:13063 BJ259 修口/:13109 housingUiActive）
    const bare = (src.match(/window as unknown as \{ __swUI\?: \{ (?:inventoryOpen|housingUiActive)/g) ?? []).length;
    expect(bare).toBe(4);
    for (const m of src.matchAll(/window as unknown as \{ __swUI\?: \{ (?:inventoryOpen|housingUiActive)/g)) {
      const head = src.slice(Math.max(0, m.index! - 240), m.index!);
      expect(head, `裸读须 typeof 守卫@${m.index}`).toContain('typeof window');
    }
  });

  it('node-only 站位账在档（构造器/loadWorld/destroy/帧循环=浏览器专属生命周期）', () => {
    const src = readFileSync(resolve(__dirname, '..', 'src', 'core', 'Game.ts'), 'utf8');
    // 普查注释块在位（28 站分类账=node-only 站不守卫的依据存档）
    expect(src).toContain('★BJ285-C3 window 直读守卫普查');
  });
});

// ================================================================
// ④ 702 LifeFruitReplica 破坏面归队（S7 定谳：原版无放置面→备案;破坏面落刀）
// ================================================================
describe('BJ285-④ 702 LifeFruitReplica（KillTile 尾段 WorldGen.cs:48443-48450）', () => {
  function makeTileHarness() {
    const w = new World(80, 80, 30, 'bj285-t702');
    const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & {
      breakTile: (x: number, y: number, byPlayer?: boolean, noItem?: boolean) => void;
    };
    g.world = w;
    g.player = { x: 100000, y: 100000, equipStats: { flowerBoots: false } };
    g.spawnDrop = vi.fn();
    g.spawnParticles = vi.fn();
    g.achievements = { notifyProgressionEvent: vi.fn(), handleMining: vi.fn(), notifyTileDestroyed: vi.fn() };
    g.recLog = vi.fn();
    g._isMining = false;
    return { g, w };
  }

  it('破坏 v_702：2×2 锚整件清除 + 掉 1291 生命果（旧=漏收家族,无掉落锚残留）', () => {
    const { g, w } = makeTileHarness();
    const t = TILE_BY_KEY['v_702_life_fruit_replica'];
    // style0 2×2：frameX=dx*18, frameY=dy*18（CheckJunglePlant :48367-48381 锚序）
    for (let dx = 0; dx < 2; dx++) {
      for (let dy = 0; dy < 2; dy++) {
        w.store.setTileSilent(20 + dx, 20 + dy, t);
        const i = w.store.idx(20 + dx, 20 + dy);
        w.store.frameX[i] = dx * 18;
        w.store.frameY[i] = dy * 18;
      }
    }
    g.breakTile(21, 21);   // 击右下格（锚回溯面:左上 (20,20) 整件清）
    for (let dx = 0; dx < 2; dx++) {
      for (let dy = 0; dy < 2; dy++) {
        expect(w.store.get(20 + dx, 20 + dy)).toBe(0);
      }
    }
    const drop = (g.spawnDrop as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(drop[2]).toBe('vi_1291_life_fruit');
    expect(drop[0]).toBe(21 * 16 + 16);   // 被击格盒心（NewItem(i*16,j*16,32,32) :48444）
    expect(drop[1]).toBe(21 * 16 + 16);
  });
});
