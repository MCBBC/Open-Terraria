// ★BJ400 件 3（2026-09-29）：硬核幽灵冻结反向偏差立案+修复。
// 定谳锚（1457 反编译直读；1458 同构对拍）：
//   原版 Player.Update :24938-24942 `if (ghost) { Ghost(); return; }` 先于 dead 分支
//   :24943——ghost=true（UpdateDead :17161-17169 difficulty==2 && respawnTimer 到点）
//   起 UpdateDead 整体停摆,Ghost()（Player.cs:6714-6850）接管：
//   · 移动 = controlUp||Jump 上升 / controlDown 下降 / controlLeft∧!Right、
//     controlRight∧!Left 平移；反向 0.9 阻尼、加速度 0.2、速度帽 7、死区 |v|纵
//     ≤0.1/横≤0.2 内归零（:6731-6789）。
//   · `position += velocity` 无 tile 碰撞（:6790）=自由穿墙原版本相。
//   · 世界界钳 640px（:6821-6847）：X 越界 vx=0；顶界 vy<−0.1→−0.1 慢漂 quirk；
//     底界 vy=0。
//   · ghostFrameCounter 每 8t 推进 ghostFrame %4（:6802-6818）。
//   本仓旧病：hp≤0 早退贯穿 ghost 相=幽灵冻结原地仅帧动画（BJ397 邻接发现）。
// 变异证红：M4 ghostFlight 速度帽 7→0.7 → ①飞行组红。（原子变异+逐字节还原）
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');

// 200×120 tiles = 3200×1920 px（>80 格门,640px 界钳两侧留有飞行域）
const mkWorld = (): World => new World(200, 120, 42, 'bj400-ghost');

const fakeHooks = (w: World, p: Player) => ({
  world: w,
  player: p,
  enemies: () => [],
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
});

/** 硬核幽灵相玩家（isGhostPhase 四门全满足：dead∧difficulty2∧!survive∧timer≤0） */
function mkGhost(w: World): Player {
  const p = new Player(100 * TILE, 60 * TILE, new Inventory());
  p.hp = 0;
  p.dead = true;
  p.respawnTimer = 0;
  (p as unknown as { _deathPartsInit: boolean })._deathPartsInit = true;   // 散飞已初始化（幽灵相前已跑过 UpdateDead 域）
  (p as unknown as { appearance?: { difficulty: number } }).appearance = { difficulty: 2 };
  p.vx = 0; p.vy = 0;
  return p;
}

const step = (p: Player, w: World, ticks = 1): void => {
  for (let i = 0; i < ticks; i++) p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);
};

// ============================================================
// ① 自由飞行（Ghost() :6731-6789 移动语义 1:1）
// ============================================================
describe('BJ400-① ghost 自由飞行（Ghost() 移动 1:1,Player.cs:6714-6850）', () => {
  it('右推：加速度 0.2/拍 → 速度帽 7；位移逐拍增长（旧码冻结位移恒 0）', () => {
    const w = mkWorld();
    const p = mkGhost(w);
    p.inputRight = true;
    step(p, w, 3);
    expect(p.vx).toBeCloseTo(0.6, 6);            // 3 拍加速
    const x3 = p.x;
    step(p, w, 60);
    expect(p.vx).toBeCloseTo(7, 6);              // 速度帽 :6731
    // 60 拍位移 = Σ min(0.2k,7) = 0.2×(35×36/2) + 7×25 = 301（解析下界 290）
    expect(p.x).toBeGreaterThan(x3 + 290);       // 持续位移（冻结病=恒 0）
    p.inputRight = false;
    p.inputLeft = true;                          // 反向 0.9 阻尼（:6763-6765）
    step(p, w, 1);
    expect(p.vx).toBeCloseTo(7 * 0.9 - 0.2, 6);
  });

  it('上推（Jump）：上升；松开死区 |vy|≤0.1 归零（:6755-6761）', () => {
    const w = mkWorld();
    const p = mkGhost(w);
    p.inputJump = true;
    step(p, w, 5);
    expect(p.vy).toBeLessThan(0);
    const y5 = p.y;
    step(p, w, 20);
    expect(p.y).toBeLessThan(y5);
    p.inputJump = false;
    for (let i = 0; i < 80; i++) step(p, w, 1);
    expect(p.vy).toBe(0);                        // 死区归零
  });

  it('同按左右=阻尼臂（独立电平 inputLeft∧inputRight → else 臂 0.9 衰减）', () => {
    const w = mkWorld();
    const p = mkGhost(w);
    p.inputRight = true;
    step(p, w, 35);                              // vx→7
    p.inputLeft = true;                          // 双按
    step(p, w, 1);
    expect(p.vx).toBeCloseTo(7 * 0.9, 6);        // else 臂（:6783-6789）非左臂加速
  });

  it('ghostFrame 每 8t 推进 %4（:6802-6818,自 updateDeathParts 迁入）', () => {
    const w = mkWorld();
    const p = mkGhost(w);
    p.inputRight = true;
    const f0 = p.ghostFrame;
    step(p, w, 8);
    expect(p.ghostFrame).toBe((f0 + 1) % 4);
    step(p, w, 8);
    expect(p.ghostFrame).toBe((f0 + 2) % 4);
  });
});

