// ★C16a（2026-10-12）：弹幕 AI 域清偿（红蓝 R16 F1-F12）判别锁。
//  落刀面（先定谳后动刀,反编译 1457 唯一标杆,行号亲读）：
//   · F1  389 出膛锚 = NewProjectile 中心域（:30601 传 Center + :10880 position=
//         Center−w/2）− 389 盒 4×4（:4732-4743）→ 左上 Center−2（旧 −5 偏 3px）。
//   · F3  644 伤害语义：①IDStatic 免疫表（:6951 usesIDStatic+:468 cd=−1 缺省 →
//         :14036 写 count+(uint)(−1)=count−1（uint 回绕）→ 门 :606-608
//         `stored<=count` 恒真=免疫面零阻;:14035 命中尾 immune[owner]=0 清窗）
//         ②t=60 Kill 二段 Damage（:73416-73430）——旧钉 bj639「t=60 无伤害/
//         单发语义」=R1-F1 级误读判谳,已破钉重产。
//   · F4  爆花尘速度 = (0,−3).RotBy(θ)·RotBy(φ) 角合成 ×(2.1,2) = (6.3sin,−6cos)×k
//         （:80318-80322;旧 ×0.33/×0.5 模长漏乘+x:y 比错）+ 白克隆两处
//         （爆花 :80337-80341 scale/fadeIn ÷2 白;亮星 :34946-34949 ×0.65 白）。
//   · F5  388 冲刺态分离力：分离环（:30123-30146）位于冲刺块（:30157-30178）之前,
//         态内每 AI 跑（extraUpdates=1→2 子步）照吃推离（冲刺速度仅触发拍写死,
//         分离实时改写冲刺轨迹;旧实现冲刺早退在环前）。
//   · F6  tGroup 759 栖息帧过滤（:52813 `type!=759||frame==projFrames-1`）+owner 门。
//   · F7  533 四向尘三错齐修（:30287-30289/:30540-30542）：Vector2.One（模√2、45°
//         对角）.RotatedBy(i·π/2).RotatedBy(rot) → 位=Center+vec×10、速=vec×1。
//   · F9  644 回门光线（:34868-34875 宿主活即每拍画,无 α 门）与 α 门 AddLight
//         （:34895-34899）拆分——旧实现整挂 alpha==0 门=渐显期光线整缺。
//   · F10 754 SpawnRopeIn 尘盒 −8 双轴（:53060/:53062 单参构造 Vector2(−8f)=双轴,
//         旧只偏 X）。
//   · F11 533 拦截焦点零速特典（:30319-30323 focus 支不写 zero 恒 (0,0),野生支
//         :30357 才写 nPC.velocity;twinsStep 同判既案,deadlySpherePhase 漏网）。
//   · F12 4262 扫描距离基准顶左（Player.cs:48285 `position.X` 非 Center）+direction
//         依赖（:48288 `if (direction<0) num56++`;useStyle5+useTurn → direction=
//         鼠标侧=mdir 同相;≤0.6 格边界差,酌情定谳=落）。
//  ★变异证红（BJ643 债①纪律）：全族走 tests/mutation-guard.ts withMutation
//  （文件互斥/panic-safe 还原/残留自检,逐字节对拍）,内层 spawnSync 独跑恰红。
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.setConfig({ testTimeout: 600_000, hookTimeout: 600_000 });   // 变异自证内层 spawn 按仓内习语放宽
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { withMutation } from './mutation-guard';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { MinionProj, RainbowCrystalBurst } from '../src/entities/MinionProj';
import { Arrow } from '../src/entities/Arrow';
import { MysticSnakeCoil } from '../src/entities/MysticSnakeCoil';
import type { VDust } from '../src/fx/VanillaDust';
import type { GameHooks } from '../src/entities/types';
// ★C档可移植:仓库外依赖(game/ 兄弟目录,clone 侧缺=正常形态)——缺则本文件 skip,本机在=真跑零语义变化
const EXT_MISSING = !['Terarria1457'].every((d) => existsSync(new URL(`../../${d}`, import.meta.url)));


const GAME = join(__dirname, '..');

// ============================================================
// 夹具（BJ514/BJ634/BJ639 防「夹具喂幻影」纪律：真 World+真 Player+真盒敌）
// ============================================================
interface MockEnemy {
  id: number; x: number; y: number; w: number; h: number; dead: boolean;
  cx: number; cy: number; hp: number; maxHp?: number; boss?: boolean;
  vx?: number; vy?: number; iframes?: number;
  hurt: (d: number, kx?: number, ky?: number, g?: GameHooks) => boolean;
  hits: number[];
}
const mkEnemy = (id: number, cx: number, cy: number, w = 40, h = 40): MockEnemy => {
  const e: MockEnemy = {
    id, x: cx - w / 2, y: cy - h / 2, w, h, dead: false, cx, cy,
    hp: 100000, maxHp: 100000, boss: true, hits: [], vx: 0, vy: 0,
    // 仓内 Enemy.hurt pierce=0 尾写 10t 免工窗（-2 缺省族语义）——F3① 清窗锁的对照面
    hurt: (d: number) => { e.hp -= d; e.hits.push(d); e.iframes = 10; return true; },
  };
  return e;
};

