// 血肉墙 Boss 族冒烟:113 本体 + 双眼 114 + 11 饥饿者 115 + Leech 117
// (Enemy.fixedUpdate 的 aiStyle 27/28/29 分发由主会话接线,这里手动分发)
import { Enemy } from '../src/entities/Enemy.ts';
import { TileStore } from '../src/world/TileStore.ts';
import { World } from '../src/world/World.ts';
import { wallOfFleshAI, wofEyeAI, hungryAI } from '../src/entities/bossAI_wof.ts';

// 世界加宽(墙 1.5px/t 恒速推进,窄世界会被推出界)
const st = new TileStore(500, 300);
const world = new World(500, 300, 1, 't');
world.store = st;
world.groundLevel = 60;
world.rockLevel = 120;
world.lavaLine = 140; // UnderworldLayer = 140 → 允许带 [150, 220]
// 地狱空腔:顶板 158-160 / 底板 200-202(供 draw 区域扫描累计 15 个实心格)
for (let x = 90; x <= 490; x++) {
  for (let y = 158; y <= 160; y++) st.setTileSilent(x, y, 1);
  for (let y = 200; y <= 202; y++) st.setTileSilent(x, y, 1);
}
const enemies: Enemy[] = [];
const projectiles: unknown[] = [];
const player = { cx: 110 * 16, cy: 176 * 16, x: 110 * 16 - 10, y: 176 * 16 - 21, w: 20, h: 42, dead: false } as never;
const game = {
  world,
  player,
  enemies: () => enemies,
  spawnDrop: () => null, damagePlayer: () => {}, addDamageNumber: () => {}, cutTile: () => {},
  onEnemyKilled: () => {}, spawnEnemy: () => {}, notifyInventoryChanged: () => {}, showPickupLabel: () => {},
  spawnParticles: () => {}, playSfx: () => {}, playSfxFiles: () => {},
  entities: (() => {
    const wrap = {
      nextId: 2,
      add: (e: Enemy, b?: string) => {
        e.id = wrap.nextId++;
        if (b === 'projectiles') projectiles.push(e); else enemies.push(e);
      },
    };
    return wrap;
  })(),
} as never;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, x?: unknown) => { if (c) { ok++; console.log('  ✓ ' + n); } else { bad++; console.log('  ✗ ' + n, x ?? ''); } };
let followWall = false; // 激光段开启:玩家钉在墙右侧(原版 flag38 要求玩家在推进方向前侧)
const run = (ticks: number) => {
  for (let i = 0; i < ticks; i++) {
    const w = enemies.find((e) => e.vanillaId === 113 && !e.dead);
    if (followWall && w) {
      // 玩家保持在墙推进方向前侧 200px、空腔内(y=176 格)
      (player as { cx: number; x: number }).cx = w.cx + 200;
      (player as { cx: number; x: number }).x = w.cx + 200 - 10;
    }
    const p = (player as { dead: boolean }).dead ? null : (player as never);
    for (const e of [...enemies]) {
      if (e.dead) continue;
      if (e.iframes > 0) e.iframes--; // Enemy.fixedUpdate 顶段的等价(fixedUpdate:198)
      if (e.vanillaId === 113) wallOfFleshAI(e, game, p);
      else if (e.vanillaId === 114) wofEyeAI(e, game, p);
      else if (e.vanillaId === 115) hungryAI(e, game, p);
    }
  }
};
world.clock.timeOfDay = 0.0; // 夜晚
const band = () => {
  // 由世界几何推得的 draw 区域:顶板上一行 -4 格 / 底板下一行 +4 格(:25882/:25934)
  const top = (158 - 4) * 16, bottom = (202 + 4) * 16;
  return { top, bottom };
};

// 1) 113 首帧生成部件
console.log('== WoF 113 部件生成 ==');
const wall = Enemy.fromVanilla(113, 100 * 16, 176 * 16)!;
wall.id = 1; enemies.push(wall);
run(1);
const eyes = enemies.filter((e) => e.vanillaId === 114);
const hungries = enemies.filter((e) => e.vanillaId === 115);
check('生成双眼 114 ×2', eyes.length === 2, eyes.length);
check('生成饥饿者 115 ×11', hungries.length === 11, hungries.length);
check('眼 ai0 ±1 两种', eyes.some((e) => e.ai0 === 1) && eyes.some((e) => e.ai0 === -1));
check('部件锚定头 id(眼 ai1/饥饿者 ai3)', eyes.every((e) => e.ai1 === wall.id) && hungries.every((e) => e.ai3 === wall.id));
check('饥饿者 ai0 沿带均布(-0.05..0.95)', hungries.every((h) => h.ai0 >= -0.05 && h.ai0 <= 0.95), hungries.map((h) => h.ai0));

// 2) 墙水平推进 + Y 吸附空腔中点
console.log('== 墙推进/吸附 ==');
const x0 = wall.x;
run(120);
check('水平推进(x 位移>100px)', wall.x - x0 > 100, Math.round(wall.x - x0));
check('朝玩家方向(+1)', wall.facing === 1 && wall.vx > 0, [wall.facing, wall.vx.toFixed(2)]);
const b0 = band();
const midY = (b0.top + b0.bottom) / 2 - wall.h / 2;
check('Y 吸附空腔中点', Math.abs(wall.y - midY) < 2, [Math.round(wall.y), Math.round(midY)]);

