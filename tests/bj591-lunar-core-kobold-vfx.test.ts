// ★BJ591（2026-10-09）FindFrame 域外演出面收官——BJ590 新登记四债清偿。
//
// 定谳（Terarria1457 亲读,唯一标杆）：
//  · 件1 [ff-dust-398-moonlord-core] 月总核 398 burst 面——FindFrame case 398
//    （NPC.cs:72712-72740）：ai0<=0 恒帧 0（:72714-72717）;ai0>0 时 `if (frame.Y
//    == 0)`（:72719）= gore 619-622 ×4（position+(∓10,∓15), velocity）+ 尘 209
//    ×50（盒内随机,:72721-72729）,随后 fc++/≥30 回卷 6/帧=fc%30/6（:72731-72738）。
//    ★burst 非「一次性」：帧号=fc%30/6 在 fc∈{1..5} 五拍全为 0+睁核首拍吃 ≤0 期
//    遗留 frame.Y=0 → **连爆 6 拍**（24 gore + 300 尘）;fc≥6 后帧号恒 ≥1 不再爆;
//    ai0 回 ≤0 期每拍清 frame.Y 而 fc 不清 → 再睁核首拍恒再爆一拍（远距瞬移
//    归位 ai0=-2 支可达）。旧刀 burst 永久哨兵=只爆 1 拍+再睁核不爆（本刀修）。
//    · AI 侧位次定谳：AI_077_MoonLordCore（:41587 起）ai[0]==2=600t 死亡演出
//    （尘 229/31 爆炎+proj 622+ThrowPieces）,ai[0]==3=残肢段 :41915-41931 是
//    gore 619-622【清除】面（deactivate 循环）+清眼直清——**AI 侧无 gore 喷发面**;
//    旧注（bossAI_lunar_misc）把 :41915-41922 当喷发面=引错,已勘误;蓝队 R1-09
//    「眼 400 死亡=直清、勿加 gore/死亡声」判语维持（眼侧确无 gore 面可加）。
//  · 件2 [ff-dust-574-575-kobold] DD2 滑翔怪尘面——FindFrame case 574/575
//    （:68658-68751,两型共用 case 块=域内零差异）:ai0!=0 滑翔支帧钳 ≥2、4t/8t
//    推进（帧<5 为 4t）钳 9,**落帧 9 那拍**喷 8× 尘 6（火把火舌）@口部
//    vector4=Center+(56·sdir,−30).RotatedBy(rotation)（:68687）,α100/velocity×3/
//    scale 0.6/fadeIn 1.2/noGravity+noLight（:68694-68703）;帧钳住后 frameCounter
//    无界增长 → 拖尾密度阶梯 maxValue 5→4(>60)→3(>180)→2(>300)→1(>600),
//    每拍 2 掷 1/maxValue 中出尘 6 @Lerp(value2,value,n/10+0.1)（value2=口部+
//    oldPos[3]−position,TrailingMode 7 逐拍后移）α50/scale 0.3/fadeIn 1.5/
//    noGravity+noLight;门=帧≥9 且 ai0<3（自爆/回旋不喷）。ai0==0 落地 0↔1@6t。
//    本仓前态:帧机/尘面整缺（Renderer 通用 6t 全帧档）,BJ454 三件（T-set 门/
//    BetsyFireball/水晶辉光）不覆盖——本刀挂 Enemy.findFrameRotation（=:91626
//    FindFrame 同拍位次）。sdir/rotation 写点 AI_108 已在轨（facing=-sign(vx)/
//    visAngle ±π 折叠）,本层不重复写。
//  · 件3 数据卫生（零行为）：①[jungle-pool-158-misid] VANILLA_SPAWN_POOLS.jungle
//    注「巨蝠(14)」双误——158=吸血蝠(VampireBat,NPCID.cs:11387)非巨蝠(GiantBat=
//    93,:11257);「(14)」掷分无原版锚（丛林地表=51 直出 :5203-5206,无 1/14 掷）。
//    158 原版无直接生成（吸血鬼 159 昼变体 Transform 158↔159 :81791）,池内条目
//    惰性（VanillaSpawner 零 D(158),BJ590 销案）,registry 无名(vanilla-npcs.json
//    提取名 NPC_158)不补死表条目。②[eclipse-anchor-drift] ECLIPSE_SPAWN_TABLE
//    注行号 3459-3521 系 1456 代际,1457 全段 +93 → :3552-3614,逐条目 line 字段
//    同步重锚（机械核=原版行切片含 SpawnNPC(id)）。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Enemy } from '../src/entities/Enemy';
import { GorePiece } from '../src/entities/GorePiece';
import { moonLordCoreAI } from '../src/entities/bossAI_duke_moonlord';
import { VANILLA_SPAWN_POOLS, poolFor } from '../src/data/vanillaNpcs';
import { ECLIPSE_SPAWN_TABLE } from '../src/world/Eclipse';
import type { GameHooks } from '../src/entities/types';
import type { Player } from '../src/entities/Player';
// ★C档可移植:仓库外依赖(game/ 兄弟目录,clone 侧缺=正常形态)——缺则本文件 skip,本机在=真跑零语义变化
const EXT_MISSING = !['Terarria1457'].every((d) => existsSync(new URL(`../../${d}`, import.meta.url)));


