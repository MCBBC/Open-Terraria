// Chester 宠物箱便携容器流（proj 960）三工单回归：
//   · T1 右键开合（Main.cs:38411-38487 TryInteractingWithMoneyTrough 的 proj.type==960
//     支；Projectile.cs:80556-80564 TryGetContainerIndex：525/960 → chest=-2——无独立
//     存储，开的就是玩家存钱罐 player.bank/banks[0] 活引用）
//   · T2 跟随关门（Player.cs:31245-31327 HandleBeingInChestRange 追踪支每 tick 子集：
//     宠物消失/走出 Simple 射程 → 关面板 + ChesterClose）
//   · T3 开盖帧机（Projectile.cs:63714-63828 type==960 支：0-3 待机 / 4 空中 /
//     5-12 行走 / 13-18 开盖段 / 19 合盖过渡）
// 契约常量桩 = data/vanillaOpenBags.ts CHESTER_CONTAINER。
import { describe, it, expect, vi } from 'vitest';
// ★Enemy 须最先加载（2026-08-26 审计,同 tests/sfx-wiring.test.ts 先例）：
//   Game→…→bossAI→Arrow→TownNPC→Enemy 活环,Game-first 导入序下 Enemy.ts 尾部
//   顶层 bindEnemyCtor(Enemy) 在环内求值时 bossAI 未初始化即 TypeError 整文件
//   无法收集。先完整加载 Enemy 断环;根修=bindEnemyCtor 抽叶模块(挂账)。
import { Enemy } from '../src/entities/Enemy';
import { Game } from '../src/core/Game';
import { PetFollower } from '../src/entities/PetFollower';
import { Player } from '../src/entities/Player';
import { VoidLensProj } from '../src/entities/VoidLensProj';
import { FlyingPiggyBank } from '../src/entities/FlyingPiggyBank';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import {
  CHESTER_CONTAINER, MONEY_TROUGH_USE, VOID_LENS_CONTAINER,
} from '../src/data/vanillaOpenBags';
import { ItemIconCache } from '../src/render/CursorItemIcon';

// ===================== Game 最小桩（blue-r2 casterGame 同法） =====================
/** updateChesterContainerRange/hoveredChester/interactChesterContainer 可驱动的最小
 *  Game 桩：真实 Player+World（inTileRange 走原型真实现），相机恒等映射（鼠标世界点
 *  = input.mouseX/Y 直填），面板/音效走记录器 */
function chesterGame() {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & {
    // 记录面（断言消费）
    opened: Array<{ x: number; y: number; items: Array<unknown> }>;
    closeCalls: number;
    sfxCalls: string[];
  };
  const player = new Player(50 * TILE, 90 * TILE, new Inventory());
  const world = new World(120, 160, 30);
  let panel: { x: number; items: Array<unknown> } | null = null;
  g.opened = [];
  g.closeCalls = 0;
  g.sfxCalls = [];
  g.player = player;
  g.world = world;
  g.input = { mouseX: 0, mouseY: 0, rightDown: false, uiBlocking: false };
  g.camera = { screenToWorld: (mx: number, my: number) => [mx, my] as [number, number] };
  g.openChest = (c: { x: number; y: number; items: Array<unknown> }) => {
    panel = c;
    g.opened.push(c);
  };
  g.openChestRef = () => panel;
  g.closeChestPanel = () => { g.closeCalls++; panel = null; };
  g.playSfxWav = (file: string) => { g.sfxCalls.push(file); return true; };
  return { g, player, world };
}

/** 站在玩家交互射程内的 Chester 跟随体（玩家 (50,90)*TILE，射程 x±5/y+3 格） */
function mkChester(g: Record<string, unknown>, player: Player, tileDx = 2): PetFollower {
  void g;
  const pet = new PetFollower(player.cx + tileDx * TILE, player.y, 960, () => player);
  pet.onGround = true;
  pet.vy = 0;
  return pet;
}

const lastSfx = (g: { sfxCalls: string[] }): string => g.sfxCalls[g.sfxCalls.length - 1];

