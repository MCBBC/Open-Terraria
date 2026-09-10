// SW-FX4（2026-09-10）：channel 持械工具弹家族回归——审计 F5「21 件 channel 弹幕整缺」
// （docs/audit/item-audit-2026-08-22 §工具 F5）定谳 + 链路真值表 + 绘制层勘误。
//
// ★清单定谳（itemfunc channel∧(pick|axe|hammer) 全量扫描 = 27 件，审计 21 件漏 6）：
//   审计 21 件 = 383/384/385/386/387/388/579/1189/1190/1196/1197/1203/1204/1231/1232/
//   1262/2342/2773/2774/2798/3098；漏 6 件 = 2778 NebulaChainsaw / 2779 NebulaDrill /
//   2783 SolarFlareChainsaw / 2784 SolarFlareDrill / 3463 StardustChainsaw / 3464
//   StardustDrill——SetDefaults3(2773/2774) 形参复制（Item.cs:26571-26610/:31061-31068）
//   提取器不展开 helper 继承 → itemfunc 该六件缺 noUseGraphic（channel/useStyle/工具力
//   已直写），行为面由 Game 工具分支 saw 补丁强制 noGraphic 兜住（源扫描见 ③）。
// 原版金标（Terarria1457）：
//   · 物品面逐件：useStyle=5 + channel=true + noUseGraphic=true + noMelee=true + shoot=
//     专属弹 + 工具力（Item.cs case 锚：383:5832/384:5851/385:5870/386:5889/387:5908/
//     388:5927/579:8137/1189:14631/1190:14650/1196:14751/1197:14770/1203:14871/1204:14890/
//     1231:15213/1232:15233/1262:15655/2342:23534/2773:26487/2774:26508/2798:26727/3098:28650）
//   · 弹面：DefaultToDrillOrChainsaw()（Projectile.cs:10733-10743）= aiStyle20/friendly/
//     penetrate −1/tileCollide false/drawLayer 7/usesOwnerLight/ownerHitCheck/melee；
//     445 激光钻走 AI_075（:67285-67330，音 Item132@23t/无火花尘/60t 相位灯串）
//   · AI_020（Projectile.cs:25804-25941）：timeLeft=60/252 4t·509 2t 帧推进/音 pick>0→
//     Item190@15t else Item189@20t/channel=false→Kill/挂手 RotatedRelativePoint(MountedCenter)
//     /velocity=鼠标向×shootSpeed×scale/SetDummyItemTime(2) 冻结重触/尘31 1/6/vx 抖动
//   · 释放链：Player.cs:52311 StartChanneling(sItem)（channel=true+_channelShotCache{
//     ProjectileTypeExpected=shoot}）→ Projectile.cs:11101 TryUpdateChannel →
//     :71777 TryCancelChannel；Player.cs:43128 !flag5→channel=false（松键/CCed）；
//     挖掘并行：ItemCheck_UseMiningTools :45995（toolTime 循环 :43899-43908=useTime 档）
//   · 绘制（本批勘误，ChainsawProj.draw）：源矩形=(0, 帧高×frame, 图宽, 图高/projFrames)、
//     origin=帧心（Main.cs:30625-30631）；projFrames 509=2（Main.cs:8620）/252=4（:8750）
//     余 25 型无赋值恒 1；姿态角=Atan2(vy,vx)+1.5700000524（Projectile.cs:25889）单一 +π/2；
//     dir 翻转仅 ownerHitCheck∧gravDir==−1 倒重力支（Main.cs:35447-35456），常规重力无翻转
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { World } from '../src/world/World';
import type { GameHooks } from '../src/entities/types';
import { itemFuncOfVid } from '../src/data/vanillaItemFunc';
import { itemCombat } from '../src/data/vanillaItemCombat';
import { projectileData } from '../src/data/vanillaProjectiles';
import { projFrameCount, projSprite } from '../src/entities/Arrow';
import { ChainsawProj } from '../src/entities/ChainsawProj';

