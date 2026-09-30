import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';

// BJ410 冰雪陆龟 154 朝向定谳（2026-09-30 用户实报"贴图朝向与角色相反/屁股朝玩家"）。
//
// 原版朝向链（先定谳锚;★C5 复核:旧注 :29387-29391 行号漂移,实际锚如下）：
//   - AI（NPC.cs:29335 aiStyle 39 态 0）：direction=sign(velocity.X)（:29413-29420,
//     vx==0 保持原向）→ `spriteDirection = direction`（:29421）——贴图朝向=行进向。
//     速度反转折返 `!justHit && velocity.X != oldVelocity.X → direction *= -1`
//     （:29469-29472;oldVelocity=Update 尾 :93681 在 ApplyTileCollision :93687 前的
//     快照 → 差值=上一拍碰撞改了 vx,撞墙停/反向 → 折返）。
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
// BJ410-Q2 邻接六刀（2026-09-30 C5 红蓝定性,行号已亲读复核）——与崖边折返块
// 正交的六个预存在偏差,全部按原版落定：
//   #1 态0朝向源：direction=sign(vx)（:29413）+速度反转折返（:29469）,非玩家侧
//     （旧 facing=sign(dx) 每 tick 重查 → 折返后下一拍转回=贴崖爬行;原版一次
//     折返 vx=0.1×dir → sign(vx) 定向 → 全速离崖）。test C 护栏按此重锚。
//   #2 wet→ai[1]=1000 仅非 496/497 支（:29448）,wet=碰撞盒 WetCollision 任意接触
//     （旧无差别越族+中心格 liquid>80 阈）。
//   #3 蓄力第二臂纵向条件 = 盒底>玩家顶−200（:29444,不头顶远悬即蓄）,非旧
//     `dy>200`（只在远高于玩家时蓄=与原版反相,无视线蓄力臂恒断）。
//   #4 转态（ai[1]≥400,:29464）不早退——原版 else-if 链,转态拍走完态 0 尾
//     （翻转/崖边/加速）,下拍才进态 1（旧 return=转态拍整尾蒸发）。
//   #5 justHit 复位（:29393）无 ai0 门（旧 `ai0!==3`=自造豁免,旋冲受击不断）；
//     TargetClosest（:29397）= seekDirX 同语义。
//   #6 496/497 加速三臂（:29506-29532）:超速衰减 ×0.8（vy==0 门）/direction 门
//     accel 0.07/死区;其余两档 dist<400 ±1 : ±1.5（:29534-29570 同式）——
//     旧单臂恒 accel+clamp=超速瞬钳、空中照钳。
//
// 判别面：
//   A) 崖 + 玩家在下方坑底（gate 假）→ 不折返:facing 恒 +1 且随行跳崖入坑
//      （变异[去 Y 门]红:折返+不入坑）。
//   B) 崖 + 玩家同高在崖外（gate 真）→ 折返存活+折返后全速离崖（防过修+定谳#1）。
//   C) 平坦地 → facing==sign(velocity.X)（朝向源=行进向,定谳#1 重锚;C2 反向
//      出生走离判别）。
//   Q2 六刀各一发判别面（见「BJ410-Q2 邻接六刀」块）。
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
    playSfx: () => {}, playSfxWav: () => {}, playSfxFiles: () => {},
    addDamageNumber: () => {}, spawnParticles: () => {},
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

  it('B: 崖+玩家同高在崖外（gate 真）→ 折返存活+折返后全速离崖、不坠坑（防过修+定谳#1）', () => {
    // 坑 cols 46..52 直落(无底格);玩家 (50*16, 站 y=60 顶面)——盒顶 918 < 龟盒底 960。
    // 定谳#1:折返 vx=0.1×(-1) → 下一拍 sign(vx) 定向 → 持续向左离崖（旧 facing=sign(dx)
    // 下一拍转回 +1 → 崖边折返块再折 → 每拍只挪 0.1px 贴崖爬行,cx 永远过不了折返点 24px）
    const w = buildLedgeWorld([46, 52], null);
    const player = playerMock(50 * T, 60 * T);
    const hooks = hooksFor(w, player);
    const e = Enemy.fromVanilla(154, 42 * T, 59 * T)!;
    let turned = false;
    let cxAtTurn = 0;
    for (let t = 0; t < 300; t++) {
      e.fixedUpdate(1 / 60, hooks);
      if (!turned && e.ai0 === 0 && e.facing === -1) { turned = true; cxAtTurn = e.cx; }
      if (turned && e.cx < cxAtTurn - 24) break;
    }
    expect(turned).toBe(true);
    expect(e.cx).toBeLessThan(cxAtTurn - 24);            // 全速离崖（贴崖爬行变异红）
    expect(e.y + e.h).toBeLessThanOrEqual(60 * T + 1);   // 未坠坑(仍在主地板)
  });

  it('C: 平坦地 → 态 0 facing==sign(velocity.X)（朝向源=行进向,定谳#1 重锚）', () => {
    const w = world70();
    const st = w.store;
    for (let x = 10; x <= 70; x++) st.setTileSilent(x, 60, 2);
    const player = playerMock(52 * T, 60 * T);   // dist=160<200 → 不蓄力,纯走行
    const hooks = hooksFor(w, player);
    const e = Enemy.fromVanilla(154, 40 * T, 59 * T)!;
    for (let t = 0; t < 60; t++) {
      e.fixedUpdate(1 / 60, hooks);
      expect(e.vx).toBeGreaterThan(0);   // 朝右加速行进
      expect(e.facing).toBe(1);          // sign(vx)=+1（本场景与 sign(dx) 同值;
    }                                    //  真判别力由 C2「反向出生走离」承担）
  });

  it('C2: 玩家在右+初始朝左 → 原版按行进向继续向左走（不走离判别;旧 sign(dx) 首拍即转头）', () => {
    const w = world70();
    const st = w.store;
    for (let x = 10; x <= 70; x++) st.setTileSilent(x, 60, 2);
    const player = playerMock(52 * T, 60 * T);   // 玩家在右
    const hooks = hooksFor(w, player);
    const e = Enemy.fromVanilla(154, 40 * T, 59 * T)!;
    e.facing = -1;                               // 出生朝左（spawn 朝向原版=出生逻辑域,直置单测缝）
    const cx0 = e.cx;
    for (let t = 0; t < 30; t++) {
      e.fixedUpdate(1 / 60, hooks);
      expect(e.vx).toBeLessThanOrEqual(0);       // 行进向=左（dist 192<200 不蓄力,纯走行）
      expect(e.facing).toBe(-1);
    }
    expect(e.cx).toBeLessThan(cx0);              // 持续走离（旧 facing=sign(dx)=+1 → 向右逼近玩家=红）
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

// ===================== BJ410-Q2 邻接六刀判别面（2026-09-30 C5 红蓝定性落刀） =====================
// 每条一发判别面;锚与语义见文件头注。直驱 tortoiseAI 的用例沿 solar-content-port
// 先例（绕过 fixedUpdate 管线,几何/状态直置——wet 走真实 npcLiquid 管线的除外）。

type PlayerMock = ReturnType<typeof playerMock>;
type Hooks = ReturnType<typeof hooksFor>;

function flatHooks(player: PlayerMock) {
  const w = world70();
  for (let x = 10; x <= 70; x++) w.store.setTileSilent(x, 60, 2);
  return { w, hooks: hooksFor(w, player), player };
}

function driveOnce(e: Enemy, hooks: Hooks, player: PlayerMock) {
  (e as unknown as { tortoiseAI: (g: unknown, p: PlayerMock) => void }).tortoiseAI.call(e, hooks, player);
}

describe('BJ410-Q2 邻接六刀（NPC.cs:29393/29413/29444/29448/29463/29469/29506 1:1）', () => {
  it('定谳#2: 496/497 入水不跳 ai[1]=1000（wet→1000 仅非 496/497 支）+ 153 对照仍跳', () => {
    // 水池:地板行 38、水行 37 灌满(255)——龟半身入水,中心小盒 WetCollision 命中。
    // ★行高选择:湿扫窗 j1=min(st.h−40,…)=40（原版 underworld 钳）→ 80 高世界里
    // 行 >40 永不判湿,水池必须放行 ≤39（真实 npcLiquid 管线写位 this.wet,非手设;
    // dist<200 不蓄力 → ai1 只吃无条件 +1/t）
    const mkWater = () => {
      const w = world70();
      for (let x = 10; x <= 70; x++) w.store.setTileSilent(x, 38, 2);
      for (let x = 30; x <= 55; x++) w.store.setLiquid(x, 37, 255, 0);
      return w;
    };
    {  // 496 巨贝:入水 40 拍仍态 0 且 ai1<400（旧 wet→1000 → 1-2 拍进态 1=红）
      const w = mkWater();
      const player = playerMock(44 * T, 38 * T);
      const hooks = hooksFor(w, player);
      const e = Enemy.fromVanilla(496, 42 * T, 37 * T)!;
      for (let t = 0; t < 40; t++) e.fixedUpdate(1 / 60, hooks);
      expect(e.wet).toBe(true);
      expect(e.ai0).toBe(0);
      expect(e.ai1).toBeLessThan(400);
    }
    {  // 153 对照:同一水池 wet→1000 → 快速转态 1（wet 通路自身存活）
      const w = mkWater();
      const player = playerMock(44 * T, 38 * T);
      const hooks = hooksFor(w, player);
      const e = Enemy.fromVanilla(153, 42 * T, 37 * T)!;
      let entered1 = false;
      for (let t = 0; t < 40; t++) {
        e.fixedUpdate(1 / 60, hooks);
        if (e.ai0 === 1) { entered1 = true; break; }
      }
      expect(e.wet).toBe(true);
      expect(entered1).toBe(true);
    }
  });

  it('定谳#3: 蓄力第二臂纵向条件=盒底>玩家顶−200——高处无视线不蓄/低处无视线照蓄', () => {
    // 隔离视线臂（R3 重锚 2026-09-30）:flag46=CanHit 纯几何后 dead 不再压 los
    // （R3#4 定谳）→ 几何遮断（墙）替代 dead 作隔离手段;dist>600 隔离距离门 →
    // 纯测纵向条件极性。
    {  // A 龟在高台(盒底≈320)、玩家 700px 下方（地板遮断视线）:旧 dy>200 → +10/t=330;
      //  原版 320>782 假 → 仅 +1/t
      const player = { ...playerMock(50 * T, 64 * T), dead: true };
      const { w, hooks } = flatHooks(player);
      for (let x = 36; x <= 44; x++) w.store.setTileSilent(x, 20, 2);
      const e = Enemy.fromVanilla(154, 40 * T, 19 * T)!;
      for (let t = 0; t < 30; t++) driveOnce(e, hooks, player);
      expect(e.ai1).toBeLessThan(100);        // 原版:30（旧:330 红）
    }
    {  // B 龟在地面(盒底≈960)、玩家 700px 上方（墙 col 45 rows 14..59 遮断 Y 主导
      //  步进路径=几何 los 假）:旧 dy<0 → +1/t=30;原版 960>14 真 → +10/t
      const player = { ...playerMock(50 * T, 16 * T), dead: true };
      const { w, hooks } = flatHooks(player);
      for (let y = 14; y <= 59; y++) w.store.setTileSilent(45, y, 2);
      const e = Enemy.fromVanilla(154, 40 * T, 59 * T)!;
      for (let t = 0; t < 30; t++) driveOnce(e, hooks, player);
      expect(e.ai1).toBeGreaterThan(200);     // 原版:330（旧:30 红）;los 臂被墙隔离
      expect(e.ai0).toBe(0);                  // 无 los 臂 → 不满蓄转态（330<400）
    }
  });

  it('定谳#4: 转态拍（ai1≥400）不早退——崖边折返照走（翻转+置速）,下拍才进态 1', () => {
    const w = buildLedgeWorld([46, 52], 71);
    const player = playerMock(50 * T, 60 * T);          // 同层崖外,门真
    const hooks = hooksFor(w, player);
    const e = Enemy.fromVanilla(154, 46.5 * T, 59 * T)!; // 崖沿外一格（中心柱=坑 col 46,自身柱无地板→折返可达;直驱不落位,自身柱含地板则扫描恒 ground）
    e.ai1 = 399;
    e.vx = 1; e.vy = 0;
    (e as unknown as { tortoiseOldVx: number }).tortoiseOldVx = 1;  // 模拟上一拍快照（防速度反转折返抢戏）
    driveOnce(e, hooks, player);                // 恰一拍:ai1 399+1=400 → 转态
    expect(e.ai0).toBe(1);                               // 转态
    expect(e.facing).toBe(-1);                           // 转态拍崖边折返照走（旧 return → facing 保持 +1=红）
    expect(e.vx).toBeCloseTo(-0.17, 5);                  // 折返置速 0.1×(-1) 后 accel 臂续推 −0.07（原版序）
  });

  it('定谳#5: 旋冲（态 3）受击即断——justHit 复位无 ai0 门', () => {
    const player = playerMock(52 * T, 60 * T);
    const { hooks } = flatHooks(player);
    const e = Enemy.fromVanilla(154, 40 * T, 59 * T)!;
    e.ai0 = 3; e.ai1 = 0; e.ai2 = 0;
    e.hurt(10, 0, 0, hooks);                  // justHitT=2（:14172）
    e.fixedUpdate(1 / 60, hooks);             // 拍头递减 2→1 → justHit 恒真过 AI
    expect(e.justHit).toBe(true);
    expect(e.ai0).toBe(0);                    // 旧 `ai0!==3` 门 → 保持 3=红
    expect(e.ai1).toBe(1);                    // 复位后态 0 尾 ai1++ 照走（同拍进态 0 体）
  });

  it('定谳#6: 加速三臂——超速衰减 ×0.8（vy==0 门）/空中超速三臂全跳/两档 max', () => {
    const near = playerMock(42 * T, 60 * T);  // dist≈32<400
    const far = playerMock(70 * T, 60 * T);   // dist=480>400
    const { hooks } = flatHooks(near);
    const spawn = (id: number) => {
      const e = Enemy.fromVanilla(id, 40 * T, 59 * T)!;
      e.vy = 0;
      return e;
    };
    {  // a) 496 落地超速（同向）0.6 → ×0.8=0.48（旧恒accel+clamp → 0.5 红）
      const e = spawn(496);
      e.vx = 0.6;
      (e as unknown as { tortoiseOldVx: number }).tortoiseOldVx = 0.6;
      driveOnce(e, hooks, near);
      expect(e.vx).toBeCloseTo(0.48, 5);
    }
    {  // b) 496 空中超速:第一臂 vy 门假、else-if 全跳 → 速度保持 0.6（旧 → 瞬钳 0.5 红）
      const e = spawn(496);
      e.vx = 0.6; e.vy = 0.5;
      (e as unknown as { tortoiseOldVx: number }).tortoiseOldVx = 0.6;
      driveOnce(e, hooks, near);
      expect(e.vx).toBeCloseTo(0.6, 5);
    }
    {  // c) 154 远档（dist≥400 max=1.5）超速 2 → ×0.8=1.6（旧 → 钳 1.5 红）
      const e = spawn(154);
      e.vx = 2;
      (e as unknown as { tortoiseOldVx: number }).tortoiseOldVx = 2;
      driveOnce(e, hooks, far);
      expect(e.vx).toBeCloseTo(1.6, 5);
    }
    {  // d) 154 近档（dist<400 max=1）超速 1.2 → ×0.8=0.96（旧 → 钳 1 红）
      const e = spawn(154);
      e.vx = 1.2;
      (e as unknown as { tortoiseOldVx: number }).tortoiseOldVx = 1.2;
      driveOnce(e, hooks, near);
      expect(e.vx).toBeCloseTo(0.96, 5);
    }
  });
});

// ===================== BJ410-R3 陆龟 AI 邻接四刀（2026-09-30 清债落刀） =====================
// 四条（Q2 亲读登记债;锚行号已 R3 亲读复核——Q2 报行号漂移 +19~31,语义锚全等）：
//   R3#1 态 0 每 tick 属性复位非 417 支（:29453-29462 全型段,旧只落 417）:
//     defense=defDefense/damage=defDamage/kbResist=scaled(0.75 496/497|0.3)。
//     ★稳态行为面零差（153/154 SetDefaults kb=0.3 :10965/:10980、496/497=0.75 :14716,
//     ScaleStats :18114 出生已乘同曲线;def.damage/defense 现无 AI 内写点）——落位为
//     态 3 伤害/防御强化债（:29556-29558,登记中）的前置机构。
//   R3#2 态 3 wet 段（:29693-29696 wet∧dirY<0 → vy-=0.3,每拍含弹射拍;同族态 4
//     :29701-29704 一并落位）+ 弹射单式两支（:29636-29655）:无视线支 vx=朝玩家归一
//     分量（旧 facing×spd 全速）+LOS 支 bias 反号修正（旧 dy+bias=压低,原版
//     playerTop−cy−bias=玩家在上方时再抬高）+顶对心基准。首帧 TargetClosest
//     （:29635,旧缺=无视线按行走朝向发射）。
//   R3#3 态 5（:29838/:29847-29856）:rotation=0 每拍 + ≥30 转 0 态前 TargetClosest
//     （:29850）+ 转态门先于 wet（wet 覆写转 3 拍 TargetClosest 仍面;旧序反+缺面）。
//   R3#4 num606 距离基准（:29424-29427）= hypot(ΔcenterX, playerTopY−npcCenterY)
//     ——玩家顶对龟心（≈21px 偏置;旧中心距在近竖直方位跨档）;flag46=CanHit 纯几何
//     无 dead 门（:29428;原版 target 停留死玩家 → 尸体位姿照常蓄力/弹射=死亡玩家
//     角落语义对齐,旧 los 含 !player.dead）。
// 判别面（每条一发）：
//   R3-1 属性复位序列:投毒 def→态 0 一拍复原+kbResist 档（154 0.3/496 0.75）。
//   R3-2 wet 段 vy（态 3 弹射后/态 4,dirY 极性对照）+无视线弹射 vx 朝玩家+LOS bias 面。
//   R3-3 态 5 rotation 归零/转态拍面向/wet∧≥30 拍 TargetClosest 仍面+转 3。
//   R3-4 加速档 21px 偏置跨档（中心距<400 而顶心距>400 → max 1.5）+死亡玩家蓄力臂。
// 变异基线:去 R3#1 else 支→R3-1 红;去 wet 段→R3-2a/b 红;弹射回 facing*spd→R3-2c 红;
// dist 回中心距→R3-4a 红;los 回 !dead→R3-4b 红;去态 5 rotation/TargetClosest→R3-3 红。

import { getKnockbackMultiplierScaledByDifficulty } from '../src/stats/ScaleStats';

describe('BJ410-R3 陆龟邻接四刀（NPC.cs:29453/29636/29693/29701/29838/29850 1:1）', () => {
  const scaled = (v: number, e: Enemy) => getKnockbackMultiplierScaledByDifficulty(v, e.difficulty || 1);

  it('R3#1: 态 0 每 tick 属性复位·非 417 支——投毒 def 一拍复原+kbResist 0.3/0.75 档', () => {
    {  // 154:毒 def.damage/defense=999 + kb 哨兵 0.5 → 一拍复原 + 0.3 档
      const player = playerMock(52 * T, 60 * T);
      const { hooks } = flatHooks(player);
      const e = Enemy.fromVanilla(154, 40 * T, 59 * T)!;
      driveOnce(e, hooks, player);                       // 首拍:aiInit 捕获基准（先于投毒）
      const base = e.tortoiseDefBase!;
      expect(base.dmg).toBeLessThan(900);
      e.def = { ...e.def, damage: 999, defense: 999 };   // 实例拷贝后投毒（防共享表污染）
      e.kbResistOverride = 0.5;
      driveOnce(e, hooks, player);
      expect(e.def.damage).toBe(base.dmg);               // 旧：999（复位缺失=红）
      expect(e.def.defense).toBe(base.def);              // 旧：999（红）
      expect(e.kbResistOverride).toBeCloseTo(scaled(0.3, e), 6);  // 旧：0.5（红）
    }
    {  // 496:kbResist=0.75 档（旧：不复位=红）
      const player = playerMock(52 * T, 60 * T);
      const { hooks } = flatHooks(player);
      const e = Enemy.fromVanilla(496, 40 * T, 59 * T)!;
      driveOnce(e, hooks, player);
      expect(e.kbResistOverride).toBeCloseTo(scaled(0.75, e), 6);
    }
  });

  it('R3#2a: 态 3 wet 段——wet∧dirY<0 → vy-=0.3（弹射后飞行拍;dirY=1 对照不助推）', () => {
    const player = playerMock(52 * T, 60 * T);           // 远离:else 支纯飞行
    const { hooks } = flatHooks(player);
    const mk = () => {
      const e = Enemy.fromVanilla(154, 40 * T, 20 * T)!; // 半空（无块碰撞污染 vy）
      e.ai0 = 3; e.ai1 = 5; e.ai3 = 1;                   // 弹射后飞行拍（ai3≠0 → vy-=0.22 支）
      e.vx = 0; e.vy = 0;
      return e;
    };
    {  // dirY=-1（玩家在上）:vy = 0−0.22−0.3(wet) +0.2(wet 重力) = −0.32（旧：−0.02 红）
      const e = mk(); e.wet = true; e.dirY = -1;
      driveOnce(e, hooks, player);
      expect(e.vy).toBeCloseTo(-0.32, 5);
    }
    {  // dirY=+1 对照:wet 段不助推 → −0.02
      const e = mk(); e.wet = true; e.dirY = 1;
      driveOnce(e, hooks, player);
      expect(e.vy).toBeCloseTo(-0.02, 5);
    }
  });

  it('R3#2b: 态 4 wet 段——同谓词族（wet∧dirY<0 → vy-=0.3;旧缺=红）', () => {
    const player = playerMock(52 * T, 60 * T);
    const { hooks } = flatHooks(player);
    const e = Enemy.fromVanilla(154, 40 * T, 20 * T)!;
    e.ai0 = 4; e.ai2 = 0.5; e.wet = true; e.dirY = -1; e.vx = 0; e.vy = 0;
    driveOnce(e, hooks, player);
    expect(e.vy).toBeCloseTo(-0.1, 5);                   // 0−0.3(wet)+0.2(wet 重力)（旧：+0.2 红）
    expect(e.ai0).toBe(4);                               // ai2=0.49>0 不转态（隔离转态面）
  });

  it('R3#2c: 态 3 无视线弹射——vx=朝玩家归一分量+首帧 TargetClosest（旧 facing×spd 全速=红）', () => {
    // 墙 col 46 隔断视线;龟朝左出生、玩家在右:原版弹射仍朝玩家（vx>0）;dirY=−1 →
    // num620=playerTop−cy−|dx|×0.2 → vx=dx/hypot×6、vy 强制 −10。
    // ★墙位=rows 38..40:80 高测试世界 underworld 钳（clampYTile hi=st.h−40=40）把
    //   两端 tile 钳到行 40,墙须落钳后步行行上（rows>40 的墙对 los 不可见）
    const player = playerMock(52 * T, 60 * T);
    const { w, hooks } = flatHooks(player);
    for (let y = 38; y <= 40; y++) w.store.setTileSilent(46, y, 2);
    const e = Enemy.fromVanilla(154, 40 * T, 59 * T)!;
    e.ai0 = 3;                                           // 直驱态 3 弹射拍（ai1=0 → 首帧支）
    e.facing = -1;                                       // 行走朝向与玩家侧相反（旧按此发射=−6 红）
    const cx0 = e.cx, cy0 = e.cy;                        // 弹射时刻盒心（driveOnce 会位移,预期式须用发射时基准）
    driveOnce(e, hooks, player);
    const num618 = player.cx - cx0;
    const num620 = (player.y - cy0) - Math.abs(num618) * 0.2;    // dirY=−1（刷新后玩家在上）
    const expectVx = (num618 / Math.hypot(num618, num620)) * 6;
    expect(e.facing).toBe(1);                            // TargetClosest 先于弹射（旧缺=保 −1）
    expect(e.vx).toBeCloseTo(expectVx, 6);               // ≈+5.66（旧 −6 红）
    expect(e.vx).toBeGreaterThan(0);
  });

  it('R3#2d: 态 3 LOS 弹射 bias 面——playerTop−cy−|dx|×0.2（玩家在上再抬高;旧 dy+bias=压低=红）', () => {
    // 玩家 mock 悬空直置（driveOnce 无物理,无需立足面）;无遮断 → flag46 真=10 速档
    const player = playerMock(52 * T, 30 * T);
    const { hooks } = flatHooks(player);
    const e = Enemy.fromVanilla(154, 40 * T, 59 * T)!;   // 地面（cy=944,玩家远上方）
    e.ai0 = 3;                                           // 直驱态 3 弹射拍（ai1=0 → 首帧支）
    const cx0 = e.cx, cy0 = e.cy;                        // 弹射时刻盒心（同 2c）
    driveOnce(e, hooks, player);
    const num618 = player.cx - cx0;
    const num620 = (player.y - cy0) - Math.abs(num618) * 0.2;    // dirY=−1 → bias 不归 0
    const expectVx = (num618 / Math.hypot(num618, num620)) * 10;
    expect(e.vx).toBeCloseTo(expectVx, 6);               // ≈3.33（旧 dy+bias 式 ≈3.95 红）
  });

  it('R3#3: 态 5——rotation=0 每拍 + ≥30 转 0 态前 TargetClosest + wet∧≥30 拍仍面且转 3', () => {
    {  // a) rotation 归零（旧保持 1.234=红）
      const player = playerMock(52 * T, 60 * T);
      const { hooks } = flatHooks(player);
      const e = Enemy.fromVanilla(154, 40 * T, 59 * T)!;
      e.ai0 = 5; e.visAngle = 1.234;
      driveOnce(e, hooks, player);
      expect(e.visAngle).toBe(0);
    }
    {  // b) ai1≥30 转态拍 TargetClosest 先行（旧不面=红）
      const player = playerMock(52 * T, 60 * T);
      const { hooks } = flatHooks(player);
      const e = Enemy.fromVanilla(154, 40 * T, 59 * T)!;
      e.ai0 = 5; e.ai1 = 29; e.facing = -1;              // 玩家在右、龟朝左
      driveOnce(e, hooks, player);
      expect(e.ai0).toBe(0);
      expect(e.facing).toBe(1);                          // 旧：−1（无 TargetClosest=红）
    }
    {  // c) wet∧≥30:TargetClosest 仍面（原版序 :29850 先于 wet 覆写 :29853）且转 3
      const player = playerMock(52 * T, 60 * T);
      const { hooks } = flatHooks(player);
      const e = Enemy.fromVanilla(154, 40 * T, 59 * T)!;
      e.ai0 = 5; e.ai1 = 29; e.facing = -1; e.wet = true;
      driveOnce(e, hooks, player);
      expect(e.facing).toBe(1);                          // 旧：wet 先判早退→面蒸发=红
      expect(e.ai0).toBe(3);                             // wet 覆写转 3
      expect(e.ai1).toBe(0);
    }
  });

  it('R3#4a: num606 距离基准 21px 偏置面——中心距<400 而顶心距>400 → 加速档 max=1.5', () => {
    // 玩家正上方偏 9px:中心距 hypot(9,−5)≈10.3（旧 max=1 → 1.2 衰减 0.96 红）;
    // 顶心距 hypot(9,−411)≈411.1（原版 max=1.5 → 1.2+0.07=1.27）
    const player = { ...playerMock(42 * T, 60 * T), y: 533, cy: 554 };
    const { hooks } = flatHooks(player);
    const e = Enemy.fromVanilla(154, 40 * T, 59 * T)!;
    e.vx = 1.2; e.vy = 0;
    (e as unknown as { tortoiseOldVx: number }).tortoiseOldVx = 1.2;
    driveOnce(e, hooks, player);
    expect(e.vx).toBeCloseTo(1.27, 5);                   // 旧（中心距）:0.96 红
  });

  it('R3#4b: flag46 纯几何——死亡玩家角落蓄力臂照常（旧 los 含 !dead=红）', () => {
    const player = { ...playerMock(60 * T, 60 * T), dead: true };  // 300px>200 几何开阔 → flag46 真
    const { hooks } = flatHooks(player);
    const e = Enemy.fromVanilla(154, 40 * T, 59 * T)!;
    for (let t = 0; t < 30; t++) driveOnce(e, hooks, player);
    expect(e.ai0).toBe(0);
    expect(e.ai1).toBeGreaterThan(100);                  // +4(los 臂)+1/t ≈150;旧:30 红
  });
});
