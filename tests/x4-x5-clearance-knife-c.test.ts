// ★X4/X5 清偿刀 C（2026-09-29）红蓝对抗复核漏修批落刀判别面。
//  覆盖：①BJ361 同族三站补派发（flipBlock/flipCell/toggleGemLock 裸写窗后
//  notifyChanged——贴图 mark 主通道 + LightingEngine dirty 通道恢复）
//  ②pan 入口 mount DontHoldItems 门（Main.cs:63724-63727）
//  ③幽灵相 spectatingSlot 清零（Ghost() Player.cs:6716）
//  ④幽灵相死亡 UI 倒计时 respawnTimer>1 门（Main.cs:46140）
//  ⑥BJ347 行号勘误锚（NPC.cs:37206）
//  ⑤BJ377 混合态夹具判别力=本文件外的 bj377-container-anchor-repair.test.ts 自身
//  （变异证红见该文件执行记录：摘 tryFamily 反证支 → 红）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { World } from '../src/world/World';
import { Wiring } from '../src/world/Wiring';
import { flipBlock, flipCell } from '../src/world/wiring/devices';
import { TILE_BY_KEY } from '../src/data/tiles';
import { Game } from '../src/core/Game';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');
const gameSrc = read('src/core/Game.ts');
const devicesSrc = read('src/world/wiring/devices.ts');
const rendererSrc = read('src/render/Renderer.ts');

/** 渲染 mark 主通道替身（ChunkCache.ts:300 同位订阅） */
function markSpy(st: World['store']): Array<[number, number]> {
  const calls: Array<[number, number]> = [];
  st.onTileChanged((x, y) => calls.push([x, y]));
  return calls;
}

// ============================================================
// ① BJ361 同族三站补派发（裸写窗后写入域恰达）
// ============================================================
describe('X4-① BJ361 三站补派发（flipBlock/flipCell/toggleGemLock 窗后 notifyChanged）', () => {
  it('flipBlock（灯笼 1×2 档翻转）：监听替身恰收写入域 2 格各一次（窗内零半写态派发）', () => {
    const w = new World(60, 60, 7, 'x4-flipblock');
    const st = w.store;
    const LANTERN = TILE_BY_KEY['lantern']!;
    st.setTileSilent(40, 40, LANTERN, 18, 36);   // 灭档 fx=18
    st.setTileSilent(40, 41, LANTERN, 18, 54);
    const marks = markSpy(st);
    flipBlock(new Wiring(st), 40, 40, 1, 2, 'x', 18, 18);
    expect(st.frameX[st.idx(40, 40)]).toBe(0);   // 18→0 亮档
    expect(st.frameX[st.idx(40, 41)]).toBe(0);
    expect(marks).toEqual([[40, 40], [40, 41]]); // 写入域恰达=贴图 mark+lighting dirty 恢复
  });

  it('flipCell（火把单格）：监听替身恰收写入格一次', () => {
    const w = new World(60, 60, 7, 'x4-flipcell');
    const st = w.store;
    const TORCH = TILE_BY_KEY['torch']!;
    st.setTileSilent(30, 30, TORCH, 0, 0);
    const marks = markSpy(st);
    flipCell(new Wiring(st), 30, 30, 66);
    expect(st.frameX[st.idx(30, 30)]).toBe(66);  // 0→66 灭档
    expect(marks).toEqual([[30, 30]]);
  });

  it('toggleGemLock（右击开锁 3×3 frameY 0→54 带）：监听替身恰收写入域 9 格各一次', () => {
    const w = new World(60, 60, 7, 'x4-gemlock');
    const st = w.store;
    const GEMLOCK = TILE_BY_KEY['v_440_gemlocks']!;
    for (let ix = 20; ix < 23; ix++) {
      for (let iy = 20; iy < 23; iy++) {
        st.setTileSilent(ix, iy, GEMLOCK, 0, (iy - 20) * 18);   // 关带 fy=0+row*18
      }
    }
    const marks = markSpy(st);
    const g = Object.create(Game.prototype) as unknown as {
      world: World; spawnDrop: () => void; checkDecorSquareFrame: () => void;
      toggleGemLock(tx: number, ty: number, on: boolean): void;
    };
    g.world = w;
    g.spawnDrop = () => {};            // wasOn=false 本例不掉宝石,桩防外溢
    g.checkDecorSquareFrame = () => {}; // DECOR 完整性裁决面与本刀无关,桩化
    g.toggleGemLock(20, 20, true);
    for (let iy = 20; iy < 23; iy++) {
      expect(st.frameY[st.idx(20, iy)]).toBe(54 + (iy - 20) * 18);   // 0→54 带
    }
    // 写入域 3×3 恰达（列优先序=补派发循环序;窗内零半写态派发）
    const expected: Array<[number, number]> = [];
    for (let ix = 20; ix < 23; ix++) for (let iy = 20; iy < 23; iy++) expected.push([ix, iy]);
    expect(marks).toEqual(expected);
  });

  it('三站补派发在窗【后】（notifyChanged 不得挪进 suppressListeners 窗内——BJ361 M2b 半写态教训）', () => {
    for (const [src, name] of [[devicesSrc, 'devices.ts']] as const) {
      void name;
      // flipBlock/flipCell：notifyChanged 出现在 finally 块之后（窗关闭后）
      const fb = src.indexOf('export function flipBlock(');
      const fbSeg = src.slice(fb, src.indexOf('export function flipCell('));
      expect(fbSeg.indexOf('st.notifyChanged')).toBeGreaterThan(fbSeg.indexOf('} finally {'));
      const fc = src.indexOf('export function flipCell(');
      const fcSeg = src.slice(fc, src.indexOf('// ============ 器件态机族'));
      expect(fcSeg.indexOf('st.notifyChanged')).toBeGreaterThan(fcSeg.indexOf('} finally {'));
    }
    const gl = gameSrc.indexOf('private toggleGemLock(');
    const glEnd = gameSrc.indexOf('checkDecorSquareFrame(tx, ty)', gl);
    const glSeg = gameSrc.slice(gl, glEnd);
    expect(glSeg.indexOf('st.notifyChanged')).toBeGreaterThan(glSeg.indexOf('} finally {'));
  });
});

