// 孤儿武器 B3 波六件回归（2026-08-30，模型 tests/orphan-weapons-a.test.ts）：
//   工单1 虚空袋对 4131(闭)/5325(开) → 弹 734 虚空透镜（VoidLensProj,aiStyle154）
//         + 满背包溢流入 banks[3]（GetItem_VoidVault :39703-39760）+ 右键换型
//         （ItemCheck_ManageRightClickFeatures :31796-31801 快换表）+ 透镜右键
//         开 -5 面板（TryInteractingWithVoidLens Main.cs 38403 段 + TryGetContainerIndex
//         :80568；banks[3] 直通面板=同储物族 openChest 约定）
//   工单2 沙滩球 859 → 弹 155（BallProjs.BeachBallProj,AI_032 :27264-27408;
//         WallCollision 反弹衰减 ±0.6/:18714-18728;Kill 回收 :79351-79354）
//   工单3 橄榄球 4743 → 弹 861（BallProjs.FootballProj,首触墙切滚动档/接触回收/
//         静止 Kill 回落 max(ai[2],1) 只 :18484-18502+:23674-23730+:79355-79357）
//   工单4 三地球仪 Kill 三重掷策略（Projectile.cs:75111-75131）：
//         月亮球 rollMoonType ∈0..8 必异（RandomizeMoonState WorldGen.cs:7732——
//         ★原版掷的是【月亮贴图样式 moonType】非 moonPhase 相位,工单混述以源码为准）
//         / 树球 areaId 表+变体池 / 世界球 zone 优先级链+各槽掷数策略
// 锚点：Item.cs case 4131/5325 :35876-35894、case 859 :11440-11453、case 4743
//       :38989-39004、case 4765/4766 :39207-39216、case 5285 :41966-41975；
//       Projectile.cs AI_154 :53071-53101、AI_032 :27264-27408、Kill :75111-75131。
import { describe, it, expect, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { Game } from '../src/core/Game';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TileStore } from '../src/world/TileStore';
import { TILE } from '../src/core/constants';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { ITEM_DEFS } from '../src/data/items';
import { invIndexOfVanilla } from '../src/data/vanillaRecipes';
import { itemCombat } from '../src/data/vanillaItemCombat';
import { VoidLensProj } from '../src/entities/VoidLensProj';
import { BeachBallProj, FootballProj } from '../src/entities/BallProjs';
import {
  rollMoonType, rollTreeTopVariation, treeTopVariationPool, ensureTreeTops13,
  rollUntilDifferent, rollSnowBg, rollCorruptBg, rollDesertBg, isSameBackground,
  pickZoneArea, oceanDepths, rollVariantInDomain, type Rng,
} from '../src/world/styleRerolls';
import { BiomeBackground, VANILLA_FOREST_STYLE_ORDER } from '../src/render/BiomeBackground';

/** 原版森林样式号 → 本仓行号（VANILLA_FOREST_STYLE_ORDER 映射;终清波扩表后行序
 *  即样式升序+子族紧随基样） */
function frRow(styleNo: number): number {
  const i = VANILLA_FOREST_STYLE_ORDER.indexOf(styleNo);
  expect(i).toBeGreaterThanOrEqual(0);
  return i;
}
import type { GameHooks } from '../src/entities/types';

const STONE = () => {
  const id = TILE_BY_KEY['v_1_stone'];
  return id !== undefined ? id : 1;
};

/** 确定性 RNG（掷流断言用）：seqRng([0.9,0.05]) 轮询取值 */
function seqRng(values: number[]): Rng {
  let i = 0;
  return {
    next(max?: number): number {
      const v = values[i++ % values.length];
      return max === undefined ? v : Math.floor(v * max);
    },
  };
}
const randRng: Rng = { next(max?: number) { return max === undefined ? Math.random() : Math.floor(Math.random() * max); } };

function makeHooks(store: TileStore): GameHooks & {
  drops: Array<{ key: string; x: number; y: number; n: number }>;
  lights: Array<[number, number, number, number, number]>;
} {
  const drops: Array<{ key: string; x: number; y: number; n: number }> = [];
  const lights: Array<[number, number, number, number, number]> = [];
  const hooks = {
    world: { store } as never,
    // 轻量本地玩家（candidatePlayers 缺省兜底扫描的对象——接触回收/踢飞面用）
    player: { x: -9999, y: -9999, w: 20, h: 42, cx: -9989, cy: -9978, vx: 0, vy: 0, dead: false, facing: 1 },
    enemies: () => [], critters: () => [], npcs: () => [],
    projectiles: () => [] as unknown[],
    spawnDrop: (x: number, y: number, key: string, n?: number) => { drops.push({ key, x, y, n: n ?? 1 }); return null; },
    damagePlayer: (): number => 0, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {}, notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => true,
    showPickupLabel: () => {}, spawnDust: () => null,
    addLightAt: (x: number, y: number, r: number, g: number, b: number) => { lights.push([x, y, r, g, b]); },
  };
  return Object.assign(hooks as unknown as GameHooks, { drops, lights });
}

function vanillaId(id: number): number {
  const d = ITEM_DEFS[id];
  return d?.vid ?? parseInt(d?.key.slice(3) ?? '-1', 10);
}
function vanillaOfHeld(p: Player): number {
  const s = p.inv.slots[p.inv.selected];
  return s ? vanillaId(s.id) : -1;
}

/** 最小 Game 桩（A 波 stubGame 同法 + cb/openChest 面）：驱动 Game 私有方法 */
function stubGame(_mouseAt: [number, number]) {
  const g = Object.create(Game.prototype) as unknown as Record<string, any> & {
    sfxFiles: string[];
    synthFallbacks: string[];
    openedChests: Array<{ x?: number; y?: number; items: Array<unknown> }>;
    chestClosed: boolean;
  };
  const player = new Player(50 * TILE, 90 * TILE, new Inventory());
  g.player = player;
  g.world = { store: new TileStore(200, 200) };
  g.camera = { screenToWorld: () => _mouseAt };
  g.enemies = () => [];
  g.candidatePlayers = undefined;
  g.input = { mouseX: 0, mouseY: 0, mouseDown: false, rightDown: false, uiBlocking: false };
  g._prevRightDown = false;
  g.entities = { projectiles: [] as unknown[], add(e: unknown) { (this.projectiles as unknown[]).push(e); } };
  g.sfxFiles = [];
  g.synthFallbacks = [];
  g.openedChests = [];
  g.chestClosed = false;
  g.playSfxFile = (f: string) => { g.sfxFiles.push(f); return true; };
  g.sfx = {
    play: (n: string) => { g.synthFallbacks.push(n); },
    playWavFile: (f: string) => { g.sfxFiles.push(f); return true; },
  };
  g.cb = { onInventoryChanged: () => {}, onToast: () => {} };
  g.achievements = undefined;
  g.spawnParticles = () => {};
  g.useSwing = () => {};
  g.dmgNumbers = [];          // addDamageNumber 桶（damagePlayer 尾受击飘字消费）
  return g;
}