const ROOT = join(__dirname, '..');
const npc1457 = existsSync(join(ROOT, '../Terarria1457/Terraria/NPC.cs')) ? readFileSync(join(ROOT, '../Terarria1457/Terraria/NPC.cs'), 'utf8') : '';   // ★C档可移植:缺档降级(EXT_MISSING skip 兜底)
const npcIdSrc = existsSync(join(ROOT, '../Terarria1457/Terraria.ID/NPCID.cs')) ? readFileSync(join(ROOT, '../Terarria1457/Terraria.ID/NPCID.cs'), 'utf8') : '';   // ★C档可移植:缺档降级(EXT_MISSING skip 兜底)
const moonlordSrc = readFileSync(join(ROOT, 'src/entities/bossAI_duke_moonlord.ts'), 'utf8');
const eyeAiSrc = readFileSync(join(ROOT, 'src/entities/bossAI_lunar_misc.ts'), 'utf8');
const enemySrc = readFileSync(join(ROOT, 'src/entities/Enemy.ts'), 'utf8');
const npcsDataSrc = readFileSync(join(ROOT, 'src/data/vanillaNpcs.ts'), 'utf8');
const eclipseSrc = readFileSync(join(ROOT, 'src/world/Eclipse.ts'), 'utf8');
const spawnerSrc = readFileSync(join(ROOT, 'src/world/spawn/VanillaSpawner.ts'), 'utf8');
const npcJson = JSON.parse(readFileSync(join(ROOT, 'public/sprites/vanilla-npcs.json'), 'utf8'));

const LINES = npc1457.split('\n');
const vSlice = (a: number, b: number) => LINES.slice(a - 1, b).join('\n');
/** FindFrame 内 case 体（first occurrence 在 AI_108 内部 type switch,须从 FindFrame 头起找） */
function findFrameCaseBody(head: string, stop: string): string {
  const ff = npc1457.indexOf('public void FindFrame()');
  const start = npc1457.indexOf(head, ff);
  if (start < 0) return '';
  const end = npc1457.indexOf(stop, start);
  return npc1457.slice(start, end < 0 ? start + 2000 : end);
}
const coreBody = findFrameCaseBody('\t\tcase 398:', '\t\tcase 396:');
const koboldBody = findFrameCaseBody('\t\tcase 574:\n\t\tcase 575:', '\t\tcase 549:');

// ---------------------------------------------------------------------------
// 件1 行为级：月总核 398 burst 6 拍窗 + 再睁核复爆（moonLordCoreAI 确定性桩）
// ---------------------------------------------------------------------------
function coreGame() {
  const bursts: Array<{ n: number }> = [];
  const eye = { dead: false, vanillaId: 400, ai3: 0 } as unknown as Enemy;
  const game = {
    enemies: () => [eye],
    spawnParticles: (_x: number, _y: number, _c: string, n: number) => { bursts.push({ n }); },
    playSfxWav: () => {},
    playSfxFiles: () => {},
  } as unknown as GameHooks;
  return { game, bursts, eye };
}
const makeCore = (eye: Enemy) => {
  const e = Enemy.fromVanilla(398, 4000, 1200);
  if (!e) throw new Error('fromVanilla(398) 失败');
  e.bInit = true;
  e.ai0 = 1; e.ai1 = 0;                       // 二阶段（三残肢已解锁）
  eye.ai3 = e.id;
  return e;
};

