// ★BJ649 酷酷史莱姆 Slachi「被推出房间外弹跳」（2026-10-12,用户实报十周年纪念种子）。
//
// 【物证链】behavior-log 十周年纪念种子 01-50-17 / 18-05-47 两份 30t 采样：
//   town_slime_cool x 62438→62444（6px/300t 龟速蠕动,朝 home 3904 列）、
//   y 4303→4337→4304「33px 振幅/300t 慢抛物线」、g=0 全程、wm=0 恒、vx 0.02 恒、
//   悬浮 home (3904,275) 上方 ~6 格;行272 长平台（x3898-3911,内 11P=平台）=
//   自宅房间天花板,竖列平台 x3897/3902/3907 行273-275=平台梯。
//
// 【定谳】三段:
//   ① 「慢抛物线」=30t 采样对原版城镇史莱姆【常蹦周期 ~33t】的混叠假象（LCM≈330t;
//      逐拍复现实测周期 33t:落→臂A vy=-5→滞空→落→…）。臂A=cs:54721-25 flag14
//      末档（行走中侧带净空→vy=-5）=原版城镇史莱姆招牌蹦跳,本仓 1:1 无偏离。
//      g=0 恒 = 蹦跳滞空 33t > 采样间隔 30t。
//   ② 史莱姆所在位 = 自宅屋顶（行272 平台=房间天花板）。夜间 sitFlag 窗内
//      walk-home 臂 num7(脚行 271)≠floorY(276) 永不合闸 → 屋顶振荡;玩家在场
//      压制回家传送（cs:53977-98 视野门,原版同）。此段无缺陷。
//   ③ 真凶【本仓缺陷】= A9 臂B 支撑谓词（TownNPC.fixedUpdate,cs:54760-87）:
//      原版 `tileSafely6.nactive() && Main.tileSolid[type]`（cs:54771-72）【无
//      !tileSolidTop 排除】→ 平台九件套整批计入支撑（Main.cs:8031-32
//      tileSolidTop[19]=true;tileSolid[19]=true;239/380/427/435-439 同批）。
//      本仓 SOLID_LUT=defs.solid≡tileSolid∧!tileSolidTop 把平台排除 → 平台上空
//      支撑恒 0≤2 → 臂B 每滞空拍点火（vx×0.2+停走）→ 史莱姆 0.02px/t 龟速原地
//      蹦跳永不下地=「悬浮弹跳」。同族判例:2026-08-31 walkPrediction avoidFalling
//      平台落点修复（同文件已修,本支漏同步）。
// 【落刀】臂B 支撑谓词 isSolid ∪ VAN_TILE_SOLID_EXTRA 平台九件套（sheet 域单源
//      GenSolid,=原版 tileSolid 真表代理,Game.solid() 同式）。家具顶（桌 14/
//      工作台 16 等原版 tileSolid=false）不计入——勿放宽到 isPlatform。
// 【变异】M1 摘平台九件套项→T1 恰红（余 4 绿）;M2b 谓词放宽 isSolid∪isPlatform
//        →T3 恰红（余 4 绿）。逐字节还原+sha256 对拍（98838077…）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TownNPC, WALK_SPEED } from '../src/entities/TownNPC';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';

const PLAT = TILE_BY_KEY['platform']!;   // sheet 19（平台九件套首领）
const TABLE = TILE_BY_KEY['table']!;     // 原版 tileSolid[14]=false（家具顶不计数）
const DIRT = TILE_BY_KEY['dirt']!;
const WOOD = TILE_BY_KEY['wood']!;

function makeGame(world: World, playerX: number, playerY: number) {
  return {
    game: {
      world,
      // 玩家钉在史莱姆身位（回家传送视野门压制=物证「玩家在场」同相）
      player: {
        x: playerX, y: playerY, w: 20, h: 42, dead: false,
        luckState: { usedGalaxyPearl: false, npcLuck: () => {}, playerLuck: () => 0 },
      },
      enemies: () => [],
      npcs: () => [],
      critters: () => [],
      spawnTownShot: () => {},
      spawnParticles: () => {},
      spawnBurst: () => {},
      playSfx: () => {},
      playSfxFiles: () => {},
      addDamageNumber: () => {},
      achievements: { notifyProgressionEvent: () => {} },
      behavioLog: () => {},
      quickFindHomeForNpc: () => false,
    } as never,
  };
}

/** T1/T1b 场景:长平台/实心地板（支撑>2）。★物证同相=纯平台层下无实心
 *  （行272 平台下方 273-275 只有 3 根平台竖列,isSolid 语义下全隐形）——
 *  underTile=null 即纯悬空平台;WOOD 对照面垫 Dirt（实心正常计数） */
function makeLongFloorWorld(floorTile: number, underTile: number | null, floorRow = 60) {
  const world = new World(240, 200, 100, 'bj649');
  const st = world.store;
  for (let x = 60; x <= 200; x++) st.setTileSilent(x, floorRow, floorTile);
  if (underTile !== null) for (let x = 60; x <= 200; x++) st.setTileSilent(x, floorRow + 1, underTile);
  world.clock.timeOfDay = 0;   // 午夜（夜窗=sitFlag 真,物证同相）
  return world;
}

/** T2 场景:断崖（顶 row60 x150-210 / 谷底 row80 x60-210）。家 (90,79) 在谷底、
 *  与崖顶出发位（160 列）相距 70 列（>±35）→ walkPrediction avoidFalling 豁免
 *  （cs:56120-23 远行赶路愿跳坑）→ 史莱姆从崖缘走出=腾空贴崖面下坠 → 臂B 支撑窗
 *  （崖面邻列 1-2 实心格）≤2 → 确定点火;谷底承接存活 */
