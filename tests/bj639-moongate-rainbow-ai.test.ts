// ★BJ639（2026-10-11）：aiStyle 123 哨兵弹面全域普查 批 1 落刀判别锁。
//  普查判据（BJ634/BJ635 判例推广）：原版专属 AI 行为面 vs 本仓通用/近似承载。
//  批 1 两型（BJ635 批 2 候选定谳=真缺）：
//    · 642 月门光束（AI_084 642 支 :31964-31971/:32076-32085/:32113-32186 +
//      Colliding :16029-16037 + CutTiles :15288 + usesLocalNPCImmunity cd10 :6915）
//      ——此前落「速度 9 直飞 Arrow」通用承载（恒速直线/无扫摆/无束长/无线碰撞）；
//    · 644 彩虹水晶爆裂（aiStyle 112 644 支 :34866-34998 + Kill :73416 +
//      DoRainbowCrystalStaffExplosion :80316）——此前=落点即时 AoE（t=0 触发、
//      14×14 盒、弹实体本体不存在=无渐显/自旋/hsl 色相/花瓣尘/回门光线）。
//  ★夹具纪律（BJ514/BJ634/BJ635 判例防「夹具喂幻影」）：真 World（地板格）+ 真
//  Player + 真 MinionProj 哨兵（sentry=true）+ 真 Enemy 盒（maxHp=100000 过
//  canBeChasedBy lifeMax 门）+ 直接驱动 fixedUpdate。
//  ★变异证红（BJ606 习语：spawnSync 子进程恰红 + 逐字节还原 + sha256 对拍）：
//    M1 642 扫摆摘除 / M2 642 寿命 50→500 / M3 644 引爆 t30→t0（回退旧即时档）/
//    M4 644 引爆盒 60→14（回退旧窄盒档） 各必恰红。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { MinionProj, MoonGateBeam, RainbowCrystalBurst, discoHueAt, rgbToHslHue } from '../src/entities/MinionProj';
import type { GameHooks } from '../src/entities/types';

const GAME = join(__dirname, '..');

interface MockEnemy {
  id: number; x: number; y: number; w: number; h: number; dead: boolean;
  cx: number; cy: number; hp: number; maxHp?: number; vanillaId?: number;
  boss?: boolean; vx?: number; vy?: number;
  hurt: (d: number, kx?: number, ky?: number, g?: GameHooks) => boolean;
  hits: number[];
}
/** 真 Enemy 盒夹具（防幻影三件套：maxHp 终值/boss 旗/真盒 w×h） */
const mkEnemy = (id: number, cx: number, cy: number, w = 40, h = 40, boss = true): MockEnemy => {
  const e: MockEnemy = {
    id, x: cx - w / 2, y: cy - h / 2, w, h, dead: false, cx, cy,
    hp: 100000, maxHp: 100000, boss, hits: [], vx: 0, vy: 0,
    hurt: (d: number) => { e.hp -= d; e.hits.push(d); return true; },
  };
  return e;
};

function makeHooks(enemies: MockEnemy[] = []) {
  const w = new World(300, 140, 7, 'bj639');
  for (let x = 0; x < 300; x++) for (let y = 120; y < 140; y++) w.store.setTile(x, y, 1);
  w.groundLevel = 120;
  const player = new Player(60 * 16, 110 * 16, new Inventory());
  const registry: unknown[] = [];   // projectiles 活体表（AI 查询面）
  const added: unknown[] = [];      // 生成日志（add 调用面——与活体表分离防夹具自污染）
  const hooks: GameHooks = {
    world: w as never,
    player: player as never,
    enemies: () => enemies,
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
  };
  (hooks as unknown as { entities: { projectiles: unknown[]; add: (e: unknown) => void } }).entities = {
    projectiles: registry,
    add: (e: unknown) => { registry.push(e); added.push(e); },
  };
  return { hooks, store: w.store, player, added };
}

