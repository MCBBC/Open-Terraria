// BJ542 撒旦事件怪"穿墙"定谳判别面（用户实报：DD2 地精半嵌冰块/坡面内部走行）。
// 定谳（Terarria1457 亲读）：AI_107_ImprovedWalkers（NPC.cs:63575-65168）的穿墙相位
// = **原版本相**，非缺陷：
//   · flag2 相位门（:63686-63710）：FighterUsesDD2PortalAppearEffect 19 型
//     （NPCID.cs:4797 = 552-557/561-565/568-573/576-577，不含 566/567 旧日骷髅）
//     无 CanHit 视线且朝向目标且 ai[0]<=0 → 置 noGravity+noTileCollide 直飞目标；
//     入场闩锁须 vy==0（落地）或 |ΔY|>800（:63700-63704）。
//   · 相位飞行（:65049-65168）：X 向 Lerp(vx,±1,0.05) + 三档垂直伺服 +
//     alpha += 20 钳 60（幽灵化=刻意可视化）+ localAI[3]=40f 钉值（:65060，重臂
//     出生渐显块 → 相位结束 α 5/t 回落归零=幽灵态暂态）。
//   · 卡位传送（:64660-64691）：ai[3]==30 且 flag30（除 620 恒真）→ position.X +=
//     direction*width*2 穿墙瞬移；566/567 不在 fade 集永不相位但同样瞬移。
//   · 坡面/半砖不阻挡 CanHit（Collision.cs:443-453 slope==0 && !halfBrick 门）→
//     "坡面内部走行"=坡面不触发相位的原版 LOS 语义。
// 用户证据交叉验证（behavior-log-灵巧的女王内地 2026-10-07）：552 全程 eT=0（零卡死）、
//   vx=±1/vy=0/onGround 平滑穿过 tile(2137,263-264) 1 宽 2 高石柱——即 flag2 相位
//   特征（柱体挡 CanHit 线→相位直穿，非卡死非 unembed）。
// 判别面：A 相位穿冰墙+α幽灵态+退出落地；B 坡面不阻挡 CanHit；C 566 不相位但瞬移；
//         D 攻击窗（ai[0]>0）抑制相位；E ★落刀判别:相位结束 α 回落归零（:65060 钉值）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { losClear } from '../src/entities/bossAI';
import { TILE_BY_KEY } from '../src/data/tiles';
import { W107_PORTAL_FADE } from '../src/entities/bossAI_dd2';

const W = 220, H = 120, FLOOR = 60;   // H=120:CanHit y 钳 maxTilesY-40=80,FLOOR-1=59 须在钳上面（原版 :394-395 钳制带）
const ICE = TILE_BY_KEY['ice'];   // 冰块（内部注册 id,vanilla sheet 161,实心）
const VANILLA_FADE_SET = [552, 553, 554, 555, 556, 557, 561, 562, 563,
  564, 565, 568, 569, 570, 571, 572, 573, 576, 577];

function makeWorld(): World {
  const w = new World(W, H, 11, 'bj542');
  const st = w.store;
  w.groundLevel = 24;
  for (let x = 0; x < W; x++) {
    st.setTile(x, FLOOR, 1);
    st.setTile(x, FLOOR + 1, 1);
  }
  return w;
}

type Proj = { x: number; y: number; vx: number; vy: number; damage: number };

function makeHooks(w: World, playerAt: { x: number; y: number } | null) {
  const enemies: Enemy[] = [];
  const projectiles: Proj[] = [];
  const em = {
    nextId: 1,
    add: (e: unknown, bucket: 'enemies' | 'projectiles') => {
      const ent = e as { id: number };
      ent.id = em.nextId++;
      if (bucket === 'enemies') enemies.push(e as Enemy);
      else projectiles.push(e as Proj);
    },
  };
  const px = (playerAt?.x ?? 70) * TILE, py = (playerAt?.y ?? FLOOR - 3) * TILE;
  const hooks = {
    world: w, player: playerAt ? { x: px, y: py, w: 20, h: 42, cx: px + 10, cy: py + 21, vx: 0, vy: 0, dead: false, hp: 400, maxHp: 400, aggro: 0 } : null,
    enemies: () => enemies,
    critters: () => [],
    npcs: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    spawnBurst: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxWav: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
    cutTile: () => {},
    breakTile: (bx: number, by: number) => w.store.setTile(bx, by, 0),
    scene: { zoneGraveyard: false, zoneCorrupt: false, zoneCrimson: false, zoneSandstorm: false, zoneUndergroundDesert: false },
    entities: em,
  } as unknown as GameHooks;
  return { hooks, enemies, projectiles, em };
}

function spawnAt(h: ReturnType<typeof makeHooks>, id: number, tx: number): Enemy {
  const e = Enemy.fromVanilla(id, tx * TILE, 0)!;
  e.y = FLOOR * TILE - e.h;   // 底边贴 FLOOR 行顶（避免半埋触发相位假象）
  e.id = h.em.nextId++;
  h.enemies.push(e);
  return e;
}