describe.skipIf(EXT_MISSING)('BJ591 件1：月总核 398 FindFrame burst 面（NPC.cs:72712-72740）', () => {
  afterEach(() => vi.restoreAllMocks());

  it('原版锚：case 398 burst 在 if(frame.Y==0) 内、无哨兵（重复窗=帧机构造性推论）', () => {
    expect(coreBody).toContain('if (frame.Y == 0)');
    expect(coreBody).toContain('Gore.NewGore(position + new Vector2(-10f, -15f), velocity, 619);');
    expect(coreBody).toContain('Gore.NewGore(position + new Vector2(10f, 15f), velocity, 622);');
    expect(coreBody).toContain('for (int i = 0; i < 50; i++)');
    expect(coreBody).toContain('Dust.NewDust(position, width, height, 209);');
    expect(coreBody).toContain('frameCounter = 6.0;');
    expect(coreBody).toContain('frame.Y = num * num20;');
    // 帧号公式在 fc∈{1..5} 全为 0 → burst 连续 6 拍（构造性,无 once 闸）
    expect(coreBody).not.toMatch(/burst/);
  });

  it('AI 侧位次：AI_077 ai0==3 段= gore 619-622 清除面（非喷发）+ R1-09 眼侧判语维持', () => {
    // :41915-41925=deactivate 循环 + :41926-41944 清眼直清——旧注「喷发面」引错的物证
    const cleanup = vSlice(41912, 41944);
    expect(cleanup).toContain('gore.type >= 619 && gore.type <= 622');
    expect(cleanup).toContain('gore.active = false;');
    expect(cleanup).toContain('nPC3.type == 400');
    // 本仓：眼 400 死亡=直清（R1-09 判语在档）+ 核心喷发面由核心帧引擎承接（BJ591 勘误注）
    expect(eyeAiSrc).toContain('勿加 gore/死亡声');
    expect(eyeAiSrc).toContain('e.dead = true; return;');
    expect(eyeAiSrc).toContain('BJ591 勘误');
  });

  it('本仓落刀：frameY0 门在位、一次性哨兵退役', () => {
    expect(moonlordSrc).toContain('fx.frameY0 = idx === 0;');
    expect(moonlordSrc).toContain('fx.frameY0 = true;');
    expect(moonlordSrc).toMatch(/interface CoreX \{ fc: number; frameY0: boolean \}/);
    expect(moonlordSrc).not.toContain('burst: boolean');
    expect(moonlordSrc).not.toContain('!fx.burst');
  });

  it('首睁核连爆 6 拍（24 gore=619..622×6 轮 + 6×尘 209×50）,fc≥6 后静默', () => {
    const spy = vi.spyOn(GorePiece, 'newGore').mockImplementation(() => null);
    const { game, bursts, eye } = coreGame();
    const e = makeCore(eye);
    const player = { cx: e.cx, cy: e.cy } as unknown as Player;
    for (let i = 0; i < 6; i++) moonLordCoreAI(e, game, player);
    expect(spy.mock.calls.length, '6 拍 × 4 gore').toBe(24);
    expect(spy.mock.calls.map((c) => c[0])).toEqual(
      Array.from({ length: 6 }, () => [619, 620, 621, 622]).flat(),
    );
    expect(bursts.length, '每拍一簇尘 209×50（粒子替身,数量 1:1）').toBe(6);
    for (const b of bursts) expect(b.n).toBe(50);
    // 帧号序列：fc=1..5 全 0、fc=6 → 1
    expect(e.customFrameIdx).toBe(1);
    for (let i = 0; i < 4; i++) moonLordCoreAI(e, game, player);   // t7..t10 静默
    expect(spy.mock.calls.length, 'fc≥6 恒 ≥1 帧号,不再爆').toBe(24);
    expect(bursts.length).toBe(6);
  });

  it('帧机循环：fc=30 回卷 6 → 帧号 1..4 循环（5 帧表 vanilla-npcs.json frames=5）', () => {
    vi.spyOn(GorePiece, 'newGore').mockImplementation(() => null);
    const { game, eye } = coreGame();
    const e = makeCore(eye);
    const player = { cx: e.cx, cy: e.cy } as unknown as Player;
    moonLordCoreAI(e, game, player);                               // t1 fc=1 帧 0
    expect(e.customFrameIdx).toBe(0);
    for (let i = 0; i < 11; i++) moonLordCoreAI(e, game, player);  // t12 fc=12 帧 2
    expect(e.customFrameIdx).toBe(2);
    for (let i = 0; i < 12; i++) moonLordCoreAI(e, game, player);  // t24 fc=24 帧 4
    expect(e.customFrameIdx).toBe(4);
    for (let i = 0; i < 6; i++) moonLordCoreAI(e, game, player);   // t30 fc=30→6 帧 1
    expect(e.customFrameIdx, '≥30 回卷 6=帧号回 1（1..4 循环）').toBe(1);
    expect(npcJson['398'].frames).toBe(5);
  });

  it('再睁核复爆：ai0 回 ≤0 期清 frame.Y 不清 fc → 复归 ai0>0 首拍恰爆 1 拍', () => {
    const spy = vi.spyOn(GorePiece, 'newGore').mockImplementation(() => null);
    const { game, bursts, eye } = coreGame();
    const e = makeCore(eye);
    const player = { cx: e.cx, cy: e.cy } as unknown as Player;
    for (let i = 0; i < 10; i++) moonLordCoreAI(e, game, player);  // 窗过,24 gore
    expect(spy.mock.calls.length).toBe(24);
    // 远距瞬移归位（ai0=-2,本仓 :37162-37197 支——ai0 ≤0 期）
    e.ai0 = -2; e.ai1 = 0;
    for (let i = 0; i < 3; i++) moonLordCoreAI(e, game, player);
    expect(spy.mock.calls.length, '≤0 期零 gore').toBe(24);
    // 再睁核：恰 1 拍（fc 已 ≥6,帧号即离 0）
    e.ai0 = 1;
    moonLordCoreAI(e, game, player);
    expect(spy.mock.calls.length, '复爆恰 4 gore').toBe(28);
    expect(bursts.length, '复爆恰 1 簇尘').toBe(7);
    moonLordCoreAI(e, game, player);
    expect(spy.mock.calls.length, '第二拍起静默').toBe(28);
  });
});

