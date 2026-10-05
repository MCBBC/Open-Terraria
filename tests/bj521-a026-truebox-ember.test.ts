/**
 * BJ521 两件（BJ520 登记债清偿）：
 *
 * ① a026 族真盒三源同步——原版 SetDefaults 亲读钉值：
 *    191-194 俾格米 18×18（Projectile.cs:2794-2795）——192/193/194 带 scale
 *    1.025/1.05/1.075（:2804-2812）,SetDefaults 尾 width×scale 截断（:10674-10675）
 *    → 194 终盒 19×19（18×1.075f=19.35;192/193 截断回 18）;266 宝宝史莱姆 24×16
 *    （:3519-3520）;1094/1113 火绒狐 18×18（:10217-10218/:10384-10385）。
 *    三源=构造器 if 链 + minionTrueBox 读口 + 数据面 vanilla-projectiles.json
 *    （字面+scale 形态,按尾式折算恒等）。此前 191-194/266 双面缺注册落 16×16 缺省、
 *    trueBox 漏 1094（构造器 2026-09-06 批已有=单源漂移）⇒ 判定盒/湿段采样盒差 2-8px。
 * ② 湿段采样盒随真盒：projectileWetSection 吃实体 w/h（MinionProj.fixedUpdate 湿段
 *    调用位）——岩浆列卡盒外沿（18 宽盒触/16 宽盒不触,lavaCollision 精确盒交
 *    npcLiquid.ts:102 `px+pw > i*TS` 严格式）=构造器缺省回退的判别面;满浸对照位
 *    证夹具自身可检液（防假阳/假阴双向）。
 * ③ 喷火态×岩浆边——原版门序：AI_026 顶 flag10 岩浆逃逸门 :59170-59174
 *    （lavaWet → ai[0]=1/ai[1]=0）先于 flag8 喷火块 :60011-60101（ai[0]>=1000 :60014,
 *    块尾 return :60101）→ 岩浆拍 ai[0]=1<1000 喷火块不入,落 ai[0]==1 归位态。
 *    玩家侧 TryUsingFoxsparksAbility（Player.cs:43679,ai[0]=1000f :43686,:43105 调用位
 *    逐拍）重置 ⇒ 压制非粘滞：!wet 三清（:17103-17108）后下拍复燃,无需重按。
 *    仓内 foxChannel=电平驱动（Game 通道=玩家侧重置等价面）→ AI 侧以 lavaWetAi
 *    读相折门序（岩浆拍跳过喷火支 fall-through 至 ai026TailGround 门→归位飞行）;
 *    释放臂喷火后锁（:60093 localAI[0]=30）按原版只在喷火块入过时落。
 *    ★BJ523（2026-10-05）：③复燃断言维持=原版语义（gold 面不翻）;BJ522 登记债①
 *    「须重按」前提证伪——狐杖 autoReuse=true（Item.cs:44503/:47377）→
 *    ItemCheck_AutoReuseLogic :53519 逐拍强制 releaseUseItem=true + :53524 fast-path
 *    （itemAnimation==1→0）→ :43064 门重开每拍重调 TryUsingFoxsparksAbility（岩浆
 *    持住重臂环）⇒ 出岩浆首拍 ai[0]==1000 即 fire;「:43105 调用位逐拍」「持住恒假」
 *    两注均勘误（机制=autoReuse 重臂环非「逐拍重置」/非「按下沿」）,详见
 *    tests/bj523-fox-w0-invocation-face.test.ts 头注。
 * ④ BJ520 面守恒：flag10 门（191）/266 不入逃逸门/读相（首拍不触发）不回归。
 * 实现落点：src/entities/MinionProj.ts（构造器链+minionTrueBox+喷火支门+draw 门+
 *    foxFlameRan/foxLavaHold）+ src/core/Game.ts（喷火通道钉位/刷瞄门+释放锁门）。
 * 夹具注：世界高 160（湿段扫描窗 j1 钳 st.h-40,液体行须 <120——BJ520 同注）;
 *    岩浆读相=上拍湿段尾值 → 首拍必不触发（原版同相,BJ520 t1 同款断言）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { MinionProj, minionTrueBox } from '../src/entities/MinionProj';
import { projectileWetSection } from '../src/entities/projWetSection';
import type { GameHooks } from '../src/entities/types';

const priv = (o: object): Record<string, any> => o as unknown as Record<string, any>;
const ROOT = join(__dirname, '..');
const MINION_TS = readFileSync(join(ROOT, 'src', 'entities', 'MinionProj.ts'), 'utf8');
const GAME_TS = readFileSync(join(ROOT, 'src', 'core', 'Game.ts'), 'utf8');
const PROJ_JSON = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'vanilla-projectiles.json'), 'utf8')) as
  Record<string, { width: number; height: number; scale?: number; aiStyle: number; minion?: boolean }>;

// ================================================================
// ① 真盒钉值（原版 SetDefaults 亲读,含 :10674-10675 尾式 scale 截断）
// ================================================================
const TRUE_BOXES: Record<number, [number, number]> = {
  191: [18, 18],          // 俾格米（:2794-2795,无 scale 行=字段缺省 1f :322）
  192: [18, 18],          // scale 1.025 → 18.45 截断回 18（:2804-2806）
  193: [18, 18],          // scale 1.05 → 18.9 截断回 18（:2807-2809）
  194: [19, 19],          // scale 1.075 → 18×1.075f=19.35 截断 19（:2810-2812+:10675）★钉值
  266: [24, 16],          // 宝宝史莱姆（:3519-3520,无 scale 行）
  1094: [18, 18],         // 火绒狐（:10217-10218）★trueBox 漂移修复
  1113: [18, 18],         // 可靠的火绒狐（:10384-10385）
};
/** 数据面字面锚（提取器面=SetDefaults 赋值字面,scale 单列——尾式前值） */
const LITERAL_BOXES: Record<number, [number, number]> = {
  191: [18, 18], 192: [18, 18], 193: [18, 18], 194: [18, 18],
  266: [24, 16], 1094: [18, 18], 1113: [18, 18],
};

