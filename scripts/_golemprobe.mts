// 石巨人 Boss 族冒烟:本体 245 + 头 246 + 双拳 247/248(挂载态/自由态/冲拳循环/全族自毁)
// 直接驱动 bossAI_golem 的导出 AI(Enemy.ts 分发由主会话统一接线,此处不依赖)
import { Enemy } from '../src/entities/Enemy.ts';
import { TileStore } from '../src/world/TileStore.ts';
import { World } from '../src/world/World.ts';
import { golemAI, golemHeadAI, golemFistAI } from '../src/entities/bossAI_golem.ts';

const st = new TileStore(200, 300);
const world = new World(200, 300, 1, 't');
world.store = st;
world.groundLevel = 60;   // 玩家在地下(神庙层)→ 脱庙狂暴系数 num=1,行为确定
world.rockLevel = 190;
for (let x = 0; x < 200; x++) st.setTileSilent(x, 150, 1); // 地板
const enemies: Enemy[] = [];
const projectiles: unknown[] = [];
const game = {
  world,
  player: null as never,
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

/** 玩家桩(x/y tile 坐标可变) */
const mkPlayer = (tx: number, ty: number) => ({
  x: tx * 16, y: ty * 16, w: 20, h: 42,
  cx: tx * 16 + 10, cy: ty * 16 + 21, vx: 0, vy: 0, dead: false,
});
let player: ReturnType<typeof mkPlayer> = mkPlayer(100, 140);
(game as unknown as { player: unknown }).player = player;

/** aiStyle 局部分发(等同主会话将接入 Enemy.fixedUpdate 的映射) */
const aiByStyle: Record<number, (e: Enemy, g: never, p: never) => void> = {
  45: golemAI as never,
  46: golemHeadAI as never,
  47: golemFistAI as never,
};
const run = (ticks: number) => {
  for (let i = 0; i < ticks; i++) {
    for (const e of [...enemies]) {
      if (e.dead) continue;
      // 模拟 Enemy.fixedUpdate 头段:每 tick 先递减 iframes(直接调 AI 不会走共享尾段)
      if (e.iframes > 0) e.iframes--;
      const fn = aiByStyle[e.vanilla?.aiStyle ?? -1];
      if (fn) fn(e, game as never, player as never);
    }
  }
};
world.clock.timeOfDay = 0.0; // 夜晚(石巨人神庙 Boss 不逃夜,此值无行为影响)
const fam = () => ({
  body: enemies.find((e) => e.vanillaId === 245)!,
  head: enemies.find((e) => e.vanillaId === 246)!,
  fistL: enemies.find((e) => e.vanillaId === 247)!,
  fistR: enemies.find((e) => e.vanillaId === 248)!,
});
const shoulder = (anchor: Enemy, isLeft: boolean) => ({
  x: anchor.cx + anchor.vx + (isLeft ? -84 : 78) * 0.5,
  y: anchor.cy + anchor.vy - 9 * 0.5,
});

// =============== ① 首帧生成部件 ===============
console.log('== Golem 245 spawn ==');
{
  const body = Enemy.fromVanilla(245, 100 * 16, 120 * 16)!;
  body.id = 1; enemies.push(body);
  run(1);
  const { head, fistL, fistR } = fam();
  check('首帧生成头 246', !!head);
  check('首帧生成左拳 247', !!fistL);
  check('首帧生成右拳 248', !!fistR);
  check('拳 ai0 侧别 ±1', fistL.ai0 === -1 && fistR.ai0 === 1, [fistL.ai0, fistR.ai0]);
  check('本体 ai0=0 地面蓄力态', body.ai0 === 0, body.ai0);
  check('头出生位置在本体上方', head.cy < body.cy, [Math.round(head.cy / 16), Math.round(body.cy / 16)]);
}

// =============== ② 本体跳跃(onGround 切换) ===============
console.log('== Golem 245 jump ==');
{
  const { body, head } = fam();
  run(140); // 落地 + 蓄力(首跳 ≈300+20t)
  check('挂载头在场时本体无敌(dontTakeDamage=flag)', body.iframes > 0, body.iframes);
  head.hp = Math.floor(head.maxHp * 0.3); // 头残血 → 眼部阶段(ai0=1)与激光
  run(1);
  check('头血 < 半 → 眼部阶段 ai0=1', head.ai0 === 1, head.ai0);
  head.hp = head.maxHp; // 复原,后续断言不依赖残血分档
  run(1);
  const baseY = body.cy, x0 = body.cx;
  let sawAir = false, minY = baseY;
  for (let i = 0; i < 560; i++) {
    run(1);
    if (!body.onGround) sawAir = true;
    minY = Math.min(minY, body.cy);
  }
  check('发生起跳(离地)', sawAir);
  check('跳起高度 > 150px', baseY - minY > 150, Math.round(baseY - minY));
  check('起跳后落地(onGround)', body.onGround);
  check('跳跃有水平位移', Math.abs(body.cx - x0) > 4, Math.round(body.cx - x0));
}

// =============== ④ 拳蓄力冲出后回位 ===============
console.log('== Golem fist 247/248 punch ==');
{
  const { body, fistL, fistR } = fam();
  const track = (fist: Enemy, isLeft: boolean) => {
    let peak = 0, returned = false;
    for (let i = 0; i < 500; i++) {
      run(1);
      const s = shoulder(body, isLeft);
      const d = Math.hypot(fist.cx - s.x, fist.cy - s.y);
      peak = Math.max(peak, d);
      if (peak > 100 && d < 150) { returned = true; break; }
    }
    return { peak, returned };
  };
  const L = track(fistL, true);
  check('左拳蓄力冲出(峰值位移 > 100px)', L.peak > 100, Math.round(L.peak));
  check('左拳回位(肩锚 150px 内)', L.returned, Math.round(L.peak));
  const R = track(fistR, false);
  check('右拳蓄力冲出(峰值位移 > 100px)', R.peak > 100, Math.round(R.peak));
  check('右拳回位(肩锚 150px 内)', R.returned, Math.round(R.peak));
  check('拳存活', !fistL.dead && !fistR.dead);
}

// =============== ③ 本体血尽 → 头转自由态续战 ===============
console.log('== Golem body slain -> head free ==');
{
  const { body, head } = fam();
  body.hp = 0;
  run(2);
  check('本体进入死亡演出(ai3=1)', body.ai3 === 1, body.ai3);
  check('头存活', !head.dead);
  check('头转自由态(ai3=1)', head.ai3 === 1, head.ai3);
  run(70);
  check('本体 60t 后真死', body.dead);
  check('头继续存活(本体死透后头继续)', !head.dead);
  check('自由头满血续命(249 语义)', head.hp === head.maxHp, [head.hp, head.maxHp]);
  const dmg249 = Enemy.fromVanilla(249, 0, 0)!.def.damage;
  check('自由头属性对齐 249', head.def.damage === dmg249, [head.def.damage, dmg249]);
  const hx = head.cx, hy = head.cy;
  run(240); // 自由头悬浮(目标 = 玩家 + (0,-300))+ 弹幕循环
  check('自由头自主战斗位移', Math.hypot(head.cx - hx, head.cy - hy) > 40,
    [Math.round(head.cx / 16), Math.round(head.cy / 16)]);
  check('拳改锚自由头存活', fam().fistL !== undefined && !enemies.find((e) => e.vanillaId === 247)!.dead);
}

// =============== ⑤ 头死 → 全族自毁 ===============
console.log('== Golem head slain -> family despawn ==');
{
  const { head, fistL, fistR } = fam();
  head.hp = 0;
  run(2);
  check('头死亡', head.dead);
  check('全族自毁(拳全灭)', fistL.dead && fistR.dead, [fistL.dead, fistR.dead]);
  check('无存活的石巨人族成员', enemies.every((e) => e.dead || (e.vanillaId !== 245 && e.vanillaId !== 246 && e.vanillaId !== 247 && e.vanillaId !== 248)));
}

// =============== 弹幕(258 火焰弹 / 259 眼激光) ===============
{
  const ids = projectiles.map((p) => (p as { projId: number }).projId);
  check('发射过火焰弹 258', ids.includes(258), ids.slice(0, 8));
}

console.log(`\n结果: ${ok} 通过, ${bad} 失败`);
process.exit(bad ? 1 : 0);