// ============================================================
// ② 穿墙（position += velocity 无 tile 碰撞,:6790 原版本相）
// ============================================================
describe('BJ400-② ghost 穿墙（无碰撞位移,Player.cs:6790）', () => {
  it('实体墙列不可阻拦：右推直穿 4 格厚石墙', () => {
    const w = mkWorld();
    const st = w.store;
    const p = mkGhost(w);
    const wallX = 110;
    for (let y = 50; y <= 70; y++) {
      for (let dx = 0; dx < 4; dx++) st.setTileSilent(wallX + dx, y, 1);   // 石墙列
    }
    p.inputRight = true;
    const x0 = p.x;
    step(p, w, 120);
    expect(p.x).toBeGreaterThan((wallX + 5) * TILE);   // 已穿至墙右侧之外
    expect(p.x).toBeGreaterThan(x0 + 8 * TILE);
  });
});

// ============================================================
// ③ 世界界钳（:6821-6847：640px；顶界慢漂 quirk/底界归零）
// ============================================================
describe('BJ400-③ 世界界钳（Ghost() :6821-6847,B=640）', () => {
  it('左界：x<640 → 钳 640 且 vx=0', () => {
    const w = mkWorld();
    const p = mkGhost(w);
    p.x = 660;
    p.inputLeft = true;
    step(p, w, 40);
    expect(p.x).toBe(640);                       // :6822-6825
    expect(p.vx).toBe(0);
    step(p, w, 10);
    expect(p.x).toBe(640);                       // 持续推顶不再动
  });

  it('顶界：y<640 → 钳 640 且 vy 压到 −0.1（慢漂 quirk 照抄,非归零）', () => {
    const w = mkWorld();
    const p = mkGhost(w);
    p.y = 650;
    p.inputJump = true;
    step(p, w, 60);
    expect(p.y).toBe(640);
    step(p, w, 1);
    expect(p.y).toBe(640);
    expect(p.vy).toBe(-0.1);                     // :6829-6832（上升被顶界截 −0.1）
  });

  it('底界：y>hPx−640−h → 钳位且 vy=0', () => {
    const w = mkWorld();
    const p = mkGhost(w);
    const bottom = 120 * TILE;                   // 1920
    p.y = bottom - 640 - p.h + 40;
    p.inputDown = true;
    step(p, w, 30);
    expect(p.y).toBe(bottom - 640 - p.h);
    expect(p.vy).toBe(0);                        // :6840-6843
  });
});

// ============================================================
// ④ 相面切换判别（ghost 相停 UpdateDead/普通死亡不受扰/重生交互）
// ============================================================
describe('BJ400-④ 相面判别（UpdateDead 停摆 + 非幽灵死亡不变 + 重生拒）', () => {
  it('ghost 相死亡散飞冻结（UpdateDead 停摆,:24938 先于 :24943）', () => {
    const w = mkWorld();
    const p = mkGhost(w);
    const seg = p.deadParts.head;
    seg.px = 3; seg.py = 4;
    step(p, w, 30);
    expect(p.deadParts.head.px).toBe(3);         // 散飞位不再推进
    expect(p.deadParts.head.py).toBe(4);
  });

  it('普通死亡（difficulty 0）非幽灵相：位置冻结不飞（旧死亡路径零扰动回归）', () => {
    const w = mkWorld();
    const p = new Player(100 * TILE, 60 * TILE, new Inventory());
    p.hp = 0;
    p.dead = true;
    p.respawnTimer = 600;                        // 未到点
    (p as unknown as { appearance?: { difficulty: number } }).appearance = { difficulty: 0 };
    const x0 = p.x;
    p.inputRight = true;
    step(p, w, 20);
    expect(p.x).toBe(x0);                        // 死亡早退=不积分移动
    expect(p.dead).toBe(true);
  });

  it('ghost 相持续 600 拍：dead 恒 true、hp 恒 ≤0（硬核不重生,respawnPlayer hardcoreDead 拒）', () => {
    const w = mkWorld();
    const p = mkGhost(w);
    p.inputRight = true;
    step(p, w, 600);
    expect(p.dead).toBe(true);
    expect(p.hp).toBeLessThanOrEqual(0);
  });

  it('源码锚：ghost 分支先于散飞段/非幽灵段；respawnPlayer 硬核拒重生在位', () => {
    const playerSrc = read('src/entities/Player.ts');
    const deathBlock = playerSrc.indexOf('if (this.hp <= 0) {');
    const ghostBranch = playerSrc.indexOf('if (this.isGhostPhase(game.world)) {', deathBlock);
    const partsInit = playerSrc.indexOf('if (!this._deathPartsInit) {', deathBlock);
    expect(ghostBranch).toBeGreaterThan(deathBlock);
    expect(ghostBranch).toBeLessThan(partsInit);   // ghost 分支先于散飞/UpdateDead 域
    expect(playerSrc).toContain('private ghostFlight(game: GameHooks): void {');
    expect(playerSrc).toContain('this.x += this.vx;');   // :6790 无碰撞位移
    const gameSrc = read('src/core/Game.ts');
    expect(gameSrc).toContain('if (p.appearance?.hardcoreDead) return;');
  });
});