// ---------------------------------------------------------------------------
describe('工单1 虚空袋对 4131/5325', () => {
  it('左键使用 = 发射弹 734 且手持物不变（shoot 路径,非直开面板非换型）', () => {
    const g = stubGame([50 * TILE + 64, 90 * TILE]);
    const p = g.player as Player;
    const iid = invIndexOfVanilla(4131);
    expect(iid).toBeGreaterThanOrEqual(0);
    p.inv.slots[0] = { id: iid, stack: 1 };
    p.inv.selected = 0;
    (g as unknown as { throwVoidLens: (d: unknown, vid: number) => void })
      .throwVoidLens(ITEM_DEFS[iid], 4131);
    const projs = g.entities!.projectiles as unknown[];
    expect(projs).toHaveLength(1);
    expect(projs[0]).toBeInstanceOf(VoidLensProj);
    expect((projs[0] as VoidLensProj).projId).toBe(734);
    expect(vanillaOfHeld(p)).toBe(4131);              // 手持物不被使用消耗/换型
    expect(p.inv.slots[0]!.stack).toBe(1);
    expect(g.openedChests).toHaveLength(0);           // 使用不直接开面板(:35886 shoot 语义)
  });

  it('AI_154：速度 ×0.94/t 衰减 + 逐帧淡入 + 紫光每拍一条', () => {
    const store = new TileStore(80, 80);
    const g = makeHooks(store);
    const lens = new VoidLensProj(40 * TILE, 40 * TILE, 4, 0);
    for (let i = 0; i < 10; i++) lens.fixedUpdate(1 / 60, g);
    expect(lens.vx).toBeCloseTo(4 * Math.pow(0.94, 10), 2);      // velocity *= 0.94f(:53088)
    expect(lens.opacity).toBeGreaterThan(0);                     // Opacity += .03(:53096)
    expect(lens.dead).toBe(false);
    expect(g.lights.length).toBeGreaterThanOrEqual(10);          // AddLight(.4,.2,.9)(Helper :30)
    for (const l of g.lights) expect(l[2]).toBeCloseTo(0.4, 5);
  });

  it('选圈载入路径 = Extra_93（B3-1 回归：VoidLensHelper.cs:103 TextureAssets.Extra[93];Extra_94=飞猪 525/960 悬停段 Main.cs:35131 num500=94）', () => {
    const files: string[] = [];
    const ctx = {
      save: () => {}, restore: () => {}, drawImage: () => {},
      globalAlpha: 1, imageSmoothingEnabled: false,
    } as unknown as CanvasRenderingContext2D;
    const atlas = { ensureVImage: (f: string) => { files.push(f); return { width: 34, height: 384 }; } };
    const lens = new VoidLensProj(40 * TILE, 40 * TILE, 0, 0);
    // 纯鼠标路径 interactState=0：本体条外不请求任何 Extra 选圈图
    lens.draw({ atlas, ctx } as never, null as never);
    expect(files).toEqual(['vanilla/Projectile_734.png']);
    // 智能光标交互态：只叠 Extra_93（★误装 Extra_94 即飞猪贴图回归）
    files.length = 0;
    lens.interactState = 1;
    lens.draw({ atlas, ctx } as never, null as never);
    expect(files.filter((f) => f.startsWith('vanilla/Extra_'))).toEqual(['vanilla/Extra_93.png']);
    // 素材落盘且与 Projectile_734 的 34×48×8 帧栅格同构（原版共用 frame 矩形）
    expect(existsSync(new URL('../public/sprites/vanilla/Extra_93.png', import.meta.url))).toBe(true);
  });

  it('同主同型去重：新透镜顶旧透镜（timeLeft 小者自杀,:53074-53087）', () => {
    const store = new TileStore(80, 80);
    const g = makeHooks(store);
    const oldL = new VoidLensProj(20 * TILE, 20 * TILE, 1, 0);
    for (let i = 0; i < 37; i++) {
      (g as unknown as { projectiles(): unknown[] }).projectiles = () => [oldL];
      oldL.fixedUpdate(1 / 60, g);
    }
    const newL = new VoidLensProj(60 * TILE, 20 * TILE, 1, 0);
    // 全桶扫描含 newL（原版 Main.projectile[0..999] 全扫等价）
    (g as unknown as { projectiles(): unknown[] }).projectiles = () => [oldL, newL];
    oldL.fixedUpdate(1 / 60, g);
    expect(oldL.dead).toBe(true);                                 // timeLeft 小者杀(:53082)
    expect(newL.dead).toBe(false);
  });

  it('右键换型 4131↔5325（快换表 ChangeItemType:id 换堆叠不动）', () => {
    const g = stubGame([50 * TILE, 90 * TILE]);
    const p = g.player as Player;
    p.inv.slots[0] = { id: invIndexOfVanilla(4131), stack: 2 };
    p.inv.selected = 0;
    const sw = (g as unknown as { swapVoidBagVisual: (v: number) => boolean }).swapVoidBagVisual;
    expect(sw.call(g, 4131)).toBe(true);
    expect(vanillaOfHeld(p)).toBe(5325);
    expect(p.inv.slots[0]!.stack).toBe(2);
    expect(g.synthFallbacks).toContain('pickup');        // legacy PlaySound(7)=Grab(:31871)
    expect(sw.call(g, 5325)).toBe(true);
    expect(vanillaOfHeld(p)).toBe(4131);
    expect(sw.call(g, 859)).toBe(false);                 // 表外件不吃换型
  });

  it('溢流入袋 depositIntoVoidVault：占用合并→空位落格,既有数据保留;无 4131 拒收', () => {
    const p = new Player(50 * TILE, 90 * TILE, new Inventory());
    const vault = p.banks[3];
    const gelA = invIndexOfVanilla(28);                  // Gel（大堆叠物）
    vault[0] = { id: gelA, stack: 3 };                   // 既有占用堆叠
    vault[1] = { id: invIndexOfVanilla(2997), stack: 1 };// 另一件既有数据
    expect(p.useVoidBag()).toBe(false);                  // 无袋不吸
    expect(p.depositIntoVoidVault(gelA, 50)).toBe(50);
    p.inv.slots[0] = { id: invIndexOfVanilla(4131), stack: 1 };
    const left = p.depositIntoVoidVault(gelA, 50);
    expect(left).toBe(0);
    expect(vault[0]!.stack).toBeGreaterThan(3);          // 合并到既有堆叠
    expect(vault[1]!.id).toBe(invIndexOfVanilla(2997));  // ★既有数据保留
    const dirt = invIndexOfVanilla(1);
    expect(p.depositIntoVoidVault(dirt, 3)).toBe(0);     // 余量落新空位
    expect(vault.some((s) => s && vanillaId(s.id) === 1 && s.stack === 3)).toBe(true);
  });

  it('透镜右键开 -5 面板:banks[3] 活引用直通;同面板再右键即关(:38449-38476)', () => {
    const g = stubGame([50 * TILE, 90 * TILE]);
    const opened = g.openedChests;
    g.openChest = (c: { x?: number; y?: number; items: Array<unknown> }) => { opened.push(c); };
    g.openChestRef = () => (opened.length ? opened[opened.length - 1] : null);
    g.closeChestPanel = () => { g.chestClosed = true; };
    const pet = new VoidLensProj(50 * TILE, 80 * TILE, 0, 0);
    (g as unknown as { interactContainerPet(h: unknown): void })
      .interactContainerPet({ kind: 'lens', pet });
    expect(opened).toHaveLength(1);
    expect(opened[0].x).toBe(-5);                        // TryGetContainerIndex 734→-5(:80568)
    expect(opened[0].items).toBe((g.player as Player).banks[3]);   // banks[3] 数据直通
    expect(g.sfxFiles).toContain('Item_130');            // 开音(Main.cs 38453)
    // 再右键同容器 → 关（chest=-1 + 同音）
    g.sfxFiles.length = 0;
    (g as unknown as { interactContainerPet(h: unknown): void })
      .interactContainerPet({ kind: 'lens', pet });
    expect(g.chestClosed).toBe(true);
    expect(g.sfxFiles).toContain('Item_130');            // 关音(Player.cs:31259 同值)
  });

  it('rollMoonType 必异且 ∈0..8（工单④断言——moonType 月亮贴图样式 0..8,原版口径）', () => {
    for (let cur = 0; cur <= 8; cur++) {
      const mt = rollMoonType(cur, randRng);
      expect(mt).not.toBe(cur);                          // guaranteeNewStyle(WorldGen.cs:7736)
      expect(mt).toBeGreaterThanOrEqual(0);
      expect(mt).toBeLessThanOrEqual(8);                 // Next(9)
    }
  });
});