// =====================================================================
// ★27 件全家族表：[vid, shoot, 音档工具力（pick>0=钻音190档/axe·hammer=锯音189档）]
// =====================================================================
const FAMILY: Array<[number, number, 'pick' | 'axe' | 'hammer']> = [
  [383, 57, 'axe'], [384, 58, 'axe'], [385, 59, 'pick'], [386, 60, 'pick'],
  [387, 61, 'axe'], [388, 62, 'pick'], [579, 107, 'pick'], [1189, 213, 'pick'],
  [1190, 214, 'axe'], [1196, 216, 'pick'], [1197, 217, 'axe'], [1203, 219, 'pick'],
  [1204, 220, 'axe'], [1231, 223, 'pick'], [1232, 224, 'axe'], [1262, 252, 'hammer'],
  [2342, 369, 'axe'], [2773, 427, 'axe'], [2774, 428, 'pick'], [2778, 429, 'axe'],
  [2779, 430, 'pick'], [2783, 431, 'axe'], [2784, 432, 'pick'], [2798, 445, 'pick'],
  [3098, 509, 'axe'], [3463, 610, 'axe'], [3464, 609, 'pick'],
];
const AUDIT_21 = [383, 384, 385, 386, 387, 388, 579, 1189, 1190, 1196, 1197, 1203,
  1204, 1231, 1232, 1262, 2342, 2773, 2774, 2798, 3098];
const SETDEFAULTS3_SIX = [2778, 2779, 2783, 2784, 3463, 3464];

/** itemfunc channel+tool 全量并扫（Game.itemFuncTool 同式判据）——家族权威清单 */
function channelToolSweep(): number[] {
  const out: number[] = [];
  for (let vid = 1; vid <= 7000; vid++) {
    const f = itemFuncOfVid(vid);
    if (f && f.channel && (f.pick || f.axe || f.hammer)) out.push(vid);
  }
  return out;
}

// =====================================================================
// ① 清单完备性：itemfunc channel+tool 全扫 = 27 件（审计 21 + 6 继承变体）
// =====================================================================
describe('SW-FX4 ① channel+tool 家族清单完备性（27 件=审计21+SetDefaults3 继承 6）', () => {
  it('itemfunc 全量扫描恰为 27 件,含审计 21 件与 6 件变体（防清单再缺件）', () => {
    const sweep = channelToolSweep();
    expect(sweep).toHaveLength(27);
    for (const vid of AUDIT_21) expect(sweep, `审计件 ${vid}`).toContain(vid);
    for (const vid of SETDEFAULTS3_SIX) expect(sweep, `变体件 ${vid}`).toContain(vid);
  });

  it.each(FAMILY)('vid %i → shoot %i：useStyle5+channel+shoot 数据链（Item.cs 逐件 case 锚）', (vid, shoot) => {
    const f = itemFuncOfVid(vid)!;
    const c = itemCombat(vid)!;
    expect(f.useStyle, `vid ${vid} useStyle5（Player.cs:46578 useStyle5 朝鼠标档）`).toBe(5);
    expect(f.channel, `vid ${vid} channel`).toBe(1);
    expect(c.shoot, `vid ${vid} shoot`).toBe(shoot);
    const p = projectileData(shoot)!;
    // DefaultToDrillOrChainsaw（Projectile.cs:10733-10743）/445=AI_075（:5165-5177）
    expect([p.aiStyle, p.penetrate], `proj ${shoot} aiStyle/penetrate`).toEqual(
      shoot === 445 ? [75, -1] : [20, -1]);
  });

  it('六件 SetDefaults3 继承变体：channel/useStyle/工具力直写在册;combat 数值与基件 2773/2774 全等', () => {
    for (const vid of SETDEFAULTS3_SIX) {
      const f = itemFuncOfVid(vid)!;
      expect(f.channel, `vid ${vid} channel`).toBe(1);
      expect(f.useStyle, `vid ${vid} useStyle5`).toBe(5);
      expect(f.pick ?? f.axe, `vid ${vid} 工具力`).toBeTruthy();
      const base = itemCombat(vid === 2778 || vid === 2783 || vid === 3463 ? 2773 : 2774)!;
      const c = itemCombat(vid)!;
      expect([c.damage, c.useTime, c.useAnimation], `vid ${vid} 继承数值`)
        .toEqual([base.damage, base.useTime, base.useAnimation]);
    }
  });

  it('27 弹贴图资产在位（public/sprites/vanilla/Projectile_N.png——F5 链视觉面完整性）', () => {
    for (const [, shoot] of FAMILY) {
      expect(fs.existsSync(path.join(__dirname, '..', 'public', 'sprites', 'vanilla',
        `Projectile_${shoot}.png`)), `Projectile_${shoot}.png`).toBe(true);
    }
  });
});

