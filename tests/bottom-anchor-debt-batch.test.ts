// Bottom 锚语义清债批回归（2026-09-17 债刀-6/BJ111 同族收尾）：
//   ① 死亡分裂族 Bottom 锚实量测（115→116 / 50→1 / 16→-5 / 405→406——hurt(9999) 触发
//      HitEffect 分裂链,与 bj112c-428 同 harness）；
//   ② SpawnOnPlayer 通用支寻点纯函数（findSpawnOnPlayerGenericPoint,NPC.cs:81391-81454
//      1:1）——下扫实心 Bottom 语义 / 穷尽静默失败 / safeArea 拒斥+末次豁免；
//   ③ despawnTimer 家族口径 18740 = (int)(750×1.25)×20（NPC.cs:81596+:81485）源哨兵；
//   ④ 405 分裂 unitYRotatedByRandom 单源收编源哨兵。
// ★405 统计判别力备案：maxRadians=2π 时 RotatedByRandom 的三角分布在整圆上【解析等价
//   于均匀】（θ=2πd mod 2π,三角密度 f(d)=1−|d| 两支预像密度和恒=1）——故本刀为文本
//   1:1/单源收编,统计判别无差不是"未生效"；判别器 = 源哨兵（回退均匀掷即爆红）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Enemy } from '../src/entities/Enemy';
import { SquidCloud } from '../src/entities/SquidCloud';
import { CultistRitualCircle } from '../src/entities/bossAI_lategame';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { findSpawnOnPlayerGenericPoint } from '../src/core/Game';
import type { GameHooks } from '../src/entities/types';

const HERE = dirname(fileURLToPath(import.meta.url));
const W = 160, H = 140, FLOOR = 120;

function makeHooks() {
  const world = new World(W, H, 7, 'bottom-anchor-batch');
  const st = world.store;
  world.groundLevel = 60;
  for (let x = 0; x < W; x++) {
    st.setTile(x, FLOOR, 1);
    st.setTile(x, FLOOR + 1, 1);
  }
  const enemies: Enemy[] = [];
  const em = {
    nextId: 1,
    add: (e: unknown, bucket: 'enemies' | 'projectiles') => {
      const ent = e as { id: number };
      ent.id = em.nextId++;
      if (bucket === 'enemies') enemies.push(e as Enemy);
    },
  };
  const player = {
    x: 130 * TILE, y: (FLOOR - 3) * TILE, w: 20, h: 42,
    cx: 130 * TILE + 10, cy: (FLOOR - 3) * TILE + 21,
    vx: 0, vy: 0, hp: 400, maxHp: 400, dead: false, useTime: 1,
    aabbOverlaps: () => false,
  };
  const hooks = {
    world, player,
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    spawnDust: () => null,
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
    entities: em,
  } as unknown as GameHooks;
  return { hooks, enemies, em, store: st, world };
}

function killAndCollect(
  h: ReturnType<typeof makeHooks>, vid: number, childVid: number,
): { parent: Enemy; kids: Enemy[] } {
  const parent = Enemy.fromVanilla(vid, 70 * TILE, (FLOOR - 6) * TILE)!;
  parent.id = h.em.nextId++;
  h.enemies.push(parent);
  parent.hurt(9999, 0, 0, h.hooks);
  const kids = h.enemies.filter((e) => !e.dead && e.vanillaId === childVid && e !== parent);
  return { parent, kids };
}

