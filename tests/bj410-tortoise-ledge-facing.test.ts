import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';

// BJ410 冰雪陆龟 154 朝向定谳（2026-09-30 用户实报"贴图朝向与角色相反/屁股朝玩家"）。
//
// 原版朝向链（先定谳锚）：
//   - AI（NPC.cs:29335 aiStyle 39 态 0）：direction=sign(velocity.X)（:29387-29391）→
//     `spriteDirection = direction`（:29421）——贴图朝向=行进向（cs:29473 崖边折返在
//     accel :29507 前，先折返后加速）。
//   - 崖边折返（NPC.cs:29473-29504）门 = velocity.Y==0 ∧
//     Main.player[target].position.Y < position.Y+height——★玩家顶<龟盒底才算
//     "玩家在上方"才折返；玩家在下方悬崖外【不】折返（原版头朝玩家随行跳崖）。
//   - 绘制（Main.cs:23356-23360）：spriteDirection==1 → FlipHorizontally（sheet
//     原生朝左,NPC_154.png 眼(255,239,163)@帧 x≈8-9/72 左半——sha256
//     110484a9… 与本仓散图全等,贴图层无嫌疑）。
//   - 本仓 Renderer.ts 通用镜像门 `facing>0 → scale(-1,1)`（aiStyle 39 走
//     rotate(visAngle),39 不在 rotationDriven;C 态隔离截图钉死极性正常）。
//     facing ≡ spriteDirection（Enemy.ts:12138 域注释）。
//
// 本仓错位层 = tortoiseAI 态 0 崖边折返块缺玩家-Y 门（旧实现单列 +24px 探针 ×
// 下 4 行、无门、折返后不置 vx）——玩家在下方悬崖外时也折返 → 龟滞留崖边、
// 屁股朝玩家蓄力（实机探针 run1 A 态截图复现:玩家在右 300px、龟头朝左）。
// 修复 = NPC.cs:29473-29504 1:1（门+center±3 列×num609..+4 行窗+tileSolid 谓词
// 含平台九件套+折返置 vx=0.1×direction+先折返后加速序）。
//
// 判别面：
//   A) 崖 + 玩家在下方坑底（gate 假）→ 不折返:facing 恒 +1 且随行跳崖入坑
//      （变异[去 Y 门]红:折返+不入坑）。
//   B) 崖 + 玩家同高在崖外（gate 真）→ 折返存活（防过修;原版同款转身）。
//   C) 平坦地 → facing==sign(dx) 护栏（走行朝玩家）。
// 同族普查：153/154/496/497/417 共用本块（aiStyle 39 态 0 原版共享段）——
//   A/B 以 154 为主判,153 补一发族面。

const T = 16;

function world70() {
  return new World(80, 80, 42, 'open');
}

function playerMock(x: number, yFloorPx: number) {
  // y=盒顶;站在 yFloorPx 顶面上（盒高 42,cy=y+21）
  return {
    x: x - 10, y: yFloorPx - 42, w: 20, h: 42,
    cx: x, cy: yFloorPx - 21, dead: false, useTime: 0,
  };
}

function hooksFor(w: World, player: ReturnType<typeof playerMock>) {
  return {
    world: w,
    player,
    playSfx: () => {}, addDamageNumber: () => {}, spawnParticles: () => {},
    enemies: () => [],
    spawnDrop: () => null, damagePlayer: (): number => 0,
    entities: { add: () => {} },
  } as never;
}

/** 主地板 y=60(草地 2);坑 cols [p0..p1] 清空到底 y=71(玩家在下方场景)。 */
function buildLedgeWorld(pitCols: [number, number], pitFloorY: number | null) {
  const w = world70();
  const st = w.store;
  for (let x = 10; x <= 70; x++) st.setTileSilent(x, 60, 2);
  if (pitFloorY != null) {
    for (let x = pitCols[0]; x <= pitCols[1]; x++) {
      st.setTileSilent(x, 60, 0);
      st.setTileSilent(x, pitFloorY, 2);
    }
  } else {
    for (let x = pitCols[0]; x <= pitCols[1]; x++) st.setTileSilent(x, 60, 0);
  }
  return w;
}