// =====================================================================
// ② 弹面 SetDefaults 逐型（scale 字面 + Main.projFrames + 盒径）
// =====================================================================
const SCALES: Record<number, number> = {
  57: 1, 58: 1.08, 59: 0.9, 60: 0.9, 61: 1.16, 62: 0.9, 107: 1.1, 213: 0.92,
  214: 1, 216: 0.93, 217: 1.12, 219: 0.95, 220: 1.2, 223: 1, 224: 1.1, 252: 1.1,
  369: 1, 427: 1, 428: 1, 429: 1, 430: 1, 431: 1, 432: 1, 445: 1, 509: 1.2, 609: 1, 610: 1,
};
describe('SW-FX4 ② 弹面 SetDefaults（scale 字面/P.cs 逐件）+ Main.projFrames', () => {
  it('scale 逐型 = SetDefaults 字面（无行=缺省 1）', () => {
    for (const [pid, sc] of Object.entries(SCALES)) {
      expect(projectileData(Number(pid))?.scale ?? 1, `proj ${pid} scale`).toBe(sc);
    }
  });

  it('projFrames：509=2（Main.cs:8620）/252=4（:8750）/其余家族恒 1（单帧竖长条整图绘制）', () => {
    expect(projFrameCount(509)).toBe(2);
    expect(projFrameCount(252)).toBe(4);
    for (const pid of [57, 58, 59, 60, 61, 62, 107, 213, 214, 216, 217, 219, 220,
      223, 224, 369, 427, 428, 429, 430, 431, 432, 445, 609, 610]) {
      expect(projFrameCount(pid), `proj ${pid}`).toBe(1);
    }
  });

  it('盒径抽核（钻 59=22×22@0.9 / 锯 509=22×22@1.2 / 月主竖长盒 430=30×54 不缩）', () => {
    expect([projectileData(59)?.width, projectileData(59)?.height]).toEqual([22, 22]);
    expect([projectileData(509)?.width, projectileData(509)?.height]).toEqual([22, 22]);
    expect([projectileData(430)?.width, projectileData(430)?.height]).toEqual([30, 54]);
    expect([projectileData(445)?.width, projectileData(445)?.height]).toEqual([10, 10]);
  });
});

// =====================================================================
// ③ Game 工具分支派发门（源文本锚——弹幕派发/useStyle5 姿态/同型不重发/ai75 变体）
// =====================================================================
describe('SW-FX4 ③ 工具分支派发门（Game.ts 源锚——channel 家族 27 件同一门放行）', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'Game.ts'), 'utf8');

  it('派发门=shoot aiStyle 20∨75（覆盖 27 件 aiStyle20 + 2798→445 aiStyle75）', () => {
    expect(src).toContain('sawAi === 20 || sawAi === 75');
    expect(src).toContain('laser: sawAi === 75');
  });

  it('同型弹在场不重发（原版 SetDummyItemTime(2) 冻结 itemTime → flag4 门 :43878 不重触）', () => {
    expect(src).toContain('q instanceof ChainsawProj && !q.dead');
  });

  it('持械姿态补丁：useStyle 5 + noGraphic（noUseGraphic 继承盲区六件由此兜住）+ 朝鼠标 aim', () => {
    expect(src).toContain('this.swing.useStyle = 5;');
    expect(src).toContain('this.swing.noGraphic = true;');
    expect(src).toContain('this.swing.aim = sawAng;');
  });
});

