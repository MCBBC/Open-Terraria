// ★RB15d-FX51「暂停期滚轮双偏」定谳翻案锁（2026-09-14）。
// RB15d 原发现：暂停期 fullMap 缩放支/背包 DOM 滚轮支仍可用（原版暂停期消费段整段
// 不跑 Main.cs:17350-17356）。逐域复核定谳：
//   ①fullMap 缩放支=【伪发现】：Game.ts 滚轮分支树（:8344）宿主=private fixedUpdate
//     （:7746），全仓唯一调用点=:7531，位于 frame() `if (!this.paused)` 门内 while
//     循环（:7523-7527）⇒ 暂停期整树死，与原版「消费段宿主=Player.Update,CanPauseGame
//     真 → DoUpdate_WhilePaused 后 Main.Update return（:17372-17377）;gameMenu :17346;
//     !CanUpdateGameplay :17350-17356」同相。首 commit（02c8ad21）即同构（wheel :282 ⊂
//     fixedUpdate :244;调用点 :236 已在 !paused 门内）——该半从未成立。
//   ②背包 DOM 支=【2026-09-16 复核二次翻案：伪发现，不动刀】。原判只引
//     Player.cs:25402（非暂停宿主,1458 :25400 零漂移）推出「暂停期宿主死」——漏了
//     DoScrollingInInventory 的【第二个宿主】：暂停宿主 DoUpdate_WhilePaused 本体
//     （Main.cs:17547-17551,1458 :17549 零漂移）`if (playerInventory) {
//     RefreshInfoAccs(); DoScrollingInInventory(); dropItemCheck(); }`——暂停期在
//     playerInventory 态【重跑】背包滚轮消费（CanPauseGame autoPause playerInventory 臂
//     :17500 恰是「暂停∧playerInventory」态 ⇒ 原版滚轮【活】,autoPause 语义本体=
//     冻结世界照常操作背包/合成/滚配方）。逐态对拍（本仓 DOM 滚轮 ↔ 原版）：
//     - autoPause∧背包开（applyAutoPauseUI Game.ts:7790）=paused∧invPanel block
//       ↔ 原版 :17549 活面=同相 ✓（此处照滚正是原版同相,非 bug）
//     - 暂停浮层（ingameOptionsWindow :17496 臂）=原版 Open() 收背包
//       （IngameOptions.cs:70 playerInventory=false,RB8c 口径）⇒ :17547 块跳过=死;
//       本仓 openInGamePause（main.ts:363）同样收背包 → invPanel display none →
//       UI.ts:8952 playerInventory 门早退+元素监听随面板隐没=死=同相 ✓
//     - 表情/手册面板（IngameFancyUI 惯例,UI.ts:1234/:1300）不收背包=paused∧invPanel
//       block ↔ 原版 :17549 块只查 playerInventory（editSign/editChest 都不拦）=活=同相 ✓
//     ⇒ 本仓不存在「paused∧背包 DOM 可达∧原版死」的态,补 `if (game.paused) return;`
//     反而是真回归（砍 autoPause 暂停期合成网格/配方滚轮,违背原版 :17549）+H3 死码
//     过度矫正反模式 ⇒ 不动刀,原「修法登记」作废,改立【禁门锁】H4。
//   ③内门不对称=原版结构：滚轮段唯一内门=热栏臂 :32028（!inFancyUI∧!ingameOptionsWindow
//     → 本仓 !paused,RB8c 口径）；map 臂(:25387-25396)/背包臂(:25404)【无】内门——
//     暂停死亡全部来自宿主。对 map/背包支补 !paused = 对宿主已死路径加休眠钩
//     （红队卫生面「死码」反模式），H3 同时防该过度矫正回潮。
//     ★2026-09-16 勘误：本条对 Player.cs 消费段成立，但「宿主死」推论只覆盖
//     !playerInventory 态——playerInventory 态的暂停宿主=:17549（见②二次翻案），
//     背包臂滚轮在暂停期经 DoUpdate_WhilePaused 存续，与 map 臂（暂停全死）不对称。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const gameSrc = readFileSync(join(ROOT, 'src/core/Game.ts'), 'utf8');
const uiSrc = readFileSync(join(ROOT, 'src/ui/UI.ts'), 'utf8');

