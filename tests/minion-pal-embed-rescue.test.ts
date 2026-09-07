// 帕鲁地面随从 1118 黏土蓓蕾"卡地形"嵌入域回归（2026-09-07 蓝队仆从移动域批）。
//  用户实报："召唤的黏土蓓蕾有时也会卡在地形里"（间歇;召唤物不入 enemyMove 记录）。
//  逐路径定谳（原版 AI_067 :50014-52160 + HandleMovement :17578 / Collision.cs
//  TileCollision :2299 旧位盒门 / SolidCollision :2713 / StepUp :3641）：
//   ① 扑击/行走 moveAndCollide —— 原版 TileCollision 四道门全用【旧位盒】判定,
//      未嵌入格照拦、已嵌入格放行,本身不产嵌入;仓内同构（moveAxis 旧位判定）✔
//   ② 湿体嵌墙 —— 原文本无 unembed（TileCollision wet 跳支让位正确）,原版救援面
//      = StepUp :51508（ai[0]==0||3 运动块逐拍直调,湿态无豁免支）;仓内曾只接
//      ai067WalkChase(虎/海盗)/spiderStep/frogStep,帕鲁/蘑菇漏接 → 补接
//   ③ 归位态退出落格（主根因）—— 原版 :50685-50692 第 4 连词 = !Collision.
//      SolidCollision(position,width,height)【全盒】;仓内 palGroundStep 用中心
//      单格、mushBoiStep 用中心列+脚行双格近似 → 归位飞行（tileCollide=false 直
//      积分穿墙）以盒缘/脚行压墙、中心落空气袋的姿态退出进步行态 = 嵌入位落地。
//      湿身时 unembedPass 整段让位 → 原版救援面（StepUp/飞行态重入）接不上前
//      持续卡地形。修 = 两处退出门换 solidOverlap（家族既有 SolidCollision 等价,
//      蛙 :50686 同句同构）+ mush 补缺的第 3 连词（自身底不高过主底）
//   ④ 跳梯 (-5.1..-11.1,湿 ×2) 顶格 —— 上升被 Y 轴上顶门拦（旧位在盒底之下才拦,
//      与原版 gate4 同构）,不产嵌入 ✔（读例核过,不加测）
//  本文件钉：③ 全盒退出门（湿/干两态）+ ② StepUp 浅嵌入（脚沉 ≤16.1px）湿态自救。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { MinionProj } from '../src/entities/MinionProj';

const LIQ = 255;

/** 地形：地面 row 70 实心（列 50..70）;可选立柱（列 62,行 66..69）;
 *  可选水体（列 55..65,行 66..69 静水,不跑液体模拟） */
function mkWorld(opts: { pillar?: boolean; water?: boolean }): World {
  const w = new World(120, 160, 30, 'embed');
  w.clock.timeOfDay = 0;
  for (let x = 50; x <= 70; x++) w.store.setTile(x, 70, 1);
  if (opts.pillar) for (let y = 66; y <= 69; y++) w.store.setTile(62, y, 1);
  if (opts.water) {
    for (let x = 55; x <= 65; x++) {
      for (let y = 66; y <= 69; y++) {
        const i = w.store.idx(x, y);
        w.store.liquid[i] = LIQ;
        w.store.liquidType[i] = 0;
      }
    }
  }
  return w;
}

function mkGame(w: World): { g: GameHooks; player: Player } {
  const player = new Player(58 * TILE, 70 * TILE - 42, new Inventory()); // 立于 row 70 顶
  player.facing = 1;
  const g = {
    world: w,
    player,
    enemies: () => [], critters: () => [], npcs: () => [],
    spawnDust: () => ({ vx: 0, vy: 0, scale: 1, alpha: 0, noGravity: false, color: null }),
    spawnParticles: () => {}, playSfx: () => {}, playSfxFiles: () => {},
    playSfxFile: () => {}, playSfxWav: () => {},
    cutTile: () => {}, spawnDrop: () => null, damagePlayer: (): number => 0,
    addDamageNumber: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    notifyInventoryChanged: () => {}, mapFullscreen: () => false,
    spawnFriendlyProj: () => {}, addLightAt: () => {},
  } as unknown as GameHooks;
  (g as unknown as { entities: { projectiles: unknown[]; add: () => void } }).entities =
    { projectiles: [], add: () => {} };
  return { g, player };
}

