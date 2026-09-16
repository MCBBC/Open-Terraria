// SW-BJ99（2026-09-16）Game.ts 清账三件套锁（本文件锁 ①②；③ BJ72 暂停帧悬停回填挂
// tests/sw-bj72-cursor-overs-clear.test.ts「SW-BJ99 暂停帧绘制相悬停回填」块）。
//
// ① BJ98 债①：pan 档位注释重锚（纯注释零行为）——Game.ts 相机平移注释区的行号引曾是
//    1456 旧档（GetPlayerControlledCameraPan 1456 Main.cs:62195-62253 → 1457 :63703-63780/
//    1458 :63709-63786；档位面 1457 起由 Main.cs 内联迁 Player.GetPanControlValues
//    Player.cs:6268-6289,1457/1458 同号）。锁 = 1457/1458 双版真锚在位 + 1456 陈旧串
//    清零 + BJ94 两 Set 集合值逐位不动（BJ98 口径：23 Gel 在、283 Dart 无）。
//    变异证红：注释锚改回 ':62216' 族 / 删 'Player.cs:6268' / 动 Set 字面量 → 红。
//
// ② BJ94 移交债①：stepRemoteProxy 收尾 wetSticky 契约行——远端代理不走 fixedUpdate
//    液体链（Renderer.ts _waveCtxPushPlayer :2586-2596 注登记的移交债）,wetSticky 曾
//    恒假（Player 构造缺省,Game.ts 零写位）。修 = 收尾补 `p.wetSticky = p.inWater;`
//    （代理湿面 = 足部粗判 inWater = 本仓 wetNow∧!inLava 同位代理近似）→ 恒等式
//    wetSticky ≡ inWater ⟹ Renderer 波注入 OR 臂（:2597/:4853 `p.wetSticky || p.inWater`）
//    收敛为 wetSticky 本身。零视觉变化：单机 simulateRemotePlayers 整链不可达（唯一
//    调用点 `if (this.net?.active)`,Game.ts :46481）;联机 OR 臂取值加行前后逐位相同
//    （false||inWater ≡ inWater = 加行后 wetSticky）。挂链消费面排查：本地湿链专供
//    （tickSlimeWetState 挂 Player.ts:4157 湿流程/Chilled 门 :4326 —— 代理不可达）。
//    变异证红：删赋值行 → 「湿态」用例红。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Game, BJ94_SCOPE_ACC, BJ94_AMMO_SCOPE } from '../src/core/Game';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';

const gameSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/core/Game.ts'), 'utf8');

// ===================== ① BJ98 债①：pan 档位注释重锚（纯注释锁） =====================
describe('① BJ98 债①：pan 档位注释重锚（1457/1458 双版锚）', () => {
  /** 相机平移注释+代码区切片（golf 注释头 → _panPrevRight 推进行） */
  function panRegion(): string {
    const s = gameSrc.indexOf('// ★IIIII233');
    const e = gameSrc.indexOf('this._panPrevRight = this.input.rightDown');
    expect(s).toBeGreaterThan(0);
    expect(e).toBeGreaterThan(s);
    return gameSrc.slice(s, e);
  }

  it('真锚在位：1457 GetPlayerControlledCameraPan Main.cs:63703 + 档位面 Player.GetPanControlValues Player.cs:6268 + 1458 :63709', () => {
    const r = panRegion();
    expect(r).toContain('Main.cs:63703');        // 1457 主函数定义（1458 :63709）
    expect(r).toContain('1458 :63709');
    expect(r).toContain('Player.cs:6268');       // GetPanControlValues（1457/1458 同号）
    // 档位行号引（GetPanControlValues 内,两版同号）
    expect(r).toContain('Player.cs:6272-6274');  // scope → 0.5
    expect(r).toContain('Player.cs:6276-6282');  // 1254 → 2/3、+scope → 0.8
    expect(r).toContain('Player.cs:6284-6288');  // 1299 → 2/3 + needsMouseRight=false
    // 门序引（Main.GetPlayerControlledCameraPan 内,1457/1458 双版）
    expect(r).toContain('Main.cs:63715-63718');  // noThrow||lastMouseInterface 拦
    expect(r).toContain('1458 :63721-63724');
    expect(r).toContain('Main.cs:63778');        // targetPan = vector×ScaledSize/2×panFactor
  });

  it('1456 陈旧行号引清零（62195 族六处不再以锚形式出现）', () => {
    const r = panRegion();
    for (const stale of [':62195-62253', ':62216', ':62219-62226', ':62229-62231', ':62252', ':62201-62204']) {
      expect(r, stale).not.toContain(stale);
    }
  });

  it('golf 相邻注释同区重锚（GetObjectTrackingCameraPan 1457 :63696-63699/1458 :63702-63705）', () => {
    const r = panRegion();
    expect(r).toContain('Main.cs:63696-63699');
    expect(r).toContain('1458 :63702-63705');
  });

  it('零行为面：BJ94_SCOPE_ACC/BJ94_AMMO_SCOPE 集合值逐位不动（BJ98 口径 23 Gel 在、283 Dart 无）', () => {
    expect([...BJ94_SCOPE_ACC].sort((a, b) => a - b)).toEqual([1300, 1858, 4005]);
    expect([...BJ94_AMMO_SCOPE].sort((a, b) => a - b)).toEqual([23, 97, 780, 1783, 1836]);
    expect(gameSrc).toContain('new Set([97, 1783, 1836, 23, 780])');
    expect(gameSrc).toContain('new Set([1300, 1858, 4005])');
  });
});

