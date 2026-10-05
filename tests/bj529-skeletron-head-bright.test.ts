// ★BJ529 骷髅王二阶段骷髅头弹非常暗（2026-10-06 用户实报）定谳+落刀三面锁：
//  ①弹身份/亮度算式钉值：270 骷髅王髅骨（专家骷髅王 NPC.cs:21961-21999 每 80/40t 发射,
//    ProjectileID.Skull=270）GetAlpha = Projectile.cs:80722-80725
//    `type==270 → new Color(255,255,255,WrappedLerp(0,255,(timeLeft%40)/40))`
//    ——RGB 恒白【不读光照色】=光照无关弹面（Main.cs:30068 projectileColor=格光 →
//    :31532 GetAlpha(projectileColor) 光色整体被替换）;A=WrappedLerp 三角波
//    （Utils.cs:305-313 num=2t、>1 折返）。
//  ②病灶=本仓弹体画进实体层被 compositeLight 全屏乘光压暗（探针
//    scripts/_bj529-skull-ab.mjs 暗腔实测乘光系数 k=0.325=vanillaProjAlpha
//    "常量色族"光照无关缺口）→ 承接=BJ278 projFullbrightQueue 判例（7f
//    flushTrailShade 光照合成后主画布 source-over 复绘=原版 s·t+bg·(1−s·t) 逐字）。
//  ③姿态两面（Arrow.draw 270 专属支）：rotation=atan2(v)（:58579-58590
//    270||585||601||706||837 同支;AutomaticallyChangesDirection :17121/:17387 →
//    direction=sign(vx) → vx<0 镜像+atan2(−v)=R(π−ang)∘M,837 同支已在
//    PROJ_ROT_RIGHT、270 漏员）;frame 拍速 :57651-57655 frame++ 逐 tick 循环 3 帧。
//  ④同族普查/非同族不回归：vanillaProjAlpha 头注 BJ529 常量色族清单
//    （fixed/fixedfade/afade/fade2/pulse40=光照无关域;fade/lerp 族=含格光域不收编）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Arrow, setProjSpriteOverride, projFrameSrcRect, PROJ_ROT_RIGHT } from '../src/entities/Arrow';
import { PROJ_ALPHA_MOD } from '../src/data/vanillaProjAlpha';

/** 原版真值复刻：WrappedLerp(0,255,(timeLeft%40)/40)/255（Utils.cs:305-313 三角折返） */
function vanillaSkullPulse(timeLeft: number): number {
  const percent = (timeLeft % 40) / 40;
  let num = percent * 2;
  if (num > 1) num = 2 - num;
  return num;   // A/255（GetAlpha 返回 A=255·num）
}

function mk270(vx = 3, vy = 0, age = 0): Arrow {
  const a = new Arrow(80 * 16, 100 * 16, vx, vy, 17, 0, 270,
    { pierce: 3, skullBone: true, life: 300, grav: 0 });
  (a as unknown as { age: number }).age = age;
  return a;
}

/** 记录式 ctx（save/translate/scale/rotate/globalAlpha/drawImage 全记,无 DOM） */
function recordingCtx() {
  const recs: Array<{ op: string; args?: unknown[] }> = [];
  const ctx = {
    canvas: { width: 800, height: 600 },
    save() { recs.push({ op: 'save' }); },
    restore() { recs.push({ op: 'restore' }); },
    translate(...a: unknown[]) { recs.push({ op: 'translate', args: a }); },
    scale(...a: unknown[]) { recs.push({ op: 'scale', args: a }); },
    rotate(...a: unknown[]) { recs.push({ op: 'rotate', args: a }); },
    drawImage(...a: unknown[]) { recs.push({ op: 'drawImage', args: a }); },
    imageSmoothingEnabled: false,
    globalAlpha: 1,
    set fillStyle(_: string) {}, set strokeStyle(_: string) {},
    set lineWidth(_: number) {},
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    fillRect() {}, strokeRect() {},
  } as unknown as CanvasRenderingContext2D;
  return { ctx, recs };
}

/** draw 捕获：实体层零绘 + projFullbrightQueue 闭包捕获 */
function draw270(a: Arrow, vx: number): { entityDraws: Array<{ op: string; args?: unknown[] }>; queued: Array<(c: CanvasRenderingContext2D) => void> } {
  const rc = recordingCtx();
  const queued: Array<(c: CanvasRenderingContext2D) => void> = [];
  a.draw({
    ctx: rc.ctx,
    mainPlayer: undefined,
    queueProjFullbright: (fn: (c: CanvasRenderingContext2D) => void) => { queued.push(fn); },
  } as never, {} as never);
  void vx;
  return { entityDraws: rc.recs, queued };
}