// ---------------------------------------------------------------------------
// 件2 行为级：DD2 滑翔怪 574/575 帧机 + 口部火舌 burst + 拖尾（确定性桩）
// ---------------------------------------------------------------------------
const TILE = 16;
function koboldGame() {
  const spawns: Array<Record<string, unknown>> = [];
  const game = {
    spawnDust: (x: number, y: number, w: number, h: number, type: number,
      sx: number, sy: number, alpha: number, _color: unknown, scale: number) => {
      const d: Record<string, unknown> = {
        bx: x, by: y, bw: w, bh: h, type, sx, sy, alpha, scale,
        vx: sx + 0.1, vy: sy - 0.2,   // 站 NewDust 随机扰动位（velocity×3 倍率的观测基面）
        noGravity: false, noLight: false, fadeIn: 0,
      };
      spawns.push(d);
      return d;
    },
  } as unknown as GameHooks;
  return { game, spawns };
}
const makeKobold = (id: 574 | 575) => {
  const e = Enemy.fromVanilla(id, 40 * TILE, 60 * TILE);
  if (!e) throw new Error(`fromVanilla(${id}) 失败`);
  e.ai0 = 1; e.vx = 8; e.vy = 0;
  e.facing = -1;                               // ≙ vanilla spriteDirection=+1（AI_108 写面）
  return e;
};
const drive = (e: Enemy, game: GameHooks) =>
  (e as unknown as { findFrameRotation(g?: GameHooks): void }).findFrameRotation(game);
const pushHist = (e: Enemy) =>
  (e as unknown as { recordTrailHistory(): void }).recordTrailHistory();

