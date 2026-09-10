// SW-FX16 2026-09-10 键位重映射 M5 收口测试：消费面走活绑表 + 持久化 round-trip
// + 结构锁（防硬编码消费点回潮）。
// 金标锚（Terarria1457）：
//   - 快捷栏数字切栏 = 可重绑 trigger（Player.cs:25286-25330 读
//     Triggers.Current.Hotbar1..Hotbar10;缺省 D1..D0 = PlayerInput.cs:2091-2100）
//     ——不是硬编码 Digit1-0;
//   - 重绑语义 = CheckRebindingProcessKeyboard（PlayerInput.cs:1643-1692）
//     已绑键反选解绑/否则整表替换;保护名单 FixDerpedRebinds（:1550-1568）;
//   - 持久化载体 = input profiles.json（Main.cs:67488 + PlayerInput.cs:768-817）
//     ——本仓 options.json 为适配层（登记见 core/Keybinds.ts 文件头）;
//   - 版本闸迁移 = PlayerInputProfile.Load :114-142（<190/218/227/265 逐段补缺省）。
// 运行:npx vitest run tests/sw-fx16-keybinds.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bindsOf, isBound, assignBinding, sanitizeKeybinds, migrateLegacyDefaults,
  hotbarSlotOfCode,
} from '../src/core/Keybinds';
import { options } from '../src/core/Options';

const SRC = join(dirname(fileURLToPath(new URL(import.meta.url))), '..', 'src');
const readSrc = (p: string): string => readFileSync(join(SRC, p), 'utf8');

beforeEach(() => {
  options.data.keybinds = {};
});

describe('SW-FX16 快捷栏数字键走活绑表（hotbarSlotOfCode）', () => {
  it('缺省表：Digit1..Digit9→槽0..8，Digit0→槽9（原版缺省 PlayerInput.cs:2091-2100）', () => {
    for (let i = 1; i <= 9; i++) expect(hotbarSlotOfCode(`Digit${i}`)).toBe(i - 1);
    expect(hotbarSlotOfCode('Digit0')).toBe(9);
    // 非数字键不命中
    expect(hotbarSlotOfCode('KeyQ')).toBeNull();
    expect(hotbarSlotOfCode('Numpad1')).toBeNull();
  });

  it('改绑跟随：Hotbar1→KeyZ 后 KeyZ 选槽0、Digit1 失效（原版消费 trigger 非物理键）', () => {
    options.data.keybinds = assignBinding(options.data.keybinds, 'Hotbar1', 'KeyZ');
    expect(bindsOf('Hotbar1')).toEqual(['KeyZ']);
    expect(hotbarSlotOfCode('KeyZ')).toBe(0);
    expect(hotbarSlotOfCode('Digit1')).toBeNull();   // 决断行：旧 regex 永远命中 Digit1
  });

  it('显式解绑（空表）：该槽无键可选中（原版 trigger 空表同相）', () => {
    options.data.keybinds = assignBinding(options.data.keybinds, 'Hotbar3', 'Digit3'); // 已绑→反选解绑
    expect(options.data.keybinds.Hotbar3).toEqual([]);
    expect(hotbarSlotOfCode('Digit3')).toBeNull();
    // 其余槽不受影响
    expect(hotbarSlotOfCode('Digit4')).toBe(3);
  });

  it('一键多 action：同一键可同时命中槽位与其它 action（原版允许）', () => {
    options.data.keybinds = { Hotbar5: ['KeyF'], Jump: ['KeyF'] };
    expect(hotbarSlotOfCode('KeyF')).toBe(4);
    expect(isBound('Jump', 'KeyF')).toBe(true);
  });
});