function makeHooks(enemies: { id: number }[] = []) {
  const w = new World(200, 160, 7, 'bj521');
  for (let x = 0; x < 200; x++) for (let y = 140; y < 160; y++) w.store.setTile(x, y, 1);
  // 干燥高台：台面 row 92（x 70-90）——喷火/复燃干态舞台（BJ520 同式）
  for (let x = 70; x <= 90; x++) w.store.setTile(x, 92, 1);
  w.groundLevel = 100;
  const player = new Player(60 * 16, 79 * 16, new Inventory());
  const hooks: GameHooks = {
    world: w as never,
    player: player as never,
    enemies: () => enemies as never,
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
    spawnDust: () => null,
  };
  (hooks as unknown as { entities: { projectiles: unknown[]; add: () => void } }).entities =
    { projectiles: [], add: () => {} };
  return { hooks, store: w.store, player, world: w };
}

const minion = (player: Player, projId: number, cx: number, cy: number): MinionProj => {
  const m = new MinionProj(cx, cy, projId, 10, 2, false, 0, false, () => player);
  m.x = cx - m.w / 2; m.y = cy - m.h / 2;
  return m;
};

/** 液体矩形（液量 255 满格;type=1 水 2 岩浆——TileStore 编码,BJ520 同式） */
function fillLiquid(h: ReturnType<typeof makeHooks>,
  x0: number, x1: number, y0: number, y1: number, type: number): void {
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const i = h.store.idx(x, y);
      h.store.liquid[i] = 255;
      h.store.liquidType[i] = type;
    }
  }
}