// =====================================================================
// ④ ChainsawProj 行为真值表（AI_020 :25804-25941 / AI_075 :67285-67330）
// =====================================================================
function mkGame(): { g: GameHooks; dust: Array<{ type: number; d: { vx: number; vy: number; noGravity: boolean } }>; sfx: string[] } {
  const dust: Array<{ type: number; d: { vx: number; vy: number; noGravity: boolean } }> = [];
  const sfx: string[] = [];
  const w = new World(120, 160, 30, 'sw-fx4');
  const g = {
    world: w,
    player: { x: 320, y: 320, w: 20, h: 42, cx: 330, cy: 341, dead: false, iframes: 0, equipStats: {} },
    enemies: () => [], critters: () => [], npcs: () => [],
    spawnDust: (x: number, y: number, bw: number, bh: number, type: number) => {
      const d = { vx: 1, vy: 1, noGravity: false };
      dust.push({ type, d });
      return d;
    },
    playSfx: () => {}, playSfxFiles: (names: string[]) => { for (const n of names) sfx.push(n); },
    playSfxFile: () => {}, playSfxWav: () => {},
    spawnParticles: () => {}, spawnDrop: () => null, damagePlayer: (): number => 0,
    addDamageNumber: () => {}, cutTile: () => {}, onEnemyKilled: () => {},
    spawnEnemy: () => {}, notifyInventoryChanged: () => {}, addLightAt: () => {},
    onProjectileDeath: () => {},
  } as unknown as GameHooks;
  return { g, dust, sfx };
}
const sawOwner = (cx = 330, cy = 341) => ({ cx, cy, facing: 1, dead: false, h: 42, gfxOffY: 0 });