// ===================== ② BJ94 移交债①：stepRemoteProxy 代理 wetSticky 契约 =====================
describe('② BJ94 移交债①：stepRemoteProxy 代理 wetSticky 契约（行为+结构锁）', () => {
  /** 最小 Game 桩（sw-bj72 bj72Game 同法）——stepRemoteProxy 只读 world.store */
  function proxyGame(): { g: Record<string, unknown>; world: World } {
    const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
    const world = new World(80, 120, 11);
    g.world = world;
    return { g, world };
  }

  /** 足部采样格灌/不灌水（采样式 = stepRemoteProxy 首行：cx 格 × (y+h-4)/TILE 格） */
  function proxyInWorld(liquid: boolean) {
    const { g, world } = proxyGame();
    const p = new Player(30 * TILE, 50 * TILE, new Inventory());
    if (liquid) world.store.setLiquid(Math.floor(p.cx / TILE), Math.floor((p.y + p.h - 4) / TILE), 255, 1);
    return { g, p };
  }

  it('干态：wetSticky 随 inWater 同源假（Renderer OR 臂恒等不变）', () => {
    const { g, p } = proxyInWorld(false);
    (g as unknown as { stepRemoteProxy(p: Player): void }).stepRemoteProxy(p);
    expect(p.inWater).toBe(false);
    expect(p.wetSticky).toBe(false);
    expect(p.wetSticky || p.inWater).toBe(p.inWater);   // OR 臂 ≡ inWater（加行前后同值）
  });

  it('湿态：足部粗判湿 → wetSticky=true（变异证红锚：删赋值行 → 本用例红）', () => {
    const { g, p } = proxyInWorld(true);
    (g as unknown as { stepRemoteProxy(p: Player): void }).stepRemoteProxy(p);
    expect(p.inWater).toBe(true);
    expect(p.wetSticky).toBe(true);
    expect(p.wetSticky || p.inWater).toBe(p.wetSticky); // 恒等收敛 = wetSticky
  });

  it('结构锁：赋值行挂 moveAndCollide 之后收尾位,且为 Game.ts 内唯一 wetSticky 写位', () => {
    const s = gameSrc.indexOf('private stepRemoteProxy(p: Player) {');
    const e = gameSrc.indexOf('/** PopupText.Update 的物品名', s);
    expect(s).toBeGreaterThan(0);
    expect(e).toBeGreaterThan(s);
    const body = gameSrc.slice(s, e);
    const iMove = body.indexOf('moveAndCollide(p, this.world, p.vx, p.vy)');
    const iWet = body.indexOf('p.wetSticky = p.inWater;');
    expect(iMove, 'moveAndCollide 调用在位').toBeGreaterThan(0);
    expect(iWet, 'wetSticky 契约行在位').toBeGreaterThan(iMove);
    expect((gameSrc.match(/p\.wetSticky = /g) ?? []).length).toBe(1);
  });
});