// 3) 饥饿者挂墙 / 脱落
console.log('== Hungry 挂墙/脱落 ==');
run(200);
check('挂墙态 ai1==0', hungries.every((h) => !h.dead && h.ai1 === 0), hungries.map((h) => h.ai1));
let maxDist = 0;
for (const h of hungries) {
  const ay = b0.top + (b0.bottom - b0.top) * h.ai0;
  maxDist = Math.max(maxDist, Math.hypot(h.x - wall.cx, h.y - ay));
}
check('挂墙环绕(离锚点 ≤450px)', maxDist <= 450, Math.round(maxDist));
const h0 = hungries[0];
h0.iframes = 8; // 模拟受击(Enemy.hurt 置 iframes=8 → hungryAI 的 justHit 近似)
run(1);
// 同帧语义:justHit 置 ai[1]=10(:26299)后立即走倒计时分支 -1(:26451-26453)→ 9
check('受击脱落 ai1=10(同帧递减为 9)', h0.ai1 === 9, h0.ai1);
const vyDetached = h0.vy;
run(10);
check('脱落倒计时递减', h0.ai1 > 0 && h0.ai1 < 10, h0.ai1);
check('脱落期自由飞行(速度保持)', Math.abs(h0.vy - vyDetached) < 0.001, [h0.vy.toFixed(3), vyDetached.toFixed(3)]);
run(10);
check('回落挂墙态', h0.ai1 === 0, h0.ai1);

// 3b) 饥饿者伤害/防御档位(随墙血量,:26318-26335)
console.log('== Hungry 档位 ==');
wall.hp = wall.maxHp * 0.4;
run(2);
check('墙血<50%: 伤 60/防 30', hungries.every((h) => h.def.damage === 60 && h.def.defense === 30), [hungries[0].def.damage, hungries[0].def.defense]);
wall.hp = wall.maxHp * 0.6;
run(2);
check('墙血<75%: 伤 45/防 20', hungries.every((h) => h.def.damage === 45 && h.def.defense === 20), [hungries[0].def.damage, hungries[0].def.defense]);
wall.hp = wall.maxHp;
run(2);
check('满血回基值', hungries[0].def.damage === Enemy.fromVanilla(115, 0, 0)!.def.damage, hungries[0].def.damage);

// 4) Leech 117 放虫轮(:25802-25827)
console.log('== Leech 117 ==');
wall.ai1 = 2700; wall.ai2 = 0; // 直接进放虫计时
run(1);
const leeches = () => enemies.filter((e) => e.vanillaId === 117);
check('ai1>2700 进放虫轮(第 1 只)', leeches().length === 1 && wall.ai2 === 2, [leeches().length, wall.ai2]);
check('Leech 沿推进方向甩出(vx=8)', leeches()[0] && leeches()[0].vx === 8, leeches()[0]?.vx);
run(61);
check('60t 后第 2 只', leeches().length === 2 && wall.ai2 === 3, [leeches().length, wall.ai2]);
run(61);
check('一轮 3 只后回攒(ai2=0)', leeches().length === 3 && wall.ai2 === 0, [leeches().length, wall.ai2]);

// 5) 之眼存在且跟随 + 激光
console.log('== 之眼 114 ==');
check('双眼存活', eyes.every((e) => !e.dead));
check('X 钉墙', eyes.every((e) => e.x === wall.x), [eyes[0].x, wall.x]);
const eyeTop = eyes.find((e) => e.ai0 === 1)!, eyeBottom = eyes.find((e) => e.ai0 === -1)!;
const mid = (b0.bottom + b0.top) / 2;
check('上眼贴上半程中点', Math.abs(eyeTop.y - ((mid + b0.top) / 2 - eyeTop.h / 2)) <= 2, Math.round(eyeTop.y));
check('下眼贴下半程中点', Math.abs(eyeBottom.y - ((mid + b0.bottom) / 2 - eyeBottom.h / 2)) <= 2, Math.round(eyeBottom.y));
check('眼血量镜像墙', eyes.every((e) => e.hp === wall.hp), [eyes[0].hp, wall.hp]);
followWall = true; // 原版 flag38:玩家须在墙推进方向前侧才发射激光(:26207-26210/:26286)
const projBefore = projectiles.length;
run(700); // 蓄能 600t → 连射段 45t/发(:26245-26249/:26252)
followWall = false;
const shots = projectiles.slice(projBefore) as Array<{ projId: number; damage: number }>;
check('蓄能满发射眼激光(83)', shots.length >= 1 && shots.every((p) => p.projId === 83), [shots.length, shots[0]?.projId]);
check('激光经典伤害 11', shots.every((p) => p.damage === 11), shots.map((p) => p.damage));

// 6) 墙死 → 部件自毁
console.log('== 墙死 → 部件自毁 ==');
wall.dead = true;
run(1);
check('饥饿者自毁', hungries.every((h) => h.dead));
check('之眼自毁', eyes.every((e) => e.dead));

// 7) 玩家死亡 → 墙 180t 自毁离场(:26040-26048)
console.log('== 玩家死 → 墙离场 ==');
enemies.length = 0; projectiles.length = 0;
const wall2 = Enemy.fromVanilla(113, 100 * 16, 176 * 16)!;
wall2.id = 9001; enemies.push(wall2);
(player as { dead: boolean }).dead = true;
run(1);
check('部件照常生成(墙未死)', enemies.some((e) => e.vanillaId === 114) && enemies.some((e) => e.vanillaId === 115));
run(183);
check('180t 后墙自毁', wall2.dead && wall2.hp === 0, [wall2.dead, wall2.hp]);
check('部件随墙消散', enemies.filter((e) => e.vanillaId === 114 || e.vanillaId === 115).every((e) => e.dead));
console.log(`\n结果: ${ok} 通过, ${bad} 失败`);
process.exit(bad ? 1 : 0);