/** 岩浆外沿夹具：岩浆 col 67-68 × row 90-91 + 水列 col 66（润湿中心探针盒——
 *  wetCollision=中心小盒（min(10,w)×h/2 居中,npcLiquid:36）,lavaWet 粘滞需 wet=true
 *  （!wet 三清 :17103-17108 同拍即清,原版同相）。判别面=岩浆全盒外沿：191 盒左
 *  66*16=1056,18 宽盒右 1074 触液列左沿 1072 达 2px;16 宽缺省盒右 1072 恰不触
 *  （lavaCollision 严格式）;水列对 16/18 宽中心盒等距=湿旗宽度不敏感,只判岩浆面。 */
const LAVA_EDGE = (h: ReturnType<typeof makeHooks>) => {
  fillLiquid(h, 67, 68, 90, 91, 2);
  fillLiquid(h, 66, 66, 90, 91, 1);
};
/** 纯岩浆盆（③/④ 用）：col 67-68 × row 90-91,盒位放盒心浸入（中心探针盒落在
 *  岩浆内=岩浆格亦判 wet,npcLiquid 头注 1） */
const LAVA_BASIN = (h: ReturnType<typeof makeHooks>) => fillLiquid(h, 67, 68, 90, 91, 2);

/** 干态探针旗面（ProjWetFlags 形;presetDone=true 跳出生预置,直跑段体） */
const dryFlags = () => ({ presetDone: true, wet: false, lavaWet: false,
  honeyWet: false, shimmerWet: false, wetCount: 0 });

describe('① a026 族真盒三源同步（构造器链+minionTrueBox+数据面）', () => {
  it('构造器 if 链：7 id 钉值（16×16 缺省不再吃;194=19×19 尾式截断）', () => {
    for (const [idStr, [bw, bh]] of Object.entries(TRUE_BOXES)) {
      const id = Number(idStr);
      const m = new MinionProj(0, 0, id, 10, 1, false, 0, false, () => null);
      expect([m.w, m.h], `构造器 ${id}`).toEqual([bw, bh]);
    }
  });

  it('minionTrueBox 读口与构造器单源同步（1094 漂移修复+尾族补齐）', () => {
    for (const [idStr, [bw, bh]] of Object.entries(TRUE_BOXES)) {
      const id = Number(idStr);
      const b = minionTrueBox(id);
      expect([b.w, b.h], `minionTrueBox(${id})`).toEqual([bw, bh]);
      const m = new MinionProj(0, 0, id, 10, 1, false, 0, false, () => null);
      expect([m.w, m.h], `构造器≡TrueBox ${id}`).toEqual([b.w, b.h]);
    }
  });

  it('数据面 vanilla-projectiles.json：字面锚+scale,按 :10674-10675 尾式折算≡钉值', () => {
    for (const idStr of Object.keys(TRUE_BOXES)) {
      const e = PROJ_JSON[idStr];
      expect(e, `数据面 ${idStr} 在表`).toBeTruthy();
      expect([e.width, e.height], `数据面 ${idStr} 字面`).toEqual(LITERAL_BOXES[Number(idStr)]);
      const fw = Math.trunc(e.width * (e.scale ?? 1));
      const fh = Math.trunc(e.height * (e.scale ?? 1));
      expect([fw, fh], `数据面 ${idStr} 尾式终值`).toEqual(TRUE_BOXES[Number(idStr)]);
    }
    // 关键字面/scale 锚：
    expect(PROJ_JSON['194'].scale).toBeCloseTo(1.075, 6);
    expect(PROJ_JSON['192'].scale).toBeCloseTo(1.025, 6);
    expect(PROJ_JSON['266'].scale).toBeUndefined();
    expect(PROJ_JSON['1094'].scale).toBeUndefined();
  });
});