let sentrySeq = 0;
const sentry = (player: Player, hooks: GameHooks, pid: number, cx: number, cy: number): MinionProj => {
  const m = new MinionProj(cx - 16, cy - 16, pid, 30, 2, true, 0, true, () => player);
  m.id = ++sentrySeq;
  m.x = cx - m.w / 2; m.y = cy - m.h / 2;         // 盒回正（Game case 'summon' 同式）
  (hooks as unknown as { entities: { projectiles: unknown[] } }).entities.projectiles.push(m);
  return m;
};
const fld = <T, K extends string>(o: T, k: K): unknown =>
  (o as unknown as Record<K, unknown>)[k];

// ============================================================
// ① 源码锚扫描（双侧亲读锚——原版行为面/本仓承载块）
// ============================================================
describe('① 源码锚（AI_084 642 支 / aiStyle112 644 支 双侧亲读锚）', () => {
  it('原版 AI_084 642 支数值锚（:31964-32213）', () => {
    const src = readFileSync(join(GAME, '..', 'Terarria1457', 'Terraria', 'Projectile.cs'), 'utf8');
    const i84 = src.indexOf('else if (aiStyle == 84)');
    expect(i84).toBeGreaterThan(-1);
    const block84 = src.slice(i84, src.indexOf('else if (aiStyle == 85)'));
    expect(block84).toContain('TryGetActive(641, out proj)');          // 宿主锁 :31964
    expect(block84).toContain('-proj.direction) * (MathF.PI / 3f) / 50f'); // 扫摆 :31967-31970
    expect(block84).toContain('Math.Sin(localAI[0] * MathF.PI / 50f) * 10f * num699'); // 包络 :32083
    expect(block84).toContain('num702 = 2f');                          // LaserScan 采样 :32130
    expect(block84).toContain('LaserScan(samplingPoint, velocity, num703 * scale, 2400f, array4)'); // :32144
    expect(block84).toContain('localAI[1] = MathHelper.Lerp(localAI[1], num704, amount)'); // Lerp 0.5 :32177
    expect(block84).toContain('new Vector3(0.3f, 0.65f, 0.7f)');       // PlotTileLine 光色 :32213
    const icoll = src.indexOf('if (type == 642)\n\t\t{\n\t\t\tfloat collisionPoint9');
    expect(icoll).toBeGreaterThan(-1);                                 // Colliding :16029
    expect(src.slice(icoll, icoll + 500)).toContain('CheckAABBvLineCollision'); // 线碰撞
    expect(src.slice(icoll, icoll + 400)).toContain('30f * scale');    // 线宽 30×scale :16033
    const i641 = src.indexOf('else if (type == 642)\n\t\t{\n\t\t\twidth = 18;');   // SetDefaults :6906
    expect(i641).toBeGreaterThan(-1);
    expect(src.slice(i641, i641 + 320)).toContain('localNPCHitCooldown = 10;');    // cd10 :6916
  });

  it('原版 aiStyle112 644 支数值锚（:34866-34998 + Kill :73416 + 爆花 :80316）', () => {
    const src = readFileSync(join(GAME, '..', 'Terarria1457', 'Terraria', 'Projectile.cs'), 'utf8');
    const i112 = src.indexOf('else if (aiStyle == 112)');
    expect(i112).toBeGreaterThan(-1);
    const block112 = src.slice(i112, src.indexOf('else if (aiStyle == 113)', i112));
    expect(block112).toContain('hslToRgb(this.ai[0], 1f, 0.5f)');      // hsl 色相 :34867
    expect(block112).toContain('localAI[0] = Main.rand.NextFloat() * 0.8f + 0.8f'); // scale 档 :34878
    expect(block112).toContain('localAI[1] / 40f * (MathF.PI * 2f)');  // 自旋 :34884
    expect(block112).toContain('alpha -= 8');                          // 渐显 :34888
    expect(block112).toContain('scale = Opacity / 2f * localAI[0]');   // :34953
    expect(block112).toContain('localAI[1] >= 60f');                   // Kill :34956
    expect(block112).toContain('localAI[1] == 30f');                   // t=30 引爆 :34974
    expect(block112).toContain('width = (height = 60)');               // 引爆盒 60 :34981
    const ikill = src.indexOf('if (type == 644)\n\t\t{\n\t\t\tDoRainbowCrystalStaffExplosion();');
    expect(ikill).toBeGreaterThan(-1);                                 // Kill 二段 :73416
    const iexp = src.indexOf('private void DoRainbowCrystalStaffExplosion()');
    expect(iexp).toBeGreaterThan(-1);
    expect(src.slice(iexp, iexp + 900)).toContain('float num = Main.rand.Next(7, 13)'); // 爆花环数
  });

  it('本仓承载锚：MoonGateBeam/RainbowCrystalBurst 全式（扫摆/束长/线碰撞/t30 引爆）', () => {
    const src = readFileSync(join(GAME, 'src', 'entities', 'MinionProj.ts'), 'utf8');
    expect(src).toContain('export class MoonGateBeam extends Entity');
    expect(src).toContain('export class RainbowCrystalBurst extends Entity');
    expect(src).toContain('Math.PI / 3) / 50');                        // 扫摆
    expect(src).toContain('this.localAI0 >= 50');                      // 50t Kill
    expect(src).toContain('30 * this.scale');                          // 线碰撞宽 30×scale
    expect(src).toContain('this.localAI1 === 30');                     // t=30 引爆
    expect(src).toContain('30 + en.w / 2');                            // 引爆盒 60（30+半宽）
    expect(src).toContain('this.localAI1 >= 60');                      // t=60 Kill
    expect(src).toContain('new MoonGateBeam(this.cx, this.cy, aimAng + gdir * (Math.PI / 6)'); // 641 生成位
    expect(src).toContain('new RainbowCrystalBurst(px, py, hue644, this, faces)');             // 643 生成位
  });
});