function makeCliffWorld() {
  const world = new World(240, 200, 100, 'bj649');
  const st = world.store;
  for (let x = 150; x <= 210; x++) st.setTileSilent(x, 60, DIRT);
  for (let x = 60; x <= 210; x++) st.setTileSilent(x, 80, DIRT);
  world.clock.timeOfDay = 0;
  return world;
}

/** 家锚远在 homeX 列（同 floorRow 地面行）→ 夜间 walk-home 臂持续给走意（物证同相:
 *  屋顶上 num7≠floorY 永不合闸）;玩家钉在身位压制传送 */
function spawnSlime(world: World, cxTile: number, floorRow: number, homeX: number) {
  // 脚底抬 2px 起落:家具顶/平台承接走「下落跨越」门,贴面出生不跨越=穿落
  const npc = new TownNPC('town_slime_cool', cxTile * 16 + 8, floorRow * 16 - 2);
  npc.home = { x: homeX, y: floorRow - 1 };
  return npc;
}

/** 驱动并采样（每 tick 记 vx 峰值 + 臂B 特征计数） */
function drive(npc: TownNPC, world: World, ticks: number, cxTile: number, floorRow: number) {
  const { game } = makeGame(world, cxTile * 16, (floorRow - 2) * 16);
  const inner = npc as unknown as { walkMode: number; walkT: number; turnLock: number; dead: boolean };
  let vxMax = 0;
  let hopCount = 0;      // vy 由 0/正 → 负 的起跳拍数
  let armBHits = 0;      // 臂B 特征:滞空拍 wm=0 且 turnLock=40 且 walkT∈[50,100]
  let prevVy = 0;
  for (let t = 1; t <= ticks; t++) {
    npc.fixedUpdate(1 / 60, game);
    if (prevVy <= 0 && npc.vy <= 0 && prevVy >= 0 && npc.vy < -4) hopCount++;
    if (!npc.onGround && inner.walkMode === 0 && inner.turnLock === 40
      && inner.walkT >= 50 && inner.walkT <= 100) armBHits++;
    const avx = Math.abs(npc.vx);
    if (avx > vxMax) vxMax = avx;
    prevVy = npc.vy;
  }
  return { vxMax, hopCount, armBHits, dead: inner.dead };
}

describe('BJ649 城镇史莱姆臂B平台支撑谓词（原版 tileSolid 含平台九件套）', () => {
  it('T1 真凶判别:长平台上空常蹦不触发臂B——走态保持 vx 达满速（物证形态反演锁）', () => {
    const world = makeLongFloorWorld(PLAT, null);
    const npc = spawnSlime(world, 130, 60, 90);
    const { vxMax, armBHits } = drive(npc, world, 600, 130, 60);
    // 修复前:臂B 每滞空拍 vx×0.2 → vx 恒 ≤0.13 龟速(物证 0.02 同相)
    // 修复后:走态保持 → vx 加速至 num22=1.0
    expect(vxMax).toBeGreaterThanOrEqual(WALK_SPEED * 0.9);
    expect(armBHits).toBe(0);
  });

  it('T1b 实心地板同态:臂B 不误触发（对照面）', () => {
    const world = makeLongFloorWorld(WOOD, DIRT);
    const npc = spawnSlime(world, 130, 60, 90);
    const { vxMax, armBHits } = drive(npc, world, 600, 130, 60);
    expect(vxMax).toBeGreaterThanOrEqual(WALK_SPEED * 0.9);
    expect(armBHits).toBe(0);
  });

  it('T2 臂B 本体保留:断崖腾空贴崖面支撑≤2 → 停走五常数照常点火', () => {
    const world = makeCliffWorld();
    const npc = new TownNPC('town_slime_cool', 160 * 16 + 8, 60 * 16);
    npc.home = { x: 90, y: 79 };
    const { armBHits, dead } = drive(npc, world, 600, 160, 60);
    expect(armBHits).toBeGreaterThan(0);          // 腾空贴崖面 → 臂B 点火（原版行为保留）
    expect(dead).toBe(false);                     // 谷底承接存活
  });

  it('T3 家具顶不计入支撑:长桌面上空支撑=0 → 臂B 照常点火（勿放宽 isPlatform）', () => {
    // ★长桌面（141 格,无法走出边缘）:原版 tileSolid[14]=false → 桌顶不计支撑 →
    //   臂B 每滞空拍点火;变异 M2b（放宽 isPlatform,桌 platform:true 被计入）下
    //   支撑=3>2 臂B 静默 → armBHits=0 恰红
    const world = makeLongFloorWorld(TABLE, null);
    const npc = spawnSlime(world, 130, 60, 90);
    const { armBHits } = drive(npc, world, 600, 130, 60);
    expect(armBHits).toBeGreaterThan(0);
  });

  it('T4 平台九件套谓词单源:VAN_TILE_SOLID_EXTRA 覆盖 19/239/380/427/435-439', () => {
    // 静态面锁:谓词表与原版 Main.cs:8031-32/:9797-9800/:10118-10137 九件套逐项对拍
    const sheets = [19, 239, 380, 427, 435, 436, 437, 438, 439];
    for (const sh of sheets) {
      const def = TILE_DEFS.find((d) => d?.vanilla?.sheet === sh);
      expect(def, `sheet ${sh} 应有本仓 def`).toBeTruthy();
      expect(def!.solid ?? false, `sheet ${sh} 平台族 defs.solid 必须为 false（单向碰撞语义）`).toBe(false);
    }
  });
});