// ============================================================
// ② pan 入口 mount DontHoldItems 门（Main.cs:63724-63727）
// ============================================================
describe('X4-② pan 坐骑持物禁 pan 门（Main.cs:63724-63727 mount.Active ∧ DontHoldItems{55,56,61}）', () => {
  it('门在位：外层 if 尾项 ridingMount ∧ MOUNT_SETS.DontHoldItems 表（Mounts.ts 单源复用）', () => {
    const gate = gameSrc.indexOf('if (!player.dead && !this.input.uiBlocking');
    const line = gameSrc.slice(gate, gameSrc.indexOf('\n', gate));
    expect(line).toContain('player.ridingMount');
    expect(line).toContain('MOUNT_SETS.DontHoldItems?.[player.mount.type]');
    // 门序：mount 门在 panMode!==1（:63721-63723 等价面）之前消费（原版 :63724<GetPanControlValues :63728）
    const gateEnd = gate + line.length;
    const panMode = gameSrc.indexOf('const panMode = player.panControlMode;', gateEnd);
    expect(panMode).toBeGreaterThan(-1);
  });
  it('表单源未复制（DontHoldItems 不在 Game.ts 内联重建）', () => {
    expect(gameSrc).not.toContain('DontHoldItems =');
    expect(gameSrc).not.toMatch(/DontHoldItems\s*[:=]\s*(new Set|\[)/);
  });
});

// ============================================================
// ③ 幽灵相 spectatingSlot 清零（Ghost() Player.cs:6716 spectating = -1）
// ============================================================
describe('X4-③ 幽灵相 spectatingSlot 清零（vanilla Ghost() Player.cs:6714-6716）', () => {
  it('fixedUpdate 观战控制站头：isGhostPhase ∧ spectatingSlot>=0 → 直写清零（先于 handleSpectatingControls）', () => {
    const clear = gameSrc.indexOf('if (this.spectatingSlot >= 0 && this.player.isGhostPhase(this.world)) this.spectatingSlot = -1;');
    expect(clear).toBeGreaterThan(-1);
    const hs = gameSrc.indexOf('if (this.spectatingSlot >= 0 || this.canDeathSpectate()) this.handleSpectatingControls();');
    expect(clear).toBeLessThan(hs);   // 清零站先于观战控制=清后不重取目标
    // 直写字段语义锚注在位（:6716 裸赋值,不走 SetOrRequestSpectating）
    expect(gameSrc).toContain('Player.cs:6714-6716');
  });
});

// ============================================================
// ④ 幽灵相死亡 UI 倒计时门（Main.cs:46140 respawnTimer > 1）
// ============================================================
describe('X4-④ 死亡 UI 倒计时 respawnTimer>1 门（vanilla Main.cs:46140-46146）', () => {
  it('drawDeathScreen 倒计时行带 >1 门（幽灵相「重生倒计时：1秒」常驻病灶）', () => {
    const ds = rendererSrc.indexOf('private drawDeathScreen(');
    const seg = rendererSrc.slice(ds, ds + 4000);
    expect(seg).toContain('player.respawnTimer > 1');
    // 门住倒计时绘制（secs 计算在门内）
    const gate = seg.indexOf('if (player.respawnTimer > 1)');
    const secs = seg.indexOf('const secs = 1 + Math.floor(player.respawnTimer / 60);');
    expect(secs).toBeGreaterThan(gate);
  });
});

// ============================================================
// ⑥ BJ347 行号勘误锚（NPC.cs:37206）
// ============================================================
describe('X5-④ BJ347 行号勘误（TabletDestroyed 调用点 NPC.cs:38881→:37206）', () => {
  it('Game.ts 不再引 NPC.cs:38881（勘误自述注除外）,勘误锚在位', () => {
    expect(gameSrc).not.toContain('NPC.cs:38881');
    expect(gameSrc).toContain('NPC.cs:37206');
    expect(gameSrc).toContain(':37183');
  });
});