describe('BJ410 陆龟 154 崖边折返朝向（NPC.cs:29473-29504 1:1）', () => {
  it('A: 崖+玩家在下方坑底 → 不折返（facing 恒 +1）且随行跳崖入坑', () => {
    // 坑 cols 46..52、坑底 y=71;龟起点盒中心 (42*16, 59*16);玩家坑内 (50*16, 站 y=71 顶面)
    const w = buildLedgeWorld([46, 52], 71);
    const player = playerMock(50 * T, 71 * T);
    const hooks = hooksFor(w, player);
    const e = Enemy.fromVanilla(154, 42 * T, 59 * T)!;
    let everTurned = false;
    let fell = false;
    for (let t = 0; t < 400; t++) {
      e.fixedUpdate(1 / 60, hooks);
      // 误折返判据:【仍在上层地板时】玩家在右侧(dx>0)却 facing=-1(=原版 Y 门
      // 要禁的转身);入坑后绕玩家走位 dx 变号翻面是正确行进向,不算
      if (e.ai0 === 0 && e.onGround && e.y + e.h <= 61 * T
        && player.cx > e.cx && e.facing === -1) everTurned = true;
      if (e.y + e.h > 70 * T) fell = true;   // 盒底越过上层地板面 = 入坑坠落
    }
    // 主判据:玩家在下方 → 原版不折返 → 头朝玩家随行跳崖
    expect(everTurned).toBe(false);
    expect(fell).toBe(true);
    expect(e.y + e.h).toBeGreaterThanOrEqual(71 * T - 1);   // 落到坑底
  });

  it('B: 崖+玩家同高在崖外（gate 真）→ 折返存活、不坠坑（防过修;原版同款转身）', () => {
    // 坑 cols 46..52 直落(无底格);玩家 (50*16, 站 y=60 顶面)——盒顶 918 < 龟盒底 960
    const w = buildLedgeWorld([46, 52], null);
    const player = playerMock(50 * T, 60 * T);
    const hooks = hooksFor(w, player);
    const e = Enemy.fromVanilla(154, 42 * T, 59 * T)!;
    let turned = false;
    for (let t = 0; t < 300; t++) {
      e.fixedUpdate(1 / 60, hooks);
      if (e.ai0 === 0 && e.facing === -1) { turned = true; break; }
    }
    expect(turned).toBe(true);
    expect(e.y + e.h).toBeLessThanOrEqual(60 * T + 1);   // 未坠坑(仍在主地板)
  });

  it('C: 平坦地 → 态 0 facing==sign(dx)（走行头朝玩家护栏）', () => {
    const w = world70();
    const st = w.store;
    for (let x = 10; x <= 70; x++) st.setTileSilent(x, 60, 2);
    const player = playerMock(52 * T, 60 * T);   // dist=160<200 → 不蓄力,纯走行
    const hooks = hooksFor(w, player);
    const e = Enemy.fromVanilla(154, 40 * T, 59 * T)!;
    for (let t = 0; t < 60; t++) {
      e.fixedUpdate(1 / 60, hooks);
      expect(e.facing).toBe(1);   // 玩家在右 → 头朝右（渲染翻面后=眼在右半）
    }
  });

  it('同族 153 巨型陆龟：玩家在下方坑底 → 同款不折返+随行跳崖', () => {
    const w = buildLedgeWorld([46, 52], 71);
    const player = playerMock(50 * T, 71 * T);
    const hooks = hooksFor(w, player);
    const e = Enemy.fromVanilla(153, 42 * T, 59 * T)!;
    let everTurned = false;
    let fell = false;
    for (let t = 0; t < 400; t++) {
      e.fixedUpdate(1 / 60, hooks);
      if (e.ai0 === 0 && e.onGround && e.y + e.h <= 61 * T
        && player.cx > e.cx && e.facing === -1) everTurned = true;
      if (e.y + e.h > 70 * T) fell = true;
    }
    expect(everTurned).toBe(false);
    expect(fell).toBe(true);
  });
});
