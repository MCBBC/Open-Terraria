// 宠物 AI 数据层回归（tools/extract-petai.mjs ← Projectile.cs
// AI_026(:55166) / AI_067(:46471) / AI_144(:66728) + aiStyle 11(:22684)/90(:31320)/124(:34023)）
// + PetFollower 三族引擎运行时烟测（地面跳跃/飞行环绕/悬停锚点 + 表外回退）
import { describe, it, expect } from 'vitest';
import petAiJson from '../src/data/vanilla-petai.json';
import petsJson from '../src/data/vanilla-pets.json';
import projJson from '../src/data/vanilla-projectiles.json';
import framesJson from '../src/data/vanilla-projframes.json';
import { PetFollower } from '../src/entities/PetFollower';
import type { GameHooks } from '../src/entities/types';

const T = petAiJson as unknown as {
  meta: { petProjCount: number; familyCounts: Record<string, number>; fallback: string; methodLines: Record<string, number> };
  defaults: Record<string, Record<string, number | number[] | string>>;
  pets: Record<string, {
    name: string; aiStyle: number; family: 'ground' | 'fly' | 'hover';
    frames: number; [k: string]: unknown;
  }>;
};
const pets = petsJson as Record<string, { buff: number; proj: number; light: number }>;
const projs = projJson as Record<string, { aiStyle?: number }>;
const frames = framesJson as Record<string, number>;

/** vanilla-pets.json 的唯一 proj id 全集（升序） */
const PET_PROJ_IDS = [...new Set(Object.values(pets).map((e) => e.proj))].sort((a, b) => a - b);

describe('vanilla-petai：aiStyle 覆盖统计', () => {
  it('宠物 proj 全覆盖（61 款，无缺条目/无 aiStyle 缺失）', () => {
    expect(T.meta.petProjCount).toBe(61);
    expect(PET_PROJ_IDS).toHaveLength(61);
    for (const id of PET_PROJ_IDS) {
      expect(T.pets[String(id)], `proj ${id} 缺条目`).toBeDefined();
      expect(T.pets[String(id)].aiStyle, `proj ${id} 缺 aiStyle`).toBe(projs[String(id)]?.aiStyle);
    }
  });

  it('aiStyle 分布 = {26:48, 67:5, 144:4, 124:2, 90:1, 11:1}（任务预期"19 为主"实勘为 26）', () => {
    const dist: Record<string, number> = {};
    for (const id of PET_PROJ_IDS) {
      const k = String(T.pets[String(id)].aiStyle);
      dist[k] = (dist[k] ?? 0) + 1;
    }
    expect(dist).toEqual({ '11': 1, '26': 48, '67': 5, '90': 1, '124': 2, '144': 4 });
  });

  it('家族分派覆盖 61 款：ground 43 / fly 10 / hover 8，且 aiStyle→家族映射合法', () => {
    const counts: Record<string, number> = { ground: 0, fly: 0, hover: 0 };
    for (const id of PET_PROJ_IDS) {
      const e = T.pets[String(id)];
      expect(['ground', 'fly', 'hover']).toContain(e.family);
      counts[e.family]++;
      // 映射不变量：26 → ground|fly；67 → ground；11/90/124/144 → hover
      if (e.aiStyle === 26) expect(['ground', 'fly']).toContain(e.family);
      else if (e.aiStyle === 67) expect(e.family).toBe('ground');
      else expect(e.family).toBe('hover');
    }
    expect(counts).toEqual({ ground: 43, fly: 10, hover: 8 });
    expect(T.meta.familyCounts).toEqual(counts);
  });

  it('AI_026 飞行子型 10 款与 ground/fly 拆分一致（tileCollide=false 分支成员）', () => {
    // AI_026 内无重力悬停分支成员（源码 :56163/:56290/:56468/:56833/:57000 等）
    const FLY_26 = [175, 197, 198, 199, 211, 380, 774, 815, 817, 1046];
    for (const id of FLY_26) expect(T.pets[String(id)].family, `proj ${id}`).toBe('fly');
    // 其余 aiStyle 26 全部是地面族
    for (const id of PET_PROJ_IDS) {
      if (T.pets[String(id)].aiStyle === 26 && !FLY_26.includes(id)) {
        expect(T.pets[String(id)].family, `proj ${id}`).toBe('ground');
      }
    }
  });

  it('帧数与 vanilla-projframes 表一致（缺条目 = 1 帧）', () => {
    for (const id of PET_PROJ_IDS) {
      expect(T.pets[String(id)].frames).toBe(frames[String(id)] ?? 1);
    }
  });
});