type DustRec = VDust & { bw: number; bh: number };   // VDust 无盒宽高列——记录用伴生字段

function makeHooks(enemies: MockEnemy[] = [], opts: { dust?: boolean; light?: boolean } = {}) {
  const w = new World(300, 140, 7, 'c16a');
  for (let x = 0; x < 300; x++) for (let y = 120; y < 140; y++) w.store.setTile(x, y, 1);
  w.groundLevel = 120;
  const player = new Player(60 * 16, 110 * 16, new Inventory());
  const registry: unknown[] = [];
  const added: unknown[] = [];
  const dusts: DustRec[] = [];
  const clones: Array<{ parent: DustRec; rec: DustRec }> = [];
  const lights: Array<{ x: number; y: number }> = [];
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
  if (opts.dust) {
    hooks.spawnDust = (x, y, ww, hh, type, sx = 0, sy = 0, alpha = 0, color = null, scale = 1, ng = false) => {
      const d = {
        x, y, bw: ww, bh: hh, type, vx: sx, vy: sy, alpha, scale, fadeIn: 0,
        noGravity: !!ng, noLight: false, color,
      } as unknown as DustRec;
      dusts.push(d);
      return d;
    };
    hooks.cloneDust = (d: DustRec) => {
      const c: DustRec = { ...d };
      clones.push({ parent: d, rec: c });
      return c;
    };
  }
  if (opts.light) {
    hooks.addLightAt = (x, y) => { lights.push({ x, y }); };
  }
  (hooks as unknown as { entities: { projectiles: unknown[]; add: (e: unknown) => void } }).entities = {
    projectiles: registry,
    add: (e: unknown) => { registry.push(e); added.push(e); },
  };
  return { hooks, player, added, dusts, clones, lights };
}

let seq = 0;
const sentry = (player: Player, hooks: GameHooks, pid: number, cx: number, cy: number): MinionProj => {
  const m = new MinionProj(cx - 16, cy - 16, pid, 30, 2, true, 0, true, () => player);
  m.id = ++seq;
  m.x = cx - m.w / 2; m.y = cy - m.h / 2;
  (hooks as unknown as { entities: { projectiles: unknown[] } }).entities.projectiles.push(m);
  return m;
};
const wrapPi = (a: number): number => {
  let r = a;
  while (r > Math.PI) r -= Math.PI * 2;
  while (r < -Math.PI) r += Math.PI * 2;
  return r;
};

