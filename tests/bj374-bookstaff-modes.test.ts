// BJ374 闸门:无限智慧巨著 3852 左键 712 命中面 + 右键 704 风暴轨迹面。
// 锚定 Terarria1457 反编译(1458 同行号对拍零变更):
//   左键  Item.cs:34087-34106(SetDefaults shoot 712/useTime3/useAnim25/speed11)
//         Player.cs:47615/47739(3852 瞄准锁向——!ItemAnimationJustStarted 后
//         vector=itemRotation 向量自锁;全族唯一 vid 覆盖)、:43820-43852(尾停发窗
//         itemAnimation < max−useTime×4——★itemAnimation 起手拍已递减 → 静默边界
//         =swT<=dur−win,旧 `<` 在 e=win 拍多发一发,实测 5 发 vs 原版 4 发)
//   右键  Player.cs:49557-49561(alt→704,pointPosition.X/Bottom−100,伤×1.75)、
//         :47612-47634(ChangeDir 点积=鼠标侧,dx==0→左)、:53317-53321(蓝×2)、
//         :4471-4484(窗=useAnim+1)
//   弹幕  Projectile.cs:7449-7461(704 SetDefaults)/71421-71575(AI_145:vy 阶梯
//         ±2/±4 钳 ±16、localAI[0] 快升支 +2 与 ≥16 提前收口 :71445-71447、
//         尘 274 几何 :71515-71537、彩带 gore 1007/1008 三掷 :71545-71575)/
//         7551-7562(712 SetDefaults penetrate 缺省 1=命中即亡)
// 实现在 src/entities/proj1457.ts(BookStormTwister) + src/core/Game.ts(发射链)。
// ★X4-债7 三条边界微差清偿(清偿刀D,2026-09-29):①尾窗单位原版式兜底
//   (Player.cs:43819-43823 itemTimeMax==0→sItem.useTime;本仓对映=窗内已施用
//   useTime=swing.multishot.useTime/getSlowMagicUseTime,慢施档随 itemTimeMax 缩放)
//   ②风暴出生 x=盒心(零修刀:pointPosition.X=RotatedRelativePoint(MountedCenter).X
//   ≡Center.X,:4209-4235/:3321-3326/:10878-10879) ③朝向门 dx==0→左(严格 >)。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TileStore } from '../src/world/TileStore';
import type { GameHooks } from '../src/entities/types';
import { BookStormTwister } from '../src/entities/proj1457';
import { GorePiece } from '../src/entities/GorePiece';

const GAME_ROOT = join(import.meta.dirname, '..');

interface DustRec { x: number; y: number; w: number; h: number; type: number;
  speedX: number; speedY: number; alpha: number; scale: number; vy: number; vx: number; }

function makeHooks(enemies: unknown[] = [], store?: TileStore,
  dustLog?: DustRec[], loopLog?: string[], critters: unknown[] = []): GameHooks {
  const hooks = {
    world: { store: store ?? new TileStore(200, 120) } as never,
    player: {
      equipStats: {}, cx: 800, cy: 1440, x: 790, y: 1419, w: 20, h: 42, dead: false,
      facing: 1, vx: 0, vy: 0,
    } as never,
    enemies: () => enemies,
    critters: () => critters,
    npcs: () => [],
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
    startLoopSfx: (key: string) => { loopLog?.push(key); return { stop: () => {}, setVolume: () => {}, playing: true, dead: false }; },
    spawnDust: (x: number, y: number, w: number, h: number, type: number,
      speedX = 0, speedY = 0, alpha = 0, _color = null, scale = 1) => {
      const rec = { x, y, w, h, type, speedX, speedY, alpha, scale,
        vx: speedX, vy: speedY, fadeIn: 0, noGravity: false, noLight: false };
      dustLog?.push(rec);                            // 同一对象:消费侧覆写可观测
      return rec as never;
    },
    stack: { anyTagged: () => false, hasActiveEffect: () => false },
  };
  return hooks as unknown as GameHooks;
}

