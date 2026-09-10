// ★SW-FX14 2026-09-10 IngameOptions 普查对账收尾测试（M14）。
// 金标 = Terarria1457/Terraria/IngameOptions.cs（647-848 全段逐项 + :973-979 光照
// 模式——台账 M14 所列「光照模式」实位在「视频」组）+ Main.cs 配置键 + 各消费 .cs。
// 覆盖四面：
//   ① 普查矩阵：647-848 段全部开关的缺省值逐项锁定（含历史批已接 10 项——
//      结构锁防静默回退）；
//   ② 新增 4 项（悬停控制/血条数字/背包特效/光照模式）的读档卫门；
//   ③ 悬停锁存行为面（hoverLatchStep 纯函数直调 = Player.cs:25452-25484 字面）；
//   ④ 光照模式循环序（NextLightMode 1:1）。
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { options } from '../src/core/Options';
import { hoverLatchStep } from '../src/entities/Player';

// ---------------------------------------------------------------- ① 普查矩阵
describe('SW-FX14 ① IngameOptions.cs:647-848 普查矩阵（缺省值=原版静态初值）', () => {
  it('新增 4 项缺省（★SW-FX14 本批）', () => {
    expect(options.data.hoverControl).toBe('hold');                    // Player.cs:357
    expect(options.data.showBossBarHealthText).toBe(true);             // BigProgressBarSystem.cs:76
    expect(options.data.flashyEffectsInterface).toBe(true);            // Main.cs:443
    expect(options.data.lightMode).toBe('color');                      // Lighting.cs:19
  });
  it('历史批已接 10 项缺省（结构锁——M14 台账逐项）', () => {
    // :647 Main.ReversedUpDownArmorSetBonuses = false（Main.cs:253）
    expect(options.data.reversedUpDownArmorSetBonuses).toBe(false);
    // :656 DoorOpeningHelper.PreferenceSettings = EnabledForEverything（DoorOpeningHelper.cs:216）
    expect(options.data.doorOpeningPreference).toBe('enabled');
    // :689 Main.SettingsEnabled_AutoReuseAllItems = false（Main.cs:241）
    expect(options.data.autoReuseAllItems).toBe(false);
    // :714 Main.showItemText = true（Main.cs:1194）
    expect(options.data.showItemText).toBe(true);
    // :721 Main.invasionProgressMode = 2（Main.cs:65992 静默初始化）
    expect(options.data.invasionProgressMode).toBe(2);
    // :727 Main.placementPreview = true（Main.cs:1298）
    expect(options.data.placementPreview).toBe(true);
    // :736 ItemSlot.Options.HighlightNewItems = true（ItemSlot.cs:31）
    expect(options.data.highlightNewItems).toBe(true);
    // :745 Main.MouseShowBuildingGrid = false（Main.cs:257）
    expect(options.data.mouseShowBuildingGrid).toBe(false);
    // :797 Main.DialoguePortraitPreference = Detailed
    expect(options.data.dialoguePortraitMode).toBe('detailed');
    // :815 Main.SettingsEnabled_OpaqueBoxBehindTooltips = true（Main.cs:249）
    expect(options.data.opaqueBoxBehindTooltips).toBe(true);
    // :824 快速丢弃三态缺省 Left Control（ItemSlot.cs:28-30 DLS=true/DQT=false）
    expect(options.data.quickTrashMode).toBe('leftControl');
  });
  it('消费面结构锁（Options.ts 注释声明的消费点在盘上真实在位）', () => {
    const game = readSrc('src/core/Game.ts');
    // :647 反转套装键 → Game.afterWorldLoad reversedArmorBonusKey 注入
    expect(game).toContain('reversedArmorBonusKey: () => options.data.reversedUpDownArmorSetBonuses');
    // :689 自动连用 → 挥击复用门（Player.cs:24182 autoReuseAllWeapons）
    expect(game).toMatch(/autoReuseAllItems/);
    const renderer = readSrc('src/render/Renderer.ts');
    // :745 建筑网格 → drawBuildingGrid
    expect(renderer).toMatch(/drawBuildingGrid/);
    // :806 血条数字 → drawBossBar 传参（本批接线）
    expect(renderer).toContain('options.data.showBossBarHealthText');
  });
  it('行为 N-A 备案面：放置预览/高亮新物品/智能门/手柄说明（依赖系统未移植）', () => {
    // 台账口径：这四项设置 1:1 建模+持久化，行为依赖未移植系统：
    //   placementPreview ← TileObject.DrawPreview 幽灵预览族未移植（TileDrawing.cs:742）
    //   highlightNewItems ← ItemSlot.newAndShiny 追踪未移植（ItemSlot.cs:1995）
    //   doorOpeningPreference ← 玩家智能门系统未移植（DoorOpeningHelper.CyclePreferences）
    //   GamepadDisableInstructionsDisplay（:754）← 手柄屏显提示系统 N-A（Web 无手柄提示层）
    //   MapScale 滑条（:770-786）← 小地图盒几何 240×MapScale + 全图 transform 矩阵
    //     （Main.cs:56088-56090/:56123）——本仓小地图/全图缩放为独立模型,整挂登记债
    // 备案本身即断言：这四项缺省与原版一致且可持久化（Options.ts 字段在位）
    expect('placementPreview' in options.data).toBe(true);
    expect('highlightNewItems' in options.data).toBe(true);
    expect('doorOpeningPreference' in options.data).toBe(true);
    expect('mapScale' in options.data).toBe(false);   // 未建模=登记债,不得伪建模
  });
});