describe('RB15d-FX51 暂停期滚轮：宿主死机制结构锁（翻案存证）', () => {
  it('H1 fixedUpdate 全仓唯一调用点在 frame() !paused 门体内（暂停期消费宿主死=:17372-17377 同相）', () => {
    const calls = [...gameSrc.matchAll(/this\.fixedUpdate\(FIXED_DT\)/g)].map((m) => m.index!);
    expect(calls, 'fixedUpdate 调用点必须唯一（第二调用点=暂停窗活路径,滚轮/生成/液体全破）').toHaveLength(1);
    const gate = gameSrc.lastIndexOf('if (!this.paused) {', calls[0]);
    expect(gate).toBeGreaterThan(-1);
    // 门与调用点之间不得出现同缩进层（4 空格）块闭合——出现即调用点已不在门体内
    const between = gameSrc.slice(gate, calls[0]);
    expect(/^    \}/m.test(between), '调用点脱离 !paused 门体=暂停期滚轮/生成/液体全部复活').toBe(false);
  });

  it('H2 滚轮分支树宿主=fixedUpdate（树在签名与下一方法之间,移出=暂停窗活路径,即红）', () => {
    const sig = gameSrc.indexOf('private fixedUpdate(dt: number) {');
    const next = gameSrc.indexOf('private tryAutoManaPotion(): boolean {', sig);
    const tree = gameSrc.indexOf('if (inp.wheelDelta !== 0) {');
    expect(sig).toBeGreaterThan(-1);
    expect(next).toBeGreaterThan(sig);
    expect(tree, '滚轮树必须仍在 fixedUpdate 体内（宿主死机制;FX51 B 组支序锁的宿主前提）')
      .toBeGreaterThan(sig);
    expect(tree).toBeLessThan(next);
  });

  it('H3 树内 !paused 内门恰一个=热栏臂（:32028 唯一内门;map/背包臂补门=死码过度矫正,即红）', () => {
    const tree = gameSrc.indexOf('if (inp.wheelDelta !== 0) {');
    const treeEnd = gameSrc.indexOf('// ★滚轮视野缩放移除', tree);
    const block = gameSrc.slice(tree, treeEnd);
    const gates = [...block.matchAll(/!this\.paused/g)].length;
    expect(gates).toBe(1);   // 现状=热栏臂 else if (!this.paused)（FX51 :32028 内门移植）
    expect(block).toContain('} else if (!this.paused) {');
  });

  it('H4 【禁门锁·②二次翻案+BJ103 失焦旁支例外】UI.ts 背包两滚轮处理器不得加全暂停态早退（原版暂停宿主 DoUpdate_WhilePaused Main.cs:17547-17551 在 playerInventory 态重跑 DoScrollingInInventory=暂停∧背包开滚轮活面;补门=砍 autoPause 暂停期合成滚轮真回归）；但失焦暂停旁支例外：原版 FocusHelper.UpdateFocus→Main.cs:17303-17316/1458 :17309-17322 在 CanPauseGame(:17371)【之前】return → :17547-17551 宿主失焦期整段不可达=滚轮死（BJ103 刀,game.focusPaused 专名早退,大写 P 不命中本条 /paused/ 小写锁）', () => {
    const span = (startMark: string, endMark: string): string => {
      const a = uiSrc.indexOf(startMark);
      expect(a, `锚缺失：${startMark}`).toBeGreaterThan(-1);
      const b = uiSrc.indexOf(endMark, a);
      expect(b, `闭锚缺失：${endMark}`).toBeGreaterThan(a);
      return uiSrc.slice(a, b);
    };
    const tick = span('private vinvGridWheelTick(e: WheelEvent): void {', 'private vinvUpdateCraftGrid');
    const craft = span('private vinvCraftWheel(e: WheelEvent): void {', 'private vinvCraftFocusGoto');
    for (const [name, body] of [['vinvGridWheelTick', tick], ['vinvCraftWheel', craft]] as const) {
      expect(body, `${name} 出现 paused 门：与原版 Main.cs:17549（DoUpdate_WhilePaused 暂停宿主重跑背包滚轮,autoPause∧背包开=活面）相悖——若仅为注释措辞提及 paused 请换精确门形断言;若真要加门须先推翻 :17549 证据并重走定谳`).not.toMatch(/paused/);
      // ★BJ103 失焦旁支例外门（唯一允许的暂停族早退形态）：focusPaused 专名——
      // 摘除即红（失焦∧背包开滚轮复活=态矩阵缺行复辟）
      expect(body, `${name} 缺 game.focusPaused 失焦旁支早退（BJ103;Main.cs:17303-17316 先于 :17371 → :17549 宿主失焦期不可达=滚轮死）`).toContain('.focusPaused) return;');
    }
    // 同相可达面守卫：tick 的 playerInventory 门（原版 :17547 块的同相门）必须在——
    // 浮层态（IngameOptions.Open :70 收背包）滚轮死的机制正是它,摘除才造真偏差
    expect(tick).toContain("if (this.invPanel.style.display !== 'block') return;");
    expect(uiSrc).toContain('this.vinvGridWheelHandler = (e) => this.vinvGridWheelTick(e);');
  });
});
