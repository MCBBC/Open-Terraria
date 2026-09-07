// SW-BJ14 2026-09-07 钩爪卡死下不来/解除键无效（用户实报）回归守卫。
//
// 定谳（原版 1457 锚）：
//  · 收爪唯一键面 = 跳键沿（Player.GrappleMovement :22899-22926 → RemoveAllGrapplingHooks
//    :33826-33838 全量杀 owner==whoAmI && aiStyle==7）；钩爪键（vanilla 缺省 E，
//    PlayerInput.cs:2078）= QuickGrapple 再发射，不是收爪键；R = QuickMount（:2085）。
//  · 根因 = 本仓 removeAllGrapplingHooks 裸 for..of 迭代 grappleProjs，kill() 内
//    unregisterGrapple → splice 变异数组 = 游标跳格，n 钩只杀 ⌊n/2⌋；随后 length=0
//    把幸存钩逐出登记表成「孤儿钩」——仍每 tick 自登记锚点表拉人
//    （GrappleProj.stepLatched），却不再被任何收爪/上限面看见 ⇒ 悬空卡死。
//    单钩（旧测试全绿）不触发，n≥2 才炸——本文件全数补 n≥2 面。
//
// 修面（src/entities/Player.ts removeAllGrapplingHooks）：快照迭代 [...grappleProjs]
// = 语义对齐原版「扫 Main.projectile 全量杀」。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TILE_BY_KEY } from '../src/data/tiles';
import { TILE, PLAYER_JUMP_SPEED } from '../src/core/constants';
import { GrappleProj, GRAPPLE_LATCH } from '../src/entities/GrappleProj';
import { BuffType } from '../src/stats/Buffs';
import {
  DEFAULT_KEYBINDS, assignBinding, isBound,
} from '../src/core/Keybinds';
import { options } from '../src/core/Options';

const DIRT = TILE_BY_KEY['dirt']!;

/** 空 60×60 世界 + 假 GameHooks（同 tests/grapple.test.ts 夹具） */
function makeWorld() {
  const w = new World(60, 60, 42, 'bj14');
  const st = w.store;
  const p = new Player(30 * TILE, 40 * TILE, new Inventory());
  const hooks = {
    world: w,
    player: p,
    spawnDrop: () => null,
    addDamageNumber: () => {},
    playSfx: () => {},
    spawnParticles: () => {},
    onInventoryChanged: () => {},
    enemies: () => [],
    critters: () => [],
    spawnEnemy: () => {},
    damagePlayer: (): number => 0,
  } as never;
  return { w, st, p, hooks };
}

/** 发射一发（模拟 Game.fireGrapple 的 spawn+register 段） */
function fire(p: Player, projType: number, dx: number, dy: number, speed: number) {
  const d = Math.hypot(dx, dy) || 1;
  const g = new GrappleProj(p.cx - 8, p.y + 8, (dx / d) * speed, (dy / d) * speed,
    projType, () => (p.dead ? null : p));
  p.registerGrappleProj(g);
  return g;
}

/** 弹体步进直到锚定（不步进玩家——锚点表由 doLatch 即时登记） */
function latch(g: GrappleProj, hooks: never, maxT = 200): void {
  for (let t = 0; t < maxT && g.ai0 !== GRAPPLE_LATCH; t++) g.fixedUpdate(1 / 60, hooks);
  expect(g.ai0).toBe(GRAPPLE_LATCH);
}