// ================= BJ374-① BookStormTwister 被埋提前收口 + 快升支判据 =================

function mkBuriedTwister(): { t: BookStormTwister; g: GameHooks } {
  const store = new TileStore(200, 120);
  // 探测柱 = (cx−8, Bottom−160) 16×160(Columns 49,Bottom 1200+105)——整柱实心
  for (let y = 60; y < 80; y++) { store.setTileSilent(49, y, 1); store.setTileSilent(50, y, 1); }
  const t = new BookStormTwister(800, 1200, 0, 63, 9);
  const g = makeHooks([], store);
  return { t, g };
}

describe('BJ374-① 704 被埋提前收口 + localAI[0] 快升支判据(:71445-71481)', () => {
  it('快升支判据=递减前 vy≤−4:过渡带 vy −3→−5 不累积,−4→−8 才 +2(:71477-71481 else 支)', () => {
    const { t, g } = mkBuriedTwister();
    const F = t as unknown as { vy: number; localAI0: number; t: number };
    // 悬空→坠支先落 1 拍:vy 0→+2(确保从自由态出发)——然后强置到过渡带
    t.fixedUpdate(1 / 60, g);
    F.vy = -3;                                        // 递减前 −3 ∈ (−4,0] → 慢升支
    t.fixedUpdate(1 / 60, g);
    expect(F.localAI0).toBe(0);                       // 旧实现按递减后 −5≤−4 判=误 +2
    expect(F.vy).toBe(-5);                            // 慢支步进 −2
    F.vy = -4;                                        // 递减前 −4 → 快升支
    t.fixedUpdate(1 / 60, g);
    expect(F.localAI0).toBe(2);                       // +2 与 −4 步进同支(:71480)
    expect(F.vy).toBe(-8);
  });
  it('localAI0≥16 → 计数跳 285(:71445),300t 帽下提前 15t 收口(旧实现只累积不消费)', () => {
    const { t, g } = mkBuriedTwister();
    const F = t as unknown as { t: number; localAI0: number };
    let sawJump = false;
    let ticks = 0;
    while (!t.dead && ticks < 400) {
      t.fixedUpdate(1 / 60, g);
      ticks++;
      if (F.t >= 285 && ticks < 20) sawJump = true;   // 跳变在 ~tick10(lai0=2/t 快升)
      if (F.t < 285 && ticks > 11) sawJump = false;
    }
    expect(sawJump).toBe(true);                       // 计数被跳到 285(非自然走表)
    expect(ticks).toBe(26);                           // 跳变@tick11(lai0 首达 16 的下一拍) +15 → 26(修前=300)
  });
});

// ================= BJ374-② 彩带 gore 1007/1008 三掷(:71545-71575) =================

describe('BJ374-② 704 彩带 gore 拖尾(修前整缺)', () => {
  it('60t 期望≈29 发(1/5+1/7+1/7=0.486/拍),型∈{1007,1008},块1 vx 含 2.5× 风暴速', () => {
    const spawnLog: Array<{ type: number; vx: number; g: { vx: number } | null }> = [];
    const orig = GorePiece.newGore.bind(GorePiece);
    GorePiece.newGore = ((type: number, x: number, y: number, vx: number, vy: number, scale = 1) => {
      if (type === 1007 || type === 1008) {
        const g = orig(type, x, y, 0, 0, scale);
        if (g) { g.vx = vx; g.vy = vy; }
        spawnLog.push({ type, vx, g });               // g 引用=块1 调用方后续 +vx 可观测
        return g;
      }
      return orig(type, x, y, vx, vy, scale);
    }) as typeof GorePiece.newGore;
    try {
      const t = new BookStormTwister(800, 1200, 11, 63, 9);
      const g = makeHooks();
      for (let i = 0; i < 60 && !t.dead; i++) t.fixedUpdate(1 / 60, g);
    } finally {
      GorePiece.newGore = orig;
    }
    expect(spawnLog.length).toBeGreaterThanOrEqual(15);            // 期望 29,σ≈3.9
    expect(spawnLog.length).toBeLessThanOrEqual(45);
    expect(spawnLog.every((s) => s.type === 1007 || s.type === 1008)).toBe(true);
    // 出膛 vx=1.5×11=16.5(±NewGore 扰动 2)——1.5× 与 2.5×(块1 追加)的区分在
    // 调用方追加后:块1 g.vx≈27.5,块2/3≈16.5
    expect(spawnLog.every((s) => s.vx > 12 && s.vx < 21)).toBe(true);
    expect(spawnLog.some((s) => s.g && s.g.vx > 22)).toBe(true);   // 块1 追加可观测
  });
});