describe.skipIf(EXT_MISSING)('BJ591 件2：DD2 滑翔怪 574/575 FindFrame 尘面（NPC.cs:68658-68751）', () => {
  afterEach(() => vi.restoreAllMocks());

  it('原版锚：case 574/575 共用块——落帧 9 八连火舌参 + 拖尾阶梯 + 落地乒乓', () => {
    expect(koboldBody).toContain('case 574:');
    expect(koboldBody).toContain('case 575:');
    expect(koboldBody).toContain('Vector2 vector4 = base.Center + new Vector2(56 * spriteDirection, -30f).RotatedBy(rotation);');
    expect(koboldBody).toContain('if (frame.Y == num * 9)');
    expect(koboldBody).toContain('for (int m = 0; m < 8; m++)');
    expect(koboldBody).toContain('Dust.NewDustDirect(vector4, 0, 0, 6, 0f, 0f, 100);');
    expect(koboldBody).toContain('dust.velocity *= 3f;');
    expect(koboldBody).toContain('dust2.scale = 0.6f;');
    expect(koboldBody).toContain('dust2.fadeIn = 1.2f;');
    expect(koboldBody).toContain('dust2.noLight = true;');
    expect(koboldBody).toContain('if (frame.Y < num * 9 || !(ai[0] < 3f))');
    expect(koboldBody).toContain('Vector2 value2 = vector4 + (oldPos[3] - position);');
    expect(koboldBody).toContain('if (frameCounter > 600.0)');
    expect(koboldBody).toContain('Dust.NewDustDirect(Vector2.Lerp(value2, value, (float)n / 10f + 0.1f), 0, 0, 6, 0f, 0f, 50);');
    expect(koboldBody).toContain('dust3.scale = 0.3f;');
    expect(koboldBody).toContain('dust3.fadeIn = 1.5f;');
    // 两型同域零差异=共用 case 块（差异全在 AI_108 参数档）
    expect(npcJson['574'].frames).toBe(10);
    expect(npcJson['575'].frames).toBe(10);
  });

  it('本仓落刀：帧机挂 findFrameRotation 层（574/575 支+尘面常量全表）', () => {
    expect(enemySrc).toContain('koboldFlyerFindFrame');
    expect(enemySrc).toContain('vid === 574 || vid === 575');
    expect(enemySrc).toContain('const mouthX = this.cx + mx * cosR - my * sinR;');
    expect(enemySrc).toContain('d.vx *= 3; d.vy *= 3;');
    expect(enemySrc).toContain('d.scale = 0.6;');
    expect(enemySrc).toContain('d.fadeIn = 1.2;');
    expect(enemySrc).toContain('d.scale = 0.3;');
    expect(enemySrc).toContain('d.fadeIn = 1.5;');
    expect(enemySrc).toContain('if (this.koboldFC > 600) maxValue = 1;');
    expect(enemySrc).toContain('this.histXAt(3) - this.x;');
    expect(enemySrc).toContain('koboldFrameY = 0;');
    expect(enemySrc).toContain('koboldFC = 0;');
  });

  it('滑翔帧机：0→2 钳入、4t/8t 推进钳 9,恰落帧 9 拍喷 8× 火舌于口部（×3 倍率）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);          // 拖尾全静默
    const { game, spawns } = koboldGame();
    const e = makeKobold(574);
    drive(e, game);
    expect(e.customFrameIdx, '进滑翔态钳帧 2').toBe(2);
    expect(spawns.length).toBe(0);
    for (let i = 0; i < 3; i++) drive(e, game);                // t4: fc=4 → 帧 3
    expect(e.customFrameIdx).toBe(3);
    for (let i = 0; i < 8; i++) drive(e, game);                // t12: fc=4(帧≥5 → 8t 门) → 帧 5
    expect(e.customFrameIdx, '帧≥5 转 8t 门').toBe(5);
    for (let i = 0; i < 31; i++) drive(e, game);               // t43 → 帧 8
    expect(e.customFrameIdx).toBe(8);
    expect(spawns.length, '帧 2..8 全程零尘').toBe(0);
    drive(e, game);                                            // t44: 落帧 9 + burst
    expect(e.customFrameIdx).toBe(9);
    expect(spawns.length, '恰 8 粒').toBe(8);
    // 口部锚 = Center + (56·sdir, −30).RotatedBy(rotation)——rot=atan2(0,8)=0、sdir=−facing=1
    const mx = e.cx + 56, my = e.cy - 30;
    for (const d of spawns) {
      expect(d.type).toBe(6);
      expect(d.bx).toBeCloseTo(mx, 6);
      expect(d.by).toBeCloseTo(my, 6);
      expect(d.bw).toBe(0); expect(d.bh).toBe(0);              // NewDustDirect 点喷（0 盒）
      expect(d.alpha).toBe(100);
      expect(d.scale).toBe(0.6);
      expect(d.fadeIn).toBe(1.2);
      expect(d.noGravity).toBe(true);
      expect(d.noLight).toBe(true);
      expect(d.vx, 'velocity×3（含 NewDust 扰动基面 0.1×3）').toBeCloseTo(0.3, 9);
      expect(d.vy, '扰动基面 −0.2×3').toBeCloseTo(-0.6, 9);
    }
  });

  it('拖尾：帧钳住后 maxValue 阶梯 5→4(>60)→…→1(>600)，Lerp(oldPos[3] 差值) 位/参', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const { game, spawns } = koboldGame();
    const e = makeKobold(574);
    for (let i = 0; i < 44; i++) drive(e, game);               // 落帧 9,fc=0
    expect(spawns.length).toBe(8);
    // oldPos[3] 填充：四拍异位记录（TrailingMode 7 逐拍后移 ≙ histAt(3)）
    const x0 = e.x;
    for (let k = 0; k < 4; k++) { e.x = x0 + k * 4; pushHist(e); }
    e.x = x0 + 12;                                             // 现位=最后记录位
    // maxValue=5 档：random=0 → 2 掷全中
    vi.spyOn(Math, 'random').mockReturnValue(0);
    drive(e, game);
    expect(spawns.length, '2 掷（n=0,1）全中').toBe(10);
    const ox = -12, oy = 0;                                    // oldPos[3]−position
    const t0 = spawns[8], t1 = spawns[9];
    expect(t0.alpha).toBe(50); expect(t1.alpha).toBe(50);
    expect(t0.scale).toBe(0.3); expect(t1.scale).toBe(0.3);
    expect(t0.fadeIn).toBe(1.5); expect(t1.fadeIn).toBe(1.5);
    expect(t0.noGravity).toBe(true); expect(t0.noLight).toBe(true);
    expect(t0.vx, '拖尾无 ×3').toBeCloseTo(0.1, 9);
    expect(t0.bx, 'Lerp(value2,value,0.1)=口部+Δ×0.9').toBeCloseTo(e.cx + 56 + ox * 0.9, 6);
    expect(t0.by).toBeCloseTo(e.cy - 30 + oy * 0.9, 6);
    expect(t1.bx, 'Lerp 0.2=Δ×0.8').toBeCloseTo(e.cx + 56 + ox * 0.8, 6);
    // 60 边界：random=0.24 在 maxValue5 恒失（floor=1）、maxValue4 恰中（floor=0）
    vi.spyOn(Math, 'random').mockReturnValue(0.24);
    const quiet = spawns.length;
    for (let i = 0; i < 59; i++) drive(e, game);               // fc=2..60（≤60 → 门 5 恒失）
    expect(spawns.length, 'fc≤60 零尘').toBe(quiet);
    drive(e, game);                                            // fc=61 >60 → 门 4 → 2 粒
    expect(spawns.length, '>60 阶梯入 4 档').toBe(quiet + 2);
    // 深档：0.999 在 4/3/2 全失（floor=3/2/1）、门 1 恒中（floor(0.999×1)=0）
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    let deepDust = 0;
    for (let i = 0; i < 700 && e.koboldFC <= 600; i++) {
      const before = spawns.length;
      drive(e, game);
      deepDust += spawns.length - before;
    }
    expect(e.koboldFC, '跨过 600').toBeGreaterThan(600);
    expect(deepDust, '>600 恒中档恰在跨拍喷 2 粒').toBe(2);
  });

  it('门与落地档：ai0≥3 不拖尾;ai0==0 帧 0↔1@6t 全程零尘;575 同面', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { game, spawns } = koboldGame();
    const e = makeKobold(574);
    for (let i = 0; i < 44; i++) drive(e, game);               // 帧 9+burst
    const base = spawns.length;                                // 8
    e.ai0 = 3;                                                 // 自爆态
    drive(e, game);
    expect(spawns.length, 'ai0==3 零拖尾').toBe(base);
    e.ai0 = 4;                                                 // 回旋态
    drive(e, game);
    expect(spawns.length, 'ai0==4 零拖尾').toBe(base);
    // 落地档 0↔1@6t（先推进再钳：1→2→0,周期 2）
    const g = makeKobold(575);
    g.ai0 = 0;
    for (let i = 0; i < 5; i++) drive(g, game);
    expect(g.customFrameIdx, 't5 帧 0').toBe(0);
    drive(g, game);                                            // t6: fc=6 → 帧 0→1
    expect(g.customFrameIdx, 't6 帧 1').toBe(1);
    for (let i = 0; i < 5; i++) drive(g, game);
    drive(g, game);                                            // t12: 1→2→钳 0
    expect(g.customFrameIdx, 't12 回 0（不驻帧 2）').toBe(0);
    expect(spawns.filter((_, i) => i >= base).length, '落地档零尘').toBe(0);
    // 575 与 574 共用 case=同面
    const g2 = makeKobold(575);
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    for (let i = 0; i < 44; i++) drive(g2, game);
    expect(spawns.filter((_, i) => i >= base).length, '575 落帧 9 同喷 8 粒').toBe(8);
  });
});

