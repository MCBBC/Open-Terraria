// ★BJ508 Quick Dash 热键绑定（用户实报：原版支持冲刺绑定热键，本仓缺位——定谳+落刀）。
//
// 原版全链（亲读 1457 反编译，锚逐条钉死）：
//   ① Trigger 注册：TriggerNames.cs:119 `Dash = "Dash"`；PlayerInput.cs:229-237
//      KnownTriggers 尾位；TriggersSet.cs:247-257 `Dash` 属性 ↔ KeyStatus["Dash"]。
//   ② 键位缺省：PlayerInput.cs:2062-2450 Reset 四预设（Redigit/Yoraiz0r/ConsolePS/
//      ConsoleXBox）× 四输入档【零 Dash 条目】= Keyboard 缺省无绑定，重绑面板自绑
//      （UIManageControls.cs:277-281 键盘页序列 …ToggleCameraMode→ArmorSetAbility→
//      Dash→sp20；显示名 UI.Dash = "Dash"/"冲刺"）。
//   ③ 消费面：TriggersSet.cs:825-826 `p.controlDash = Dash; p.releaseDash |= !p.controlDash`
//      → Player.DashMovement :21577-21576 else（dashDelay==0 就绪段）→
//      DoCommonDashHandle :21724-21783：
//        · 键面（num 支）：:21738 `controlDash && !CCed && releaseDash` →
//          num = direction（facing），持反向时改持向（:21740-21747 num3 == −num2 → num4 = num3）
//        · 双击支：:21749/:21764 `(controlRight && releaseRight) & flag`，flag =
//          :21737 `Settings.DashControl == DashPreference.AllowDoubleTap`（Player.cs:365
//          缺省 AllowDoubleTap；设置 UI = UIManageControls.cs:653-663 case "sp20"）——
//          【键面无 flag 门，双击关死键面照活】
//        · 执行门：:21751 `dashTime > 0 || num == 1` / :21766 `dashTime < 0 || num == -1`
//          （键面即触不等窗；双击沿须 ±15 窗活）
//        · 装备门：:21579 `dash <= 0 || (mount.Active && !MountID.Sets.CanDash) → return`
//          （无冲刺配饰 dashType=0 → dash=0 → 键面零冲刺；dashType 来源 = Tabi 977/
//          忍者 gearing 984→1、克盾 3097→2、日耀套→3、水晶刺客套→5、坐骑 62-65→6）
//        · cooldown：dashDelay 三态——发起 -1（:21595 等）→ 滑行衰减落档 dashDelay=num17
//          （:21567；基础 20/克盾 30）→ 倒数（:21422）回 0 再就绪；期间 DoCommonDashHandle
//          整体不跑 = 键面/双击窗皆不登记
//        · 闩：:21779-21782 `if (dashing && controlDash) releaseDash = false` ——
//          按住不重触，任意一拍松键（:826 置位臂）即重臂
//   ④ 观战退出族：Player.cs:17200 HandleSpectatingControls 键项含 controlDash。
//
// 本仓承载：Keybinds.ts（注册/缺省空表/UI.Dash 行）+ Game.ts（注入 controlDash 电平 +
// releaseDash 置位臂；观战清零；spectateKeyExits 补 Dash）+ Player.ts（num 支/执行门/
// 闩清位臂/flag 门）+ Options.ts（doubleTapDash=DashControl）+ Settings.ts（sp20 toggle）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { BuffType } from '../src/stats/Buffs';
import {
  KEYBIND_ACTIONS, DEFAULT_KEYBINDS, isBound, actionsForCode, keybindActionLabel,
} from '../src/core/Keybinds';
import { options } from '../src/core/Options';

const iid = (vid: number): number => ITEM_BY_KEY[vanillaItemKey(vid)!];

const mkWorld = (): World => {
  const w = new World(160, 160, 33, 'bj508');
  for (let x = 12; x <= 140; x++) w.store.setTileSilent(x, 30, 1 /* dirt */);
  return w;
};

const fakeHooks = (w: World, p?: Player, enemies: unknown[] = []) => ({
  world: w,
  player: p,
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
  recLog: () => {},
  achievements: undefined,
  scene: {},
});

// 出生点 tile 80（世界中部）——40*16=640 恰压 bordersMovement 左界 B=640 钳制线，
// 左向冲刺会被 `x<B → x=B; vx=0`（Player.ts:9707）边界钳清速，与被测面无关。
const mkPlayer = (w: World): Player => new Player(80 * 16, 27 * 16, new Inventory());