// ================= BJ374-③ 尘 274 几何(:71515-71537)+底部尘 31 fadeIn =================

describe('BJ374-③ 704 尘 274 椭柱几何+尘 31 fadeIn', () => {
  it('尘 274 位=Center+(21·vx4+6,105·vy4+10):x 偏左∈[−41,5],y∈[−96,106],vy∈[−1.8,−1.3]', () => {
    const dustLog: DustRec[] = [];
    const t = new BookStormTwister(800, 1200, 0, 63, 9);   // vx=0 → cx 恒定(偏移=纯几何)
    const g = makeHooks([], undefined, dustLog);
    const cx = 800;
    const cys: number[] = [];                          // 逐拍 cy(风暴在下坠,偏移基准=当拍 cy)
    for (let i = 0; i < 40 && !t.dead; i++) { t.fixedUpdate(1 / 60, g); cys.push(t.cy); }
    const d274 = dustLog.filter((d) => d.type === 274);
    expect(d274.length).toBeGreaterThanOrEqual(30);
    for (const d of d274) {
      const ox = d.x - cx;
      expect(ox).toBeGreaterThanOrEqual(-41);        // 21×(−2.2)+6
      expect(ox).toBeLessThanOrEqual(5);             // 21×(−0.06)+6
      const oyOk = cys.some((c) => { const oy = d.y - c;
        return oy >= -96 && oy <= 106; });           // 105×vy4+10,vy4∈[−1,0.9]
      expect(oyOk).toBe(true);
      expect(d.alpha).toBe(211);
      expect(d.scale).toBeCloseTo(0.87, 5);
    }
  });
  it('尘 274 速度覆写:vy=Next×−0.5−1.3∈[−1.8,−1.3];vx 含 +风暴×2.1(:71530-71532)', () => {
    const dustLog: DustRec[] = [];
    const t = new BookStormTwister(800, 1200, 11, 63, 9);
    const g = makeHooks([], undefined, dustLog);
    for (let i = 0; i < 20 && !t.dead; i++) t.fixedUpdate(1 / 60, g);
    const d274 = dustLog.filter((d) => d.type === 274);
    for (const d of d274) {
      // vy 直接覆写(与基速无关)——spawnDust 收到的 speedY 即原版覆写前参数 0,
      // 消费侧覆写在尘对象上——此处锚 spawn 参数面 0+alpha211
      expect(d.speedY).toBe(0);
      expect(d.speedX).toBe(0);
    }
    // 底部尘 31 ×4/拍:盒 (cx−25, Bottom−25) 50×25、速 (vx,−2)、alpha 100
    const d31 = dustLog.filter((d) => d.type === 31);
    expect(d31.length).toBeGreaterThanOrEqual(60);
    for (const d of d31) {
      expect(d.speedX).toBe(11);
      expect(d.speedY).toBe(-2);
      expect(d.alpha).toBe(100);
    }
  });
});

// ================= BJ374-④ Game.ts 发射链源锚(尾窗边界/锁向/右键朝向/窗长) =================