describe('BJ529 ① pulse40 亮度算式钉值（GetAlpha :80722 三角脉冲=vanilla 真值）', () => {
  let a: Arrow;
  beforeEach(() => {
    setProjSpriteOverride(270, { width: 26, height: 90 } as unknown as HTMLImageElement);
    a = mk270();
  });
  afterEach(() => {
    setProjSpriteOverride(270, { width: 0, height: 0 } as unknown as HTMLImageElement);
  });

  it('drawTableAlpha pulse40 = WrappedLerp 三角波（非锯齿）：峰 1 @tL%40=20,谷 0 @=0/40', () => {
    const fn = (a as unknown as { drawTableAlpha(): { ga: number } | null }).drawTableAlpha.bind(a);
    // 钉值 life 清单（每点对拍 vanilla 真值函数）：
    //  300: %40=20 → num=1 峰 / 310: 0.25 → 0.5 / 320: 0 谷 / 330: 0.75 → 折返 0.5 /
    //  339: 0.975 → 折返 0.05 / 307: 0.175 → 0.35 / 327: 0.675 → 折返 0.65
    for (const tL of [300, 310, 320, 330, 339, 307, 327]) {
      (a as unknown as { life: number }).life = tL;
      const got = fn()?.ga ?? -1;
      expect(got).toBeCloseTo(vanillaSkullPulse(tL), 6);
    }
  });

  it('life 不动 40 档逐点对拍 vanilla 真值（40 点全谱）', () => {
    const fn = (a as unknown as { drawTableAlpha(): { ga: number } | null }).drawTableAlpha.bind(a);
    for (let r = 0; r < 40; r++) {
      (a as unknown as { life: number }).life = 320 + r;   // 320%40=0..39 全谱
      const got = fn()?.ga ?? -1;
      expect(got).toBeCloseTo(vanillaSkullPulse(320 + r), 6);
    }
  });

  it('表身份：270=pulse40（白脉冲,filter=null=RGB 白直通）', () => {
    expect(PROJ_ALPHA_MOD[270].kind).toBe('pulse40');
    const got = (a as unknown as { drawTableAlpha(): { ga: number; filter: string | null } | null }).drawTableAlpha();
    expect(got?.filter ?? null).toBeNull();
  });
});

describe('BJ529 ② 复绘承接面（projFullbrightQueue 判例,本体不进实体层）', () => {
  beforeEach(() => {
    setProjSpriteOverride(270, { width: 26, height: 90 } as unknown as HTMLImageElement);
  });
  afterEach(() => {
    setProjSpriteOverride(270, { width: 0, height: 0 } as unknown as HTMLImageElement);
  });

  it('draw：实体层零 drawImage（乘光面退役）,恰 1 闭包入队', () => {
    const a = mk270();
    const { entityDraws, queued } = draw270(a, 3);
    expect(entityDraws.filter((r) => r.op === 'drawImage')).toHaveLength(0);
    expect(queued).toHaveLength(1);
  });

  it('闭包锁：save→translate(盒心)→rotate(atan2 v)→ga=脉冲→9 参 drawImage(帧矩形,盒心锚)→restore', () => {
    const a = mk270(3, 0, 0);   // age 0 → 帧 0;life 300 → ga=1（峰）
    const { queued } = draw270(a, 3);
    const rc = recordingCtx();
    queued[0](rc.ctx);
    const ops = rc.recs;
    expect(ops[0].op).toBe('save');
    expect(ops[ops.length - 1].op).toBe('restore');
    const tr = ops.find((o) => o.op === 'translate');
    expect(tr?.args?.[0]).toBeCloseTo(80 * 16 + 13, 4);   // x+w/2（SetDefaults 26×26）
    expect(tr?.args?.[1]).toBeCloseTo(100 * 16 + 13, 4);
    const rot = ops.filter((o) => o.op === 'rotate');
    expect(rot).toHaveLength(1);
    expect(rot[0].args?.[0]).toBeCloseTo(Math.atan2(0, 3), 6);   // :58579 atan2(vy,vx)
    expect(ops.filter((o) => o.op === 'scale')).toHaveLength(0); // vx>0 无镜像
    const draw = ops.find((o) => o.op === 'drawImage');
    expect(draw).toBeDefined();
    const [img, sx, sy, sw, sh, dx, dy, dw, dh] = draw!.args as number[];
    expect((img as unknown as { width: number }).width).toBe(26);   // 原图直切（9 参）
    expect(sx).toBe(0); expect(sw).toBe(26);
    expect(sy).toBe(0); expect(sh).toBe(30);                        // 90/3=30 帧高
    expect(dx).toBeCloseTo(-13, 4); expect(dy).toBeCloseTo(-15, 4); // 盒心锚（帧中心）
    expect(dw).toBeCloseTo(26, 4); expect(dh).toBeCloseTo(30, 4);   // drawScale=1
  });

  it('vx<0：scale(-1,1)+rotate(π−ang)（R(π−ang)∘M,:58579 direction<0 支）', () => {
    const a = mk270(-4, -3, 1);   // age 1 → 帧 1
    const { queued } = draw270(a, -4);
    expect(queued).toHaveLength(1);
    const rc = recordingCtx();
    queued[0](rc.ctx);
    const ops = rc.recs;
    const sc = ops.find((o) => o.op === 'scale');
    expect(sc?.args).toEqual([-1, 1]);
    const rot = ops.filter((o) => o.op === 'rotate');
    expect(rot).toHaveLength(1);
    const ang = Math.atan2(-3, -4);
    expect(rot[0].args?.[0]).toBeCloseTo(Math.PI - ang, 6);
  });

  it('frame 拍速 age%3（:57651 逐 tick 3 帧循环）→ 闭包帧矩形 sy=帧×30', () => {
    for (const age of [0, 1, 2, 3, 5]) {
      const f = age % 3;
      const rect = projFrameSrcRect(270, f)!;
      expect(rect.sy).toBe(f * 30);
      expect(rect.sh).toBe(30);
      const a = mk270(3, 0, age);
      const { queued } = draw270(a, 3);
      const rc = recordingCtx();
      queued[0](rc.ctx);
      const draw = rc.recs.find((o) => o.op === 'drawImage');
      expect((draw!.args as number[])[2]).toBe(f * 30);   // sy 锚帧
    }
  });

  it('ga 折算锁：life=320（谷）→ 闭包 globalAlpha=0;life=310 → 0.5', () => {
    for (const [tL, want] of [[320, 0], [310, 0.5]] as Array<[number, number]>) {
      const a = mk270(3, 0, 0);
      (a as unknown as { life: number }).life = tL;
      const { queued } = draw270(a, 3);
      const rc = recordingCtx();
      queued[0](rc.ctx);
      // globalAlpha 记录面：drawImage 时闭包已置值
      expect((rc.ctx as unknown as { globalAlpha: number }).globalAlpha).toBe(want);
    }
  });

  it('sprite 未就绪（width 0）→ 不入队不绘（P0-B 同律）', () => {
    setProjSpriteOverride(270, { width: 0, height: 0 } as unknown as HTMLImageElement);
    const a = mk270();
    const { queued } = draw270(a, 3);
    expect(queued).toHaveLength(0);
  });
});

