// ★RB15d-FX51「暂停期滚轮双偏」定谳翻案锁（2026-09-14）。
// RB15d 原发现：暂停期 fullMap 缩放支/背包 DOM 滚轮支仍可用（原版暂停期消费段整段
// 不跑 Main.cs:17350-17356）。逐域复核定谳：
//   ①fullMap 缩放支=【伪发现】：Game.ts 滚轮分支树（:8344）宿主=private fixedUpdate
//     （:7746），全仓唯一调用点=:7531，位于 frame() `if (!this.paused)` 门内 while
//     循环（:7523-7527）⇒ 暂停期整树死，与原版「消费段宿主=Player.Update,CanPauseGame
//     真 → DoUpdate_WhilePaused 后 Main.Update return（:17372-17377）;gameMenu :17346;
//     !CanUpdateGameplay :17350-17356」同相。首 commit（02c8ad21）即同构（wheel :282 ⊂
//     fixedUpdate :244;调用点 :236 已在 !paused 门内）——该半从未成立。
//   ②背包 DOM 支=【真发现但坐标在 UI.ts】：vinvGridWheelTick（window 级 listener
//     UI.ts:8373→:8376）+ vinvCraftWheel（:8741,元素绑定 :9432/:9524）无暂停门，
//     autoPause∧背包开（=CanPauseGame :17500 原臂）暂停期照滚——原版
//     DoScrollingInInventory(:25404-25405)/ScrollCraftingList 宿主死。UI.ts 不在本刀
//     授权文件面 ⇒ 移交登记（修法：vinvGridWheelTick/vinvCraftWheel 头部
//     `if (this.game?.paused) return;`）。
//   ③内门不对称=原版结构：滚轮段唯一内门=热栏臂 :32028（!inFancyUI∧!ingameOptionsWindow
//     → 本仓 !paused,RB8c 口径）；map 臂(:25387-25396)/背包臂(:25404)【无】内门——
//     暂停死亡全部来自宿主。对 map/背包支补 !paused = 对宿主已死路径加休眠钩
//     （红队卫生面「死码」反模式），H3 同时防该过度矫正回潮。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const gameSrc = readFileSync(join(ROOT, 'src/core/Game.ts'), 'utf8');

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
});
