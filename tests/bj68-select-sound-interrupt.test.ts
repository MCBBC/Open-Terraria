// BJ68（2026-09-14）FX51 剩债两笔守卫：
// ①热栏切换音 SoundID 12=MenuTick（Player.cs:492,Select :490-493 变更拍播）——原版
//   三臂（数字键 :25370 / ±键+滚轮 :32033）全汇 Select → 本仓数字键臂/±臂/
//   hotbarWheelSwitch 同拍接通（单边禁）。音效面断言=播放调用计数
//   （Game.prototype 直驱 hotbarWheelSwitch,mock this 计数口）。
// ②TryInterruptingItemUsage（P.cs:24353-24440）1:1 定义面移植 = **死码平价**：
//   1456/1457/1458 反编译全树零调用点（1.4.0.5 无此方法）→ 原版本体不执行,
//   本仓同构（定义面在+heldProj 字段/复位在,**无调用点**）。中断面断言=heldProj 态
//   （IsInterruptible aiStyle160 门 / Interrupt=Kill+heldProj=-1+itemAnimation=0+
//   itemTime=0,Projectile.cs:22370-22392）。死码平价结构锁防未来误接线。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Game } from '../src/core/Game';

const ROOT = join(__dirname, '..');
const gameSrc = readFileSync(join(ROOT, 'src/core/Game.ts'), 'utf8');
const playerSrc = readFileSync(join(ROOT, 'src/entities/Player.ts'), 'utf8');

/** Game.prototype 直驱夹具：最小 mock this（hotbarWheelSwitch 消费面） */
function wheelHarness(prevSelected: number, smartHotbar = prevSelected) {
  const sfx: string[] = [];
  const self = {
    smartSelectHotbar: smartHotbar,
    player: { inv: { selected: prevSelected }, afkCounter: 9 },
    cb: { onInventoryChanged: () => {} },
    playSfx: (name: string) => { sfx.push(name); },
  };
  return { self, sfx };
}

describe('BJ68 热栏切换音（SoundID 12=MenuTick,Player.cs:492）', () => {
  it('①滚轮臂变更拍播一声（hotbarWheelSwitch 直驱计数）', () => {
    const h = wheelHarness(3);
    (Game.prototype as unknown as { hotbarWheelSwitch(n: number): void })
      .hotbarWheelSwitch.call(h.self, 1);                   // 下滚 1 档
    expect(h.self.player.inv.selected).toBe(2);             // -notches → 上一格
    expect(h.sfx).toEqual(['menuTick']);
    expect(h.self.player.afkCounter).toBe(0);               // Select(:498) 同款清零仍在
  });

  it('②滚轮臂落到已选槽不响（selected==item → Select :495 else 支无音）', () => {
    // target 以 smartSelectHotbar 为基准(:32033 Hotbar+num):3-1=2,inv.selected 已是 2 → 无变更
    const h = wheelHarness(2, 3);
    (Game.prototype as unknown as { hotbarWheelSwitch(n: number): void })
      .hotbarWheelSwitch.call(h.self, 1);
    expect(h.self.player.inv.selected).toBe(2);
    expect(h.sfx).toEqual([]);
  });

  it('③环绕切换照播（0←上滚/9→下滚）', () => {
    const h0 = wheelHarness(0);
    (Game.prototype as unknown as { hotbarWheelSwitch(n: number): void })
      .hotbarWheelSwitch.call(h0.self, 1);
    expect(h0.self.player.inv.selected).toBe(9);            // 双 mod 环绕
    expect(h0.sfx).toEqual(['menuTick']);
  });

  it('④结构锁:数字键臂/±臂/滚轮臂四处 Select 消费面全接 menuTick（单边禁）', () => {
    expect(gameSrc).toMatch(/if \(prevSel !== hotbarSlot\) this\.playSfx\('menuTick'\)/);
    expect(gameSrc).toMatch(/if \(prevSel !== this\.player\.inv\.selected\) this\.playSfx\('menuTick'\)/);
    expect(gameSrc).toMatch(/if \(prevSel !== target\) this\.playSfx\('menuTick'\)/);
  });
});