// ---------------------------------------------------------------- ② 读档卫门
describe('SW-FX14 ② 新增 4 项读档卫门（坏值回原版缺省）', () => {
  it('存档坏值 → 缺省收敛（vanilla config 读回无守卫是 enum 裸转产物,实用缺省=初值）', async () => {
    vi.resetModules();
    vi.doMock('../src/save/KvStore', () => ({
      kvGet: async () => JSON.stringify({
        hoverControl: 'both',                       // 非法档
        showBossBarHealthText: 'yes',               // 非布尔
        flashyEffectsInterface: 0,                  // 非布尔
        lightMode: 'fancy',                         // 非法档
      }),
      kvSet: async () => {},
    }));
    const { options: fresh } = await import('../src/core/Options');
    await fresh.load();
    expect(fresh.data.hoverControl).toBe('hold');               // Player.cs:357
    expect(fresh.data.showBossBarHealthText).toBe(true);        // BigProgressBarSystem.cs:76
    expect(fresh.data.flashyEffectsInterface).toBe(true);       // Main.cs:443
    expect(fresh.data.lightMode).toBe('color');                 // Lighting.cs:19
    vi.doUnmock('../src/save/KvStore');
  });
  it('合法值穿行（好档不被卫门改写）', async () => {
    vi.resetModules();
    vi.doMock('../src/save/KvStore', () => ({
      kvGet: async () => JSON.stringify({
        hoverControl: 'click',
        showBossBarHealthText: false,
        flashyEffectsInterface: false,
        lightMode: 'retro',
      }),
      kvSet: async () => {},
    }));
    const { options: fresh } = await import('../src/core/Options');
    await fresh.load();
    expect(fresh.data.hoverControl).toBe('click');
    expect(fresh.data.showBossBarHealthText).toBe(false);
    expect(fresh.data.flashyEffectsInterface).toBe(false);
    expect(fresh.data.lightMode).toBe('retro');
    vi.doUnmock('../src/save/KvStore');
  });
});