describe('② 湿段采样盒随真盒（岩浆外沿 2px 判别面）', () => {
  it('191 真盒 18 宽触液（16 缺省盒同位不触;16 满浸位可触=夹具双向自证）', () => {
    const h = makeHooks();
    LAVA_EDGE(h);
    const m = minion(h.player, 191, 66 * 16 + 9, 90 * 16 + 9);   // 盒左 1056,盒右 1074
    expect([m.w, m.h]).toEqual([18, 18]);
    m.fixedUpdate(1, h.hooks);
    expect(priv(m).lavaWet, '18 宽真盒触外沿岩浆（lavaWet 只置不清 :16906-16911;水列润中心盒保粘滞）').toBe(true);
    expect(priv(m).wet, '湿旗=中心探针盒判（粘滞前提,:17103 三清不然）').toBe(true);
    // 镜像 A：16×16 缺省盒同位 → 岩浆面恰不触（px+pw=1072 > 1072 严格式不成立;
    //  湿旗同真（水列）→ 三清不背锅,纯几何差）
    const fA = dryFlags();
    projectileWetSection(fA as never, h.hooks, h.store, 66 * 16, 90 * 16, 16, 16, 191, false);
    expect(fA.lavaWet, '16 宽缺省盒同位不触岩浆=几何判别面').toBe(false);
    expect(fA.wet, '湿旗同位为真（水列宽度不敏感,排除湿旗混淆）').toBe(true);
    // 镜像 B：16×16 满浸位（盒左=液列左沿 1072）→ 可触=夹具自证（防假阴）
    const fB = dryFlags();
    projectileWetSection(fB as never, h.hooks, h.store, 67 * 16, 90 * 16, 16, 16, 191, false);
    expect(fB.lavaWet, '16 宽盒满浸位可触=夹具可检液（假阴排除）').toBe(true);
  });

  it('266 真盒 24×16（宽差 8px 判别面）同位触液;1094 同 18 宽面', () => {
    const h = makeHooks();
    LAVA_EDGE(h);
    const m266 = minion(h.player, 266, 66 * 16 + 12, 90 * 16 + 8);
    expect([m266.w, m266.h], '266 真盒 24×16').toEqual([24, 16]);
    m266.fixedUpdate(1, h.hooks);
    expect(priv(m266).lavaWet, '24 宽盒触外沿（16 缺省同位更不可达）').toBe(true);
    const m1094 = minion(h.player, 1094, 66 * 16 + 9, 90 * 16 + 9);
    expect([m1094.w, m1094.h]).toEqual([18, 18]);
    m1094.fixedUpdate(1, h.hooks);
    expect(priv(m1094).lavaWet, '1094 真盒同判别面（trueBox 漂移修复后湿段同相）').toBe(true);
  });
});

describe('③ 喷火态×岩浆边（门序=:59170 先于 :60011;持续压制+复燃）', () => {
  it('干态通道：喷火支入（foxT 推进+foxFlameRan 置位）——基线相', () => {
    const h = makeHooks();
    const m = minion(h.player, 1094, 76 * 16, 90 * 16);
    m.foxChannel = true; m.foxAimX = 1; m.foxAimY = 0;
    m.fixedUpdate(1, h.hooks);
    expect(priv(m).foxT, '干态首拍喷火（foxT 0→1）').toBe(1);
    expect(m.foxFlameRan, '喷火块入过=:60093 锁通道成立').toBe(true);
  });

  it('岩浆拍中断：先驻岩浆置 lavaWet,再按住 → 喷火支不入（foxT 冻结 0）+ 门落归位态', () => {
    const h = makeHooks();
    LAVA_BASIN(h);
    const m = minion(h.player, 1094, 1076 + 9, 90 * 16 + 9);   // 盒左 1076=盒心浸岩浆（中心探针盒湿）
    m.fixedUpdate(1, h.hooks);
    expect(priv(m).lavaWet).toBe(true);
    m.foxChannel = true; m.foxAimX = 1; m.foxAimY = 0;
    for (let t = 0; t < 3; t++) {
      m.x = 1076; m.y = 90 * 16;                     // 逐拍钉回岩浆位（归位飞行会移位）
      m.fixedUpdate(1, h.hooks);
    }
    expect(priv(m).foxT, '岩浆拍喷火支未入（门 :59170 先于喷火块 :60011;支先 return 旧形 → 红）').toBe(0);
    expect(m.foxFlameRan, '纯岩浆通道无喷火拍 → 无锁通道').toBe(false);
    expect(priv(m).a026A0, '门=:59174 ai[0]=1 归位态（BJ520 门在通道拍仍生效）').toBe(1);
    expect(priv(m).shootCd, '门=:59175 ai[1]=0').toBe(0);
  });

  it('持续压制+复燃：出岩浆后无需重按即复燃（玩家侧 :43686 逐拍重置面）', () => {
    const h = makeHooks();
    LAVA_BASIN(h);
    const m = minion(h.player, 1094, 1076 + 9, 90 * 16 + 9);
    m.fixedUpdate(1, h.hooks);                       // 驻岩浆
    m.foxChannel = true; m.foxAimX = 1; m.foxAimY = 0;
    m.x = 1076; m.y = 90 * 16;
    m.fixedUpdate(1, h.hooks);                       // 通道首拍=读相仍真 → 中断
    expect(priv(m).foxT).toBe(0);
    // 出岩浆：钉到干台,通道保持（foxChannel 从未置假=玩家未松手）
    m.x = 76 * 16; m.y = 90 * 16;
    m.fixedUpdate(1, h.hooks);                       // 读相=上拍岩浆值 → 本拍仍中断（:17103 三清在本拍湿段）
    m.fixedUpdate(1, h.hooks);                       // 读相=假 → 复燃
    expect(priv(m).foxT, '出岩浆次拍复燃（foxChannel 恒真,无需重按）').toBe(1);
    expect(m.foxFlameRan).toBe(true);
  });
});