// ============================================================
// ① 源码锚扫描（反编译 1457 亲读锚——先定谳面）
// ============================================================
describe.skipIf(EXT_MISSING)('① 源码锚（R16 F1-F12 反编译锚亲读）', () => {
  // ★C档可移植:缺档降级(describe 体收集期亦执行;EXT_MISSING skip 兜底)
  const psrc = existsSync(join(GAME, '..', 'Terarria1457', 'Terraria', 'Projectile.cs')) ? readFileSync(join(GAME, '..', 'Terarria1457', 'Terraria', 'Projectile.cs'), 'utf8') : '';

  it('F1/F3/F4 锚（:30601 出膛/:6951+:468+:14036+:606-608 IDStatic 链/:80318-80341 爆花）', () => {
    // F1：387 激光 NewProjectile @Center（:30601）+ 389 盒 4×4（:4732-4743）
    expect(psrc).toContain('NewProjectile(GetProjectileSource_FromThis(), base.Center.X, base.Center.Y, vector45.X');
    expect(psrc).toContain('projectile.position.X = X - (float)projectile.width * 0.5f;');   // :10880 中心域
    const i389 = psrc.indexOf('else if (type == 389)');
    expect(psrc.slice(i389, i389 + 200)).toContain('width = 4;');
    // F3：IDStatic 全链（:468 字段缺省 −1 / :6951 usesIDStatic / :14036 写 / :608 门）
    expect(psrc).toContain('public int idStaticNPCHitCooldown = -1;');
    const i644def = psrc.indexOf('else if (type == 644)\n\t\t{\n\t\t\twidth = 14;');
    expect(psrc.slice(i644def, i644def + 300)).toContain('usesIDStaticNPCImmunity = true;');
    expect(psrc).toContain('perIDStaticNPCImmunity[immunityIdentity, victimIndex] = Main.GameUpdateCount + (uint)idStaticNPCHitCooldown;');
    expect(psrc).toContain('return perIDStaticNPCImmunity[projectileType, npcIndex] <= Main.GameUpdateCount;');
    // F3②：Kill 二段（:73416-73430）
    const ikill = psrc.indexOf('if (type == 644)\n\t\t{\n\t\t\tDoRainbowCrystalStaffExplosion();');
    expect(ikill).toBeGreaterThan(-1);
    expect(psrc.slice(ikill, ikill + 600)).toContain('width = (height = 60);');
    expect(psrc.slice(ikill, ikill + 600)).toContain('Damage();');
    // F4：爆花速度式 + 白克隆双处
    const iexp = psrc.indexOf('private void DoRainbowCrystalStaffExplosion()');
    const exp = psrc.slice(iexp, iexp + 1400);
    expect(exp).toContain('new Vector2(0f, -3f).RotatedByRandom(3.1415927410125732)');
    expect(exp).toContain('new Vector2(2.1f, 2f)');
    expect(exp).toContain('spinningpoint.RotatedBy(MathF.PI * 2f * num2 / num) * vector * (0.8f + Main.rand.NextFloat() * 0.4f)');
    expect(exp).toContain('dust.scale /= 2f;');
    expect(exp).toContain('dust.fadeIn /= 2f;');
    expect(exp).toContain('dust.color = new Color(255, 255, 255, 255);');
  });

  it('F5/F6/F7/F8 锚（分离环位次/:52813 759 帧/四向尘 One 基/花瓣双环）', () => {
    // F5：分离环（num530=0.05）位次在 388 冲刺块之前
    const isep = psrc.indexOf('float num530 = 0.05f;');
    const idash = psrc.indexOf('if (this.ai[0] == 2f && type == 388)');
    expect(isep).toBeGreaterThan(-1);
    expect(idash).toBeGreaterThan(isep);
    // F6：759 栖息帧过滤 + owner 门（:52809-52825）
    expect(psrc).toContain('(projectile.type != 759 || projectile.frame == Main.projFrames[projectile.type] - 1)');
    expect(psrc).toContain('projectile.active && projectile.owner == owner && projectile.type == type');
    // F7：四向尘双站（:30287 状态 8 / :30540 状态 2）——Vector2.One 基 + 位偏 ×10
    expect(psrc).toContain('Vector2.One.RotatedBy((float)num535 * (MathF.PI / 2f)).RotatedBy(rotation)');
    expect(psrc).toContain('dust16.position = base.Center + vector40 * 10f;');
    expect(psrc).toContain('Vector2.One.RotatedBy((float)num551 * (MathF.PI / 2f)).RotatedBy(rotation)');
    expect(psrc).toContain('dust17.position = base.Center + vector44 * 10f;');
    // F8：花瓣双环（环 1 双旋 / 环 2 仅 nπ）
    expect(psrc).toContain('Vector2.UnitY.RotatedBy((float)num872 * MathF.PI).RotatedBy(rotation)');
    expect(psrc).toContain('Vector2.UnitY.RotatedBy((float)num873 * MathF.PI)');
  });

  it('F9/F10/F11/F12 锚（光线-AddLight 拆分/尘盒双轴/焦点零速/4262 顶左基准）', () => {
    // F9：回门光线（宿主活即画）与 α 门 AddLight 拆分
    expect(psrc).toContain('Utils.PlotTileLine(base.Center, proj3.Center, 8f, DelegateMethods.CastLight)');
    const iline = psrc.indexOf('Utils.PlotTileLine(base.Center, proj3.Center, 8f, DelegateMethods.CastLight)');
    const ialpha = psrc.indexOf('if (alpha == 0)', iline);
    expect(ialpha).toBeGreaterThan(iline);
    expect(psrc.slice(ialpha, ialpha + 120)).toContain('Lighting.AddLight(base.Center, newColor3.ToVector3() * 0.5f)');
    // F10：SpawnRopeIn 尘盒 −8 单参构造=双轴（:53060/:53062）
    expect(psrc).toContain('Dust.NewDustDirect(vector + new Vector2(-8f), 16, 16, 31, 0f, 0f, 100, Color.Transparent).velocity *= 0.4f;');
    expect(psrc).toContain('Dust.NewDustDirect(vector + new Vector2(-8f), 16, 16, 27, 0f, 0f, 100, Color.Transparent, 1.7f);');
    // F11：焦点支（OwnerMinionAttackTargetNPC 桶）不写 zero——支内切片零 `zero =` 赋值
    const ifocus = psrc.indexOf('NPC ownerMinionAttackTargetNPC2 = OwnerMinionAttackTargetNPC;');
    const ifocusEnd = psrc.indexOf('if (!flag32)', ifocus);
    const focusBlock = psrc.slice(ifocus, ifocusEnd);
    expect(focusBlock).toContain('center5 = ownerMinionAttackTargetNPC2.Center;');
    expect(focusBlock).not.toContain('zero =');
    // F12：4262 扫描基准=position.X（顶左）+ direction 依赖
    const plsrc = readFileSync(join(GAME, '..', 'Terarria1457', 'Terraria', 'Player.cs'), 'utf8');
    const i4262 = plsrc.indexOf('if (sItem.type == 4262)');
    const block = plsrc.slice(i4262, i4262 + 1200);
    expect(block).toContain('Math.Abs((float)Main.mouseX + Main.screenPosition.X - position.X) / 16f');
    expect(block).toContain('if (direction < 0)');
    expect(block).toContain('Point point2 = base.Center.ToTileCoordinates();');
  });
});