// ---------------------------------------------------------------------------
describe('工单2 沙滩球弹 155（BeachBallProj）', () => {
  function flatFloor(): { store: TileStore; g: ReturnType<typeof makeHooks> } {
    const store = new TileStore(120, 60);
    for (let x = 0; x < 120; x++) store.setTileSilent(x, 40, STONE(), 0, 0);
    const g = makeHooks(store);
    return { store, g };
  }

  it('撞墙反弹速度衰减 ±0.6：横向 5 → 反弹 <5 且仍存活（X 向衰减生效,:18724）', () => {
    const { store, g } = flatFloor();
    for (let y = 20; y < 40; y++) store.setTileSilent(70, y, STONE(), 0, 0);   // 墙
    const ball = new BeachBallProj(65 * TILE, 34 * TILE, 5, 0);
    for (let i = 0; i < 24 && !ball.dead; i++) ball.fixedUpdate(1 / 60, g);
    expect(ball.vx).not.toBe(5);                         // 发生过碰撞改写
    expect(Math.abs(ball.vx)).toBeLessThan(5);           // 反弹后必衰减(×-0.6 后再摩擦)
    void store;
  });

  it('踢飞计数 ai[1]：盒重叠对象 → 上抛 vy=-4.5 + bounceCount=1（:27278/:27342）', () => {
    const { g } = flatFloor();
    const ball = new BeachBallProj(60 * TILE, 30 * TILE, 0.01, 0);
    // 用桩敌人当"玩家踢"面（AI_032 对 player/npc/proj 同式处理）
    (g as unknown as { enemies(): unknown[] }).enemies =
      () => [{ x: ball.x, y: ball.y, w: 44, h: 44 }];
    let kicked = false;
    for (let i = 0; i < 30; i++) {
      ball.fixedUpdate(1 / 60, g);
      if (ball.bounceCount > 0) { kicked = true; break; }   // 踢飞置位即 ai[1]++
    }
    expect(kicked).toBe(true);
    expect(ball.vy).toBeLessThanOrEqual(-4);             // 踢飞 -4.5 起跳（本拍 +0.1 重力后 ≥ -4.4,:27278）
    expect(ball.bounceCount).toBe(1);                    // ai[1]++（:27342）
  });

  it('静置回落：滚停即 Kill,spawnDrop 出 vi_859_BeachBall（:27348-27350+:79351）', () => {
    const { g } = flatFloor();
    const ball = new BeachBallProj(60 * TILE, 38 * TILE, 0.001, 0);
    for (let i = 0; i < 3000 && !ball.dead; i++) ball.fixedUpdate(1 / 60, g);
    expect(ball.dead).toBe(true);
    expect(g.drops.filter((d) => d.key === 'vi_859_BeachBall')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
describe('工单3 橄榄球弹 861（FootballProj）', () => {
  it('首触墙无衰减反转(num27=-1)随即切滚动档 ai[1]=1;次触 ±0.6 衰减(:18484-18502)', () => {
    const store = new TileStore(160, 80);
    for (let x = 0; x < 160; x++) store.setTileSilent(x, 70, STONE(), 0, 0);
    for (let y = 28; y < 70; y++) store.setTileSilent(100, y, STONE(), 0, 0);   // 远墙（落地前先达）
    const g = makeHooks(store);
    const fb = new FootballProj(60 * TILE, 30 * TILE, 11, 0, 0, false);
    let firstWallVx = 0;
    for (let i = 0; i < 90 && !fb.dead; i++) {
      fb.fixedUpdate(1 / 60, g);
      if (fb.rolledOnce && firstWallVx === 0) { firstWallVx = fb.vx; break; }
    }
    expect(fb.rolledOnce).toBe(true);                    // ai[1]=1 首触墙置位(:18501)
    expect(firstWallVx).toBeLessThan(0);                 // X 反转（无衰减 num27=-1）
    // 第二触墙（回程）：×-0.6 缩幅
    const preAbs = Math.abs(firstWallVx);
    for (let i = 0; i < 240 && !fb.dead; i++) {
      const pvx = fb.vx;
      fb.fixedUpdate(1 / 60, g);
      if (pvx !== 0 && fb.vx !== 0 && Math.sign(fb.vx) !== Math.sign(pvx)) {   // 又一次反转
        expect(Math.abs(fb.vx)).toBeLessThanOrEqual(preAbs);   // 衰减档 −0.6 生效
        break;
      }
    }
  });

  it('ai[2] 计数回落：堆叠 3 的撒球弹静止回收出 3 个（max(ai2,1)=3,:79356）', () => {
    const store = new TileStore(60, 40);
    for (let x = 0; x < 60; x++) store.setTileSilent(x, 35, STONE(), 0, 0);
    const g = makeHooks(store);
    const fb = new FootballProj(30 * TILE, 30 * TILE, 0, 0, 3, true);
    fb.fixedUpdate(1 / 60, g);                           // vx==vy==0 → 静止 Kill
    expect(fb.dead).toBe(true);
    // RequestNewItem 一次带整堆 → 单条目 n=3（max(ai[2],1)=3,:79356）
    const ret = g.drops.filter((d) => d.key === 'vi_4743_Football');
    expect(ret).toHaveLength(1);
    expect(ret[0].n).toBe(3);
  });

  it('接触回收走同一回落口：碰玩家 Kill 并单笔掉落堆叠 max(ai2,1)（:23677→:79355）', () => {
    const store = new TileStore(60, 40);
    for (let x = 0; x < 60; x++) store.setTileSilent(x, 35, STONE(), 0, 0);
    const g = makeHooks(store);
    const fb = new FootballProj(30 * TILE, 30 * TILE, 1, 0, 2, true);
    (g as unknown as { candidatePlayers(): unknown[] }).candidatePlayers =
      () => [{ x: fb.x - 4, y: fb.y, w: 20, h: 42 }];
    for (let i = 0; i < 3 && !fb.dead; i++) fb.fixedUpdate(1 / 60, g);
    expect(fb.dead).toBe(true);
    // RequestNewItem 一次带堆叠 → 单条目 n=2
    const ret = g.drops.filter((d) => d.key === 'vi_4743_Football');
    expect(ret).toHaveLength(1);
    expect(ret[0].n).toBe(2);                            // max(ai[2],1)=2(:79356)
  });

  it('宽限期自家不杀：出生 ≤30t 与【自己】重叠不触发（localAI[0]<30 门,:23684）', () => {
    const store = new TileStore(60, 40);
    const g = makeHooks(store);
    const selfPlayer = { x: 96, y: 300, w: 20, h: 42, cx: 106, cy: 321, vx: 0, vy: 0, dead: false };
    g.player = selfPlayer as never;
    const fb = new FootballProj(110, 322, 1, 0, 1, false);   // 出生即压在自身盒上
    (g as unknown as { candidatePlayers(): unknown[] }).candidatePlayers = () => [selfPlayer];
    for (let i = 0; i < 29 && !fb.dead; i++) fb.fixedUpdate(1 / 60, g);
    expect(fb.graceTicks()).toBeLessThanOrEqual(30);
    expect(fb.dead).toBe(false);                          // 宽限期内自触不回收
    void store;
  });

  // ---- B3-3 受击撒球位次（Game.damagePlayer；原版 Player.cs:38537-38555 在闪避/
  // 免伤早退族【之后】、statLife 扣减(:38672)之前）----
  it('受击撒球正常链：落地伤→每格一弹 ai[2]=堆叠/ai[1]=1+清槽(:38546-38547)', () => {
    const g = stubGame([50 * TILE + 64, 90 * TILE]);
    const p = g.player as Player;
    p.inv.slots[0] = { id: invIndexOfVanilla(4743), stack: 5 };
    let invChanged = 0;
    (g.cb as { onInventoryChanged(): void }).onInventoryChanged = () => { invChanged++; };
    const hp0 = p.hp;
    const ok = (g as unknown as { damagePlayer(d: number, x: number, y: number): number })
      .damagePlayer(50, 20 * TILE, 90 * TILE);
    expect(ok).toBeGreaterThan(0);                       // 落地扣血
    expect(p.hp).toBeLessThan(hp0);
    const projs = g.entities!.projectiles as FootballProj[];
    expect(projs).toHaveLength(1);
    expect(projs[0]).toBeInstanceOf(FootballProj);
    expect(projs[0].stackCount).toBe(5);                 // ai[2]=原堆叠
    expect(projs[0].rolledOnce).toBe(true);              // ai[1]=1 滚动档（受击链固定置位）
    expect(projs[0].vx).toBe(-4);                        // hitDirection=+1 → -hitDir*4（来源在左）
    expect(projs[0].vy).toBe(-6);                        // :38546
    expect(p.inv.slots[0]).toBeNull();                   // SetDefaults(0)=清槽
    expect(invChanged).toBe(1);
  });

  it('B3-3 位次：黑带闪避成功=不撒球不清槽不掉血（Hurt :38506-38510 return 0 先于 :38537 撒球段）', () => {
    const g = stubGame([50 * TILE, 90 * TILE]);
    const p = g.player as Player;
    p.inv.slots[0] = { id: invIndexOfVanilla(4743), stack: 7 };
    // 忍者大师装备 984（equip-stats.test.ts 同款授法）→ blackBelt；equipStats 冻结
    // getter 由内容键自动重算,直写会 TypeError
    p.inv.armor[4] = { id: invIndexOfVanilla(984), stack: 1 };
    expect(p.equipStats.blackBelt).toBe(true);
    const rvi = vi.spyOn(Math, 'random').mockReturnValue(0);   // <0.1 必中闪避档
    const hp0 = p.hp;
    const ok = (g as unknown as { damagePlayer(d: number, x: number, y: number): number })
      .damagePlayer(50, 20 * TILE, 90 * TILE);
    rvi.mockRestore();
    expect(ok).toBe(0);                                  // 闪避=未受伤
    expect(p.hp).toBe(hp0);
    expect(g.entities!.projectiles).toHaveLength(0);     // ★不撒球
    expect(p.inv.slots[0]?.stack).toBe(7);               // ★不清槽
  });

  it('dmg>0 门已删：原版无 Damage 门，零伤命中照撒(:38540-38544)', () => {
    const g = stubGame([50 * TILE, 90 * TILE]);
    const p = g.player as Player;
    p.inv.slots[3] = { id: invIndexOfVanilla(4743), stack: 2 };
    const ok = (g as unknown as { damagePlayer(d: number, x: number, y: number): number })
      .damagePlayer(0, 20 * TILE, 90 * TILE);            // dmg=0（旧门直接跳过=偏离原版）
    expect(ok).toBe(1);                                  // 防御钳 max(1,…)
    const projs = g.entities!.projectiles as FootballProj[];
    expect(projs).toHaveLength(1);
    expect(projs[0].stackCount).toBe(2);
    expect(p.inv.slots[3]).toBeNull();
  });

  it('垃圾桶不参与：trash 持球受击不撒不清——Hurt 循环只扫 inventory[],[58]=光标镜像(:5122)非 trashItem(Main.cs:43088 独立 ctx6)', () => {
    const g = stubGame([50 * TILE, 90 * TILE]);
    const p = g.player as Player;
    p.inv.trash = { id: invIndexOfVanilla(4743), stack: 2 };
    const ok = (g as unknown as { damagePlayer(d: number, x: number, y: number): number })
      .damagePlayer(30, 20 * TILE, 90 * TILE);
    expect(ok).toBeGreaterThan(0);
    expect(g.entities!.projectiles).toHaveLength(0);     // 不为垃圾桶发弹
    expect(p.inv.trash?.stack).toBe(2);                  // 垃圾桶槽不受击清空
  });
});

// ---------------------------------------------------------------------------
describe('工单4 三地球仪重掷策略（styleRerolls 纯层）', () => {
  it('月亮球：moonType ∈0..8 且 guaranteeNew 必异；掷流固定序列可复现', () => {
    const r = seqRng([0.9, 0.05, 0.5, 0.9, 0.05, 0.5, 0.9, 0.05, 0.5]);
    const a = rollMoonType(3, r);
    const b = rollMoonType(3, r);
    expect(a).toBe(8);                                   // floor(0.9*9)=8
    expect(b).toBe(0);                                   // floor(0.05*9)=0
    expect(a !== 3 && b !== 3).toBe(true);
  });

  it('树球：areaId 无池返回 null;雪组池含 21/22 子档且 guarantee-new', () => {
    expect(rollTreeTopVariation(99, 0)).toBeNull();      // default flag 分支(TreeTopsInfo.cs:139)
    const pool = treeTopVariationPool(6)! as number[];   // 雪组清单(:121)
    expect(pool).toContain(21);
    expect(pool).toContain(42);
    for (let t = 0; t < 30; t++) {
      const v = rollTreeTopVariation(6, 21, randRng)!;
      expect(v).not.toBe(21);
      expect(pool).toContain(v);
    }
  });

  it('树球 areaId 地表判据:oceanDepths 海/漠双档与海滩带宽近似(:10990)', () => {
    expect(oceanDepths(10, 100, 4200, 200)).toBe(true);  // x<beach(210) 且浅层
    expect(oceanDepths(2100, 100, 4200, 200)).toBe(false);
    expect(oceanDepths(2100, 500, 4200, 200)).toBe(false);// 深层(y>oceanLevel)恒否
  });

  it('世界球：zone 优先级链 mushroom>underworld>desert>hallow>forest 分段(:7744-7855)', () => {
    const flags = (): Record<string, boolean> => ({
      zoneGlowshroom: true, zoneUnderworldHeight: true, zoneDesert: true,
      zoneHallow: true, zoneCorrupt: true, zoneCrimson: true,
      zoneJungle: true, zoneSnow: true, zoneBeach: true,
    });
    expect(pickZoneArea(flags() as never, 100, [100, 200, 300])).toEqual({ kind: 'mushroom' });
    const noGlow = { ...flags(), zoneGlowshroom: false };
    expect(pickZoneArea(noGlow as never, 100, [100, 200, 300])).toEqual({ kind: 'underworld' });
    const upToHallow = { ...noGlow, zoneUnderworldHeight: false, zoneDesert: false, zoneJungle: false };
    expect(pickZoneArea(upToHallow as never, 100, [100, 200, 300])).toEqual({ kind: 'hallow' });
    const none = Object.fromEntries(Object.keys(upToHallow).map((k) => [k, false]));
    expect(pickZoneArea(none as never, 90, [100, 200, 300])).toEqual({ kind: 'forest', seg: 0 });
    expect(pickZoneArea(none as never, 150, [100, 200, 300])).toEqual({ kind: 'forest', seg: 1 });
    expect(pickZoneArea(none as never, 250, [100, 200, 300])).toEqual({ kind: 'forest', seg: 2 });
    expect(pickZoneArea(none as never, 350, [100, 200, 300])).toEqual({ kind: 'forest', seg: 3 });
  });

  it('原版全域掷链参考存照(B3-5 起游戏路径改走可行域重掷,见下):纯档 guarantee-new;腐化/沙漠子族/雪折变体取值域正确', () => {
    for (let t = 0; t < 40; t++) {
      expect(rollUntilDifferent('mushroom', 0, randRng)).not.toBe(0);      // Next(5)
      expect(rollUntilDifferent('ocean', 3, randRng)).not.toBe(3);         // Next(8)
      expect(rollUntilDifferent('underworld', 2, randRng)).not.toBe(2);    // Next(3)
    }
    const c = rollCorruptBg(4, randRng);
    expect(c).not.toBe(4);
    expect(c === 51 || c === 52 || (c >= 0 && c <= 4)).toBe(true);         // :7962-7970
    const dz = rollDesertBg(1, randRng);
    expect(dz).not.toBe(1);
    expect(dz === 51 || dz === 52 || dz === 53 || (dz >= 0 && dz <= 4)).toBe(true);
    for (let t = 0; t < 40; t++) {
      const sn = rollSnowBg(0, randRng);
      expect(sn).not.toBe(0);
      expect((sn >= 1 && sn <= 8) || [21, 22, 31, 32, 41, 42].includes(sn)).toBe(true);
    }
  });

  it('IsBackgroundConsideredTheSame 族门(参考存照)：3↔31 / 5↔51 / 7↔71..73 视觉等价(:8010)', () => {
    expect(isSameBackground(3, 31)).toBe(true);
    expect(isSameBackground(31, 3)).toBe(true);
    expect(isSameBackground(5, 51)).toBe(true);
    expect(isSameBackground(7, 72)).toBe(true);
    expect(isSameBackground(72, 73)).toBe(true);
    expect(isSameBackground(1, 2)).toBe(false);
    expect(isSameBackground(31, 5)).toBe(false);
  });

  it('ensureTreeTops13 惰性补全:森林四段自 header 承袭,≥13 原样防渲染兜底漂移', () => {
    const out = ensureTreeTops13([], [1, 2, 3, 4]);
    expect(out).toHaveLength(13);
    expect(out.slice(0, 4)).toEqual([1, 2, 3, 4]);
    expect(ensureTreeTops13(new Array(15).fill(7), []).length).toBe(15);  // ≥13 原样
  });

  it('B3-4 回归:世界球 forest 分段锚【玩家】而非弹心(WorldGen.cs:7856 num2=player.Center.X/16f;Projectile.cs:75125 传 Main.player[owner] 非弹幕位置)——跨段投掷弹亡在段2也只写玩家所在段1', () => {
    const g = stubGame([0, 0]);
    g.spawnDust = (() => null) as never;
    g.playSfxFiles = ((files: string[]) => {             // 记账桩：stubGame 只挂了单件版
      for (const f of files) g.sfxFiles.push(f);
    }) as never;
    g.world.treeX = [100, 200, 300];                     // 三界碑 tile 列
    const written: Record<string, number> = {};          // forest 槽写账
    g.scene = {};                                        // 全 zone false → 走 forest 四分段
    g.renderer = { biomeBg: {
      biomeVariant: () => -1,                            // oldVal=-1 保证首掷必异且不同族,确定化
      biomeVariantRows: () => [0, 1, 2, 3, 4, 5, 6],     // B3-5 起可行域口(桩固定池,非真表长)
      sameVisual: () => false,                           // 终清波起森林族门经实例口(本测只验分段落槽)
      setBiomeVariant: (k: string, v: number) => { written[k] = v; return v; },
    } } as never;
    const p = g.player as Player;
    p.x = 150 * TILE - p.w / 2;                          // 玩家中心=tile 150 ∈ 段1 [100,200)
    // 弹亡中心 = tile 250 ∈ 段2——修复前旧实现以 cx 定段会误写 forest2(B3-4)
    (g as unknown as { onProjectileDeath(...a: unknown[]): void })
      .onProjectileDeath(869, 250 * TILE - 6, 40 * TILE, 12, 12);
    expect(g.sfxFiles).toContain('Item_107');            // Kill 链先过(:75117)
    expect(Object.keys(written).filter((k) => k.startsWith('forest'))).toEqual(['forest1']);
  });

  it('B3-5 可行域重掷纯层：掷即渲染可达+域内必异;森林族门=sameVisual 终清波扩表翻译;单值域剔空停掷', () => {
    // 决定论两界：seq[0] 取首个候选 / seq[0.99] 取末位候选（rng.next(cand.length) 契约）
    expect(rollVariantInDomain([0, 1, 2, 3], 1, undefined, seqRng([0]))).toBe(0);
    expect(rollVariantInDomain([0, 1, 2, 3], 1, undefined, seqRng([0.99]))).toBe(3);
    for (let t = 0; t < 30; t++) {
      const v = rollVariantInDomain([0, 1, 2, 3, 4, 5], 2, undefined, randRng)!;
      expect(v).not.toBe(2);                              // 必异在可行域内成立(修前全域掷+取模可折回原档)
      expect(v >= 0 && v <= 5 && Number.isInteger(v)).toBe(true);
    }
    // 森林族门（IsBackgroundConsideredTheSame :8010 → sameVisual 行空间翻译）：
    // 3↔31 / 5↔51 / 7↔71↔72↔73 互视同款;终清波扩表后全表无复制行(旧行 0/1 族已废)
    const gate = (a: number, b: number) => new BiomeBackground().sameVisual('forest', a, b);
    expect(gate(frRow(3), frRow(31))).toBe(true);
    expect(gate(frRow(31), frRow(3))).toBe(true);
    expect(gate(frRow(5), frRow(51))).toBe(true);
    expect(gate(frRow(7), frRow(72))).toBe(true);
    expect(gate(frRow(72), frRow(73))).toBe(true);
    expect(gate(frRow(1), frRow(2))).toBe(false);
    expect(gate(frRow(31), frRow(5))).toBe(false);
    // 行号表自洽：行数 = 样式映射长、映射无重复（复制行曾专治的同画问题已被扩表消灭）
    const fRows19 = new BiomeBackground().biomeVariantRows('forest');
    expect(fRows19.length).toBe(VANILLA_FOREST_STYLE_ORDER.length);
    expect(new Set(VANILLA_FOREST_STYLE_ORDER).size).toBe(VANILLA_FOREST_STYLE_ORDER.length);
    // from 样式 3 的行永不出同族的样式 31 行;from 普通行不出自身
    for (let t = 0; t < 40; t++) {
      const fromFam = rollVariantInDomain(fRows19, frRow(3), gate, randRng)!;
      expect(gate(frRow(3), fromFam)).toBe(false);
      const fromPlain = rollVariantInDomain(fRows19, frRow(9), gate, randRng)!;
      expect(fromPlain).not.toBe(frRow(9));
      expect(fRows19.includes(fromPlain)).toBe(true);
    }
    // 可行域剔空（单值域）→ null：原版 while(同值) 无从满足时上层早退的等价语义
    expect(rollVariantInDomain([3], 3)).toBeNull();
    expect(rollVariantInDomain([], 0)).toBeNull();
  });

  it('B3-5 各槽全对拍：真 BiomeBackground 表长下任意当前档重掷恒落 STYLES 行内且≠当前档——修复前的全域%表长折叠会出同档/越界写（终清波:雪15/沙漠8/腐化7/蘑菇5 扩域后语义不变）', () => {
    const bg = new BiomeBackground();
    const nonForest = ['corrupt', 'crimson', 'jungle', 'snow', 'hallow',
      'mushroom', 'desert', 'ocean', 'underworld'] as const;
    for (const k of nonForest) {
      const rows = bg.biomeVariantRows(k as never);
      expect(rows.length).toBeGreaterThan(1);             // 现存表无单值域（防御语义仍留）
      for (const cur of [...rows, -1]) {                  // -1=越界脏态也要落回可行域
        for (let t = 0; t < 24; t++) {
          const v = rollVariantInDomain(rows, cur)!;
          expect(rows.includes(v)).toBe(true);            // 掷即渲染可达
          if (rows.includes(cur)) expect(v).not.toBe(cur);// 必异
        }
      }
    }
    // 扩表后各槽值域（锚 setBG 全集:forest 19 视觉/雪 Next(9)+六折=15/沙漠 {0..4}∪{51..53}=8/
    // 腐化 {0..4}∪{51,52}=7/蘑菇 Next(5)=5/神圣 Next(6)=6/猩红 Next(7)=7/丛林 Next(7)=7）
    expect(bg.biomeVariantRows('forest').length).toBe(19);
    expect(bg.biomeVariantRows('snow').length).toBe(15);
    expect(bg.biomeVariantRows('desert').length).toBe(8);
    expect(bg.biomeVariantRows('corrupt').length).toBe(7);
    expect(bg.biomeVariantRows('mushroom').length).toBe(5);
    expect(bg.biomeVariantRows('crimson').length).toBe(7);
    expect(bg.biomeVariantRows('jungle').length).toBe(7);
    expect(bg.biomeVariantRows('hallow').length).toBe(6);
    // 森林四段走族门：from 家族成员行永不出族内其余行;from 孤行不出自身
    const fRows = bg.biomeVariantRows('forest');
    const gate = (a: number, b: number) => bg.sameVisual('forest', a, b);
    for (const cur of [-1, ...fRows]) {
      for (let t = 0; t < 24; t++) {
        const v = rollVariantInDomain(fRows, cur, gate)!;
        expect(fRows.includes(v)).toBe(true);
        if (fRows.includes(cur)) {
          expect(v).not.toBe(cur);
          expect(gate(cur, v)).toBe(false);
        }
      }
    }
  });

  it('B3-5 集成:869 世界球经真 BiomeBackground 连掷雪槽 50 次——每次写值都在 SNOW_STYLES 行域内(终清波扩至15行,含折变体子族)且逐次变化(修前 vanilla 全域%6 会折回原档视觉不变)', () => {
    const g = stubGame([0, 0]);
    g.spawnDust = (() => null) as never;
    g.playSfxFiles = ((files: string[]) => {
      for (const f of files) g.sfxFiles.push(f);
    }) as never;
    g.world.treeX = [100, 200, 300];
    g.scene = { zoneSnow: true };                         // 雪槽:domain {0..8,21..42}>>表长 6,错叠高危区
    const bg = new BiomeBackground();
    bg.setBiomeVariant('snow', 0);                        // 锚定已知当前行
    (g as unknown as { renderer: unknown }).renderer = { biomeBg: bg };
    let prev = bg.biomeVariant('snow');
    for (let t = 0; t < 50; t++) {
      (g as unknown as { onProjectileDeath(...a: unknown[]): void })
        .onProjectileDeath(869, 10 * TILE - 6, 40 * TILE, 12, 12);
      const now = bg.biomeVariant('snow');                // 公共读口=私有行空间状态
      expect(bg.biomeVariantRows('snow').includes(now)).toBe(true);  // 渲染可达行
      expect(now).not.toBe(prev);                          // 逐次必变(取模折叠曾致不变)
      prev = now;
    }
  });

  it('B3-5 集成:Game 只向可行域要池、写回域内值——假桩记账 biomeVariantRows/setBiomeVariant 调用面;underworld 尾段仍双写 world.underworldBG', () => {
    const g = stubGame([0, 0]);
    g.spawnDust = (() => null) as never;
    g.playSfxFiles = ((files: string[]) => {
      for (const f of files) g.sfxFiles.push(f);
    }) as never;
    g.world.treeX = [100, 200, 300];
    g.scene = { zoneUnderworldHeight: true };             // underworld=Next(3) 全覆盖槽+持久双写路径
    const askedKinds: string[] = [];
    const rowsOf: Record<string, number[]> = {};
    g.renderer = { biomeBg: {
      biomeVariant: (k: string) => 1,
      // 假池只给 [0,1]、当前档 1 → 候选剔空到单值,重掷结果确定化（契约验证不测真表长）
      biomeVariantRows: (k: string) => { askedKinds.push(k); return rowsOf[k] ?? [0, 1]; },
      setBiomeVariant: (k: string, v: number) => v,
    } } as never;
    (g as unknown as { onProjectileDeath(...a: unknown[]): void })
      .onProjectileDeath(869, 10 * TILE - 6, 40 * TILE, 12, 12);
    expect(askedKinds).toEqual(['underworld']);           // 池只从可行域口索取(B3-5 契约)
    expect(g.world.underworldBG).toBe(0);                 // 池内唯一候选 0 且双写持久位(setBG case9 :7754)
  });
});

// ---------------------------------------------------------------------------
// X-F1 fresh-click 门回归（⑩ 边沿统一批）：B3 波分派左键此前只有
// `inp.mouseDown && useTime===0`——input.mouseDown 是粘滞电平（touchend 才清），
// 按住 LMB 每 useTime 周期连发沙滩球/橄榄球/透镜弹。原版非 autoReuse 件必须松手
// 再点（TryingToUseItem 门 itemAnimation==0 && !Main.mouseLeftRelease 即拒,
// P.cs:24518-24523）；右键快换支本就有 _prevRightDown 边沿，不受本门影响。
describe('X-F1 fresh-click 门（B3 左键 ⑩ 边沿；右键换型支不受影响）', () => {
  /** updateUse 可驱动的最小 Game 桩（同 tests/orphan-weapons-a updUseGame 法；
 *  opts.nearCursor=true 时光标格取玩家近旁空格——右键 interactAt 距离门需要） */
  function updUseGame(heldVid: number, stack = 1,
    opts?: { nearCursor?: boolean }) {
    const g = Object.create(Game.prototype) as Record<string, any>;
    const player = new Player(50 * TILE, 90 * TILE, new Inventory());
    const iidV = invIndexOfVanilla(heldVid);
    expect(iidV).toBeGreaterThanOrEqual(0);
    player.inv.add(iidV, stack);
    player.inv.selected = Math.max(0, player.inv.slots.findIndex((s) => s && s.id === iidV));
    g.player = player;
    g.world = { store: new TileStore(200, 200), chests: [] };
    const pxT = Math.floor(player.cx / TILE);
    const pyT = Math.floor(player.cy / TILE);
    g.camera = {
      screenToWorld: () => [player.cx + 240, player.cy - 60],
      tileUnder: () => (opts?.nearCursor ? [pxT + 2, pyT] : [80, 80]),
    };
    g.enemies = () => [];
    g.candidatePlayers = undefined;
    g.netCanEditTile = () => true;
    g.housingMode = null;
    g.input = { mouseX: 500, mouseY: 300, mouseDown: false, rightDown: false,
      uiBlocking: false, downAction: () => false };
    g.entities = { projectiles: [] as unknown[], enemies: [] as unknown[],
      npcs: [] as unknown[], critters: [] as unknown[],
      add(e: unknown) { this.projectiles.push(e); } };
    g.sfxFiles = [];
    g.synthFallbacks = [];
    g.playSfxFile = (f: string) => { g.sfxFiles.push(f as string); return true; };
    g.playSfxFiles = () => {};
    g.sfx = { play: (n: string) => { g.synthFallbacks.push(n); }, playWavFile: () => true };
    g.cb = { onInventoryChanged: () => {}, onToast: () => {} };
    g.renderer = { canvas: { width: 800, height: 600 }, fullMap: { open: false },
      timeUiHover: false, weatherUiHover: false };
    g.smartCursor = { showing: false };
    g.annotateMode = false;
    g.prevSwingMouse = false;
    g.mining = null;
    g.swingHitSet = new Set<number>();
    g.swingTileCutSet = new Set<number>();
    g._prevMouseDown = false;
    g._prevRightDown = false;
    g.spawnParticles = () => {};
    g.useSwing = () => {};
    return { g, player };
  }
  function useBeat(g: Record<string, any>): void {
    g.updateUse(1 / 60);
    g._prevMouseDown = !!g.input.mouseDown;   // 生产节奏：updateUse 后拍 :6106
  }

  it('数据面：B3 四件全非 autoReuse（Item.cs SetDefaults 无 autoReuse 行）→ 全须松手', () => {
    expect(itemCombat(4131)?.autoReuse ?? false).toBe(false);
    expect(itemCombat(5325)?.autoReuse ?? false).toBe(false);
    expect(itemCombat(859)?.autoReuse ?? false).toBe(false);
    expect(itemCombat(4743)?.autoReuse ?? false).toBe(false);
  });

  it('沙滩球 859：按住第二拍不再抛球；松手重按才再抛一发（consumable 三连拍库存账）', () => {
    const { g, player } = updUseGame(859, 3);
    g.input.mouseDown = true;
    useBeat(g as never);
    const first = (g.entities.projectiles as BeachBallProj[])[0];
    expect(first).toBeInstanceOf(BeachBallProj);
    expect(first.projId).toBe(155);
    expect(player.inv.slots[0]!.stack).toBe(2);            // consumable 恰耗 1（:11446）
    player.useTime = 0;                                    // 快进：动画窗走完仍按住
    useBeat(g as never);
    expect(g.entities.projectiles).toHaveLength(1);        // ★第二拍不再复发
    expect(player.inv.slots[0]!.stack).toBe(2);            // ★库存停止白耗
    g.input.mouseDown = false;
    useBeat(g as never);                                   // 松手拍（mouseLeftRelease 置位）
    g.input.mouseDown = true;
    useBeat(g as never);                                   // 重按拍 → 再抛一发+再耗一枚
    expect(g.entities.projectiles).toHaveLength(2);
    expect(player.inv.slots[0]!.stack).toBe(1);
  });

  it('透镜 4131：左键按住不复发 734、松手重按再发；持左期间点右 → 换型支优先且吞 rightDown 不发弹', () => {
    // ★生产可达性：updateUse :9080 早退门(!mouseDown&&!autoReuseHold→return)使
    // "只右键"帧进不了孤儿波分派——右键快换支的现实入口是「持续按左(+右点)」/
    // autoResize 豁免帧，本测试即按该节奏驱动真实分派链
    const { g, player } = updUseGame(4131, 1, { nearCursor: true });
    const lensProjs = () => (g.entities.projectiles as VoidLensProj[])
      .filter((x) => x instanceof VoidLensProj);
    g.input.mouseDown = true;
    useBeat(g as never);
    expect(lensProjs()).toHaveLength(1);
    expect(vanillaOfHeld(player)).toBe(4131);              // 使用不换型不消耗
    player.useTime = 0;
    useBeat(g as never);
    expect(lensProjs()).toHaveLength(1);                   // ★按住第二拍无第二发
    // —— 按住左的同时在【交互射程内】点右键（快换表 Player.cs:31796-31801）：
    //    _prevMouseDown=true 挡死左键投掷臂；右键边沿走完 interactAt 空格不消费，
    //    到 B3 边沿臂进块 → 换型优先不发弹
    g.input.rightDown = true;
    useBeat(g as never);
    expect(vanillaOfHeld(player)).toBe(5325);              // 换型生效
    expect(lensProjs()).toHaveLength(1);                   // 换型不发弹
    expect(g.input.rightDown).toBe(false);                 // 边沿已消费（inner 吞）
    // —— 松手重按 → 新外观 5325 正常发射
    g.input.mouseDown = false;
    useBeat(g as never);                                   // 松手拍
    g.input.mouseDown = true;
    useBeat(g as never);                                   // 重按拍
    expect(lensProjs()).toHaveLength(2);
  });
});