// ---------------------------------------------------------------------------
// 件3：数据卫生锚（零行为）
// ---------------------------------------------------------------------------
describe.skipIf(EXT_MISSING)('BJ591 件3：jungle 158 勘误 + eclipse 行号重锚', () => {
  it('jungle 池：内容零变 [51,158]（poolFor 运行时消费不变=零行为判据）', () => {
    expect(VANILLA_SPAWN_POOLS.jungle).toEqual([51, 158]);
    expect(poolFor(30, 100, 10, true, 'jungle')).toEqual([51, 158]);
  });

  it('jungle 注释勘误：158=吸血蝠（VampireBat:11387）非巨蝠（GiantBat=93:11257）;158 惰性+registry 无名在档', () => {
    expect(npcIdSrc).toContain('public const short VampireBat = 158;');
    expect(npcIdSrc).toContain('public const short GiantBat = 93;');
    expect(npcIdSrc).toContain('public const short JungleBat = 51;');
    const jungleLine = npcsDataSrc.split('\n').find((l) => l.includes('jungle: [51, 158]')) ?? '';
    expect(jungleLine).toContain('吸血蝠');
    expect(jungleLine).not.toContain('巨蝠');
    expect(npcsDataSrc).toContain('NPCID.cs:11387');
    expect(spawnerSrc).not.toMatch(/D\(158\)/);                 // BJ590 销案在档（池条目惰性）
    expect((npcJson['158'] as { name: string }).name, 'registry 提取名缺口=无名,不补死表条目')
      .toBe('NPC_158');
    expect(npcJson['93'].name).toBe('Giant Bat');               // 巨蝠=93 的对照面
  });

  it('eclipse 重锚：表行号 3552-3614（逐条目机械核对=原版行切片含 SpawnNPC(id)）', () => {
    expect(eclipseSrc).toContain('NPC.cs:3552-3614');
    expect(eclipseSrc).not.toMatch(/NPC\.cs:3459/);
    expect(spawnerSrc).not.toMatch(/NPC\.cs:3459/);
    // 表 id/denom 面零变（eclipse-lunar.test.ts 主锁,此处锁重锚不伤表）
    expect(ECLIPSE_SPAWN_TABLE.map((s) => s.id)).toContain(477);
    expect(ECLIPSE_SPAWN_TABLE[0].line).toEqual([3559, 3562]);
    expect(ECLIPSE_SPAWN_TABLE[ECLIPSE_SPAWN_TABLE.length - 1].line).toEqual([3611, 3614]);
    // 机械核：重锚行切片须真含对应 SpawnNPC（BJ378 机械锚纪律）
    expect(vSlice(3559, 3562)).toContain(', 477);');
    expect(vSlice(3579, 3582)).toContain(', 159);');
    expect(vSlice(3611, 3614)).toContain(', 166);');
    expect(vSlice(3552, 3554)).toContain('Main.dayTime && Main.eclipse');
  });
});