// ===================== 契约常量（测试桩自检） =====================
describe('CHESTER_CONTAINER 契约', () => {
  it('projId 960 / 面板源 -2 / banks[0] / 光标图标 5098', () => {
    expect(CHESTER_CONTAINER.projId).toBe(960);           // Projectile.cs:63714
    expect(CHESTER_CONTAINER.openChestX).toBe(-2);        // Main.cs:38463 chest=-2
    expect(CHESTER_CONTAINER.bankIndex).toBe(0);          // player.banks[0] 存钱罐
    expect(CHESTER_CONTAINER.cursorIconVid).toBe(5098);   // Main.cs:38436 proj.type==960 支
  });
});

// ===================== 悬停光标 kind 分派（X-F5 回归） =====================
// 原版三面：525 飞猪/960 Chester 共走 TryInteractingWithMoneyTrough
// （1457 :38431-38436 flag2 段 icon=3213、==960→5098；1456 :37306-37311 同构）；
// 透镜弹 734 走独立 TryInteractingWithVoidLens（Main.cs:28348 弹型门）→ icon=4131
// （:38359，1456 :37233）。分派错误症状 = 悬停虚空透镜显示钱槽罐头(3213)。
describe('悬停光标 kind 分派（tickCursorIcon 容器宠物支）', () => {
  it('契约常量：ChesterPetItem=5098 / MoneyTrough=3213 / VoidLens=4131（ItemID.cs:11742/:7972/:9808）', () => {
    expect(CHESTER_CONTAINER.cursorIconVid).toBe(5098);
    expect(MONEY_TROUGH_USE.cursorIconVid).toBe(3213);
    expect(VOID_LENS_CONTAINER.cursorIconVid).toBe(4131);
  });

  /** tickCursorIcon 最小驱动面：tileInteractionsMouseOver 打桩隔离（本面只验证
   *  容器宠物分派，tile 悬停族另有测试）、缓存器用真实现、entities 只喂 npcs/projectiles */
  function cursorGame() {
    const { g, player } = chesterGame();
    (g as unknown as Record<string, unknown>).tileInteractionsMouseOver = () => {};
    (g as unknown as Record<string, unknown>).itemIconCache = new ItemIconCache();
    (g as unknown as Record<string, unknown>).renderer = {};
    // 悬停扫描面（hoveringTownNpc/containerPetHit 都走 entities；缺省空桶）
    (g as unknown as Record<string, unknown>).entities = { npcs: [], enemies: [], projectiles: [] };  // enemies 空桶（★SW-BP1 补:SW-BJ1 tickHoverNpcName 遍历敌怪桶,stub 缺桶=not iterable）
    return { g, player };
  }

  it('透镜弹 734 悬停 → 图标 4131（X-F5 主回归：曾误落 3213 钱槽图标）', () => {
    const { g, player } = cursorGame();
    const lens = new VoidLensProj(player.cx + 2 * TILE, player.cy, 0, 0);
    (g as unknown as Record<string, unknown>).entities = { npcs: [], enemies: [], projectiles: [lens] };
    (g.input as { mouseX: number; mouseY: number }).mouseX = lens.x + 15;
    (g.input as { mouseX: number; mouseY: number }).mouseY = lens.y + 12;
    (g as unknown as { tickCursorIcon(): void }).tickCursorIcon();
    expect(player.cursorItemIconEnabled).toBe(true);
    expect(player.cursorItemIconID).toBe(VOID_LENS_CONTAINER.cursorIconVid);   // 4131 VoidLens :38359
  });

  it('飞猪存钱罐 525 悬停 → 图标 3213（MoneyTrough 默认支）', () => {
    const { g, player } = cursorGame();
    const pig = new FlyingPiggyBank(player.cx + 2 * TILE, player.cy, 0, 0, () => player);
    (g as unknown as Record<string, unknown>).entities = { npcs: [], enemies: [], projectiles: [pig] };
    (g.input as { mouseX: number; mouseY: number }).mouseX = pig.x + 15;
    (g.input as { mouseX: number; mouseY: number }).mouseY = pig.y + 12;
    (g as unknown as { tickCursorIcon(): void }).tickCursorIcon();
    expect(player.cursorItemIconEnabled).toBe(true);
    expect(player.cursorItemIconID).toBe(MONEY_TROUGH_USE.cursorIconVid);      // 3213 :38433
  });

  it('Chester 宠物格悬停 → 图标 5098（==960 覆写支，wiring 级复核不被泛化改坏）', () => {
    const { g, player } = cursorGame();
    const pet = mkChester(g, player);
    (g as unknown as Record<string, unknown>).petFollower = pet;
    (g.input as { mouseX: number; mouseY: number }).mouseX = pet.cx;
    (g.input as { mouseX: number; mouseY: number }).mouseY = pet.cy;
    (g as unknown as { tickCursorIcon(): void }).tickCursorIcon();
    expect(player.cursorItemIconEnabled).toBe(true);
    expect(player.cursorItemIconID).toBe(CHESTER_CONTAINER.cursorIconVid);     // 5098 :38436
  });

  it('无命中 → 不启用悬停图标（重置链首四字段归零）', () => {
    const { g, player } = cursorGame();
    (g as unknown as Record<string, unknown>).entities = { npcs: [], enemies: [], projectiles: [] };  // enemies 空桶（★SW-BP1 补:SW-BJ1 tickHoverNpcName 遍历敌怪桶,stub 缺桶=not iterable）
    (g.input as { mouseX: number; mouseY: number }).mouseX = 200 * TILE;
    (g.input as { mouseX: number; mouseY: number }).mouseY = 200 * TILE;
    (g as unknown as { tickCursorIcon(): void }).tickCursorIcon();
    expect(player.cursorItemIconEnabled).toBe(false);
    expect(player.cursorItemIconID).toBe(0);
  });
});