describe('SW-BJ14 多钩跳键收爪（RemoveAllGrapplingHooks 全量杀 1457 Player.cs:33826-33840）', () => {
  it('主判：8 钩并存（吐蛛丝者 num17=8）跳键沿收爪全灭、无孤儿幸存、锚点表不复活', () => {
    const { st, p, hooks } = makeWorld();
    for (let x = 26; x <= 34; x++) st.setTileSilent(x, 24, DIRT);   // 天花板（同 grapple.test.ts 布景）
    const gs = Array.from({ length: 8 }, () => fire(p, 165, 0, -1, 10));  // 吐蛛丝者 shootSpeed 10（Item 939）
    for (const g of gs) latch(g, hooks);
    expect(p.grappling[0]).toBeTruthy();          // 锚点表已挂（grappling[0] 非空）
    p.inputJump = true;                           // 跳键沿（grappleReleaseJump 缺省 true）
    p.fixedUpdate(1 / 60, hooks);
    // 全量杀判据——旧码 for..of 变异漏杀 ⌊8/2⌋=4 个，此行必红
    expect(gs.filter((g) => !g.dead)).toHaveLength(0);
    expect(p.grappleProjs.length).toBe(0);
    expect(p.grappling[0] == null).toBe(true);
    expect(p.grapCount).toBe(0);
    // 无复活判据：幸存孤儿会经 stepLatched 重登记回锚点表再拉人（用户"卡死"机制）
    for (const g of gs) if (!g.dead) g.fixedUpdate(1 / 60, hooks);
    p.inputJump = false;
    p.fixedUpdate(1 / 60, hooks);
    expect(p.grappling[0] == null).toBe(true);
    expect(p.grapCount).toBe(0);
  });

  it('奇偶两向参数化：n=2/3/5 全灭（旧码分别漏杀 1/1/2 个——n=2 即双钩家族也卡死）', () => {
    const { st, p, hooks } = makeWorld();
    for (let x = 26; x <= 34; x++) st.setTileSilent(x, 24, DIRT);
    for (const n of [2, 3, 5]) {
      const gs = Array.from({ length: n }, () => fire(p, 165, 0, -1, 10));
      for (const g of gs) latch(g, hooks);
      p.inputJump = true;
      p.fixedUpdate(1 / 60, hooks);
      expect(gs.filter((g) => !g.dead).map((g) => g.projType), `n=${n} 幸存钩`).toHaveLength(0);
      expect(p.grappleProjs.length, `n=${n} 登记表`).toBe(0);
      p.inputJump = false;
      p.fixedUpdate(1 / 60, hooks);               // 松键重臂 grappleReleaseJump（:22924-22925）
    }
  });

  it('收爪保留原版跳增幅面：双水平锚（pvy=0）+ 慢速(<2) → vy=-jumpSpeed（:22905）', () => {
    const { st, p, hooks } = makeWorld();
    // 左右墙挂在高空净空带（行 8-13 纯天空，避开地表生成物）；玩家 cy 与锚同行 → pvy=0
    for (const col of [22, 38]) for (let y = 8; y <= 13; y++) st.setTileSilent(col, y, DIRT);
    p.y = 10 * TILE + 8 - 21;                     // cy = 行10中心 = 锚行中心（dy=0）
    const gl = fire(p, 165, -1, 0, 10);
    const gr = fire(p, 165, 1, 0, 10);
    latch(gl, hooks);
    latch(gr, hooks);
    expect(gl.cy).toBeCloseTo(gr.cy, 3);          // 双锚同高 → 质心牵引纯水平
    p.inputJump = true;                           // tick 头重力先落 vy≈0.4 → slow(<2) 成立
    p.fixedUpdate(1 / 60, hooks);
    expect(gl.dead).toBe(true);
    expect(gr.dead).toBe(true);
    expect(p.grappleProjs.length).toBe(0);
    expect(p.vy).toBe(-PLAYER_JUMP_SPEED);        // :22905 velocity.Y=-jumpSpeed（flag4=slow）
  });

  it('收爪后登记表一致：再发射→再收爪循环不泄漏（防 length=0 造孤儿路径复活）', () => {
    const { st, p, hooks } = makeWorld();
    for (let x = 26; x <= 34; x++) st.setTileSilent(x, 24, DIRT);
    for (let round = 0; round < 3; round++) {
      const gs = [fire(p, 165, 0, -1, 10), fire(p, 165, 0, -1, 10)];
      for (const g of gs) latch(g, hooks);
      p.inputJump = true;
      p.fixedUpdate(1 / 60, hooks);
      expect(gs.every((g) => g.dead), `round${round} 全灭`).toBe(true);
      expect(p.grappleProjs.length, `round${round} 登记`).toBe(0);
      p.inputJump = false;
      p.fixedUpdate(1 / 60, hooks);               // 松键重臂（:22924-22925）
    }
  });

  it('自动释放面：结网 Webbed 摘钩（Player.cs:11476）多钩全灭', () => {
    const { st, p, hooks } = makeWorld();
    for (let x = 26; x <= 34; x++) st.setTileSilent(x, 24, DIRT);
    const gs = [fire(p, 165, 0, -1, 10), fire(p, 165, 0, -1, 10)];
    for (const g of gs) latch(g, hooks);
    p.buffs.apply(BuffType.Webbed, 5);
    p.fixedUpdate(1 / 60, hooks);
    expect(gs.filter((g) => !g.dead)).toHaveLength(0);
    expect(p.grappleProjs.length).toBe(0);
  });
});