describe('vanilla-petai：三族参数抽查', () => {
  it('ground 地面跳跃族：Bunny(111) 默认步速 + Turtle(127) 慢档 + FennecFox(816) 大组档', () => {
    const D = T.defaults.ground as Record<string, unknown>;
    // AI_026 头段 num=85(:55178) / num181=0.08(:59104) / num182=6.5(:59105)
    expect(D.idleRange).toBe(85);
    expect(D.accel).toBeCloseTo(0.08);
    expect(D.maxSpeed).toBeCloseTo(6.5);
    // 跳跃梯与追赶飞行默认（:59299-59315 / :57513）
    expect(D.jumpLadder).toEqual([-5.1, -7.1, -11.1, -10.1, -9.1]);
    expect(D.flySpeed).toBe(10);
    expect(D.flyAccel).toBeCloseTo(0.2);
    expect(D.teleport).toBe(2000);

    // Bunny：全默认 + 追赶飞行提速 11（:57515-57517）
    const bunny = T.pets['111'];
    expect(bunny.name).toBe('Bunny');
    expect(bunny.flySpeed).toBe(11);
    expect(bunny.idleRange).toBeUndefined();

    // Turtle(127)：idleRange 50 / 0.04+2 慢档（:55192-55195, :59106-59109）+
    //   catchUpRange 200(:57321-57323) + 落地距 100(:57453-57457 大组)
    const turtle = T.pets['127'];
    expect(turtle.idleRange).toBe(50);
    expect(turtle.accel).toBeCloseTo(0.04);
    expect(turtle.maxSpeed).toBe(2);
    expect(turtle.catchUpRange).toBe(200);
    expect(turtle.landRange).toBe(100);

    // FennecFox(816)：步速大组 6/0.2（:59141-59144）+ 追赶飞行 12/0.4 + 落地距 100
    const fox = T.pets['816'];
    expect(fox.accel).toBeCloseTo(0.2);
    expect(fox.maxSpeed).toBe(6);
    expect(fox.idleRange).toBe(95);       // switch 组 num=95（:55230-55243）
    expect(fox.catchUpRange).toBe(400);   // case 816 → num91=400（:57331-57343）
    expect(fox.flySpeed).toBe(12);
    expect(fox.flyAccel).toBeCloseTo(0.4);
    expect(fox.landRange).toBe(100);
    // 朝向翻转：AI_026 地面族 spriteDirection=-direction → flipSign=+1
    expect(fox.flipSign).toBe(1);
    expect(fox.faceFrom).toBe('move');
  });

  it('ground aiStyle 67 滚地族：巨石宠滚动 + 红心目标偏移 + 彩虹巨石提速（AI_067 :46471）', () => {
    // BoulderPet(1056)：rotation += vx/16（:46800-46801），目标 X = -(15+w/2)·dir
    const boulder = T.pets['1056'];
    expect(boulder.roll).toBe(16);
    expect(boulder.followDx).toBe(-25);
    expect(boulder.flipSign).toBe(-1);    // AI_067 spriteDirection = sign(vx)
    // CrimsonHeart(500)：滚动 /20（:46785），目标偏移 -(15+w/2+40)·dir（:46692-46694）
    const heart = T.pets['500'];
    expect(heart.roll).toBe(20);
    expect(heart.followDx).toBe(-65);
    expect(heart.catchUpRange).toBe(200); // num3 = 200（:46646-46651）
    // RainbowBoulderPet(1090)：追赶飞行提速 18（:47087-47089）
    expect(T.pets['1090'].flySpeed).toBe(18);
    // CompanionCube(653) / DirtiestBlock(1018)：目标 = 玩家中心 X（无偏移）
    expect(T.pets['653'].followDx).toBe(0);
    expect(T.pets['1018'].followDx).toBe(0);
  });

  it('fly 飞行环绕族：BabyHornet(198) 共享体 + ZephyrFish(380) 慢档 + SharkPup(774) 浮游', () => {
    // 198 组共享体（:56468-56700）：-60x/-60y 悬停 + ±10 抖动 + 组默认速度 14 + 2000 瞬移
    const hornet = T.pets['198'];
    expect(hornet.hoverX).toBe(-60);
    expect(hornet.hoverY).toBe(-60);
    expect(hornet.jitter).toBe(10);
    expect(hornet.speed).toBe(14);
    expect(hornet.teleport).toBe(2000);
    expect(hornet.brake).toBe(50);
    expect(hornet.brakeMode ?? 'damp').toBe('damp');
    // ZephyrFish(380)：num53 = 6 / 加速度 0.3（:56519-56521）
    expect(T.pets['380'].speed).toBe(6);
    expect(T.pets['380'].accel).toBeCloseTo(0.3);
    // SharkPup(774)：-70x + 正弦浮游 ±8（:56489-56495），无随机抖动
    const shark = T.pets['774'];
    expect(shark.hoverX).toBe(-70);
    expect(shark.bob).toBe(8);
    expect(shark.jitter).toBe(0);
    // Wisp(211)：光宠，目标头上 -60，1000 瞬移
    const wisp = T.pets['211'];
    expect(wisp.hoverY).toBe(-60);
    expect(wisp.teleport).toBe(1000);
    // 朝向：AI_026 飞行分支 spriteDirection = direction → flipSign=-1；199 恒 1 → 0
    expect(hornet.flipSign).toBe(-1);
    expect(T.pets['199'].flipSign).toBe(0);
  });

  it('hover 悬停锚点族：四 aiStyle 各自锚点参数', () => {
    // aiStyle 11 ShadowOrb(18)：环绕保持距 70 + 速度 3 + 800 瞬移（:22756-22765）
    const orb = T.pets['18'];
    expect(orb.holdDist).toBe(70);
    expect(orb.speed).toBe(3);
    expect(orb.teleport).toBe(800);
    expect(orb.flipSign).toBe(0);         // 纯旋转无翻转
    // aiStyle 90 MagicLantern(492)：+40x·dir/-40y 锚点 + 基速 4 斜坡 + 插值权重 3（:31370-31378）
    const lantern = T.pets['492'];
    expect(lantern.hoverX).toBe(40);
    expect(lantern.hoverY).toBe(-40);
    expect(lantern.speedBase).toBe(4);
    expect(lantern.speedLerp).toBe(3);
    expect(lantern.teleport).toBe(1000);
    // aiStyle 124：SuspiciousTentacle(650) (30,-20) / GlommerPet(957) (-40,-40)（:34098-34140）
    expect(T.pets['650'].hoverX).toBe(30);
    expect(T.pets['650'].hoverY).toBe(-20);
    expect(T.pets['957'].hoverX).toBe(-40);
    expect(T.pets['957'].hoverY).toBe(-40);
    // aiStyle 144 AI_144_DD2Pet：DD2PetDragon(701) 全默认(30,-20)/snap 4
    expect(T.pets['701'].hoverX).toBe(30);
    expect(T.pets['701'].hoverY).toBe(-20);
    expect(T.pets['701'].snap).toBe(4);
    //   DD2PetGhost(702)：snap 6 + 待机帧率 10 + 余弦 bob 2（:66748-66751）
    expect(T.pets['702'].snap).toBe(6);
    expect(T.pets['702'].idleRate).toBe(10);
    expect(T.pets['702'].bob).toBe(2);
    //   UpbeatStar(764)：velLerp 0.025（:66802-66803）
    expect(T.pets['764'].velLerp).toBeCloseTo(0.025);
    //   AxeFairyPet(1050)：X 反向 -30 + 帧窗口 0-2（:66852-66860）
    expect(T.pets['1050'].hoverX).toBe(-30);
    expect(T.pets['1050'].frameTo).toBe(2);
    // 朝向来源 = 玩家朝向
    expect(lantern.faceFrom).toBe('player');
  });
});