// ===================== T1 右键开合 =====================
describe('T1 hoveredChester 命中门（Player.cs:23336 射程门 + Main.cs:38425 Contains 合成）', () => {
  it('射程内 + 光标落宠物 32px 内命中；光标远离/宠物超射程/非 Chester 均不命中', () => {
    const { g, player } = chesterGame();
    const pet = mkChester(g, player);
    g.petFollower = pet;

    // 光标 = 宠物中心（identity 相机 → 直接填世界坐标）
    (g.input as { mouseX: number; mouseY: number }).mouseX = pet.cx;
    (g.input as { mouseX: number; mouseY: number }).mouseY = pet.cy;
    expect((g as unknown as { hoveredChester(): unknown }).hoveredChester()).toBe(pet);

    // 光标拉远 40px（≥32 门）
    (g.input as { mouseX: number; mouseY: number }).mouseX = pet.cx + 40;
    expect((g as unknown as { hoveredChester(): unknown }).hoveredChester()).toBeNull();

    // 宠物挪出交互射程（tile 80 ≫ HX=56）
    pet.x = 80 * TILE;
    (g.input as { mouseX: number; mouseY: number }).mouseX = pet.cx;
    expect((g as unknown as { hoveredChester(): unknown }).hoveredChester()).toBeNull();

    // 非 Chester 宠物不命中
    pet.x = player.cx + 2 * TILE;
    const other = new PetFollower(pet.x, pet.y, 111, () => player);
    g.petFollower = other;
    (g.input as { mouseX: number; mouseY: number }).mouseX = other.cx;
    expect((g as unknown as { hoveredChester(): unknown }).hoveredChester()).toBeNull();
  });
});

describe('T1 interactChesterContainer 开合（Main.cs:38449-38476）', () => {
  it('右键开：items === banks[0] 活引用 + tracker.Set + 开音随机变体', () => {
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.99);   // floor(0.99*2)=1
    try {
      const { g, player } = chesterGame();
      const pet = mkChester(g, player);
      (g as unknown as { interactChesterContainer(p: PetFollower): void })
        .interactChesterContainer(pet);

      expect(g.opened).toHaveLength(1);
      expect(g.opened[0].x).toBe(-2);                       // chest = -2（Main.cs:38463）
      expect(g.opened[0].items).toBe(player.banks[0]);      // ★活引用——面板写入即存档数据
      expect(lastSfx(g)).toBe('chester_open_1');            // SoundID.cs:1042 双变体 _1
      expect((g as unknown as { chesterTrackedPet: unknown }).chesterTrackedPet).toBe(pet);
      expect(pet.beingTracked).toBe(true);                  // T3 开盖帧驱动位
    } finally {
      rnd.mockRestore();
    }
  });

  it('再右键关（chest==-2 已开 → -1）：closeChestPanel 恰一次 + 关音变体 + tracker Clear', () => {
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.0);    // floor(0*2)=0
    try {
      const { g, player } = chesterGame();
      const pet = mkChester(g, player);
      const icc = (g as unknown as { interactChesterContainer(p: PetFollower): void });
      icc.interactChesterContainer(pet);                    // 开
      expect(lastSfx(g)).toBe('chester_open_0');
      icc.interactChesterContainer(pet);                    // 再右键 = 关（:38455-38459）
      expect(g.closeCalls).toBe(1);
      expect(lastSfx(g)).toBe('chester_close_0');           // SoundID.cs:1044 双变体 _0
      expect((g as unknown as { chesterTrackedPet: unknown }).chesterTrackedPet).toBeNull();
      expect(pet.beingTracked).toBe(false);                 // 合盖段（Projectile.cs:63779 支）
    } finally {
      rnd.mockRestore();
    }
  });

  it('存钱罐 tile/物品打开的同一容器（面板源 x===-2）也被再右键关闭——同一 chest 槽语义', () => {
    const { g, player } = chesterGame();
    const pet = mkChester(g, player);
    // 模拟储物族 tile 开箱已把 -2 面板挂上（Game :16885 同款约定）
    (g.openChest as (c: { x: number; items: Array<unknown> }) => void)
      .call(null, { x: -2, y: 0, items: player.banks[0] });
    (g as unknown as { interactChesterContainer(p: PetFollower): void })
      .interactChesterContainer(pet);
    expect(g.closeCalls).toBe(1);
    expect(g.opened).toHaveLength(1);                       // 未重复开新面板
  });
});