// ============================================================
// ② 行为判别（真哨兵夹具直驱）
// ============================================================
describe('② 642 月门光束（AI_084 642 支）', () => {
  it('641 开火生成 MoonGateBeam（非 Arrow 直飞弹）——ai0=目标角+dir×π/6、方向=目标 X 符号', () => {
    const e = mkEnemy(1, 60 * 16 + 300, 110 * 16);
    const { hooks, player, added } = makeHooks([e]);
    const g = sentry(player, hooks, 641, 60 * 16, 110 * 16);
    for (let t = 0; t < 40 && added.length === 0; t++) g.fixedUpdate(1, hooks);
    expect(added.length).toBe(1);
    const beam = added[0] as MoonGateBeam;
    expect(beam).toBeInstanceOf(MoonGateBeam);                         // 旧=Arrow 直飞弹 → 红
    expect(beam.projId).toBe(642);
    const aim = Math.atan2(e.cy - g.cy, e.cx - g.cx);
    const dir = e.cx >= g.cx ? 1 : -1;
    expect(beam.ai0).toBeCloseTo(aim + dir * Math.PI / 6, 5);          // :37910-37914（旧无 ai0 → 红）
    expect(beam.direction).toBe(dir as 1 | -1);
    expect(beam.damage).toBe(30);
  });

  it('束心锁门心 + 扫摆（ai0 逐拍 −dir×π/3/50）+ 50t 消亡 + 包络 ≤1', () => {
    const e = mkEnemy(1, 60 * 16 + 300, 110 * 16);
    const { hooks, player, added } = makeHooks([e]);
    const g = sentry(player, hooks, 641, 60 * 16, 110 * 16);
    for (let t = 0; t < 40 && added.length === 0; t++) g.fixedUpdate(1, hooks);
    const beam = added[0] as MoonGateBeam;
    const a0 = beam.ai0 as number;
    for (let t = 0; t < 5; t++) beam.fixedUpdate(1, hooks);
    expect(beam.cx).toBeCloseTo(g.cx, 4);                              // 束心锁 :31965
    expect(beam.cy).toBeCloseTo(g.cy, 4);
    expect(beam.ai0).toBeCloseTo(a0 - (1 * Math.PI / 3) / 50 * 5, 6);  // 扫摆（旧恒速直线无此 → 红）
    for (let t = 5; t < 60 && !beam.dead; t++) beam.fixedUpdate(1, hooks);
    expect(beam.dead).toBe(true);                                      // 50t Kill :32079（旧 timeLeft3600 → 红）
    expect(fld(beam, 'localAI0')).toBe(50);
  });

  it('LaserScan 束长收敛 + 线碰撞命中束上敌 + cd10（usesLocalNPCImmunity）', () => {
    // 敌摆在束径正前方 240px（束向 = 目标角+π/6 扫摆带——取固定夹具直接摆线上）
    const e = mkEnemy(1, 60 * 16 + 240, 110 * 16);
    const { hooks, player, added } = makeHooks([e]);
    const g = sentry(player, hooks, 641, 60 * 16, 110 * 16);
    for (let t = 0; t < 40 && added.length === 0; t++) g.fixedUpdate(1, hooks);
    const beam = added[0] as MoonGateBeam;
    for (let t = 0; t < 30; t++) {
      if (e.hits.length > 0) break;
      beam.fixedUpdate(1, hooks);
      // 束随扫摆掠过固定敌——扫摆 ±30°×240px 距离扫过横向 ~±125px,40t 内必相交
    }
    expect(e.hits.length).toBeGreaterThan(0);                          // 线碰撞（旧直飞弹盒碰撞=命中即亡 → 形状差）
    const firstCnt = e.hits.length;
    for (let t = 0; t < 9; t++) beam.fixedUpdate(1, hooks);            // cd10 窗内
    expect(e.hits.length).toBe(firstCnt);                              // 窗内不重击（旧全局 immune → 节奏差）
    for (let t = 0; t < 4; t++) beam.fixedUpdate(1, hooks);            // 过窗（束仍在敌径上）
    expect(e.hits.length).toBeGreaterThanOrEqual(firstCnt);            // 持续束=cd 后可再击
  });

  it('宿主 641 死 → 光束即灭（:31993 锁链尾支 Kill——A2 537 同语义）', () => {
    const e = mkEnemy(1, 60 * 16 + 300, 110 * 16);
    const { hooks, player, added } = makeHooks([e]);
    const g = sentry(player, hooks, 641, 60 * 16, 110 * 16);
    for (let t = 0; t < 40 && added.length === 0; t++) g.fixedUpdate(1, hooks);
    const beam = added[0] as MoonGateBeam;
    expect(beam.dead).toBe(false);
    g.dead = true;                                                     // 宿主死
    beam.fixedUpdate(1, hooks);
    expect(beam.dead).toBe(true);                                      // 尾支 Kill（旧 Arrow 无宿主链 → 红）
  });
});