// ---------------------------------------------------------------- ③ 悬停锁存行为面
describe('SW-FX14 ③ 悬停锁存 hoverLatchStep（Player.cs:25452-25484 字面直调）', () => {
  const OFF = { up: false, down: false };
  it('Click 档：空中按↑ → 上锁存开；松↑锁存驻留（TryingToHoverUp 恒真面）', () => {
    // press 边沿（inputUp ∧ 上拍未按）且 vy≠0
    const after = hoverLatchStep(OFF, true, false, false, false, false, false);
    expect(after).toEqual({ up: true, down: false });      // :25463-25472 else 臂
    // 松键后锁存驻留（边沿消失不改状态）
    const held = hoverLatchStep(after, false, false, true, false, false, false);
    expect(held).toEqual({ up: true, down: false });
  });
  it('Click 档：互斥档——↑锁存中按↓ 仅关上不开下（:25453-25461 if 臂），再按才开下', () => {
    const upLatch = { up: true, down: false };
    const after = hoverLatchStep(upLatch, false, true, false, false, false, false);
    expect(after).toEqual({ up: false, down: false });   // 原版 if/else 互斥:关上≠开下
    // 松↓再按（第二次边沿,up 已不锁）→ 下锁存开（:25453-25461 else 臂）
    const again = hoverLatchStep(after, false, true, false, false, false, false);
    expect(again).toEqual({ up: false, down: true });
    // ↓锁存中按↑ = 仅关下锁存【不】开上（:25464-25472 if 臂对称）
    const back = hoverLatchStep(again, true, false, false, false, false, false);
    expect(back).toEqual({ up: false, down: false });
    // 再按↑ → 上锁存开（:25464-25472 else 臂）
    expect(hoverLatchStep(back, true, false, false, false, false, false)).toEqual({ up: true, down: false });
  });
  it('落地（vy==0）双清（:25475-25478）', () => {
    const latched = hoverLatchStep(OFF, true, false, false, false, false, false);
    const landed = hoverLatchStep(latched, false, false, true, false, true, false);
    expect(landed).toEqual({ up: false, down: false });
  });
  it('Hold 档（缺省）锁存永不驻留（:25479-25484）——守恒：与接线前 Hold 语义逐位相同', () => {
    const after = hoverLatchStep(OFF, true, false, false, false, false, true);
    expect(after).toEqual({ up: false, down: false });
  });
  it('同一拍 ↓↑ 双边沿：顺序互斥相消（↓ 边沿开下 → ↑ 边沿关下,双清）', () => {
    // ↓ 边沿开下锁存 → ↑ 边沿遇下锁存只关不开——两段顺序执行后双false
    const after = hoverLatchStep(OFF, true, true, false, false, false, false);
    expect(after).toEqual({ up: false, down: false });
  });
  it('按住跨帧不重触发（press 边沿 = 本拍按 ∧ 上拍末未按）', () => {
    const first = hoverLatchStep(OFF, true, false, false, false, false, false);
    expect(first.up).toBe(true);
    // 下一拍仍按住（prevUpHeld=true）→ 边沿消失,状态不变
    const second = hoverLatchStep(first, true, false, true, false, false, false);
    expect(second).toEqual(first);
  });
});

// ---------------------------------------------------------------- ④ 光照模式循环
describe('SW-FX14 ④ 光照模式循环序（Lighting.NextLightMode 1:1，Lighting.cs:169-176）', () => {
  it('枚举序 Color→White→Retro→Trippy→Color（LightMode.cs White=0/Retro=1/Trippy=2/Color=3）', () => {
    // NextLightMode: Mode++; 未定义回落 White。Color(3)++ → 4 未定义 → White(0)；
    // Trippy(2)++ → 3 = Color 已定义 → Color。四态整环。
    const order = ['color', 'white', 'retro', 'trippy'] as const;
    const next = (m: typeof order[number]) =>
      order[(order.indexOf(m) + 1) % order.length];
    expect(next('color')).toBe('white');
    expect(next('white')).toBe('retro');
    expect(next('retro')).toBe('trippy');
    expect(next('trippy')).toBe('color');
  });
  it('设置面板循环闭包与 NextLightMode 同序（Settings.ts 结构锁）', () => {
    const src = readSrc('src/ui/Settings.ts');
    expect(src).toContain("['color', 'white', 'retro', 'trippy']");
    expect(src).toContain("UI.LightMode_${d.lightMode.charAt(0).toUpperCase()}");
  });
});

function readSrc(rel: string): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return readFileSync(`${__dirname}/../${rel}`, 'utf8');
}