// ===================== T2 跟随关门（Player.cs:31245-31327 子集） =====================
describe('T2 updateChesterContainerRange 每 tick 校验', () => {
  it('宠物走出射程 → 自动关面板 + 关音 + 清追踪（:31271-31278）', () => {
    const { g, player } = chesterGame();
    const pet = mkChester(g, player);
    const icc = (g as unknown as { interactChesterContainer(p: PetFollower): void });
    icc.interactChesterContainer(pet);
    g.sfxCalls.length = 0;

    pet.x = 80 * TILE;                                      // tile 80 ≫ HX=56
    (g as unknown as { updateChesterContainerRange(): void }).updateChesterContainerRange();

    expect(g.closeCalls).toBe(1);                           // chest = -1（:31277）
    expect(/^chester_close_[01]$/.test(lastSfx(g))).toBe(true);  // :31275 ChesterClose
    expect((g as unknown as { chesterTrackedPet: unknown }).chesterTrackedPet).toBeNull();
    expect(pet.beingTracked).toBe(false);
  });

  it('宠物消失（dead）→ 同样自动关（Key.TryGetActive false :31261-31265）', () => {
    const { g, player } = chesterGame();
    const pet = mkChester(g, player);
    (g as unknown as { interactChesterContainer(p: PetFollower): void })
      .interactChesterContainer(pet);
    g.sfxCalls.length = 0;
    g.closeCalls = 0;
    pet.dead = true;
    (g as unknown as { updateChesterContainerRange(): void }).updateChesterContainerRange();
    expect(g.closeCalls).toBe(1);
    expect(/^chester_close_[01]$/.test(lastSfx(g))).toBe(true);
  });

  it('在射程内且存活 → 保持打开，beingTracked 回写 true（无音无关）', () => {
    const { g, player } = chesterGame();
    const pet = mkChester(g, player);
    (g as unknown as { interactChesterContainer(p: PetFollower): void })
      .interactChesterContainer(pet);
    g.sfxCalls.length = 0;
    g.closeCalls = 0;
    (g as unknown as { updateChesterContainerRange(): void }).updateChesterContainerRange();
    expect(g.closeCalls).toBe(0);
    expect(g.sfxCalls).toHaveLength(0);
    expect(pet.beingTracked).toBe(true);
  });

  it('面板被换成非 -2 容器 → 静默清追踪（Player.cs:31324 Clear，不播音不强关新面板）', () => {
    const { g, player } = chesterGame();
    const pet = mkChester(g, player);
    (g as unknown as { interactChesterContainer(p: PetFollower): void })
      .interactChesterContainer(pet);
    // 用户随后右键了世界宝箱：openChest 被换源（x=世界箱坐标 7）
    (g.openChest as (c: { x: number; y: number; items: Array<unknown> }) => void)
      .call(null, { x: 7, y: 9, items: [] as Array<unknown> });
    g.sfxCalls.length = 0;
    g.closeCalls = 0;
    (g as unknown as { updateChesterContainerRange(): void }).updateChesterContainerRange();
    expect((g as unknown as { chesterTrackedPet: unknown }).chesterTrackedPet).toBeNull();
    expect(g.closeCalls).toBe(0);
    expect(g.sfxCalls).toHaveLength(0);
  });

  it('世界箱/tile 容器路径不受影响：无追踪时 updateChesterContainerRange 全程空转', () => {
    const { g } = chesterGame();
    (g as unknown as { updateChesterContainerRange(): void }).updateChesterContainerRange();
    expect(g.closeCalls).toBe(0);
    expect(g.sfxCalls).toHaveLength(0);
  });
});