function buildWall(st: World['store'], ice: boolean): void {
  for (let wx = 44; wx <= 46; wx++) {
    for (let wy = FLOOR - 20; wy <= FLOOR - 1; wy++) st.setTile(wx, wy, ice ? ICE : 1);
  }
}

const centerInSolid = (w: World, e: Enemy): boolean => {
  const st = w.store;
  return st.isSolid(Math.floor(e.cx / TILE), Math.floor(e.cy / TILE));
};

// ============ Face 0：fade 集静态对账（NPCID.cs:4797 19 键字面集） ============

describe('BJ542 Face0：FighterUsesDD2PortalAppearEffect 集对账（NPCID.cs:4797）', () => {
  it('W107_PORTAL_FADE == 原版 19 键全集（相位资格面；566/567 骷髅不在集）', () => {
    expect([...W107_PORTAL_FADE].sort((a, b) => a - b)).toEqual([...VANILLA_FADE_SET].sort((a, b) => a - b));
    expect(W107_PORTAL_FADE.has(566)).toBe(false);
    expect(W107_PORTAL_FADE.has(567)).toBe(false);
    expect(W107_PORTAL_FADE.size).toBe(19);
  });
});

// ============ Face A：相位穿冰墙（销案主面——原版本相复现） ============

describe('BJ542 FaceA：哥布林 552 相位穿冰墙+α幽灵态+退出落地（:63686-63710/:65049-65168）', () => {
  it('冰墙挡视线 → 相位直穿（嵌格帧>0、越过墙线、α 幽灵化、末段退出落地）', () => {
    const w = makeWorld();
    const h = makeHooks(w, null);
    const crystal = spawnAt(h, 548, 30);
    void crystal;
    const goblin = spawnAt(h, 552, 60);
    buildWall(w.store, true);
    let solidFrames = 0;
    let crossed = false;
    let alphaGhost = 0;
    for (let i = 0; i < 900; i++) {
      if (!goblin.dead) goblin.fixedUpdate(1 / 60, h.hooks);
      if (i > 60 && goblin.spawnAlpha > 0) alphaGhost++;   // 出生渐显(60t)结束后的幽灵态
      if (centerInSolid(w, goblin)) solidFrames++;
      if (!crossed && goblin.cx < 44 * TILE) crossed = true;
    }
    expect(solidFrames).toBeGreaterThan(10);   // 相位穿墙发生（本相复现——用户所见"半嵌冰块"）
    expect(crossed).toBe(true);                // 穿到了墙左侧
    expect(alphaGhost).toBeGreaterThan(0);     // 相位幽灵化（原版 alpha+=20 钳 60 的刻意可视化）
    // 退出相位：末段不嵌实心 + 落回地表 + 不再飞行
    let tailSolid = 0;
    for (let i = 0; i < 60; i++) {
      if (!goblin.dead) goblin.fixedUpdate(1 / 60, h.hooks);
      if (centerInSolid(w, goblin)) tailSolid++;
    }
    expect(tailSolid).toBe(0);
    expect(Math.abs(goblin.y + goblin.h - FLOOR * TILE)).toBeLessThanOrEqual(10);
  });
});

// ============ Face B：坡面 CanHit 语义钉值（"坡面内部走行"=相位穿坡的原版机制） ============
// 原版亲读（Collision.cs:388-480）：do-while 出膛条件（:477-480）= inActive||!active||
//   !tileSolid||tileSolidTop ——【无 slope 豁免】→ 坡面实心格作为视线落格同样阻挡 CanHit
//   （=坡面挡视线 → flag2 相位成立 → walker 相位穿坡="坡面内部走行"）；slope==0 项只出现在
//   "两邻格均整实心"夹杀子句（:449-453/:459-465）——坡面邻格不构成夹杀。

describe('BJ542 FaceB：坡面 CanHit 语义（Collision.cs:477-480 无坡豁免 / :449-465 夹杀 slope==0）', () => {
  const line = (place: (st: World['store']) => void) => {
    const w = makeWorld();
    place(w.store);
    const h = makeHooks(w, null);
    const y = (FLOOR - 1) * TILE + 8;   // 水平视线穿 row FLOOR-1
    return losClear(h.hooks, 8 * TILE + 8, y, 12 * TILE + 8, y);
  };
  it('坡面实心格在视线上 → 阻挡（与整块实心同判 → 坡面可触发相位）', () => {
    expect(line((st) => { st.setTile(10, FLOOR - 1, 2); st.setSlope(10, FLOOR - 1, 1); })).toBe(false);
    expect(line((st) => { st.setTile(10, FLOOR - 1, 2); })).toBe(false);
    expect(line(() => {})).toBe(true);   // 空场对照
  });
  it('夹杀子句 slope==0 门：坡面邻格不构成"两邻格均整实心"（不夹杀），整块实心邻格夹杀', () => {
    // 视线沿 row FLOOR-1 空格行进；column 10 的上下邻格成对放置
    expect(line((st) => {   // 坡面对 → 不夹杀 → 视线通
      st.setTile(10, FLOOR - 2, 2); st.setSlope(10, FLOOR - 2, 1);
      st.setTile(10, FLOOR, 2); st.setSlope(10, FLOOR, 1);
    })).toBe(true);
    expect(line((st) => {   // 整块对 → 夹杀 → 阻挡
      st.setTile(10, FLOOR - 2, 2);
      st.setTile(10, FLOOR, 2);
    })).toBe(false);
  });
});