describe('BJ529 ③ 同族普查/非同族不回归（vanillaProjAlpha BJ529 清单域）', () => {
  it('常量色族（光照无关域）在表身份抽查：pulse40/fixed/fixedfade/afade/fade2', () => {
    expect(PROJ_ALPHA_MOD[270].kind).toBe('pulse40');            // 白脉冲（本批接线）
    expect(PROJ_ALPHA_MOD[332].kind).toBe('fixed');              // 恒白
    expect(PROJ_ALPHA_MOD[872].kind).toBe('fixedfade');          // White*Opacity
    expect(PROJ_ALPHA_MOD[536].kind).toBe('afade');              // (255−α) 白剪影
    expect(PROJ_ALPHA_MOD[933].kind).toBe('fade2');              // White*Opacity 后缺省尾
  });

  it('含格光域（fade/lerp 族=非同族）不入收编清单：kind 负断言', () => {
    // 缺省/lerp 族 RGB 含 newColor（格光）= 本仓乘光近似同相,非 BJ529 病灶域
    expect(PROJ_ALPHA_MOD[180].kind).toBe('lerp');
    expect(PROJ_ALPHA_MOD[444].kind).toBe('fade');
    expect(PROJ_ALPHA_MOD[75].kind).toBe('lerp');
    expect(PROJ_ALPHA_MOD[586].kind).toBe('lerp');
    // 负面：以上 id 均 ≠ pulse40,270 专属支不外溢（分支 projId===270 门）
    for (const id of [180, 444, 75, 586]) {
      expect(PROJ_ALPHA_MOD[id].kind).not.toBe('pulse40');
    }
  });

  it('270 专属支不外溢：非 270 弹实体层照常绘制（通用路径回归面）', () => {
    setProjSpriteOverride(12, { width: 28, height: 28 } as unknown as HTMLImageElement);
    try {
      // 12 真镜弹（'fade' 档,格光域）——通用路径仍在实体层画（非同族不收编）
      const a = new Arrow(80 * 16, 100 * 16, 3, 0, 20, 0, 12, { grav: 0 });
      const rc = recordingCtx();
      const queued: Array<(c: CanvasRenderingContext2D) => void> = [];
      a.draw({
        ctx: rc.ctx, mainPlayer: undefined,
        queueProjFullbright: (fn: (c: CanvasRenderingContext2D) => void) => { queued.push(fn); },
      } as never, {} as never);
      expect(queued).toHaveLength(0);                                   // 不入复绘队
      expect(rc.recs.filter((r) => r.op === 'drawImage').length).toBeGreaterThan(0); // 实体层照画
    } finally {
      setProjSpriteOverride(12, { width: 0, height: 0 } as unknown as HTMLImageElement);
    }
  });

  it('rotation 漏员状态锁：270 不入 PROJ_ROT_RIGHT（专属支已按 :58579 同支承载,勿双修）', () => {
    expect(PROJ_ROT_RIGHT.has(837)).toBe(true);   // 同支成员原位
    expect(PROJ_ROT_RIGHT.has(270)).toBe(false);  // 270 由专属支承载（BJ529）
  });
});