describe('BJ68 TryInterruptingItemUsage 死码平价（P.cs:24353-24440）', () => {
  /** interrupt 直驱夹具：heldProj+kite 弹 + 可调滚轮/背包门 */
  function harness(heldProj: number, projIds: number[], wheel = 0, inventoryOpen = false) {
    const projs = projIds.map((vid, i) => ({ id: 100 + i, projId: vid, dead: false }));
    const player = { heldProj, itemAnimTicks: 5, useTime: 7 };
    const self = {
      player,
      entities: { projectiles: projs },
      input: { wheelDelta: wheel },
      renderer: { fullMap: { open: false }, captureMode: { active: false } },
    };
    (globalThis as { window?: unknown }).window = { __swUI: { inventoryOpen } };
    return { self, player, projs };
  }

  it('①持 aiStyle160 风筝弹(766)+数字键沿 → 中断面四件套（Kill+heldProj=-1+两动画计数清零）', () => {
    const h = harness(100, [766]);
    (Game.prototype as unknown as { tryInterruptingItemUsage(b: boolean): void })
      .tryInterruptingItemUsage.call(h.self, true);
    expect(h.projs[0].dead).toBe(true);                     // Projectile.Kill 等价
    expect(h.player.heldProj).toBe(-1);                     // :22385
    expect(h.player.itemAnimTicks).toBe(0);                 // :22386 itemAnimation=0
    expect(h.player.useTime).toBe(0);                       // :22387 itemTime=0
  });

  it('②非中断面弹（190 食人鱼枪,aiStyle39）触发不杀（IsInterruptible 唯 aiStyle160 支）', () => {
    const h = harness(100, [190]);
    (Game.prototype as unknown as { tryInterruptingItemUsage(b: boolean): void })
      .tryInterruptingItemUsage.call(h.self, true);
    expect(h.projs[0].dead).toBe(false);
    expect(h.player.heldProj).toBe(100);                    // 原样
  });

  it('③滚轮臂:wheelDelta≠0 且门全开 → 中断;背包开（playerInventory 门 :24426）→ 否', () => {
    const hA = harness(100, [845], 1);
    (Game.prototype as unknown as { tryInterruptingItemUsage(b: boolean): void })
      .tryInterruptingItemUsage.call(hA.self, false);
    expect(hA.player.heldProj).toBe(-1);
    const hB = harness(100, [845], 1, true);                // inventoryOpen=true
    (Game.prototype as unknown as { tryInterruptingItemUsage(b: boolean): void })
      .tryInterruptingItemUsage.call(hB.self, false);
    expect(hB.player.heldProj).toBe(100);
    const hC = harness(100, [845], 0);                      // 无任何触发
    (Game.prototype as unknown as { tryInterruptingItemUsage(b: boolean): void })
      .tryInterruptingItemUsage.call(hC.self, false);
    expect(hC.player.heldProj).toBe(100);
  });

  it('④无持弹（heldProj=-1）早退（:24355-24361 flag 门）', () => {
    const h = harness(-1, [766]);
    (Game.prototype as unknown as { tryInterruptingItemUsage(b: boolean): void })
      .tryInterruptingItemUsage.call(h.self, true);
    expect(h.projs[0].dead).toBe(false);
  });

  it('⑤死码平价结构锁:src 内调用语法恰 1 处（定义自身）+ Player 持有字段/复位', () => {
    const calls = gameSrc.match(/tryInterruptingItemUsage\(/g) ?? [];
    expect(calls.length).toBe(1);                           // 定义面=1;任何调用点=2 → 红
    expect(playerSrc).toMatch(/heldProj = -1;/);            // 字段（P.cs:1499）
    expect(playerSrc).toMatch(/this\.heldProj = -1;/);      // 每拍复位（P.cs:24570）
  });
});