// ============================================================
// ② 行为判别锁（F1-F12）
// ============================================================
describe.skipIf(EXT_MISSING)('② 行为判别锁', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('F1 389 出膛锚=Center−2（弹心=随从发拍心;旧 −5 偏 3px → 红）', () => {
    const { hooks, player, added } = makeHooks([mkEnemy(1, 60 * 16 + 600, 90 * 16 - 40)]);
    const m = new MinionProj(player.cx, player.cy - 40, 387, 10, 2, false, 0, false, () => player);
    const cx0 = m.cx, cy0 = m.cy;                        // 出膛拍心（fire 后同拍 moveAndCollide 微移）
    m.fixedUpdate(1, hooks);
    const lasers = added.filter((e): e is Arrow => e instanceof Arrow && e.projId === 389);
    expect(lasers.length).toBeGreaterThanOrEqual(1);
    const s = lasers[0];
    expect(s.w).toBe(4); expect(s.h).toBe(4);            // :4732-4743
    expect(s.x).toBe(cx0 - 2);                           // 左上 = Center−2（逐位;旧 −5 → 红）
    expect(s.y).toBe(cy0 - 2);
    expect(s.x + s.w / 2).toBeCloseTo(cx0, 9);           // 弹心=随从发拍心
    expect(s.y + s.h / 2).toBeCloseTo(cy0, 9);
  });

  it('F3① 644 引爆命中尾清敌免工窗（:14035 immune[owner]=0,旧 10t 残留 → 红）', () => {
    const e = mkEnemy(1, 60 * 16 + 200, 110 * 16);
    const { hooks, player, added } = makeHooks([e]);
    const g = sentry(player, hooks, 643, 60 * 16, 110 * 16);
    for (let t = 0; t < 40 && added.length === 0; t++) g.fixedUpdate(1, hooks);
    const bursts = added.filter((b): b is RainbowCrystalBurst => b instanceof RainbowCrystalBurst);
    expect(bursts.length).toBeGreaterThanOrEqual(1);
    const b0 = bursts[0];
    for (let t = 0; t < 30; t++) b0.fixedUpdate(1, hooks);
    expect(e.hits.length).toBe(1);                       // t=30 首段受理
    expect(e.iframes).toBe(0);                           // :14035 清窗（旧=pierce0 尾写 10t 残留）
  });

  it('F3② t=60 二段伤害：已命中者再吃一拍（:73421-73430;IDStatic −1 档零阻）', () => {
    // 定谳链：:468 cd=−1 → :14036 写 count+(uint)(−1)=count−1（uint 回绕）→
    // :606-608 门 `stored<=count` 恒真;:14035 清窗 → 二段过 :12636 共门
    const e = mkEnemy(1, 60 * 16 + 200, 110 * 16);
    const { hooks, player, added } = makeHooks([e]);
    const g = sentry(player, hooks, 643, 60 * 16, 110 * 16);
    for (let t = 0; t < 40 && added.length === 0; t++) g.fixedUpdate(1, hooks);
    const b0 = added.filter((b): b is RainbowCrystalBurst => b instanceof RainbowCrystalBurst)[0];
    for (let t = 0; t < 30; t++) b0.fixedUpdate(1, hooks);
    expect(e.hits.length).toBe(1);
    for (let t = 30; t < 60 && !b0.dead; t++) b0.fixedUpdate(1, hooks);
    expect(b0.dead).toBe(true);
    expect(e.hits.length).toBe(2);                       // 二段=已命中者亦吃（旧钉「二段零伤」→ 红）
  });

  it('F4 爆花速度 (6.3sin,−6cos)×k + 白克隆 ÷2（:80318-80341;旧 2.05/3 漏乘 → 红）', () => {
    const { hooks, player, dusts, clones } = makeHooks([], { dust: true });
    const parent = new MinionProj(60 * 16, 110 * 16, 643, 30, 2, true, 0, true, () => player);
    let maxVx = 0, maxVy = 0;
    for (let burst = 0; burst < 3; burst++) {
      const b = new RainbowCrystalBurst(60 * 16 + 200, 110 * 16, 0.25, parent, { hitAt: () => {} });
      for (let t = 0; t < 29; t++) b.fixedUpdate(1, hooks);
      const before = dusts.length;
      const beforeClones = clones.length;
      b.fixedUpdate(1, hooks);                           // t=30 引爆拍（爆花尘 α=0,亮星 α=127,花瓣 α=225）
      const event = dusts.slice(before).filter((d) => d.alpha === 0);
      expect(event.length).toBeGreaterThanOrEqual(14);   // 2 环 × num(7-12)
      expect(clones.length - beforeClones).toBe(event.length);   // 每爆花尘一白克隆（亮星克隆 ×0.65 不入本拍）
      for (let i = 0; i < event.length; i++) {
        const d = event[i];
        const c = clones[beforeClones + i];
        expect(c.parent).toBe(d);
        expect(c.rec.scale).toBe(d.scale / 2);           // :80338 ÷2（逐位）
        expect(c.rec.fadeIn).toBe(d.fadeIn / 2);         // :80339 ÷2
        expect(c.rec.color).toEqual({ r: 255, g: 255, b: 255, a: 255 });
        // 速度域：(6.3sin,−6cos)×k → (vx/6.3)²+(vy/6)² = k² ≤ 1.44
        const kk = (d.vx / 6.3) ** 2 + (d.vy / 6) ** 2;
        expect(kk).toBeLessThanOrEqual(1.44 + 1e-9);
        maxVx = Math.max(maxVx, Math.abs(d.vx));
        maxVy = Math.max(maxVy, Math.abs(d.vy));
      }
    }
    expect(maxVx).toBeGreaterThan(4.5);                  // 旧码上限 2.05×1.2=2.46
    expect(maxVy).toBeGreaterThan(4.0);                  // 旧码上限 3×1.2=3.6
  });

  it('F4b 亮星白克隆 ×0.65（:34946-34949;旧整缺 → 红）', () => {
    const { hooks, player, dusts, clones } = makeHooks([], { dust: true });
    const parent = new MinionProj(60 * 16, 110 * 16, 643, 30, 2, true, 0, true, () => player);
    let starClones = 0;
    for (let burst = 0; burst < 3; burst++) {
      const b = new RainbowCrystalBurst(60 * 16 + 200, 110 * 16, 0.25, parent, { hitAt: () => {} });
      for (let t = 0; t < 60 && !b.dead; t++) b.fixedUpdate(1, hooks);
    }
    for (const { parent: p, rec } of clones) {
      if (Math.abs(rec.scale - p.scale * 0.65) < 1e-12) {
        starClones++;
        expect(rec.fadeIn).toBeCloseTo(p.fadeIn * 0.65, 12);
        expect(rec.color).toEqual({ r: 255, g: 255, b: 255, a: 255 });
      }
    }
    expect(starClones).toBeGreaterThanOrEqual(1);
  });

  it('F5 388 冲刺态每子步吃分离力（:30123-146 位次;旧冲刺早退 → 红）', () => {
    const { hooks, player } = makeHooks([]);
    const a = new MinionProj(player.cx, player.cy - 40, 388, 10, 2, false, 0, false, () => player);
    const b = new MinionProj(player.cx, player.cy - 40, 388, 10, 2, false, 0, false, () => player);
    a.id = ++seq; b.id = ++seq;
    const reg = (hooks as unknown as { entities: { projectiles: unknown[] } }).entities.projectiles;
    reg.push(a, b);
    (a as unknown as { twA0: number; twA1: number }).twA0 = 2;   // 冲刺态
    (a as unknown as { twA1: number }).twA1 = 0;
    a.vx = 8; a.vy = 0;
    a.fixedUpdate(1, hooks);                                     // 2 子步 × ±0.05（B 同位 → 两轴 +0.05/子步）
    expect(a.vx).toBeCloseTo(8.1, 6);
    expect(a.vy).toBeCloseTo(0.1, 6);
  });

  it('F6 tGroup 759 只计栖息帧（bbFrame==4）+owner 门（:52811-52813;旧全计 → 红）', () => {
    const { hooks, player } = makeHooks([]);
    const player2 = new Player(200 * 16, 110 * 16, new Inventory());
    const a = new MinionProj(player.cx, player.cy - 40, 759, 10, 2, false, 0, false, () => player);
    const b = new MinionProj(player.cx + 30, player.cy - 40, 759, 10, 2, false, 0, false, () => player);
    const c = new MinionProj(player.cx + 60, player.cy - 40, 759, 10, 2, false, 0, false, () => player2);
    a.id = ++seq; b.id = ++seq; c.id = ++seq;
    (a as unknown as { bbFrame: number }).bbFrame = 4;   // 栖息
    (b as unknown as { bbFrame: number }).bbFrame = 0;   // 飞行
    (c as unknown as { bbFrame: number }).bbFrame = 4;   // 异主栖息
    const reg = (hooks as unknown as { entities: { projectiles: unknown[] } }).entities.projectiles;
    reg.push(a, b, c);
    const g = (a as unknown as { tGroup(h: GameHooks, pid: number): { index: number; total: number } })
      .tGroup(hooks, 759);
    expect(g.total).toBe(1);                             // b 帧 / c 异主 双排除（旧 total=2 → 红）
    expect(g.index).toBe(0);
  });

  it('F7 533 四向尘：45°+i90°+rot、√2 模、位=Center+vec×10（状态 8 站 :30287）', () => {
    const { hooks, player, dusts } = makeHooks([], { dust: true });
    const m = new MinionProj(player.cx + 400, player.cy - 40, 533, 10, 2, false, 0, false, () => player);
    m.id = ++seq;
    (hooks as unknown as { entities: { projectiles: unknown[] } }).entities.projectiles.push(m);
    const R0 = 0.7;
    m.rot = R0;
    (m as unknown as { dA0: number; dA1: number }).dA0 = 8;      // 冲刺末态（每子步掷尘）
    (m as unknown as { dA1: number }).dA1 = 0;
    const before = dusts.length;
    m.fixedUpdate(1, hooks);
    const ds = dusts.slice(before);
    expect(ds.length).toBeGreaterThanOrEqual(4);          // ≥4（两子步各 4 向）
    for (const d of ds) {
      expect(Math.hypot(d.vx, d.vy)).toBeCloseTo(Math.SQRT2, 9);   // 模 √2（旧 1 → 红）
      expect(d.x - d.vx * 10).toBeCloseTo(m.cx, 6);                // 位=Center+vec×10（旧零偏 → 红）
      expect(d.y - d.vy * 10).toBeCloseTo(m.cy, 6);
      const a = Math.atan2(d.vy, d.vx);
      const ok = [Math.PI / 6, Math.PI / 3].some((s) =>           // 子步 rot=R0+π/6 / R0+π/3
        [0, 1, 2, 3].some((i) =>
          Math.abs(wrapPi(a - (Math.PI / 4 + i * Math.PI / 2 + R0 + s))) < 1e-6));
      expect(ok).toBe(true);                              // 45° 对角基准（旧 0° → 红）
    }
  });

  it('F7b 533 待机闪尘（状态 2 站 :30540）：同式 + noLight', () => {
    const { hooks, player, dusts } = makeHooks([], { dust: true });
    const m = new MinionProj(player.cx + 400, player.cy - 40, 533, 10, 2, false, 0, false, () => player);
    m.id = ++seq;
    (hooks as unknown as { entities: { projectiles: unknown[] } }).entities.projectiles.push(m);
    m.vx = 0; m.vy = 0;
    (m as unknown as { dA0: number }).dA0 = 2;
    const recs: Array<{ d: DustRec; rot: number; cx0: number; cy0: number }> = [];
    for (let t = 0; t < 60 && recs.length < 4; t++) {
      const before = dusts.length;
      const cx0 = m.cx, cy0 = m.cy;                       // 本拍起点（integrate 在尘后位移）
      m.fixedUpdate(1, hooks);
      const rot = m.rot;                                  // 尘掷于本拍 rot 写后（无后续改写）
      for (const d of dusts.slice(before)) recs.push({ d, rot, cx0, cy0 });
    }
    expect(recs.length).toBeGreaterThanOrEqual(4);
    for (const { d, rot, cx0, cy0 } of recs) {
      expect(d.noLight).toBe(true);
      expect(d.scale).toBeGreaterThanOrEqual(0.3);
      expect(d.scale).toBeLessThanOrEqual(0.8);
      expect(Math.hypot(d.vx, d.vy)).toBeCloseTo(Math.SQRT2, 9);
      expect(d.x - d.vx * 10).toBeCloseTo(cx0, 6);        // 位=掷拍中心+vec×10
      expect(d.y - d.vy * 10).toBeCloseTo(cy0, 6);
      const a = Math.atan2(d.vy, d.vx);
      const ok = [0, 1, 2, 3].some((i) =>
        Math.abs(wrapPi(a - (Math.PI / 4 + i * Math.PI / 2 + rot))) < 1e-6);
      expect(ok).toBe(true);
    }
  });

  it('F8 花瓣双环：环1=−sin(nπ+rot)/环2=垂直对（:34899-34924;旧 +sin 双环同式 → 红）', () => {
    const { hooks, player, dusts } = makeHooks([], { dust: true });
    const parent = new MinionProj(60 * 16, 110 * 16, 643, 30, 2, true, 0, true, () => player);
    const b = new RainbowCrystalBurst(60 * 16 + 200, 110 * 16, 0.25, parent, { hitAt: () => {} });
    // ★BJ662（2026-10-12）M8 逃逸封锁（确定性 tick 驱动,红判据必达）：rot=localAI1/40·
    //  2π·direction → t=20 拍 rot=+π（direction=1 首拍 0 掷钉定）——M8（环 2 旋转化）
    //  下环 2 判据唯一的 bitwise 对齐点 = t=20 的 n=0 花瓣（ang=0+π 与检验式
    //  sin(π) 逐位同值;t=40 rot=2π 时 sin(2π)=−2.45e-16 ≠ sin(0)/sin(π) 不对齐）。
    //  旧自由掷下红判据依赖 1/10 掷恰落在该拍（逃逸率≈81%）。改掷流钉定：
    //  localAI1=20 拍掷 0.5（四花瓣站全跳,对齐拍零生成）,其余拍掷 0（全生成）——
    //  pristine 环 2 由 loop-1 非对齐拍承载（ang=nπ 恒不随 rot,bitwise 对齐检验式）,
    //  M8 变异下环 2 判据恒 0 → 恰红。
    vi.spyOn(Math, 'random').mockImplementation(() => (b.localAI1 === 20 ? 0.5 : 0));
    let petals: Array<{ d: DustRec; rot: number }> = [];
    for (let t = 0; t < 59 && !b.dead; t++) {
      const before = dusts.length;
      b.fixedUpdate(1, hooks);
      for (const d of dusts.slice(before)) {
        if (d.alpha === 225) petals.push({ d, rot: b.rot });      // 花瓣 α=225 标记
      }
    }
    expect(petals.length).toBeGreaterThanOrEqual(4);
    let ring1WithSlope = 0, ring2 = 0;
    for (const { d, rot } of petals) {
      const inRing1 = [0, 1].some((n) => {
        const ang = Math.PI * n + rot;
        return d.vx === -Math.sin(ang) * 2.5 && d.vy === Math.cos(ang) * 2.5;   // 逐位（同式同输入）
      });
      const inRing2 = [0, 1].some((n) => {
        const ang = Math.PI * n;                                   // 环 2 不随 rot
        return d.vx === -Math.sin(ang) * 2.5 && d.vy === Math.cos(ang) * 2.5;
      });
      expect(inRing1 || inRing2).toBe(true);
      if (inRing1 && Math.abs(d.vx) > 0.25) ring1WithSlope++;
      if (inRing2) ring2++;
    }
    expect(ring1WithSlope).toBeGreaterThanOrEqual(1);     // 环 1 随 rot 转（−sin 判例,旧 +sin 镜像 → 红）
    expect(ring2).toBeGreaterThanOrEqual(1);              // 环 2 垂直对存在（旧环 2 随 rot → 红）
  });

  it('F9 回门光线宿主活即画（无 α 门）+ α 门 AddLight 拆分（:34868-34899）', () => {
    const { hooks, player, lights } = makeHooks([], { light: true });
    const parent = new MinionProj(60 * 16, 110 * 16, 643, 30, 2, true, 0, true, () => player);
    const b = new RainbowCrystalBurst(60 * 16 + 200, 110 * 16, 0.25, parent, { hitAt: () => {} });
    for (let t = 0; t < 4; t++) b.fixedUpdate(1, hooks);  // α>0 期
    const n1 = lights.length;
    b.fixedUpdate(1, hooks);                              // t=5 渐显拍（α=215>0）
    const per1 = lights.length - n1;
    expect(per1).toBeGreaterThanOrEqual(1);               // 渐显期光线在画（旧挂 α 门=0 → 红）
    for (let t = 5; t < 40; t++) b.fixedUpdate(1, hooks); // t=40,α 已归零（t=32 起）
    const n2 = lights.length;
    b.fixedUpdate(1, hooks);                              // t=41 α=0 拍
    const per2 = lights.length - n2;
    expect(per2).toBe(per1 + 1);                          // 光线步进同数 + Center 单点 AddLight（:34896-34899）
  });

  it('F10 SpawnRopeIn 尘盒 −8 双轴（:53060 单参构造;旧只偏 X → 红）', () => {
    const { hooks, dusts } = makeHooks([], { dust: true });
    const coil = new MysticSnakeCoil(10 * 16 + 8, 20 * 16 + 8 - 16, 20 * 16 + 8 - 16);
    (coil as unknown as { spawnRopeIn(x: number, y: number, g: GameHooks): void }).spawnRopeIn(10, 20, hooks);
    const d27 = dusts.filter((d) => d.type === 27);
    expect(d27.length).toBe(5);
    for (const d of d27) {
      expect(d.x).toBe(10 * 16);                          // x·16+8−8（双轴 −8）
      expect(d.y).toBe(20 * 16);                          // 旧=20·16+8（漏 Y 偏）→ 红
      expect(d.bw).toBe(16); expect(d.bh).toBe(16);
    }
  });

  it('F11 533 拦截焦点零速特典（:30319-30323 focus 支不写 zero → 截击面喂 (0,0)）', () => {
    const proto = MinionProj.prototype as unknown as Record<string, (...a: unknown[]) => void>;
    const spy = vi.spyOn(proto, 'ai066TryInterceptingTarget').mockImplementation(() => {});
    // 焦点支：minionTargetId 同 id → targetVelocity 恒 (0,0)（旧恒喂敌速 → 红）
    const eF = mkEnemy(1, 60 * 16 + 400, 110 * 16 - 40);
    const { hooks: hF, player: pF } = makeHooks([eF]);
    (pF as unknown as { minionTargetId?: number }).minionTargetId = eF.id;
    eF.vx = 5; eF.vy = 0;
    const mF = new MinionProj(pF.cx, pF.cy - 40, 533, 10, 2, false, 0, false, () => pF);
    mF.fixedUpdate(1, hF);
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(1);
    const focusCall = spy.mock.calls[spy.mock.calls.length - 1];
    expect(focusCall[2]).toBe(0);                         // zero 不写（:30319-30323）
    expect(focusCall[3]).toBe(0);
    // 野生支：才写 nPC.velocity（:30357）
    spy.mockClear();
    const eW = mkEnemy(2, 60 * 16 + 400, 110 * 16 - 40);
    const { hooks: hW, player: pW } = makeHooks([eW]);
    eW.vx = 5; eW.vy = 0;
    const mW = new MinionProj(pW.cx, pW.cy - 40, 533, 10, 2, false, 0, false, () => pW);
    mW.fixedUpdate(1, hW);
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(1);
    const wildCall = spy.mock.calls[spy.mock.calls.length - 1];
    expect(wildCall[2]).toBe(5);
    expect(wildCall[3]).toBe(0);
  });

  it('F12 4262 扫描基准顶左+direction：仓内承载面勘正锚（Player.cs:48285）', () => {
    const gameSrc = readFileSync(join(GAME, 'src', 'core', 'Game.ts'), 'utf8');
    expect(gameSrc).toContain('Math.abs(mvx2 - this.player.x) / TILE');   // position.X 顶左（旧 .cx → 红）
    expect(gameSrc).toContain('(mdir < 0 ? 1 : 0)');                       // direction 依赖（useStyle5+useTurn 同相）
    expect(gameSrc).not.toContain('Math.abs(mvx2 - this.player.cx) / TILE');
  });
});