describe('死亡分裂族 Bottom 锚（NewNPC nPC.Bottom=(X,Y),NPC.cs:81594）', () => {
  it('115→116 饿魂:顶 = 父底−h（旧中心锚半盒低 h/2）', () => {
    const h = makeHooks();
    const { parent, kids } = killAndCollect(h, 115, 116);
    expect(kids.length, '115 死亡出 1 只 116').toBeGreaterThanOrEqual(1);
    for (const k of kids) {
      expect(k.x, 'Bottom.x=Center.X → x=cx−w/2').toBeCloseTo(parent.cx - k.w / 2, 4);
      expect(k.y, 'Bottom.y=父底 → y=父底−h').toBeCloseTo(parent.y + parent.h - k.h, 4);
    }
  });

  it('50→1 史王分裂:体内 inset32 整数点为底中锚+初速域 Next(−15,16)/Next(−30,1)×0.1', () => {
    const h = makeHooks();
    const seen = new Set<number>();
    for (let round = 0; round < 12; round++) {
      const { parent, kids } = killAndCollect(h, 50, 1);
      seen.add(kids.length);
      expect(kids.length, 'Next(4)+4=4-7 只').toBeGreaterThanOrEqual(4);
      expect(kids.length).toBeLessThanOrEqual(7);
      for (const k of kids) {
        const py = k.y + k.h;   // 底中锚 Y = 掷点
        expect(py, '底边 = 体内掷点 ∈ [顶, 顶+h−32]').toBeGreaterThanOrEqual(parent.y);
        expect(py).toBeLessThanOrEqual(parent.y + parent.h - 32);
        const px = k.x + k.w / 2;
        expect(px, 'X = 体内掷点 ∈ [左, 左+w−32]').toBeGreaterThanOrEqual(parent.x);
        expect(px).toBeLessThanOrEqual(parent.x + parent.w - 32);
        expect(Math.abs(k.vx) * 10, 'vx = Next(−15,16)×0.1（0.1 步进域）').toBeLessThanOrEqual(15.0001);
        expect(k.vy * 10, 'vy = Next(−30,1)×0.1 ∈ (−3,0]').toBeLessThanOrEqual(0.0001);
        expect(k.vy).toBeGreaterThan(-3.0001);
        expect(k.ai0, 'ai0=−1000×Next(3)').toBeLessThanOrEqual(0);
        expect(k.ai1, 'ai1=−1（显式空体内,C-18）').toBe(-1);
      }
      for (const k of kids) k.dead = true;
    }
    expect(seen.size, '12 轮至少见 3 档数量').toBeGreaterThanOrEqual(3);
  });

  it('16→-5 母史莱姆:2-3 只+底=父底+父速×2 增量族（1457 :85716-85735,旧"Wiki 1-3"废）', () => {
    const h = makeHooks();
    const counts = new Set<number>();
    for (let round = 0; round < 12; round++) {
      // -5 子体 = 基体 vid 1 + vanillaNetId −5（SetDefaults(-5) 后置,锚定用基体盒）
      const { parent, kids } = killAndCollect(h, 16, 1);
      counts.add(kids.length);
      for (const k of kids) {
        expect(k.y + k.h, '底 = 父底（Bottom 锚 :85719）').toBeCloseTo(parent.y + parent.h, 4);
        expect(k.x, 'Bottom.x=cx → x=cx−w/2（旧 ±14 散布废）').toBeCloseTo(parent.cx - k.w / 2, 4);
        expect(Math.abs(k.vx) * 10, '|vx| ≤ Next(−20,20)×0.1+k×0.3（父速 0）').toBeLessThanOrEqual(26.0001);
        expect(k.vy, 'vy = 父vy − Next(0,10)×0.1 − k ≤ 0').toBeLessThanOrEqual(0.0001);
        expect(k.ai0, 'ai0=−1000×Next(3)（:85728）').toBeLessThanOrEqual(0);
      }
      for (const k of kids) k.dead = true;
    }
    expect([...counts].every((n) => n >= 2 && n <= 3), '数量恒 2-3（Next(2)+2,旧 1-3=红）').toBe(true);
  });

  it('405→406 星细胞:速度域 [3,7)+单位向+Bottom(Center.X,Bottom.Y)（:84395-84405）', () => {
    const h = makeHooks();
    const { parent, kids } = killAndCollect(h, 405, 406);
    expect(kids.length, '空场首杀 = 4 只').toBe(4);
    for (const k of kids) {
      expect(k.x).toBeCloseTo(parent.cx - k.w / 2, 4);
      expect(k.y).toBeCloseTo(parent.y + parent.h - k.h, 4);
      const s = Math.hypot(k.vx, k.vy);
      expect(s, '速度 = (3+NextFloat×4) 浮点域 [3,7)').toBeGreaterThanOrEqual(3);
      expect(s).toBeLessThan(7);
      expect(Math.hypot(k.vx / s, k.vy / s), '方向单位化（RotatedByRandom 保模长）').toBeCloseTo(1, 6);
    }
  });
});