// ===================== 运行时烟测 =====================
/** 测试用世界：row ≥ FLOOR 行为地板，WALL 列加一堵墙（跳跃用） */
function stubWorld(FLOOR: number, WALL: number | null) {
  const W = 400, H = 200, n = W * H;
  const slope = new Uint8Array(n), half = new Uint8Array(n);
  return {
    w: W, h: H, slope, half,
    inBounds: (c: number, r: number) => c >= 0 && c < W && r >= 0 && r < H,
    idx: (c: number, r: number) => r * W + c,
    isSolid: (c: number, r: number) => r >= FLOOR || (WALL !== null && c === WALL && r >= FLOOR - 10 && r < FLOOR),
    isPlatform: () => false,
  };
}
function stubGame(FLOOR = 60, WALL: number | null = null): GameHooks {
  return { world: { store: stubWorld(FLOOR, WALL) } } as unknown as GameHooks;
}
function stubPlayer(cx: number, floorRow: number, facing = 1) {
  const w = 20, h = 42, x = cx - w / 2, y = floorRow * 16 - h;
  return { x, y, w, h, cx, cy: y + h / 2, facing, dead: false };
}

describe('PetFollower 三族引擎运行时', () => {
  it('ground 族（Bunny 111）：向玩家行走 + 前方挡墙触发跳跃梯', () => {
    const FLOOR = 60;
    const player = stubPlayer(110 * 16, FLOOR, 1);
    const game = stubGame(FLOOR, 95);   // col 95 一堵 10 格高的墙
    const pet = new PetFollower(90 * 16, FLOOR * 16 - 18, 111, () => player);
    const startX = pet.x, startY = pet.y;
    let minY = startY;
    for (let i = 0; i < 90; i++) {
      pet.fixedUpdate(1, game);
      minY = Math.min(minY, pet.y);
      expect(Number.isFinite(pet.x)).toBe(true);
      expect(Number.isFinite(pet.y)).toBe(true);
    }
    // 行走：向右靠近玩家（dist≈311 < catchUpRange 500 → 地面态）
    expect(pet.cx).toBeGreaterThan(startX + pet.w / 2 + 20);
    // 跳跃梯：前方挡墙（col 95 探测命中）→ vy 取 -5.1/-7.1/-9.1/-10.1/-11.1 档
    expect(minY).toBeLessThan(startY - 4);
  });

  it('ground 族超距瞬移：dist > 2000 直接落在玩家身边', () => {
    const FLOOR = 60;
    const player = stubPlayer(100 * 16, FLOOR, 1);
    const game = stubGame(FLOOR, null);
    const pet = new PetFollower(100 * 16 + 3000, FLOOR * 16 - 18, 111, () => player);
    pet.fixedUpdate(1, game);
    expect(Math.abs(pet.cx - player.cx)).toBeLessThan(1);
    expect(pet.vy).toBe(0);
  });

  it('fly 族（BabyHornet 198）：悬停玩家后上方并收敛（无 tileCollide）', () => {
    const player = stubPlayer(200 * 16, 60, 1);
    const game = stubGame(60, null);
    const pet = new PetFollower(150 * 16, 30 * 16, 198, () => player);
    for (let i = 0; i < 300; i++) pet.fixedUpdate(1, game);
    const wantX = player.cx - 60, wantY = player.cy - 60;   // hoverX -60 × facing
    expect(Math.hypot(pet.cx - wantX, pet.cy - wantY)).toBeLessThan(140);
    expect(Number.isFinite(pet.x)).toBe(true);
  });

  it('hover 族（SuspiciousTentacle 650）：锚定 (30·facing, -20) 指数收敛', () => {
    const player = stubPlayer(200 * 16, 60, 1);
    const game = stubGame(60, null);
    const pet = new PetFollower(150 * 16, 30 * 16, 650, () => player);
    for (let i = 0; i < 120; i++) pet.fixedUpdate(1, game);
    expect(Math.abs(pet.cx - (player.cx + 30))).toBeLessThan(8);
    expect(Math.abs(pet.cy - (player.cy - 20))).toBeLessThan(8);
  });

  it('hover 族（ShadowOrb 18）：holdDist=70 死区——区外以速度 3 直取玩家中心收敛', () => {
    const player = stubPlayer(200 * 16, 60, 1);
    const game = stubGame(60, null);
    // 远距（>70）：每 tick 以速度 3 直取玩家中心（:22796-22800）→ 停在中心 ≤1 步内
    const pet = new PetFollower(150 * 16, 30 * 16, 18, () => player);
    for (let i = 0; i < 200; i++) pet.fixedUpdate(1, game);
    expect(Math.hypot(pet.cx - player.cx, pet.cy - player.cy)).toBeLessThanOrEqual(4);
    expect(pet.vx).toBe(0);
    // 死区内（<70）：不动（:22802-22804 velocity = 0）。proj 18 判定盒 32×32，
    // 构造位 (cx-40, cy-40) 的中心距 = hypot(40-16, 40-16) ≈ 34 < 70
    const pet2 = new PetFollower(player.cx - 40, player.cy - 40, 18, () => player);
    const d0 = Math.hypot(pet2.cx - player.cx, pet2.cy - player.cy);
    expect(d0).toBeLessThan(70);
    for (let i = 0; i < 60; i++) pet2.fixedUpdate(1, game);
    expect(Math.hypot(pet2.cx - player.cx, pet2.cy - player.cy)).toBeCloseTo(d0, 5);
    expect(pet2.vx).toBe(0);
  });

  it('表外 proj id：回退旧肩后悬停近似（不崩、收敛、无 NaN）', () => {
    const player = stubPlayer(200 * 16, 60, 1);
    const game = stubGame(60, null);
    const pet = new PetFollower(150 * 16, 30 * 16, 400, () => player);  // 400 非宠物投射物
    for (let i = 0; i < 200; i++) pet.fixedUpdate(1, game);
    expect(Number.isFinite(pet.x) && Number.isFinite(pet.y)).toBe(true);
    expect(Math.hypot(pet.cx - player.cx, pet.cy - player.cy)).toBeLessThan(80);
  });
});