const mkBud = (g: GameHooks, x: number, y: number): MinionProj =>
  new MinionProj(x, y, 1118, 10, 2, false, 0, false, () =>
    (g as unknown as { player: Player }).player);

const palA0 = (m: MinionProj): number => (m as unknown as { palA0: number }).palA0;

// ===================== ③ 归位态退出闸（主根因,湿/干同刀） =====================
describe('1118 归位退出闸 = 原版 SolidCollision 全盒（:50685-50692）', () => {
  it('盒缘压墙（柱列 62）而中心格空气 → 不退出（旧中心单格闸在此放行=嵌入位落地）', () => {
    const w = mkWorld({ pillar: true });
    const { g } = mkGame(w);
    // 盒 [984,998)×[1056,1078)：跨列 61(空气)/62(柱实心,行 66-67)、行 66-67
    // ——中心 (991,1067)=格(61,66) 空气 → 旧闸放行;全盒压柱 → 新闸拒退
    const m = mkBud(g, 984, 1056);
    (m as unknown as { palA0: number }).palA0 = 1;           // 归位飞行态（直积分穿墙位）
    m.fixedUpdate(1 / 60, g);
    expect(palA0(m)).toBe(1);                                // 嵌入姿态不放行退出
  });

  it('全盒净空对照位 → 正常退出进步行态（palA0=0）', () => {
    const w = mkWorld({ pillar: true });
    const { g } = mkGame(w);
    const m = mkBud(g, 976, 1056);                           // 盒 [976,990) 全落空气列 61
    (m as unknown as { palA0: number }).palA0 = 1;
    m.fixedUpdate(1 / 60, g);
    expect(palA0(m)).toBe(0);
  });

  it('mushBoiStep 1022 同句同修：盒缘压墙不退出 + 净空退出（四连词含自身底≤主底）', () => {
    const w = mkWorld({ pillar: true });
    const { g } = mkGame(w);
    const mkMush = (x: number, y: number): MinionProj => {
      const m = new MinionProj(x, y, 1022, 10, 2, false, 0, false, () =>
        (g as unknown as { player: Player }).player);
      return m;
    };
    // 1022 真盒 20×30（:9670-9671）——盒 [984,1004) 跨列 61/62,右缘压柱
    const stuck = mkMush(984, 1056);
    (stuck as unknown as { mbA0: number }).mbA0 = 1;
    stuck.fixedUpdate(1 / 60, g);
    expect((stuck as unknown as { mbA0: number }).mbA0).toBe(1);

    // 净空对照：盒 [972,992) 全落空气列 60/61
    const clear = mkMush(972, 1056);
    (clear as unknown as { mbA0: number }).mbA0 = 1;
    clear.fixedUpdate(1 / 60, g);
    expect((clear as unknown as { mbA0: number }).mbA0).toBe(0);
  });
});

// ===================== ② StepUp 浅嵌入自救（湿态生效,:51508 补接） =====================
describe('1118 StepUp 坡步/浅嵌入救援（Collision.StepUp :3641/:51508）', () => {
  it('湿身脚沉 8px 入地面行 + 上方净空 → 逐拍抬升至面（unembedPass 湿跳支让位,救援=原版 StepUp）', () => {
    const w = mkWorld({ water: true });
    const { g } = mkGame(w);
    // 盒 [984,998)×[1106,1128)：脚底 1128 沉入地面行 70（顶 1120）8px,盒行 69 浸水
    const m = mkBud(g, 984, 1106);
    m.fixedUpdate(1 / 60, g);
    expect(m.wet).toBe(true);                                // 湿态成立（unembed 让位前提）
    expect(Math.abs(m.y + m.h - 70 * TILE)).toBeLessThanOrEqual(0.5);  // 抬到地面顶
    expect(m.onGround).toBe(true);
  });

  it('干态对照：同姿态同样脱出（StepUp 无湿豁免,原版同句）', () => {
    const w = mkWorld({});
    const { g } = mkGame(w);
    const m = mkBud(g, 984, 1106);
    m.fixedUpdate(1 / 60, g);
    expect(m.wet).toBe(false);
    expect(Math.abs(m.y + m.h - 70 * TILE)).toBeLessThanOrEqual(0.5);
    expect(m.onGround).toBe(true);
  });
});