describe('SW-FX4 ④ ChainsawProj AI_020/AI_075 真值表', () => {
  afterEach(() => vi.restoreAllMocks());

  it('channel 真值表：持链=活+挂手+瞄准直写;断链=Kill（:25848-25873 松链亡）', () => {
    const env = mkGame();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);    // 固定掷：vx 抖动因子 = 1+0.01
    const o = sawOwner();
    let channel = true;
    const saw = new ChainsawProj(o, 10, 1, () => channel,
      () => ({ x: o.cx + 100, y: o.cy }), { projId: 509, pick: 0, shootSpeed: 48 });
    saw.fixedUpdate(1 / 60, env.g);
    expect(saw.dead).toBe(false);
    // 挂手 = RotatedRelativePoint(MountedCenter) − size/2（:23879/:23921-23922）；
    // 常规态（rot=0/gfxOffY=0）anchor ≡ 玩家中心 → pos = 中心 − size/2
    expect(saw.x).toBeCloseTo(330 - saw.w / 2, 6);
    expect(saw.y).toBeCloseTo(341 - saw.h / 2, 6);
    // velocity = (鼠标−anchor) 归一 × shootSpeed×scale（:23884-23902：48×1.2=57.6），
    // 出膛后 :23932 抖动 ×(1+Next(−3,4)×0.01)——掷 0.5 → Next(−3,4)=2 → ×1.01（右向）
    expect(saw.vy).toBeCloseTo(0, 9);
    expect(saw.vx).toBeCloseTo(48 * 1.2 * 1.01, 6);
    // 断链（松键/切件/死亡）→ 下一 AI 拍 Kill
    channel = false;
    saw.fixedUpdate(1 / 60, env.g);
    expect(saw.dead).toBe(true);
  });

  it('面向跟随 velocity.X 符号（:23909-23916 ChangeDir）', () => {
    const env = mkGame();
    const o = sawOwner();
    const saw = new ChainsawProj(o, 10, 1, () => true,
      () => ({ x: o.cx - 100, y: o.cy }), { projId: 57, shootSpeed: 40 });
    saw.fixedUpdate(1 / 60, env.g);
    expect(o.facing).toBe(-1);
  });

  it('同敌 10t 免疫窗（:5523-5524 idStaticNPCHitCooldown=10 / ownerHitCheck 缺省档）', () => {
    const env = mkGame();
    const hits: number[] = [];
    const enemy = { x: 320, y: 330, w: 40, h: 40, id: 7, dead: false,
      hurt: (d: number) => { hits.push(d); return true; } };
    (env.g as { enemies: () => unknown[] }).enemies = () => [enemy];
    const saw = new ChainsawProj(sawOwner(), 10, 1, () => true,
      () => ({ x: 400, y: 341 }), { projId: 509, pick: 0, shootSpeed: 48 });
    for (let t = 0; t < 10; t++) saw.fixedUpdate(1 / 60, env.g);
    expect(hits.length).toBe(1);                      // 贴盒 10 拍仍只跳 1 次（窗未过）
    saw.fixedUpdate(1 / 60, env.g);                   // 第 11 拍 = 距首跳恰 10t
    expect(hits.length).toBe(2);                      // 免疫窗到 → 可再命中
    for (let t = 0; t < 9; t++) saw.fixedUpdate(1 / 60, env.g);
    expect(hits.length).toBe(2);                      // 距上次 9t → 仍压窗
    saw.fixedUpdate(1 / 60, env.g);
    expect(hits.length).toBe(3);                      // 又 10t → 第三跳
  });

  it('帧推进仅 252(4t/帧)与 509(2t/帧),其余 27 型恒 frame0（:25807-25829 无支=不动）', () => {
    const env = mkGame();
    const mk = (pid: number) => new ChainsawProj(sawOwner(), 10, 1, () => true,
      () => ({ x: 400, y: 341 }), { projId: pid, pick: 0, shootSpeed: 40 });
    const frameOf = (s: ChainsawProj) => (s as unknown as { frame: number }).frame;
    const s252 = mk(252), s509 = mk(509), s57 = mk(57);
    for (let t = 0; t < 2; t++) { s252.fixedUpdate(1 / 60, env.g); s509.fixedUpdate(1 / 60, env.g); }
    expect(frameOf(s509)).toBe(1);                    // 2t/帧 → 2 拍一帧
    expect(frameOf(s252)).toBe(0);                    // 4t/帧 → 未满
    for (let t = 0; t < 2; t++) { s252.fixedUpdate(1 / 60, env.g); s509.fixedUpdate(1 / 60, env.g); }
    expect(frameOf(s252)).toBe(1);
    expect(frameOf(s57)).toBe(0);                     // 无支 = 恒 frame0
  });

  it('音分档：pick>0→Item_190@15t（钻）/pick=0→Item_189@20t（锯·插孔锤）/laser→Item_132@23t（:23866-23878/:67285-67292）', () => {
    const mk = (opts: { pick?: number; laser?: boolean }) => {
      const env = mkGame();
      const saw = new ChainsawProj(sawOwner(), 10, 1, () => true,
        () => ({ x: 400, y: 341 }), { projId: opts.laser ? 445 : 59, pick: opts.pick ?? 0,
          shootSpeed: 32, laser: opts.laser });
      return { env, saw };
    };
    const tickN = (saw: ChainsawProj, g: GameHooks, n: number) => {
      for (let t = 0; t < n; t++) saw.fixedUpdate(1 / 60, g);
    };
    // 钻（pick 110）：t0 首响 + 15t 后第二响
    const drill = mk({ pick: 110 });
    tickN(drill.saw, drill.env.g, 1);
    expect(drill.env.sfx).toEqual(['Item_190']);
    tickN(drill.saw, drill.env.g, 14);
    expect(drill.env.sfx).toEqual(['Item_190']);
    tickN(drill.saw, drill.env.g, 1);
    expect(drill.env.sfx).toEqual(['Item_190', 'Item_190']);
    // 锯（pick 0）：20t 档（3098/252/1262/2773 族同档）
    const csaw = mk({ pick: 0 });
    tickN(csaw.saw, csaw.env.g, 21);
    expect(csaw.env.sfx).toEqual(['Item_189', 'Item_189']);
    // 激光钻（445 ai75）：Item_132 23t 档（无 pick 分档）
    const laser = mk({ laser: true });
    tickN(laser.saw, laser.env.g, 24);
    expect(laser.env.sfx).toEqual(['Item_132', 'Item_132']);
  });

  it('laser 445：无火花尘+相位灯串 lightRGB（:67300-67320）;ai20 有尘 31（1/6 强制掷）无灯', () => {
    const envL = mkGame();
    vi.spyOn(Math, 'random').mockReturnValue(0);      // 恒中 1/6 掷
    const laser = new ChainsawProj(sawOwner(), 10, 1, () => true,
      () => ({ x: 400, y: 341 }), { projId: 445, pick: 230, shootSpeed: 36, laser: true });
    for (let t = 0; t < 30; t++) laser.fixedUpdate(1 / 60, envL.g);
    expect(envL.dust).toHaveLength(0);                // ai75 无火花尘段
    expect((laser as unknown as { lightRGB: [number, number, number] | null }).lightRGB).not.toBeNull();

    const envS = mkGame();
    const saw = new ChainsawProj(sawOwner(), 10, 1, () => true,
      () => ({ x: 400, y: 341 }), { projId: 59, pick: 110, shootSpeed: 32 });
    saw.fixedUpdate(1 / 60, envS.g);
    expect(envS.dust.map((x) => x.type)).toContain(31);   // 尘 31（:23933-23941）
    const rec = envS.dust.find((x) => x.type === 31)!;
    expect(rec.d.noGravity).toBe(true);               // :23937
    expect(rec.d.vy).toBeLessThan(0);                 // −Next(7,13)×0.15 向上反溅
    expect((saw as unknown as { lightRGB: unknown }).lightRGB).toBeNull();   // ai20 无灯串
  });
});