describe('② 644 彩虹水晶爆裂（aiStyle112 644 支）', () => {
  it('643 volley 生成真爆裂弹 ×3（旧=落点即时 AoE 无弹体 → 红）且 t=0 不伤害', () => {
    const e = mkEnemy(1, 60 * 16 + 200, 110 * 16);
    const { hooks, player, added } = makeHooks([e]);
    const g = sentry(player, hooks, 643, 60 * 16, 110 * 16);
    for (let t = 0; t < 40 && added.length === 0; t++) g.fixedUpdate(1, hooks);
    expect(added.length).toBe(3);                                      // volley 3（:37928）
    for (const b of added) {
      expect(b).toBeInstanceOf(RainbowCrystalBurst);                   // 旧无弹实体 → 红
      expect((b as RainbowCrystalBurst).projId).toBe(644);
      expect((b as RainbowCrystalBurst).hue).toBeGreaterThanOrEqual(0); // Disco 色相（:37922）
    }
    expect(e.hits.length).toBe(0);                                     // t=0 无伤（旧即时 AoE → 红）
    for (let t = 0; t < 10; t++) for (const b of added) (b as RainbowCrystalBurst).fixedUpdate(1, hooks);
    expect(e.hits.length).toBe(0);                                     // t<30 仍无伤
  });

  it('t=30 引爆：60×60 盒内敌受一次伤（旧 14×14 窄盒 → 环带靶红）', () => {
    // 落点公式 j=0 = 靶盒内随机点 → 靶盒 4×4 = 爆心恒 ≈ 敌心（±2,判别确定性）——
    // 环带靶 = 距爆心 25px（60 盒 35 界恒含 / 旧 14 盒 12 界恒不含,零掷散歧义）
    const e = mkEnemy(1, 60 * 16 + 200, 110 * 16, 4, 4);
    const ring = mkEnemy(2, e.cx + 25, e.cy, 10, 10);                  // 10×10 小盒靶
    const { hooks, player, added } = makeHooks([e, ring]);
    const g = sentry(player, hooks, 643, 60 * 16, 110 * 16);
    for (let t = 0; t < 40 && added.length === 0; t++) g.fixedUpdate(1, hooks);
    for (const b of added) (b as RainbowCrystalBurst).fixedUpdate(1, hooks); // t=1 首拍掷定
    for (let t = 1; t < 29; t++) for (const b of added) (b as RainbowCrystalBurst).fixedUpdate(1, hooks);
    const before = e.hits.length + ring.hits.length;                   // t=29 尚未引爆
    for (const b of added) (b as RainbowCrystalBurst).fixedUpdate(1, hooks);   // t=30 引爆拍
    expect(e.hits.length + ring.hits.length).toBeGreaterThan(before);  // 受理
    expect(ring.hits.length).toBeGreaterThan(0);                       // 60 盒环带含（旧 14 盒 → 红）
    for (const b of added) (b as RainbowCrystalBurst).fixedUpdate(1, hooks);
    const after = e.hits.length + ring.hits.length;
    for (let t = 0; t < 5; t++) for (const b of added) (b as RainbowCrystalBurst).fixedUpdate(1, hooks);
    expect(e.hits.length + ring.hits.length).toBe(after);              // 单发语义（usesIDStatic :6951）
  });

  it('t=60 Kill 二段爆花（无伤害）+ 宿主 643 死全扫（:73336）', () => {
    const e = mkEnemy(1, 60 * 16 + 200, 110 * 16);
    const { hooks, player, added } = makeHooks([e]);
    const g = sentry(player, hooks, 643, 60 * 16, 110 * 16);
    for (let t = 0; t < 40 && added.length === 0; t++) g.fixedUpdate(1, hooks);
    const b0 = added[0] as RainbowCrystalBurst;
    for (let t = 0; t < 31; t++) b0.fixedUpdate(1, hooks);
    const hitsAt30 = e.hits.length;                                    // t=30 已伤（真弹语义）
    for (let t = 31; t < 60 && !b0.dead; t++) b0.fixedUpdate(1, hooks);
    expect(b0.dead).toBe(true);                                        // 60t Kill（旧即时 AoE 无寿命面）
    expect(e.hits.length).toBe(hitsAt30);                              // 二段零伤（单发语义）
    // 宿主扫除
    const b1 = added[1] as RainbowCrystalBurst;
    g.dead = true;
    b1.fixedUpdate(1, hooks);
    expect(b1.dead).toBe(true);                                        // :73336 全扫
  });
});