// ================= 二审补齐：fly 分档/Y×2/Wisp 远距档/动态提速/960 偏移/313 门 =================
import { flyAccelOf, accelTowardY, accelToward } from '../src/entities/PetFollower';

describe('宠物行为二审补齐（:56560-56925/:56010-56050/:59361）', () => {
  it('flyAccelOf 距离分档：198 近档 0.1/远档 0.6，380 远档 0.4，817 远档 0.5@400', () => {
    expect(flyAccelOf(198, 50, 0.4)).toBe(0.1);
    expect(flyAccelOf(198, 200, 0.4)).toBe(0.4);
    expect(flyAccelOf(198, 400, 0.4)).toBe(0.6);
    expect(flyAccelOf(380, 400, 0.4)).toBe(0.4);
    expect(flyAccelOf(817, 450, 0.4)).toBe(0.5);
    expect(flyAccelOf(815, 450, 0.4)).toBe(0.4);   // 815 无远档
    expect(flyAccelOf(774, 30, 0.4)).toBe(0.1);     // 阈值 40
    expect(flyAccelOf(111, 400, 0.4)).toBe(0.4);    // 表外款默认
  });

  it('accelTowardY 交叉零点 ×2（:56666-56674：总步 3acc；X 轴仅双步）', () => {
    expect(accelTowardY(-1, 1, 0.1)).toBeCloseTo(-0.7, 6);
    expect(accelToward(1, -1, 0.1)).toBeCloseTo(0.8, 6);
  });

  it('Wisp(211) 远距追击闩：>200 置位恒速 12 直取玩家', () => {
    const game = stubGame(60, null);
    const player = stubPlayer(200 * 16, 60, 1);
    // 初始距 ≈788：在 1000 瞬移门内、>200 追击门 → wispFar 置位
    const pet = new PetFollower(160 * 16, 30 * 16, 211, () => player);
    // 中段（仍远距）：恒速 12 直取——速度模长 ≈12
    let midSpeed = 0;
    for (let i = 0; i < 20; i++) pet.fixedUpdate(1, game);
    midSpeed = Math.hypot(pet.vx, pet.vy);
    expect(midSpeed).toBeGreaterThan(8);      // ≈12 档（远距追击）
    // 追到底：赶到玩家身边（证明追击段生效而非悬停滞留）
    for (let i = 0; i < 120; i++) pet.fixedUpdate(1, game);
    expect(Math.hypot(pet.cx - player.cx, pet.cy - player.cy)).toBeLessThanOrEqual(60);
    expect(Number.isFinite(pet.x)).toBe(true);
  });

  it('960 Chester 目标偏移 70px（玩家移动取 direction，:56042-56050）', () => {
    const game = stubGame(60, null);
    const player = stubPlayer(200 * 16, 60, -1);
    (player as { vx?: number }).vx = 5;   // 玩家在移动 → num8 = player.direction = -1
    const pet = new PetFollower(200 * 16, 60 * 16 - 18, 960, () => player);
    for (let i = 0; i < 120; i++) pet.fixedUpdate(1, game);
    // 目标 = cx - 70×(-1) = cx+70（右侧身后）；idleRange=10 → 停在 cx+70±50 内
    expect(pet.cx - player.cx).toBeGreaterThan(20);
    expect(pet.cx - player.cx).toBeLessThan(130);
  });

  it('追赶飞行 <60px 漂移（:57557-57561：近距不重定向）', () => {
    const game = stubGame(60, null);
    const player = stubPlayer(200 * 16, 12, 1);   // 高空玩家 → 兔子追赶飞行
    const pet = new PetFollower(200 * 16, 40 * 16, 111, () => player);
    for (let i = 0; i < 5; i++) pet.fixedUpdate(1, game);
    // 强制近距 <60px
    pet.x = player.cx - 30; pet.y = player.cy - 20;
    const v0 = pet.vx;
    for (let i = 0; i < 10; i++) pet.fixedUpdate(1, game);
    // <60px 期间 vx 不被重定向到 flySpeed 档（漂移保持）
    expect(Math.abs(pet.vx - v0)).toBeLessThan(3);
  });

  it('313 Spider 翻转门（:59361 type != 313——恒不翻）', () => {
    const game = stubGame(60, null);
    const player = stubPlayer(200 * 16, 60, 1);
    const pet = new PetFollower(200 * 16, 60 * 16 - 18, 313, () => player);
    for (let i = 0; i < 30; i++) pet.fixedUpdate(1, game);
    expect(pet.projId).toBe(313);
    expect(Number.isFinite(pet.x)).toBe(true);
  });
});