describe('SpawnOnPlayer 通用支寻点（findSpawnOnPlayerGenericPoint,NPC.cs:81391-81454 1:1）', () => {
  const VW = 1920, VH = 1080;
  const halfW = Math.floor(VW / TILE * 0.7);

  it('下扫实心+Bottom 语义:窗口内地板必命中,落点=首实心格行（ty*TILE 为底锚）', () => {
    const world = new World(400, 300, 7, 'finder-hit');
    const st = world.store;
    const ground = 130;   // spawnArea.Bottom = 100+floor(1080/16×0.7)=147 → 地板须在其上
    for (let x = 0; x < 400; x++) for (let y = ground; y < ground + 5; y++) st.setTile(x, y, 1);
    const pt = findSpawnOnPlayerGenericPoint(
      st, 200, 100, 200 * TILE + 8, 100 * TILE + 8, VW, VH,
    );
    expect(pt, '窗口内整片地板 = 必命中').not.toBeNull();
    expect(pt!.ty, '落点 = 下扫首个实心格行').toBe(ground);
    expect(st.isSolid(pt!.tx, pt!.ty), '落点格本体实心（Bottom 贴其顶）').toBe(true);
    expect(pt!.tx).toBeGreaterThanOrEqual(200 - halfW);
    expect(pt!.tx).toBeLessThan(200 + halfW);
  });

  it('穷尽静默失败:窗口内无实心 → null（旧 t=499 强制空中落点=红）', () => {
    const world = new World(400, 300, 7, 'finder-miss');
    const st = world.store;
    for (let x = 0; x < 400; x++) st.setTile(x, 250, 1);   // 地板在 spawnArea.Bottom 之下
    const pt = findSpawnOnPlayerGenericPoint(
      st, 200, 100, 200 * TILE + 8, 100 * TILE + 8, VW, VH,
    );
    expect(pt, '500×50 穷尽未得 = 静默不生成（:81451 if(flag)）').toBeNull();
  });

  it('safeArea 拒斥+末次豁免:确定性 rand——仅 safe 内有地,前 499 拍全拒,末拍命中', () => {
    const world = new World(400, 300, 7, 'finder-safe');
    const st = world.store;
    const ground = 130;
    // 仅玩家所在列 ±5 有地（0.52 盒内:safeY=floor(1080/16×0.52)=35 ≥ |130−100|）
    for (let x = 195; x <= 205; x++) for (let y = ground; y < ground + 5; y++) st.setTile(x, y, 1);
    // 恒定 rand=0.502:tx 恒=200（ground 列内）、ty 恒=100（≤ground,下扫可达）
    let calls = 0;
    const rand = () => { calls++; return 0.502; };
    const pt = findSpawnOnPlayerGenericPoint(
      st, 200, 100, 200 * TILE + 8, 100 * TILE + 8, VW, VH, rand,
    );
    expect(pt, '末次尝试豁免 safeArea → 命中 safe 内地面（:81408 flag2 臂）').not.toBeNull();
    expect(pt!.tx).toBe(200);
    expect(pt!.ty).toBe(ground);
    // 判别量:499 个非末次外层 × 50 内层 × 每内层 2 掷(全被 safeArea/下扫拒) + 末次首掷 2
    // ——若 safeArea 拒斥被回退,第 1 拍即 found → calls=2=红;若末次豁免被回退 → null=红
    expect(calls, '非末次全拒+末次首内层命中').toBe(499 * 50 * 2 + 2);
  });
});