// ============ Face C：566 旧日骷髅——不相位但 30t 卡位传送 ============

describe('BJ542 FaceC：566 非 fade 集（零相位幽灵）+ 卡位传送（:64660-64691）', () => {
  it('骷髅墙前滞留 → ai[3]==30 瞬移 Δx>=2w，全程无 α 幽灵态', () => {
    const w = makeWorld();
    const h = makeHooks(w, null);
    spawnAt(h, 548, 30);
    const sk = spawnAt(h, 566, 60);
    buildWall(w.store, true);
    let maxJump = 0;
    let prevX = sk.x;
    let ghostAfterSpawn = 0;
    for (let i = 0; i < 260; i++) {
      if (!sk.dead) sk.fixedUpdate(1 / 60, h.hooks);
      maxJump = Math.max(maxJump, Math.abs(sk.x - prevX));
      prevX = sk.x;
      if (i >= 125 && sk.spawnAlpha > 0) ghostAfterSpawn++;   // 出生渐显(120t)后零幽灵
    }
    expect(maxJump).toBeGreaterThanOrEqual(2 * sk.w - 0.5);   // 瞬移签名（position.X += direction*width*2）
    expect(ghostAfterSpawn).toBe(0);                          // 非 fade 集 → 永不相位幽灵化
  });
});

// ============ Face D：攻击窗（ai[0]>0）抑制相位 ============

describe('BJ542 FaceD：相位门 flag2 &= ai[0]<=0（:63696）', () => {
  it('前摇中不相位（α=0），收招后相位恢复（α>0）', () => {
    const w = makeWorld();
    const h = makeHooks(w, null);
    spawnAt(h, 548, 30);
    const goblin = spawnAt(h, 552, 60);
    for (let i = 0; i < 70; i++) goblin.fixedUpdate(1 / 60, h.hooks);   // 无墙热身:出生渐显完毕
    buildWall(w.store, true);
    goblin.ai0 = 20;                                                    // 人为进前摇
    for (let i = 0; i < 20; i++) {                                      // 攻击窗 20t
      goblin.fixedUpdate(1 / 60, h.hooks);
      expect(goblin.spawnAlpha).toBe(0);                                // 攻击中不穿墙不幽灵化
    }
    let resumed = false;
    for (let i = 0; i < 10; i++) {
      goblin.fixedUpdate(1 / 60, h.hooks);
      if (goblin.spawnAlpha > 0) resumed = true;                        // 收招（ai0<=0）→ 相位恢复
    }
    expect(resumed).toBe(true);
  });
});

// ============ Face E：★落刀判别——相位结束 α 回落归零（:65060 localAI[3]=40f 钉值） ============

describe('BJ542 FaceE：相位幽灵态为暂态（localAI[3]=40f 重臂出生渐显块）', () => {
  it('视线恢复后 α 以 5/t 回落归零（曾缺钉 → α 恒 60 微透明不复原）', () => {
    const w = makeWorld();
    const h = makeHooks(w, null);
    spawnAt(h, 548, 30);
    const goblin = spawnAt(h, 552, 60);
    buildWall(w.store, true);
    let alphaAtPhase = 0;
    for (let i = 0; i < 90; i++) {
      goblin.fixedUpdate(1 / 60, h.hooks);
      if (i === 89) alphaAtPhase = goblin.spawnAlpha;   // 相位中（墙在）
    }
    expect(alphaAtPhase).toBeGreaterThan(0);            // 相位幽灵态在（进入 E 判别前提）
    for (let wx = 44; wx <= 46; wx++) {
      for (let wy = FLOOR - 20; wy <= FLOOR - 1; wy++) w.store.setTile(wx, wy, 0);   // 拆墙 → LOS 恢复
    }
    for (let i = 0; i < 60; i++) goblin.fixedUpdate(1 / 60, h.hooks);
    expect(goblin.spawnAlpha).toBe(0);                  // 幽灵态回落归零（:65060 钉值语义）
    for (let i = 0; i < 40; i++) {
      goblin.fixedUpdate(1 / 60, h.hooks);
      expect(goblin.spawnAlpha).toBe(0);                // 恒 0（不复燃）
    }
  });
});