// =====================================================================
// ⑤ 绘制层（本批勘误：projFrames 权威切片 + 单一 +π/2 姿态 + 撤自创纵向翻转）
// =====================================================================
type Call = { m: string; a: unknown[] };
function makeRecCtx() {
  const calls: Call[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_t, k) => {
      if (k === 'canvas') return undefined;
      return (...a: unknown[]) => { calls.push({ m: String(k), a }); };
    },
  });
  return { calls, ctx };
}
let NEXT_IMG = { w: 1, h: 1 };
beforeAll(() => {
  vi.stubGlobal('Image', class {
    naturalWidth = NEXT_IMG.w; naturalHeight = NEXT_IMG.h;
    width = NEXT_IMG.w; height = NEXT_IMG.h;
    complete = true;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_v: string) { this.onload?.(); }
  });
});
function pngSize(id: number): { w: number; h: number } {
  const b = fs.readFileSync(path.join(__dirname, '..', 'public', 'sprites', 'vanilla',
    `Projectile_${id}.png`));
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
function prime(id: number) {
  NEXT_IMG = pngSize(id);
  projSprite(id);                                   // 预热模块级 spriteCache
  return NEXT_IMG;
}

describe('SW-FX4 ⑤ ChainsawProj.draw（Main.cs:30625-30631 帧切片 + P.cs:25889 姿态角）', () => {
  afterEach(() => vi.restoreAllMocks());

  it('单帧竖长条整图绘制（57=14×54 不得被宽高比切成 4 份）', () => {
    const tex = prime(57);
    expect(tex).toEqual({ w: 14, h: 54 });
    const saw = new ChainsawProj(sawOwner(), 10, 1, () => true,
      () => ({ x: 400, y: 341 }), { projId: 57, shootSpeed: 40 });
    const { calls, ctx } = makeRecCtx();
    saw.draw({ canvas: undefined as never, ctx: ctx as never });
    const di = calls.find((c) => c.m === 'drawImage')!;
    expect(di).toBeTruthy();
    // 9 参 drawImage：a0=图 a1=sx a2=sy a3=sw a4=sh a5=dx a6=dy a7=dw a8=dh
    expect([di.a[1], di.a[2], di.a[3], di.a[4]]).toEqual([0, 0, 14, 54]);   // 源矩形=整图
    expect([di.a[7], di.a[8]]).toEqual([14, 54]);                            // 绘制尺寸（scale1）
  });

  it('509 两帧切片（28×140 → 帧高 70）+ 2t/帧取帧;252 四帧（22×240 → 60）×SetDefaults scale', () => {
    const env = mkGame();
    const tex = prime(509);
    expect(tex).toEqual({ w: 28, h: 140 });
    const saw = new ChainsawProj(sawOwner(), 10, 1, () => true,
      () => ({ x: 400, y: 341 }), { projId: 509, pick: 0, shootSpeed: 48 });
    for (let t = 0; t < 2; t++) saw.fixedUpdate(1 / 60, env.g);   // 2t → frame=1
    const { calls, ctx } = makeRecCtx();
    saw.draw({ canvas: undefined as never, ctx: ctx as never });
    const di = calls.find((c) => c.m === 'drawImage')!;
    expect([di.a[1], di.a[2], di.a[3], di.a[4]]).toEqual([0, 70, 28, 70]);  // 第二帧带
    expect(di.a[7]).toBeCloseTo(28 * 1.2, 6);                               // ×SetDefaults scale
    expect(di.a[8]).toBeCloseTo(70 * 1.2, 6);

    const tex2 = prime(252);
    expect(tex2).toEqual({ w: 22, h: 240 });
    const saw2 = new ChainsawProj(sawOwner(), 10, 1, () => true,
      () => ({ x: 400, y: 341 }), { projId: 252, pick: 0, shootSpeed: 46 });
    for (let t = 0; t < 8; t++) saw2.fixedUpdate(1 / 60, env.g);  // 8t → frame=2
    const r2 = makeRecCtx();
    saw2.draw({ canvas: undefined as never, ctx: r2.ctx as never });
    const di2 = r2.calls.find((c) => c.m === 'drawImage')!;
    expect([di2.a[1], di2.a[2], di2.a[3], di2.a[4]]).toEqual([0, 120, 22, 60]); // 第三帧带
    expect(di2.a[7]).toBeCloseTo(22 * 1.1, 6);
    expect(di2.a[8]).toBeCloseTo(60 * 1.1, 6);
  });

  it('姿态角 = Atan2(vy,vx)+π/2 单值（:25889——旧式再 +1.57 双重旋转已撤）;无纵向翻转臂', () => {
    prime(59);
    const saw = new ChainsawProj(sawOwner(), 10, 1, () => true,
      () => ({ x: 430, y: 341 }), { projId: 59, shootSpeed: 32 });
    saw.vx = 32; saw.vy = 0;                                          // 右瞄（AI 直写后朝向）
    const { calls, ctx } = makeRecCtx();
    saw.draw({ canvas: undefined as never, ctx: ctx as never });
    const rot = calls.find((c) => c.m === 'rotate')!;
    expect(rot.a[0]).toBeCloseTo(Math.PI / 2, 6);
    expect(calls.find((c) => c.m === 'scale')).toBeUndefined();       // 无自创翻转（含 vx<0）

    const sawL = new ChainsawProj(sawOwner(), 10, 1, () => true,
      () => ({ x: 230, y: 341 }), { projId: 59, shootSpeed: 32 });
    sawL.vx = -32; sawL.vy = 0;                                       // 左瞄（原版纯旋转无镜像）
    const rl = makeRecCtx();
    sawL.draw({ canvas: undefined as never, ctx: rl.ctx as never });
    expect(rl.calls.find((c) => c.m === 'rotate')!.a[0]).toBeCloseTo(3 * Math.PI / 2, 6);   // atan2(0,−32)=π
    expect(rl.calls.find((c) => c.m === 'scale')).toBeUndefined();
  });
});