// ============================================================
// ③ 变异自证（恰红+withMutation 三层守卫,BJ643 债①纪律）
//    SW_C16A_MUT=1 时本组跳过（内层独跑读环境位跳过自证组,防递归）
// ============================================================
describe.skipIf(EXT_MISSING || process.env.SW_C16A_MUT)('③ 变异自证（恰红+逐字节还原+sha256 对拍）', () => {
  const { spawnSync } = require('node:child_process') as typeof import('node:child_process');

  const spawnVitest = (filter: string) => spawnSync(
    'npx', ['vitest', 'run', 'tests/c16a-projai-r16-clearance.test.ts', '--no-file-parallelism', '-t', filter], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 600_000,
      env: { ...process.env, SW_C16A_MUT: '1' },
    });
  const mutate = (file: string, trigger: string, replacement: string, filter: string): void => {
    withMutation(file, trigger, replacement, () => {
      const r = spawnVitest(filter);
      expect(r.status, `变异须证红: ${replacement}`).not.toBe(0);
      expect(r.stdout + r.stderr).toContain(filter);
    }, { label: `C16a ${filter}` });
  };

  const MINION = join(process.cwd(), 'src', 'entities', 'MinionProj.ts');
  const COIL = join(process.cwd(), 'src', 'entities', 'MysticSnakeCoil.ts');

  it('M1 F1 出膛锚 −2→−5（回退旧偏 3px 档）→ F1 锁 红', () => {
    mutate(MINION,
      'const laser = new Arrow(this.cx - 2, this.cy - 2, dx / d * 8, dy / d * 8,',
      'const laser = new Arrow(this.cx - 5, this.cy - 5, dx / d * 8, dy / d * 8,',
      'F1 389 出膛锚');
  });

  it('M2 F3① 命中尾清窗摘除 → F3① 锁 红', () => {
    mutate(MINION,
      '(en as { iframes?: number }).iframes = 0;',
      ';',
      'F3① 644 引爆');
  });

  it('M3 F3② t=60 二段伤害摘除（回退旧「单发语义」钉）→ F3② 锁 红', () => {
    mutate(MINION,
      'this.faces.hitAt(game, this.cx, this.cy);   // :73421-73428 二段 Damage（吃同表）',
      ';',
      'F3② t=60');
  });

  it('M4 F4 爆花速度 6.3/6→2.05/3（回退旧模长漏乘档）→ F4 锁 红', () => {
    mutate(MINION,
      'Math.sin(ang) * 6.3 * speedK, -Math.cos(ang) * 6 * speedK, 0,',
      'Math.sin(ang) * 2.05 * speedK, -Math.cos(ang) * 3 * speedK, 0,',
      'F4 爆花');
  });

  it('M5 F5 冲刺子步分离环摘除（回退旧早退档）→ F5 锁 红', () => {
    mutate(MINION,
      '        this.separationNudge(game, p);\n        this.twA1++;',
      '        this.twA1++;',
      'F5 388 冲刺态');
  });

  it('M6 F7 四向尘 45° 基准摘除（回退旧 0° 档）→ F7 锁 红', () => {
    mutate(MINION,
      'const ang = Math.PI / 4 + i * (Math.PI / 2) + this.rot;',
      'const ang = i * (Math.PI / 2) + this.rot;',
      'F7 533 四向尘');
  });

  it('M7 F9 α 门 AddLight 摘除 → F9 锁 红', () => {
    mutate(MINION,
      'game.addLightAt?.(this.cx, this.cy, hr / 255 * 0.5, hg / 255 * 0.5, hb / 255 * 0.5);',
      ';',
      'F9 回门光线');
  });

  it('M8 F8 花瓣环 2 旋转化（回退旧双环同式档）→ F8 锁 红', () => {
    mutate(MINION,
      'const ang = loop === 0 ? Math.PI * n + this.rot : Math.PI * n;',
      'const ang = Math.PI * n + this.rot;',
      'F8 花瓣双环');
  });

  it('M9 F6 tGroup 759 帧过滤摘除（回退旧全计档）→ F6 锁 红', () => {
    mutate(MINION,
      '&& (pid !== 759 || m.bbFrame === 4)) {',
      ') {',
      'F6 tGroup');
  });

  it('M10 F11 焦点零速特典摘除（回退旧恒喂敌速档）→ F11 锁 红', () => {
    mutate(MINION,
      'isFocus533 ? 0 : (tgt as unknown as { vx?: number }).vx ?? 0,',
      '(tgt as unknown as { vx?: number }).vx ?? 0,',
      'F11 533 拦截');
  });

  it('M11 F10 尘盒双轴 −8 摘 Y（回退旧单轴档）→ F10 锁 红', () => {
    mutate(COIL,
      "const d = game.spawnDust?.(vx0 - 8, vy0 - 8, 16, 16, 27, 0, 0, 100,",
      "const d = game.spawnDust?.(vx0 - 8, vy0, 16, 16, 27, 0, 0, 100,",
      'F10 SpawnRopeIn');
  });
});