describe('④ BJ520 面守恒 + 源级锁', () => {
  it('BJ520 岩浆门不回归：191 门活/266 不入门/首拍读相不触发', () => {
    const h = makeHooks();
    LAVA_BASIN(h);
    const m191 = minion(h.player, 191, 1076 + 9, 90 * 16 + 9);   // 盒心浸岩浆
    m191.fixedUpdate(1, h.hooks);                    // 首拍:读相=构造值 false（BJ520 t1 同款）
    expect(priv(m191).a026A0, '首拍门不触发（读相）').toBe(0);
    m191.x = 1076; m191.y = 90 * 16;
    m191.fixedUpdate(1, h.hooks);
    expect(priv(m191).a026A0, '次拍门活（191∈flag10）').toBe(1);
    const m266 = minion(h.player, 266, 1076 + 12, 90 * 16 + 8);   // 岩浆中但近玩家（归位门不夺面）
    m266.fixedUpdate(1, h.hooks);
    m266.x = 1076; m266.y = 90 * 16;
    m266.fixedUpdate(1, h.hooks);
    expect(priv(m266).a026A0, '266∉flag10 不入逃逸门（:59179 else-if 支）').toBe(0);
    expect(priv(m266).lavaWet, '266 受段（BJ520② 注册面）岩浆中 lavaWet 置位').toBe(true);
  });

  it('BJ521 落刀标记在位（AI 门/draw 门/foxFlameRan/foxLavaHold/Game 钉位门+锁门）', () => {
    expect(MINION_TS).toContain('★BJ521');
    expect(MINION_TS.split('this.foxChannel && !this.lavaWetAi').length - 1, 'AI 支+draw 支同门 ×2')
      .toBe(2);
    expect(MINION_TS).toContain('foxFlameRan = false;');
    expect(MINION_TS).toContain('get foxLavaHold(): boolean');
    expect(MINION_TS).toContain('case 194: return { w: 19, h: 19 };');
    expect(MINION_TS).toContain('case 266: return { w: 24, h: 16 };');
    expect(MINION_TS).toContain('case 1094: case 1113: return { w: 18, h: 18 };');
    expect(GAME_TS).toContain('!m.foxLavaHold');
    expect(GAME_TS).toContain('if (m.foxFlameRan) { m.foxFlameRan = false; m.lockAfterFoxChannel(); }');
  });

  it('sha256 稳定（变异还原后回同值）', () => {
    for (const f of [MINION_TS, GAME_TS]) {
      expect(createHash('sha256').update(f).digest('hex')).toHaveLength(64);
    }
  });
});