describe('SW-FX16 改键 round-trip（assign → 持久化清洗 → 读档回放）', () => {
  it('assignBinding 产物经 sanitizeKeybinds+JSON round-trip 后 bindsOf 等值', () => {
    let map = assignBinding({}, 'MapFull', 'KeyN');        // 改绑
    map = assignBinding(map, 'Grapple', 'KeyE');           // 同键反选=解绑(Grapple 原绑 KeyE)
    map = assignBinding(map, 'QuickMount', 'KeyG');        // 换键
    // 模拟落盘+读档：序列化 → 清洗（Options.load :406-409 同序）
    const persisted = JSON.parse(JSON.stringify(sanitizeKeybinds(map)));
    options.data.keybinds = migrateLegacyDefaults(sanitizeKeybinds(persisted));
    expect(bindsOf('MapFull')).toEqual(['KeyN']);
    expect(bindsOf('Grapple')).toEqual([]);                // 反选解绑存活读档（合法态）
    expect(bindsOf('QuickMount')).toEqual(['KeyG']);
    expect(bindsOf('Jump')).toEqual(['Space']);            // 未改 action 走缺省
  });

  it('迁移卫门不吞新改键：LEGACY_KEYBIND_DEFAULTS 只摘「与旧缺省全等」条目', () => {
    options.data.keybinds = migrateLegacyDefaults({ Inventory: ['Escape', 'KeyE'] });
    expect(options.data.keybinds.Inventory).toBeUndefined();   // 旧缺省原样落盘 → 迁出
    expect(bindsOf('Inventory')).toEqual(['Escape']);
    options.data.keybinds = migrateLegacyDefaults({ Inventory: ['KeyI'] });
    expect(options.data.keybinds.Inventory).toEqual(['KeyI']); // 真自定义保留
  });
});

// ---- 结构锁（sw-bn2 同款源文本锚,防硬编码消费点回潮）----
describe('SW-FX16 消费面结构锁', () => {
  it('Game.ts 快捷栏派发走 hotbarSlotOfCode，regex /^Digit 面已退役', () => {
    const game = readSrc('core/Game.ts');
    expect(game).toContain('hotbarSlotOfCode(code)');
    // 旧硬编码 regex 的【代码形态】不复存在（exec 调用;注释提及不锁）
    expect(game).not.toMatch(/\/\^Digit\(\[0-9\]\)\$\/\.exec/);
  });

  it('MobileControls 地图/旅程钮发活绑表首码，死码字面已退役', () => {
    const mc = readSrc('ui/MobileControls.ts');
    expect(mc).toContain("bindsOf('MapFull')[0]");
    expect(mc).toContain("bindsOf('ToggleCreativeMenu')[0]");
    expect(mc).not.toContain("tapVirtual('KeyM')");
    expect(mc).not.toContain("tapVirtual('KeyC')");
    // 聊天钮 'Enter' 保留 = 原版聊天键硬编码面（KnownTriggers 59 项无 Chat,
    // PlayerInput.cs:229-237——非债,登记性保留）
    expect(mc).toContain("tapVirtual('Enter')");
  });

  it('main.ts 相机模式门：Shift 豁免收窄到调试保留集（全键豁免退役）', () => {
    const main = readSrc('main.ts');
    expect(main).toContain('SHIFT_DEBUG_RESERVED');
    // 旧「全键 Shift 豁免」形态不得回潮
    expect(main).not.toMatch(/!e\.shiftKey && isBound\('ToggleCameraMode'/);
    // 保留集覆盖全部 Shift 组合调试臂（F1/F2 像素画·无敌,F3 碰撞盒,F4 迷雾,F5 录制,F10 传送）
    for (const k of ['F1', 'F2', 'F3', 'F4', 'F5', 'F10']) {
      expect(main).toMatch(new RegExp(`SHIFT_DEBUG_RESERVED[^\\n]*'${k}'`));
    }
  });

  it('spectateKeyExits 维持表驱动（keybinds 批登记面的回归守卫）', () => {
    const game = readSrc('core/Game.ts');
    // :4399-4404 退出键族 = isBound(Jump/Inventory/SmartSelect/SmartCursor/QuickMount/
    // QuickHeal/QuickMana/ToggleCreativeMenu/Grapple/Hotbar 族)
    expect(game).toMatch(/spectateKeyExits[\s\S]{0,700}isBound\('Grapple', code\)/);
  });
});