describe('清债哨兵:despawnTimer 18740 家族口径 + 405 三角单源（源级 tripwire）', () => {
  const gameSrc = readFileSync(join(HERE, '../src/core/Game.ts'), 'utf8');
  const enemySrc = readFileSync(join(HERE, '../src/entities/Enemy.ts'), 'utf8');
  const qbSrc = readFileSync(join(HERE, '../src/entities/bossAI_queenbee_plantera.ts'), 'utf8');

  it('despawnTimer = 18740 全站点（SpawnBoss timeLeft=(int)(750×1.25)=937×20）', () => {
    expect((gameSrc.match(/despawnTimer = 18740/g) ?? []).length,
      'Game.ts 七站:duke/golem/eol/deerclops/spawnBossOnPlayer/summonBossAtTx 头+twin').toBeGreaterThanOrEqual(7);
    expect(gameSrc, '旧 flat ×20=15000 残留=红').not.toMatch(/despawnTimer = 15000/);
    expect(qbSrc, 'QB 远支卫生上界随家族 1:1（原版无钳,仅作上界）').toMatch(/despawnTimer > 18740/);
  });

  it('405 分裂单源 unitYRotatedByRandom（回退均匀角=红;2π 统计等价故用源哨兵）', () => {
    const block = enemySrc.slice(
      enemySrc.indexOf('vanillaId === 405'),
      enemySrc.indexOf('蠕虫任一段死亡'),
    );
    expect(block, '405 块消费单源 unitYRotatedByRandom').toContain('unitYRotatedByRandom(Math.PI * 2)');
    expect(block, '405 块不得残留均匀角掷').not.toContain('Math.random() * Math.PI * 2');
  });

  it('Duke/Golem/通用支 Bottom 锚换算行在位（cy+100−h / spot.y−h / spawnY−h）', () => {
    expect(gameSrc).toMatch(/duke\.y = bobber\.cy \+ 100 - duke\.h/);
    expect(gameSrc).toMatch(/head\.y = spot\.y - head\.h/);
    expect(gameSrc).toMatch(/head\.y = spawnY - head\.h/);
    expect(gameSrc).toMatch(/e\.y = pt\.ty \* TILE - e\.h/);
  });
});

// ============================================================================
// BJ113 域外登记清债批（2026-09-17 债刀-7）:
//   ① SquidCloud 813→619 出鱿 Bottom 锚（Projectile.cs:34509 → :81594）;
//   ② 仪式圈弹 490 age300 召 454/521 Bottom 锚（Projectile.cs:32931/:32935）;
//   ③ msg202 线契约 Bottom 化双端结构锁（客户端 sender 废 +8 / SimHost.summon 补 −h）;
//   ④ 血月小动物转化 Transform 底保留语义锁（:93033-93048 + :81912-81918/:81931）。
// ============================================================================

describe('SquidCloud 813 出鱿 619 Bottom 锚（BJ113-①,Projectile.cs:34509→NPC.cs:81594）', () => {
  it('ai[0]==90 出鱿鱼:底边 = 云中心（旧中心锚低 h/2=红）', () => {
    const h = makeHooks();
    const cloud = new SquidCloud(70 * TILE, 100 * TILE);   // 构造 (x,y)=中心
    for (let i = 0; i < 90; i++) cloud.fixedUpdate(1 / 60, h.hooks);
    const squids = h.enemies.filter((e) => e.vanillaId === 619);
    expect(squids.length, 'ai[0]==90 恰出 1 只 619').toBe(1);
    const sq = squids[0];
    expect(sq.y + sq.h, 'Bottom.y = 云中心（Center.Y 作 NewNPC Y）').toBeCloseTo(cloud.cy, 4);
    expect(sq.cx, 'Bottom.x = Center.X → cx 同值（fromVanilla X 恰同,不回归）').toBeCloseTo(cloud.cx, 4);
  });

  it('t≤50 隐形蓄积段不出鱿（ai 门先于锚定,防锚行遮蔽门回归）', () => {
    const h = makeHooks();
    const cloud = new SquidCloud(70 * TILE, 100 * TILE);
    for (let i = 0; i < 89; i++) cloud.fixedUpdate(1 / 60, h.hooks);
    expect(h.enemies.filter((e) => e.vanillaId === 619).length, 't=89 未达 ai[0]==90').toBe(0);
  });
});

describe('仪式圈弹 490 召 454/521 Bottom 锚（BJ113-②,Projectile.cs:32931/:32935→NPC.cs:81594）', () => {
  it('age==300 场上无 454 → 召幻影龙 454:底边 = 仪式弹中心;链段随头位', () => {
    const h = makeHooks();
    const src = Enemy.fromVanilla(439, 70 * TILE, 100 * TILE)!;
    h.em.add(src, 'enemies');
    const circle = new CultistRitualCircle(src);
    for (let i = 0; i < 300; i++) circle.fixedUpdate(1 / 60, h.hooks);
    const dragons = h.enemies.filter((e) => e.vanillaId === 454);
    expect(dragons.length, 'AnyNPCs(454) 空 → 召 454（:32929）').toBe(1);
    const head = dragons[0];
    expect(head.y + head.h, 'Bottom.y = 仪式弹中心（旧中心锚低 h/2=红）').toBeCloseTo(circle.cy, 4);
    expect(head.cx, 'Bottom.x = 仪式弹中心').toBeCloseTo(circle.cx, 4);
    expect(
      h.enemies.some((e) => e.vanillaId !== null && e.vanillaId! >= 455 && e.vanillaId! <= 459),
      'AI_006 专块链段随头位（先换算再 spawnWormChain 才不漂 h/2）',
    ).toBe(true);
  });
});