const tick = (p: Player, w: World): void => { p.fixedUpdate(1 / 60, fakeHooks(w, p) as never); };

/** 注入面（Game.ts 同序）：controlDash 电平 + releaseDash 置位臂（TriggersSet.cs:826） */
function injectDash(p: Player, held: boolean): void {
  p.inputDash = held;
  p.releaseDash ||= !p.inputDash;
}

/** 臂位拍：真实链路里键未按的任意一拍即把 releaseDash 置位（:826 语义） */
function armDash(p: Player, w: World): void {
  injectDash(p, false);
  tick(p, w);
  expect(p.releaseDash).toBe(true);
}

/** 滑行衰减循环：直到 dashDelay 落冷却档（>0），返回采样值（=num17 设定值） */
function glideToCooldown(p: Player, w: World): number {
  let guard = 0;
  while (p.dashDelay <= 0 && guard++ < 300) { injectDash(p, false); tick(p, w); }
  return p.dashDelay;
}

// ============ ① 键位注册 + 缺省值 ============
describe('BJ508① Dash 键注册 + 缺省（原版 Keyboard 档无绑定）', () => {
  it('Dash 入 KEYBIND_ACTIONS 尾位（UIManageControls.cs:277-281 键盘页序）', () => {
    expect(KEYBIND_ACTIONS.includes('Dash')).toBe(true);
    expect(KEYBIND_ACTIONS[KEYBIND_ACTIONS.length - 1]).toBe('Dash');   // ArmorSetAbility 不入表,Dash 顶其尾位
    expect(KEYBIND_ACTIONS[KEYBIND_ACTIONS.length - 2]).toBe('ToggleCameraMode');
  });

  it('缺省空表 = 原版 Redigit Keyboard 档无 Dash 条目（PlayerInput.cs:2069-2108）', () => {
    expect(DEFAULT_KEYBINDS.Dash).toEqual([]);
    expect(isBound('Dash', 'KeyD')).toBe(false);      // 缺省下任何键都不触发 Dash
    // 自绑后 isBound/actionsForCode 走通用通道（重绑语义同 M5）
    options.data.keybinds = { Dash: ['KeyV'] };
    expect(isBound('Dash', 'KeyV')).toBe(true);
    expect(actionsForCode('KeyV')).toContain('Dash');
    options.data.keybinds = {};
  });

  it('显示名走 UI.Dash 官译（en "Dash"/zh-Hans "冲刺"，Terraria.Localization.Content.*.json:419）', () => {
    expect(keybindActionLabel('Dash').length).toBeGreaterThan(0);   // 不抛+非空（l10n 未加载回退链）
    const built = JSON.parse(readFileSync(
      fileURLToPath(new URL('../public/l10n/zh-Hans.json', import.meta.url)), 'utf8',
    )) as { UI: Record<string, string> };
    expect(built.UI.Dash).toBe('冲刺');
    expect(built.UI.DoubleTapDash).toBe('双击冲刺');
    const builtEn = JSON.parse(readFileSync(
      fileURLToPath(new URL('../public/l10n/en-US.json', import.meta.url)), 'utf8',
    )) as { UI: Record<string, string> };
    expect(builtEn.UI.Dash).toBe('Dash');
  });

  it('doubleTapDash 缺省 true = DashControl 缺省 AllowDoubleTap（Player.cs:365）', () => {
    expect(options.data.doubleTapDash).toBe(true);
  });
});