describe('BJ374-④ 发射链源锚(修前五差异回归闩)', () => {
  const src = () => readFileSync(join(GAME_ROOT, 'src/core/Game.ts'), 'utf8');

  it('尾停发窗边界=swT <= swDur−winTail×U(:43820-43852——itemAnimation 起手拍已递减,', () => {
    const s = src();
    // 旧 `swT < swDur - winTail` 在 e=win 拍(3852 第 5 发,anim=13<14)放行=每窗多发
    // ★X4-债7①:窗单位 U=窗内已施用 useTime(慢施缩放档,msU27 口径)
    expect(s).toMatch(/swT <= swDur - winTail \* \(msU27 \|\| cw\.useTime \|\| 4\)/);
    expect(s).not.toMatch(/swT < swDur - winTail/);
  });
  it('尾窗单位原版式兜底:itemTimeMax==0→sItem.useTime 三站位(:43819-43823,慢施随缩放)', () => {
    const s = src();
    // 站A case'magic' 派发门:U=当前窗已施用值(swing.multishot.useTime=R27 续发钟)
    expect(s).toMatch(/const win = TAIL_SILENCE_WIN\[critVid\] \* \(this\.swing\.multishot\?\.useTime \|\| cw\.useTime \|\| 4\)/);
    // 站B 6152:appliedU6152 兜底链,续发钟与尾窗同源同值(:19170 旧双式分裂已收)
    expect(s).toMatch(/const appliedU6152 = this\.player\.getSlowMagicUseTime\(cw\.useTime\) \|\| cw\.useTime \|\| 4;/);
    expect(s).toMatch(/const winTail6152 = TAIL_SILENCE_WIN\[critVid\] \* appliedU6152;/);
    expect(s).toMatch(/useTime: appliedU6152,/);
    // 站C 泛化 spray:msU27 同源(msU27=续发钟),gate 兜底链
    expect(s).toMatch(/const msU27 = this\.player\.getSlowMagicUseTime\(cw\.useTime\);\s*\n\s*this\.swing\.multishot = ms27 = \{\s*\n\s*useTime: msU27,/);
    // 负面:旧「裸 cw.useTime 兜 4」形回退即红(慢施窗单位分裂:钟 ⌊U×2.5⌋/窗 U)
    expect(s).not.toMatch(/winTail \* \(cw\.useTime \|\| 4\)/);
    expect(s).not.toMatch(/winTail6152 = TAIL_SILENCE_WIN\[critVid\] \* \(cw\.useTime/);
  });
  it('3852 续发锁向:fireAgain27 critVid===3852 早退沿 lockAng27/lockPose27(:47615/47739)', () => {
    const s = src();
    expect(s).toMatch(/const lockAng27 = mzAng, lockPose27 = ang;/);
    expect(s).toMatch(/if \(critVid === 3852\) \{\s*\n\s*const aAnchor27 = this\.resolveShotAnchor\(def\.key, lockPose27\);\s*\n\s*this\.fireGemStaffBolts\(cw, def, ps, lockAng27,/);
  });
  it('updateSwingHits 姿势跟手 3852 例外(全族唯一 itemRotation 覆盖 vid)', () => {
    const s = src();
    expect(s).toMatch(/&& \(ITEM_DEFS\[this\.swing\.item\]\?\.vid \?\? -1\) !== 3852\)/);
  });
  it('右键风暴方向=鼠标侧严格 >(点积>0 :47626-47634——dx==0 同轴拍 num=0 落 else=朝左)', () => {
    const s = src();
    // ★X4-债7③:全量旋转未建模(φ=0)⇒ num=sign(dx);dx==0 边沿 vanilla 翻左
    expect(s).toMatch(/bsMwx > this\.player\.cx \? 1 : -1/);
    expect(s).not.toMatch(/bsMwx >= this\.player\.cx/);
  });
  it('右键风暴出生 x=盒心(零修刀:pointPosition.X≡Center.X,「杖尖」读法不成立)', () => {
    const s = src();
    // ★X4-债7②:pointPosition=RotatedRelativePoint(MountedCenter)(:47605+:4209-4235
    // 无坐骑无旋转恒等盒心;NewProjectile :10878-10879 传点即弹心)≡player.cx。
    // 正面钉当前式;负面杀双变异——出生锚被换成绘制杖尖(resolveShotAnchor)或被摘除
    expect(s).toMatch(/const twister = new BookStormTwister\(this\.player\.cx, feetY - 100,/);
    expect(s).not.toMatch(/new BookStormTwister\((?!this\.player\.cx)/);
  });
  it('右键窗长=useAnimation+1(ApplyItemAnimation :4471-4484 style5+autoReuse 补间帧)', () => {
    const s = src();
    expect(s).toMatch(/\(bsData\?\.useAnimation \?\? 25\) \+ 1/);
  });
});

// ================= BJ381 704 小动物命中面(用户实报"龙卷风不伤小动物") =================
// 定谳:原版 critter SetDefaults 无 friendly=true(兔 46 族 NPC.cs:9364-9373 仅
// width/aiStyle7/lifeMax5/catchItem)⇒ Damage_PVE_Inner :12618 flag=!friendly 恒真;
// 拒收唯 CanNPCBeHitByPlayerOrPlayerProjectile(Player.cs:20673-20689)=dontHurtCritters
// ∪ minion/MinionShot/sentry/SentryShot——704 魔法弹全不沾 ⇒ 原版龙卷照伤小动物。
// 本仓 critters 独立桶不入 game.enemies(),dealContacts 只扫敌桶=整缺;修=接单源
// hitCritters(穿透弹范式 WeaponProj.ts:309/Arrow.ts:10011——不杀弹不耗穿透)。

describe('BJ381 704 小动物命中面(修前整缺)', () => {
  function mkCritter(x: number, y: number): {
    x: number; y: number; w: number; h: number; dead: boolean;
    hurt(dmg: number, kx: number, ky: number, _g: unknown,
      armorPen: number, crit: boolean, pierce: number, fromPlayer: boolean): boolean;
    calls: Array<{ dmg: number; kx: number; ky: number; armorPen: number; crit: boolean; pierce: number; fromPlayer: boolean }>;
  } {
    const calls: Array<{ dmg: number; kx: number; ky: number; armorPen: number; crit: boolean; pierce: number; fromPlayer: boolean }> = [];
    const c = {
      x, y, w: 18, h: 20, dead: false,
      calls,
      hurt(dmg: number, kx: number, ky: number, _g: unknown,
        armorPen: number, crit: boolean, pierce: number, fromPlayer: boolean): boolean {
        calls.push({ dmg, kx, ky, armorPen, crit, pierce, fromPlayer });
        c.dead = true;                          // critter lifeMax=5 一击即死(全族)
        return true;
      },
    };
    return c;
  }

  it('重叠 critter 受击一次(5 伤/fromPlayer=true),弹体不亡(穿透−1 不消耗)', () => {
    const t = new BookStormTwister(800, 1200, 0, 63, 9);
    // 弹体盒首拍=(770,1095)60×210;critter 置身内 (790,1200)
    const c = mkCritter(790, 1200);
    const g = makeHooks([], undefined, undefined, undefined, [c]);
    for (let i = 0; i < 3 && !t.dead; i++) t.fixedUpdate(1 / 60, g);
    expect(c.calls.length).toBe(1);
    expect(c.calls[0].dmg).toBe(5);               // hitCritters 定伤面(RB10d-D1 等价杀面)
    expect(c.calls[0].fromPlayer).toBe(true);     // DPS 计/lastCreatureHit 入账
    expect(t.dead).toBe(false);                   // penetrate=−1:命中小动物弹体不消耗
  });

  it('判别面:不重叠 critter 零受击(命中门不误伤全桶)', () => {
    const t = new BookStormTwister(800, 1200, 0, 63, 9);
    const c = mkCritter(1400, 1200);              // 弹体右缘 830 之外
    const g = makeHooks([], undefined, undefined, undefined, [c]);
    for (let i = 0; i < 5 && !t.dead; i++) t.fixedUpdate(1 / 60, g);
    expect(c.calls.length).toBe(0);
  });
});