describe('msg202 Bottom 契约双端结构锁（BJ113-③,SummonIntent=202 线契约）', () => {
  const gameSrc = readFileSync(join(HERE, '../src/core/Game.ts'), 'utf8');
  const simSrc = readFileSync(join(HERE, '../../server/src/sim/SimHost.ts'), 'utf8');

  it('SimHost.summon Bottom 化:head/twin y=y−h（Game.summonBossAtTx 同式,:81452-81454+:81594）', () => {
    expect(simSrc, 'head.y = y - head.h（msg202 (x,y)=Bottom 锚点）').toMatch(/head\.y = y - head\.h;/);
    expect(simSrc, 'twin 126 同批换算').toMatch(/twin\.y = y - twin\.h;/);
    expect(simSrc, '旧中心锚裸放置（if (twin) this.entities.add）=红').not
      .toMatch(/if \(twin\) this\.entities\.add\(twin, 'enemies'\);/);
  });

  it('客户端 sender 废除旧中心锚 +8:物品路径发 Bottom 行（自然路径本无 +8 不动）', () => {
    expect(gameSrc).toMatch(/sendSummonIntent\(key, tx2 \* TILE \+ 8, Math\.max\(4, onPlayerTy\) \* TILE\)/);
    expect(gameSrc, '旧 ty*TILE+8 中心锚=红').not.toMatch(/Math\.max\(4, onPlayerTy\) \* TILE \+ 8/);
    expect(gameSrc, '自然路径保持 ty2-12 行').toMatch(/sendSummonIntent\(key, tx2 \* TILE \+ 8, Math\.max\(4, ty2 - 12\) \* TILE\)/);
  });
});

describe('血月小动物转化 Transform 语义锁（BJ113-④,NPC.cs:93033-93048+:81912-81918/:81931）', () => {
  const gameSrc = readFileSync(join(HERE, '../src/core/Game.ts'), 'utf8');

  it('小动物支桶迁移重建后补锚:左缘保持+底边对齐+速度保留+HP 比例结转', () => {
    expect(gameSrc, 'X 左缘保持（:81912-81918 X 不动）').toMatch(/en\.x = cr\.x;/);
    expect(gameSrc, 'Y 底边对齐（position.Y+=旧高→SetDefaults→-=新高）').toMatch(/en\.y = cr\.y \+ cr\.h - en\.h;/);
    expect(gameSrc, '速度保留（Transform 不触 velocity）').toMatch(/en\.vx = cr\.vx; en\.vy = cr\.vy;/);
    expect(gameSrc, 'life 比例结转（:81931 num2*lifeMax/num3）').toMatch(/Math\.trunc\(\(cr\.hp \* en\.maxHp\) \/ cr\.maxHp\)/);
    expect(gameSrc, '旧顶左喂中心锚（cr.x,cr.y 直喂）=红').not
      .toMatch(/fromVanilla\(w\.crimson \? pair\[1\] : pair\[0\], cr\.x, cr\.y\)/);
  });

  it('value==0 钉零（:93037-93046:变前 value==0 → 变后强钉 0,两支都在位）', () => {
    expect(gameSrc, '敌怪支变前捕获').toMatch(/const wasValueZero = \(e\.def\.value \?\? 0\) === 0;/);
    expect(gameSrc, '小动物支变前捕获').toMatch(/const wasValueZero = \(cr\.def\.value \?\? 0\) === 0;/);
    expect(gameSrc, '钉零写回').toMatch(/e\.def = \{ \.\.\.e\.def, value: 0 \};/);
    expect(gameSrc).toMatch(/en\.def = \{ \.\.\.en\.def, value: 0 \};/);
  });
});