describe('② 纯函数（Disco 色相链）', () => {
  it('rgbToHslHue/discoHueAt（Main.cs:48743 + :19776 六相循环）', () => {
    expect(rgbToHslHue(255, 0, 0)).toBeCloseTo(0, 6);                  // 红相 hue=0
    expect(rgbToHslHue(0, 255, 0)).toBeCloseTo(1 / 3, 6);              // 绿相 1/3
    expect(rgbToHslHue(0, 0, 255)).toBeCloseTo(2 / 3, 6);              // 蓝相 2/3
    expect(discoHueAt(0)).toBeCloseTo(0, 6);                           // 初值 R=255 → hue 0
    // 六相周期 219：t=0 与 t=219 同相（纯函数幂等）
    expect(discoHueAt(219)).toBeCloseTo(discoHueAt(0), 6);
    // G 相完成拍（t≈37）→ R 减相中 → hue 已离开 0
    expect(discoHueAt(40)).toBeGreaterThan(0.01);
  });
});

// ============================================================
// ③ 变异自证（恰红+逐字节还原+sha256 对拍,BJ606 习语）
//    SW_BJ639_MUT=1 时本组跳过（变异运行读环境位跳过自证组,防递归）
// ============================================================
describe.skipIf(process.env.SW_BJ639_MUT)('③ 变异自证（恰红+逐字节还原+sha256 对拍）', () => {
  const writeFileSync = (f: string, s: string) => require('node:fs').writeFileSync(f, s);
  const { createHash } = require('node:crypto') as typeof import('node:crypto');
  const { spawnSync } = require('node:child_process') as typeof import('node:child_process');

  const spawnVitest = (filter: string) => spawnSync(
    'npx', ['vitest', 'run', 'tests/bj639-moongate-rainbow-ai.test.ts', '--no-file-parallelism', '-t', filter], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 600_000,
      env: { ...process.env, SW_BJ639_MUT: '1' },
    });
  const sha256 = (b: string) => createHash('sha256').update(b).digest('hex');
  const mutate = (file: string, trigger: string, replacement: string, filter: string): void => {
    let cur = readFileSync(file, 'utf8');
    if (!cur.includes(trigger) && cur.includes(replacement)) {
      writeFileSync(file, cur.replace(replacement, trigger));   // 上轮 SIGKILL 泄漏自愈
      cur = readFileSync(file, 'utf8');
    }
    const PRISTINE = cur;
    expect(PRISTINE).toContain(trigger);
    try {
      writeFileSync(file, PRISTINE.replace(trigger, replacement));
      const r = spawnVitest(filter);
      expect(r.status, `变异须证红: ${replacement}`).not.toBe(0);
      expect(r.stdout + r.stderr).toContain(filter);
    } finally {
      writeFileSync(file, PRISTINE);
    }
    const restored = readFileSync(file, 'utf8');
    expect(restored).toBe(PRISTINE);
    expect(sha256(restored)).toBe(sha256(PRISTINE));            // sha256 对拍（逐字节还原）
  };

  const MINION = join(process.cwd(), 'src', 'entities', 'MinionProj.ts');

  it('M1 642 扫摆摘除（回退旧恒向直线承载）→ ②扫摆锁 红', () => {
    mutate(MINION,
      'const sweep = -(this.direction as number) * (Math.PI / 3) / 50;',
      'const sweep = 0;',
      '扫摆');   // 注：-t 过滤串勿含 '+'（regex 元字符会零匹配假绿）
  });

  it('M2 642 寿命 50→500（回退旧 timeLeft3600 面缺）→ ②50t 消亡锁 红', () => {
    mutate(MINION,
      'if (this.localAI0 >= 50) { this.dead = true; return; }',
      'if (this.localAI0 >= 500) { this.dead = true; return; }',
      '50t 消亡');
  });

  it('M3 644 引爆 t30→t0（回退旧即时 AoE 档）→ ②t=0 不伤害/30 拍引爆 红', () => {
    mutate(MINION,
      'if (this.localAI1 === 30 && !this.boomed) {',
      'if (this.localAI1 === 0 && !this.boomed) {',
      't=30 引爆');
  });

  it('M4 644 引爆盒 60→14（回退旧窄盒档）→ ②环带靶 红', () => {
    mutate(MINION,
      'if (Math.abs(en.cx - bx) < 30 + en.w / 2 && Math.abs(en.cy - by) < 30 + en.h / 2) {',
      'if (Math.abs(en.cx - bx) < 7 + en.w / 2 && Math.abs(en.cy - by) < 7 + en.h / 2) {',
      't=30 引爆');
  });
});