// ============ ②③ 装备门 + 触发链 ============
describe('BJ508② 装备冲刺配饰 + 按键 → 冲刺（触发链）', () => {
  it('克盾 3097（dashType 2）+ 按住 Dash 键 → 发起 14.5×dir 冲刺', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    p.inv.armor[3] = { id: iid(3097), stack: 1 };        // Shield of Cthulhu → eq.dash=2
    p.facing = 1;
    armDash(p, w);
    injectDash(p, true);
    tick(p, w);
    expect(p.vx).toBeCloseTo(14.5, 5);                   // :21619 dash2=14.5×dir
    expect(p.dashDelay).toBe(-1);                        // :21626 进入滑行
    expect(p.eocDash).toBe(15);                          // :21627 冲撞窗
    expect(p.releaseDash).toBe(false);                   // :21779-21782 闩清位
    // 按住不重触（闩）：走完滑行+冷却，期间按住不再发起
    for (let i = 0; i < 100; i++) { injectDash(p, true); tick(p, w); }
    expect(p.dashDelay).toBe(0);                         // 已回就绪
    expect(Math.abs(p.vx)).toBeLessThan(15);             // 未重触（vx 已按阻尼收敛）
  });

  it('忍者足具 977（dashType 1）+ 按键（无方向）→ 朝 facing 冲 16.9', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    p.inv.armor[3] = { id: iid(977), stack: 1 };         // Tabi → eq.dash=1
    p.facing = -1;                                       // 朝左
    armDash(p, w);
    injectDash(p, true);
    tick(p, w);
    expect(p.vx).toBeCloseTo(-16.9, 5);                  // :21588 dash1=16.9×dir，dir=facing=-1
    expect(p.dashDelay).toBe(-1);
    expect(p.eocDash).toBe(0);                           // dash1 无冲撞窗
  });

  it('持反向按键 → 改持向冲（num3 == −num2 → num4 = num3，:21740-21747）', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    p.inv.armor[3] = { id: iid(3097), stack: 1 };
    p.facing = 1;
    armDash(p, w);                                       // inputX=0 臂位（facing 不翻转）
    // 朝向锁定期（挥砍 animBusy && !itemUseTurn → 5442 翻转门闭）+ 本拍置反向：
    // facing 恒 1 而持向为左 = 原版「持反向改持向」唯一可达语境
    p.itemAnimTicks = 20;
    p.itemUseTurn = false;
    p.inputX = -1;
    injectDash(p, true);
    tick(p, w);
    expect(p.vx).toBeCloseTo(-14.5, 5);                  // 冲向 = 持向（左，反向）
  });

  it('持同向按键 → 朝 facing 冲（num3 == num2 不翻向）', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    p.inv.armor[3] = { id: iid(977), stack: 1 };
    p.facing = 1;
    p.inputX = 1;                                        // 按住右（同向）
    armDash(p, w);
    injectDash(p, true);
    tick(p, w);
    expect(p.vx).toBeCloseTo(16.9, 5);
  });
});

describe('BJ508③ 无配饰按键 → 零冲刺（装备门 :21579 dash<=0）', () => {
  it('裸装按 Dash 键：无位移爆发、无滑行态、闩不清位', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    p.facing = 1;
    armDash(p, w);
    injectDash(p, true);
    tick(p, w);
    expect(p.vx).toBe(0);                                // dash==0 → DoCommonDashHandle 不跑
    expect(p.dashDelay).toBe(0);
    expect(p.eocDash).toBe(0);
    expect(p.releaseDash).toBe(true);                    // 无冲刺 → 闩不清位（dashing=false）
  });

  it('非 CanDash 坐骑（猪龙 type 2）+ 配饰 + 按键：零冲刺（:21579 return）', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    p.inv.armor[3] = { id: iid(977), stack: 1 };
    p.mount.active = true;
    (p.mount as unknown as { type: number }).type = 2;   // 非 CanDash 集 {56..65}
    p.facing = 1;
    armDash(p, w);
    injectDash(p, true);
    tick(p, w);
    expect(Math.abs(p.vx)).toBeLessThan(1);              // 无冲刺赋速
    expect(p.dashDelay).toBe(0);
    expect(p.dashT).toBe(0);                             // 窗也不落
    expect(p.releaseDash).toBe(true);                    // 门拒不落标（dashing=false）
  });
});