describe('SW-BJ14 键位面（用户"按 R 无效/改绑 G 也无效"辨析）', () => {
  it('R 缺省≠钩爪：原版 R=QuickMount（PlayerInput.cs:2081）、Grapple 缺省=E（PlayerInput.cs:2075;SW-BN2 2026-09-07 缺省表对齐原版——E 曾让位物品栏,Inventory 收回纯 Escape 后按用户令回归）', () => {
    expect(DEFAULT_KEYBINDS.QuickMount).toEqual(['KeyR']);
    expect(DEFAULT_KEYBINDS.Grapple).toEqual(['KeyE']);
    expect(isBound('Grapple', 'KeyR')).toBe(false);   // 按 R 永不触发钩爪（原版同构）
  });

  it('改绑 G 跟随：isBound("Grapple","KeyG") 置真——keydown 消费点 Game.ts:5257 语义可达', () => {
    const prev = options.data.keybinds;
    try {
      options.data.keybinds = assignBinding({ ...prev }, 'Grapple', 'KeyG');
      expect(isBound('Grapple', 'KeyG')).toBe(true);
      expect(isBound('Grapple', 'KeyR')).toBe(false);
    } finally {
      options.data.keybinds = prev;
    }
  });
});

describe('SW-BJ14 结构锁（防裸 for..of 回潮）', () => {
  const playerSrc = readFileSync(new URL('../src/entities/Player.ts', import.meta.url), 'utf8');
  const grappleSrc = readFileSync(new URL('../src/entities/GrappleProj.ts', import.meta.url), 'utf8');
  const gameSrc = readFileSync(new URL('../src/core/Game.ts', import.meta.url), 'utf8');

  it('removeAllGrapplingHooks 快照迭代在位、裸迭代绝迹', () => {
    expect(playerSrc).toContain('for (const g of [...this.grappleProjs]) g.kill();');
    expect(playerSrc).not.toContain('for (const g of this.grappleProjs) g.kill();');
  });

  it('GrappleProj.kill 为唯一反注册点（注销只发生在 kill 内——登记表漂移源头唯一化）', () => {
    const killBody = grappleSrc.slice(grappleSrc.indexOf('kill(): void'), grappleSrc.indexOf('draw(r: GrappleDrawHost'));
    expect(killBody).toContain('unregisterGrapple(this)');
    // 全仓对 grappleProjs 的写点仅三处：register push / unregister splice / removeAll 清空
    expect(playerSrc.match(/grappleProjs\.splice/g)).toHaveLength(1);       // 仅 unregisterGrapple
    const removeAllIdx = playerSrc.indexOf('removeAllGrapplingHooks(): void');
    const lenZeroIdx = playerSrc.indexOf('this.grappleProjs.length = 0');
    expect(removeAllIdx).toBeGreaterThan(-1);
    expect(lenZeroIdx).toBeGreaterThan(removeAllIdx);                        // 仅 removeAll 内
  });

  it('钩爪键消费面在位：isBound(\'Grapple\') → useEquippedGrapple（QuickGrapple 等价）', () => {
    expect(gameSrc).toContain("isBound('Grapple', code)");
    expect(gameSrc).toContain('useEquippedGrapple(');
  });
});