// ===================== T3 帧分段（Projectile.cs:63714-63828） =====================
/** T3 用最小桩：直接驱 chesterStepAnim（帧分段精确断言），fixedUpdate 冒烟一条 */
describe('T3 chesterStepAnim 帧机（20 帧床四段）', () => {
  function framePet(): PetFollower {
    const owner = { x: 990, y: 979, w: 20, h: 42, cx: 1000, cy: 1000, facing: 1, dead: false };
    const pet = new PetFollower(1000, 1000, 960, () => owner);
    pet.onGround = true;
    return pet;
  }
  const tick = (pet: PetFollower, movedX: boolean, n = 1) => {
    for (let i = 0; i < n; i++) {
      (pet as unknown as { chesterStepAnim(m: boolean): void }).chesterStepAnim(movedX);
    }
  };
  const frameOf = (pet: PetFollower): number => (pet as unknown as { frame: number }).frame;
  const accOf = (pet: PetFollower): number => (pet as unknown as { frameAcc: number }).frameAcc;

  it('空中档（vy≠0 :63717）：定格帧 4 + 开盖闩全复位', () => {
    const pet = framePet();
    (pet as unknown as { chestLidPhase: number }).chestLidPhase = 1;
    (pet as unknown as { chestLidArm: number }).chestLidArm = 1;
    pet.vy = 2;
    tick(pet, false);
    expect(frameOf(pet)).toBe(4);
    expect((pet as unknown as { chestLidPhase: number }).chestLidPhase).toBe(0);
    expect((pet as unknown as { chestLidArm: number }).chestLidArm).toBe(0);
    expect(accOf(pet)).toBe(0);
  });

  it('待机轮（无人跟踪 :63798-63805）：帧 0..3 每 6t、24t 回卷', () => {
    const pet = framePet();
    pet.vy = 0;
    tick(pet, false, 7);                                    // acc=7 → 帧 1
    expect(frameOf(pet)).toBe(1);
    tick(pet, false, 6);                                    // acc=13 → 帧 2
    expect(frameOf(pet)).toBe(2);
    tick(pet, false, 6);                                    // acc=19 → 帧 3
    expect(frameOf(pet)).toBe(3);
    tick(pet, false, 5);                                    // acc=24 ≥24 归零 → 帧 0
    expect(frameOf(pet)).toBe(0);
    expect(accOf(pet)).toBe(0);
  });

  it('行走档（movedX :63808-63823）：窗界钳 [5,12]、速度累进 max(2,|v|)', () => {
    const pet = framePet();
    pet.vy = 0;
    pet.vx = 3;                                             // 每拍累 3
    tick(pet, true);                                        // acc3 ≤6 → 帧界外钳回 5
    expect(frameOf(pet)).toBe(5);
    tick(pet, true, 2);                                     // acc9 >6 → 帧 6
    expect(frameOf(pet)).toBe(6);
    // 从 12 再进一拍 → 13 越上界 → 钳回 5（原版 `frame > 12 → 5` 字面）
    (pet as unknown as { frame: number }).frame = 12;
    (pet as unknown as { frameAcc: number }).frameAcc = 5;
    tick(pet, true);
    expect(frameOf(pet)).toBe(5);
    // 低速钳底：|v|=0.5 → 每拍仍累 max(2,·)=2
    pet.vx = 0.5;
    (pet as unknown as { frame: number }).frame = 5;
    (pet as unknown as { frameAcc: number }).frameAcc = 0;
    tick(pet, true, 4);                                     // 累 8 >6 → 帧 6
    expect(frameOf(pet)).toBe(6);
  });

  it('收步段（静止时帧 5..11 未走完 :63734-63746）：4t/帧收完到 12 归 0', () => {
    const pet = framePet();
    pet.vy = 0;
    (pet as unknown as { frame: number }).frame = 7;
    tick(pet, false, 4);                                    // 4t → 帧 8
    expect(frameOf(pet)).toBe(8);
    (pet as unknown as { frame: number }).frame = 11;
    (pet as unknown as { frameAcc: number }).frameAcc = 0;
    tick(pet, false, 4);                                    // 11→12→归 0
    expect(frameOf(pet)).toBe(0);
  });

  it('开盖段（被跟踪 :63747-63778）：帧 13 停 7 拍 → 14，保持环 14..18 循环', () => {
    const pet = framePet();
    pet.vy = 0;
    (pet as unknown as { beingTracked: boolean }).beingTracked = true;
    tick(pet, false);                                       // 首拍：armed + 帧 13（counter=1）
    expect(frameOf(pet)).toBe(13);
    expect((pet as unknown as { chestLidArm: number }).chestLidArm).toBe(1);
    tick(pet, false, 5);
    expect(frameOf(pet)).toBe(13);                          // counter=6 仍未越门（>6 门）
    tick(pet, false, 1);                                    // 第 7 拍 counter=7>6 → 14
    expect(frameOf(pet)).toBe(14);
    expect((pet as unknown as { chestLidPhase: number }).chestLidPhase).toBe(1);
    tick(pet, false, 28);                                   // 保持环每 7 拍一步：15/16/17/18
    expect(frameOf(pet)).toBe(18);
    tick(pet, false, 7);
    expect(frameOf(pet)).toBe(14);                          // >18 回卷 14（:63771-63773）
  });

  it('合盖过渡（脱离跟踪 :63787-63796）：帧 12..19 定格 19 七拍后回 0，闩复位', () => {
    const pet = framePet();
    pet.vy = 0;
    // 先制造"开过盖"状态（phase=1/arm=1/frame=16）
    (pet as unknown as { beingTracked: boolean }).beingTracked = true;
    (pet as unknown as { chestLidPhase: number }).chestLidPhase = 1;
    (pet as unknown as { chestLidArm: number }).chestLidArm = 1;
    (pet as unknown as { frame: number }).frame = 16;
    (pet as unknown as { beingTracked: boolean }).beingTracked = false;
    tick(pet, false);                                       // 首拍：闩复位 + 定格 19（counter=1）
    expect(frameOf(pet)).toBe(19);
    expect((pet as unknown as { chestLidPhase: number }).chestLidPhase).toBe(0);
    expect((pet as unknown as { chestLidArm: number }).chestLidArm).toBe(0);
    tick(pet, false, 5);
    expect(frameOf(pet)).toBe(19);                          // counter=6 未越门仍定格
    tick(pet, false, 1);                                    // 第 7 拍 counter=7>6 → 0
    expect(frameOf(pet)).toBe(0);
  });

  it('静止面向玩家（:63726-63733 spriteDirection=direction 直映）：dir 取玩家侧符号', () => {
    const owner = { x: 990, y: 979, w: 20, h: 42, cx: 1000, cy: 1000, facing: 1, dead: false };
    const pet = new PetFollower(1100, 1000, 960, () => owner);   // 玩家在左
    pet.onGround = true;
    (pet as unknown as { dir: number }).dir = 1;
    tick(pet, false);
    expect((pet as unknown as { dir: number }).dir).toBe(-1);    // 转身面向玩家
  });

  it('fixedUpdate 冒烟：空中下落定格帧 4（AI→stepAnim 全链）', () => {
    const FLOOR = 60;
    const W = 200, H = 120;
    const store = {
      w: W, h: H,
      inBounds: (c: number, r: number) => c >= 0 && c < W && r >= 0 && r < H,
      idx: (c: number, r: number) => r * W + c,
      isSolid: (c: number, r: number) => r >= FLOOR,
      isPlatform: () => false,
      slope: new Uint8Array(W * H), half: new Uint8Array(W * H),
    };
    const game = { world: { store } } as never;
    const owner = { cx: 100 * 16, cy: (FLOOR - 10) * 16, x: 100 * 16, y: (FLOOR - 10) * 16,
      w: 20, h: 42, facing: 1, dead: false, vx: 0, vy: 0 };
    const pet = new PetFollower(owner.cx, (FLOOR - 20) * 16, 960, () => owner);
    pet.fixedUpdate(1 / 60, game);
    expect(frameOf(pet)).toBe(4);                           // vy≠0 → 帧 4
  });
});