// ============ ④ 与双击面协同（原版语义） ============
describe('BJ508④ 与双击面协同（原版语义）', () => {
  it('双击冲刺开着：键面与双击沿并存——双击沿照常登记 ±15 窗', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    p.inv.armor[3] = { id: iid(977), stack: 1 };
    p.facing = 1;
    p.inputX = 0; tick(p, w);
    p.inputX = 1; tick(p, w);                            // 首击右向 → 登记窗
    expect(p.dashT).toBe(15);                            // :21761 dashTime = 15
    p.inputX = 0; tick(p, w);
    p.inputX = 1; tick(p, w);                            // 二击 → 消费
    expect(p.vx).toBeCloseTo(16.9, 5);
  });

  it('双击冲刺关死（OnlyThroughHotkeys）：双击沿零触发、键面照活（:21737 flag 只门双击支）', () => {
    options.data.doubleTapDash = false;
    try {
      const w = mkWorld();
      const p = mkPlayer(w);
      p.inv.armor[3] = { id: iid(977), stack: 1 };
      p.facing = 1;
      // 双击沿完整序（首击+二击）——关死后零窗零触发（仅步行加速）
      p.inputX = 0; tick(p, w);
      p.inputX = 1; tick(p, w);
      expect(p.dashT).toBe(0);                           // 窗不登记（flag=false）
      expect(p.dashDelay).toBe(0);                       // 不发起
      p.inputX = 0; tick(p, w);
      p.inputX = 1; tick(p, w);
      expect(p.dashT).toBe(0);
      expect(p.dashDelay).toBe(0);                       // 二击不触发
      expect(Math.abs(p.vx)).toBeLessThan(2);            // 步行加速量级（非 16.9 爆发）
      // 键面照活
      p.inputX = 0; tick(p, w);
      armDash(p, w);
      injectDash(p, true);
      tick(p, w);
      expect(p.vx).toBeCloseTo(16.9, 5);
      expect(p.dashDelay).toBe(-1);
    } finally {
      options.data.doubleTapDash = true;
    }
  });

  it('键面松键重臂：松→按 → 再次冲刺（:826 置位臂语义）', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    p.inv.armor[3] = { id: iid(977), stack: 1 };
    p.facing = 1;
    armDash(p, w);
    injectDash(p, true); tick(p, w);                     // 第一冲
    expect(p.vx).toBeCloseTo(16.9, 5);
    expect(p.releaseDash).toBe(false);
    for (let i = 0; i < 120; i++) { injectDash(p, false); tick(p, w); }   // 松键走完滑行+冷却
    expect(p.dashDelay).toBe(0);
    p.x = 80 * 16;                                       // 回中（滑行漂移近 bordersMovement 右界,B=640 钳制与被测面无关）
    injectDash(p, true); tick(p, w);                     // 再按 → 重臂发起
    expect(p.vx).toBeCloseTo(16.9, 5);
    expect(p.releaseDash).toBe(false);
  });

  it('CCed（石化）按键零冲刺（:21738 !CCed 门）', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    p.inv.armor[3] = { id: iid(977), stack: 1 };
    p.facing = 1;
    armDash(p, w);
    p.buffs.apply(BuffType.Stoned, 5);                   // 石化 → cced（internal 枚举 82=vanilla 156）
    injectDash(p, true);
    tick(p, w);
    expect(p.vx).toBe(0);
    expect(p.dashDelay).toBe(0);
  });
});

// ============ ⑤ cooldown ============
describe('BJ508⑤ cooldown（dashDelay 三态）', () => {
  it('克盾滑行结束 → 冷却档恰 30（:21567 num17 dash2=30）；冷却期按键不发起不登记窗', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    p.inv.armor[3] = { id: iid(3097), stack: 1 };
    p.facing = 1;
    armDash(p, w);
    injectDash(p, true); tick(p, w);                     // 发起
    expect(p.dashDelay).toBe(-1);
    const cd = glideToCooldown(p, w);
    expect(cd).toBe(30);                                 // :21459 dash2 覆写 num17=30
    injectDash(p, true); tick(p, w);                     // 冷却期按键
    expect(p.dashDelay).toBeGreaterThan(0);              // 不发起（仍在冷却倒数）
    expect(p.dashT).toBe(0);                             // 双击窗也不登记（冷却期 DoCommonDashHandle 不跑）
  });

  it('基础档恰 20（Tabi，:21431 num17 基值）vs 克盾 30 覆写', () => {
    const w = mkWorld();
    const p1 = mkPlayer(w);
    p1.inv.armor[3] = { id: iid(977), stack: 1 };
    p1.facing = 1;
    armDash(p1, w);
    injectDash(p1, true); tick(p1, w);
    const t1 = glideToCooldown(p1, w);
    expect(t1).toBe(20);                                 // 基础档 num17=20
  });
});

// ============ 观战退出族（Player.cs:17200 controlDash） ============
describe('BJ508⑥ 观战退出族补 Dash', () => {
  it('spectateKeyExits 含 Dash 绑定键（结构锁）', async () => {
    const src = readFileSync(fileURLToPath(new URL('../src/core/Game.ts', import.meta.url)), 'utf8');
    expect(src).toMatch(/isBound\('Dash', code\)/);
    expect(src).toMatch(/player\.inputDash = inp\.downAction\('Dash'\)/);
    expect(src).toMatch(/player\.releaseDash \|\|= !player\.inputDash/);
  });
});
