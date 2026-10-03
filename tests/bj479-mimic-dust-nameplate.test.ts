// BJ479（2026-10-03）宝箱怪受击/死亡尘整缺（BJ472 登记面）+ npcdust 提取器对账 3 红复绿
// + 伪装态名牌门（BJ464 新登记）三件套。
//
// 定谳（Terarria1457 亲读,1458 同区逐字节全等区）：
//   ① 85（Mimic）/629（Ice Mimic）共支 HitEffect（NPC.cs:89766-89801）——根级 ai[3] 门=
//     段位选尘：`int num722 = 7; if (ai[3]==2f) num722=10; if (ai[3]==3f) num722=37;`
//     hit=ceil(dmg/lifeMax×50) 循环 / death=20 发;gore 61/62/63（×0.3 速度）归
//     extract-gore.mjs（carve-out,不在尘表）。段位语义=AI_025 生成时锁（:25684-25697:
//     ai[3]==0 时按生成深度自置 1 地表/2 地下/3 地狱;341/629 每 tick 强制 =1 :25699-25701
//     → 629 恒段 1 恒尘 7）。★根因：num722 三重赋值使提取器「唯一赋值还原/per-type 桶」
//     双失效 → typedLocal 桶尾值 37 静默错解析,靠 85/629 未接线（rollout pending）掩盖
//     = 表侧整缺。落刀=提取器 ai3Locals 建模（d=组头初值/m=段位覆写,0 掷运行时段位）+
//     stmt.idAi3 新字段+解释器消费（读 Enemy.ai3=mimicAI BJ464 锁定值）。
//   ② era guard 3 红（dry-run 漂移/沙箱 byte-perfect/1458 重放）=BJ411 批5 手工条目（23）
//     与 9-24 提取器漂移——json 才对（工具陈旧）。落刀=提取器 roll 条件 id 局部建模
//     （`int numN=25;if(Next(2)==0){numN=6}` → idPick=[6,25]+空门帧 rollIdConsumed 摘除
//     占位支,1 掷同拍）→ 23 提取器原生复现（_meta.batch5 退役→batch6）,重产走 era guard
//     纪律（SW_OUT 双沙箱 sha256 全等 7f5a1a04…→--write-real→干跑零漂移）。
//   ③ 伪装态名牌门（Main.cs:22743 nameOver 渐显 aiStyle25&&ai0==0 门）：★nameOver 字段
//     唯一绘制消费位=手柄支（Main.cs:46851 `PlayerInput.UsingGamepad` 内 White*nameOver）,
//     本仓 Web 版无手柄名牌面（Keybinds.ts:104 LockOn「Web 版不做」）→ nameOver 面结构
//     N/A;本仓名牌消费位=悬停名（Main.cs:43740-43748 排除门族,Game.tickHoverNpcName）,
//     ai0==0 伪装门 SW-BJ1 已建模——本刀判别测试复锁（伪装隐藏/激活显示,85/341/629 族）。
//
// 断言面：
//   A. 数据面金标——85/629 表结构钉值+对账复绿（batch6/pending 出清）。
//   B. 行为锁——85 三段选尘 7/10/37;受击 ceil 簇数/死亡 20 发两触发面;0 掷纯度;
//      629 恒段端到端（地狱生成 mimicAI 锁 1→尘 7;85 同深锁 3→尘 37）;未锁拍缺省 7。
//   C. 名牌门——伪装态悬停不显名/觉醒态显名+血量行（85/341/629 族）。
//   D. 变异自证——M1 摘解释器 idAi3 消费=段位选尘红;M2 摘 hit 簇 ceil=簇数红;
//      M3 提取器 tmp 变异体摘 ai3Locals 登记=85 退化为桶尾值 37（探针物证）。
//      M1/M2 npcdust-mutation-mutex 共锁（bj296/bj304/bj327 同锁,锚含批6）。
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { gateConsumerMutation, lockConsumerMutation, unlockConsumerMutation } from './npcdust-mutation-mutex';
import { Enemy } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { Inventory } from '../src/items/Inventory';
import { Game } from '../src/core/Game';
import { Lang } from '../src/i18n/Lang';
import npcDustJson from '../src/data/vanilla-npcdust.json';
import type { GameHooks } from '../src/entities/types';
import type { Enemy as EnemyT } from '../src/entities/Enemy';
import { spawnNpcHitDust, spawnNpcDeathDust } from '../src/entities/NpcHitDust';

const TABLE = npcDustJson as unknown as Record<string, {
  hit?: Array<Record<string, unknown>>; death?: Array<Record<string, unknown>>;
}> & { _meta: Record<string, unknown> };
const sha256 = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
const TMP = realpathSync(tmpdir());

type DustCall = { type: number; x: number; y: number; w: number; h: number; scale: number };

/** 解释器最小钩（85/629 链只消费 spawnDust+实体字段,无 world 面） */
function mkCapturingHooks(captured: DustCall[]): GameHooks {
  return {
    spawnDust: (x: number, y: number, w: number, h: number, type: number,
      sx = 0, sy = 0, alpha = 0, color = null, scale = 1) => {
      const rec: DustCall = { type, x, y, w, h, scale };
      captured.push(rec);
      return { x, y, noGravity: false, vx: sx, vy: sy, scale, fadeIn: 0, noLight: false, color };
    },
  } as unknown as GameHooks;
}

/** 解释器桩实体（85/629 链消费面:vanillaId/ai3/maxHp/盒位） */
const mkMimic = (vanillaId: number, ai3: number, maxHp = 4000): EnemyT =>
  ({
    vanillaId, ai3, hp: maxHp, maxHp, x: 100, y: 100, w: 20, h: 30, cx: 110, cy: 115,
    spawnAlpha: 0, colorRGBA: null, vanillaScale: 1, vx: 0, vy: 0,
  }) as unknown as EnemyT;

/** AI 端到端夹具（bj464 mkHooks 同构：指定 groundLevel 的竖井世界） */
function mkHooks(groundLevel: number, floorRow = 300) {
  const w = new World(120, 400, 1, 'bj479');
  w.groundLevel = groundLevel;
  for (let x = 0; x < 120; x++) {
    for (let y = 0; y < floorRow; y++) w.store.setTileSilent(x, y, 0, 0, 0);
    w.store.setTileSilent(x, floorRow, 1, 0, 0);
  }
  const captured: DustCall[] = [];
  const hooks = {
    world: w, player: null,
    enemies: () => enemies, critters: () => [], projectiles: () => [],
    entities: { nextId: 1, add: () => {} },
    spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {},
    spawnDust: (x: number, y: number, wn: number, hn: number, type: number,
      sx = 0, sy = 0, alpha = 0, color = null, scale = 1) => {
      const rec: DustCall = { type, x, y, w: wn, h: hn, scale };
      captured.push(rec);
      return { x, y, noGravity: false, vx: sx, vy: sy, scale, fadeIn: 0, noLight: false, color };
    },
    notifyInventoryChanged: () => {}, playSfx: () => {}, playSfxFiles: () => {},
    playSfxFile: () => {}, showPickupLabel: () => {}, broadcastParticleOrchestra: () => {},
  };
  const enemies: EnemyT[] = [];
  return { hooks: hooks as unknown as GameHooks, world: w, captured };
}

/** 直接驱 AI_025 核（mimicAI 私有;bj464 同法） */
function tickMimicAI(hooks: GameHooks, e: EnemyT, n: number): void {
  const ai = (e as unknown as { mimicAI: (g: GameHooks, p: null) => void }).mimicAI;
  for (let i = 0; i < n; i++) ai.call(e, hooks, null);
}

beforeEach(() => { vi.spyOn(Math, 'random').mockImplementation(() => 0.5); });
afterEach(() => { vi.restoreAllMocks(); });

// ===================== A. 数据面金标（vanilla-npcdust.json 批6） =====================

describe('BJ479 A. 数据面金标（85/629 表结构+对账复绿）', () => {
  it('85 三段尘档：hit=hitK50/death=n20,idAi3={m:{2:10,3:37}},dust=7（段 1 缺省,HitEffect :89766-89801）', () => {
    expect(TABLE['85']).toEqual({
      hit: [{ dust: 7, idAi3: { m: { 2: 10, 3: 37 } }, hitK: 50, line: 89781 }],
      death: [{ dust: 7, idAi3: { m: { 2: 10, 3: 37 } }, n: 20, line: 89787 }],
    });
  });

  it('629 与 85 共支同表（type==85||type==629;恒段 1 由 AI_025 :25699-25701 承担,表侧同构）', () => {
    expect(TABLE['629']).toEqual(TABLE['85']);
  });

  it('⑤对账复绿：batch6 声明在位+pending 出清 85/629/23（era guard 干跑零漂移配套断言）', () => {
    expect(TABLE._meta.batch6).toBeDefined();          // 提取器原生批6（批5 手工 batch5 已退役）
    expect(TABLE._meta.batch5).toBeUndefined();
    const pend = TABLE._meta.pending as Array<{ types?: number[] }>;
    const ids = new Set(pend.flatMap((p) => p.types ?? []));
    for (const vid of [85, 629, 23]) expect(ids.has(vid), `pending 含 ${vid}`).toBe(false);
  });
});

// ===================== B. 行为锁（解释器消费面） =====================

describe('BJ479 B. 行为锁（85/629 尘链）', () => {
  it('85 段位选尘（段 1/2/3 → 尘 7/10/37）：death 恒 20 发、0 掷', () => {
    for (const [ai3, dust] of [[1, 7], [2, 10], [3, 37]] as const) {
      const captured: DustCall[] = [];
      spawnNpcDeathDust(mkMimic(85, ai3), mkCapturingHooks(captured), 1);
      expect(captured, `ai3=${ai3}`).toHaveLength(20);
      expect(new Set(captured.map((c) => c.type)), `ai3=${ai3}`).toEqual(new Set([dust]));
    }
  });

  it('未锁拍（ai3=0,生成首拍受击）→ m 无 0 键 → 缺省尘 7（原版 num722 初值同相）', () => {
    const captured: DustCall[] = [];
    spawnNpcDeathDust(mkMimic(85, 0), mkCapturingHooks(captured), 1);
    expect(captured).toHaveLength(20);
    expect(new Set(captured.map((c) => c.type))).toEqual(new Set([7]));
  });

  it('受击/死亡两触发面：hit 簇数=ceil(dmg/maxHp×50)（161/4000→3 发）且死亡面恒 20 发,互不串相', () => {
    const captured: DustCall[] = [];
    const e = mkMimic(85, 1);
    spawnNpcHitDust(e, mkCapturingHooks(captured), 1, 161);
    expect(captured).toHaveLength(3);                          // ceil(161/4000×50)=ceil(2.0125)=3
    expect(new Set(captured.map((c) => c.type))).toEqual(new Set([7]));
    const deathCaptured: DustCall[] = [];
    spawnNpcDeathDust(e, mkCapturingHooks(deathCaptured), 1);
    expect(deathCaptured).toHaveLength(20);                    // 死亡相=固定 n20（非簇数公式）
    // 段 2 受击同式：尘 10
    const cap2: DustCall[] = [];
    spawnNpcHitDust(mkMimic(85, 2), mkCapturingHooks(cap2), 1, 161);
    expect(new Set(cap2.map((c) => c.type))).toEqual(new Set([10]));
  });

  it('掷流纯度：85/629 尘链 0 掷（根级 ai[3] 门=读态非掷,原版 HitEffect 该支无 Main.rand）', () => {
    let rolls = 0;
    const orig = Math.random;
    Math.random = () => { rolls++; return 0.5; };
    try {
      const hooks = mkCapturingHooks([]);
      spawnNpcHitDust(mkMimic(85, 2), hooks, 1, 161);
      spawnNpcDeathDust(mkMimic(629, 1), hooks, 1);
      expect(rolls).toBe(0);
    } finally {
      Math.random = orig;
    }
  });

  it('629 恒段端到端：地狱生成 mimicAI 强制段 1（AI_025 :25699-25701）→ 死亡尘恒 7;85 同深锁段 3 → 尘 37', () => {
    // 629：地狱深（tileY 250 > UnderworldLayer=200）——深度支置 3 后被 :25699 强制回 1
    {
      const { hooks, captured } = mkHooks(120);
      const e = Enemy.fromVanilla(629, 40 * 16, 250 * 16) as EnemyT;
      e.y = 300 * 16 - e.h;
      tickMimicAI(hooks, e, 1);
      expect(e.ai3).toBe(1);                                   // 恒段 1（BJ464 锁段链 1:1）
      captured.length = 0;
      spawnNpcDeathDust(e, hooks as unknown as GameHooks, 1);
      expect(captured).toHaveLength(20);
      expect(new Set(captured.map((c) => c.type))).toEqual(new Set([7]));
    }
    // 85 对照：同深锁段 3（地表/地下/地狱三档的第三档）→ 死亡尘 37
    {
      const { hooks, captured } = mkHooks(120);
      const e = Enemy.fromVanilla(85, 40 * 16, 250 * 16) as EnemyT;
      e.y = 300 * 16 - e.h;
      tickMimicAI(hooks, e, 1);
      expect(e.ai3).toBe(3);
      captured.length = 0;
      spawnNpcDeathDust(e, hooks as unknown as GameHooks, 1);
      expect(captured).toHaveLength(20);
      expect(new Set(captured.map((c) => c.type))).toEqual(new Set([37]));
    }
  });
});

// ===================== C. 伪装态名牌门（③:Main.cs:22743/43740 同族） =====================

/** Game 原型桩（sw-bj1 同法） */
function stubGame(): Record<string, any> {
  const g = Object.create(Game.prototype) as unknown as Record<string, any>;
  g.player = {
    x: 160, y: 160, w: 20, h: 42, cx: 170, cy: 181, dead: false,
    equipStats: { tileRange: false, toolboxRange: 0 },
    buffs: { has: () => false },
    cursorItemIconEnabled: false, cursorItemIconID: 0, cursorItemIconText: '',
  };
  g.world = { isJourney: false };
  g.entities = { enemies: [], npcs: [], critters: [] };
  g.renderer = { atlas: null, fullMap: { open: false } };    // atlas null → npcHoverHit ±8 回退盒
  g.input = { mouseX: 170, mouseY: 180 };
  g.camera = { screenToWorld: (sx: number, sy: number) => [sx, sy] };
  g.smartCursor = { wanted: false };
  g.openChestRef = () => null;
  return g;
}

const mkEnemy = (over: Record<string, unknown> = {}): EnemyT =>
  Object.assign(Object.create(Enemy.prototype), {
    id: 9, vanillaId: 85, dead: false, x: 160, y: 160, w: 20, h: 42,
    hp: 45, maxHp: 45, ai0: 0, ai3: 1,
    ...over,
  }) as unknown as EnemyT;

describe('BJ479 C. 伪装态名牌门（85/341/629 族,ai0==0 隐藏/激活显示）', () => {
  it('85 伪装态（ai0==0）悬停不显名（Main.cs:22743 nameOver 门/:43740 悬停排除门同族）', () => {
    const g = stubGame();
    g.entities.enemies = [mkEnemy({ vanillaId: 85, ai0: 0 })];
    (g as unknown as { tickHoverNpcName(): void }).tickHoverNpcName();
    expect(g.player.cursorItemIconText).toBe('');
  });

  it('85 觉醒态（ai0!=0）照常显名+血量行（:43740 `|| ai[0] != 0` 反向支）', () => {
    const g = stubGame();
    g.entities.enemies = [mkEnemy({ vanillaId: 85, ai0: 7 })];
    (g as unknown as { tickHoverNpcName(): void }).tickHoverNpcName();
    expect(g.player.cursorItemIconText).toBe(`${Lang.npcName(85) ?? ''}: 45/45`);
    expect(g.player.cursorItemIconEnabled).toBe(false);
  });

  it('341/629 同门：伪装隐藏/觉醒显示（:43740 排除族三型全覆盖）', () => {
    for (const vid of [341, 629]) {
      const g = stubGame();
      g.entities.enemies = [mkEnemy({ vanillaId: vid, ai0: 0 })];
      (g as unknown as { tickHoverNpcName(): void }).tickHoverNpcName();
      expect(g.player.cursorItemIconText, `${vid} 伪装态`).toBe('');
      g.entities.enemies = [mkEnemy({ vanillaId: vid, ai0: 1 })];
      (g as unknown as { tickHoverNpcName(): void }).tickHoverNpcName();
      expect(g.player.cursorItemIconText, `${vid} 觉醒态`).toBe(`${Lang.npcName(vid) ?? ''}: 45/45`);
    }
  });
});

// ===================== D. 变异自证（原子+逐字节还原+sha256,共锁） =====================

describe('BJ479 D. 变异自证', () => {
  const CONSUMER = join(process.cwd(), 'src', 'entities', 'NpcHitDust.ts');
  const EXTRACTOR = join(process.cwd(), 'tools', 'extract-npcdust.mjs');
  const spawnVitest = (filter: string) => spawnSync('npx', ['vitest', 'run', 'tests/bj479-mimic-dust-nameplate.test.ts', '--no-file-parallelism', '-t', filter], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 600_000,
    env: { ...process.env, SW_BJ479_MUT: '1' },   // ★子进程豁免残留检测闸（对变异文件跑 B 面）
  });

  beforeAll(() => { gateConsumerMutation('SW_BJ479_MUT', CONSUMER); });

  it('M1 摘解释器 idAi3 消费（恒缺省尘）→ 段位选尘判别红', () => {
    lockConsumerMutation();
    const PRISTINE = readFileSync(CONSUMER, 'utf8');
    const before = sha256(CONSUMER);
    const TRIGGER = 'st.idAi3 != null ? (st.idAi3.m[e.ai3 ?? 0] ?? st.dust) : st.dust';
    expect(PRISTINE).toContain(TRIGGER);
    try {
      writeFileSync(CONSUMER, PRISTINE.replace(TRIGGER, 'st.dust'));   // ★变异:恒缺省尘（纯表达式,防注释吞闭合括号=解析死伪红）
      const r = spawnVitest('段位选尘');
      expect(r.status).not.toBe(0);               // ★变异证红:段 2/3 尘型判别捕获
      expect(r.stdout).toContain('段位选尘');
    } finally {
      writeFileSync(CONSUMER, PRISTINE);
    }
    expect(sha256(CONSUMER)).toBe(before);       // 逐字节还原
    unlockConsumerMutation();
  });

  it('M2 摘受击簇 ceil（→floor）→ 簇数公式判别红', () => {
    lockConsumerMutation();
    const PRISTINE = readFileSync(CONSUMER, 'utf8');
    const before = sha256(CONSUMER);
    const TRIGGER = "if (el.hitK != null) return Math.ceil((dmg / e.maxHp) * el.hitK);";
    expect(PRISTINE).toContain(TRIGGER);
    try {
      writeFileSync(CONSUMER, PRISTINE.replace(TRIGGER, 'if (el.hitK != null) return Math.floor((dmg / e.maxHp) * el.hitK); // ★变异:ceil→floor'));
      const r = spawnVitest('两触发面');
      expect(r.status).not.toBe(0);               // ★变异证红:3 发 vs floor=2 判别捕获
      expect(r.stdout).toContain('两触发面');
    } finally {
      writeFileSync(CONSUMER, PRISTINE);
    }
    expect(sha256(CONSUMER)).toBe(before);
    unlockConsumerMutation();
  });

  it('M3 提取器 tmp 变异体摘 ai3Locals 消费支 → 85 探针退化为桶尾值 37（provenance 物证）', () => {
    const before = sha256(EXTRACTOR);            // 真工具零接触哨兵
    const dir = mkdtempSync(join(TMP, 'bj479-mut-'));
    try {
      const src = readFileSync(EXTRACTOR, 'utf8');
      const TRIGGER = 'if (ai3Locals.has(s)) {';
      expect(src).toContain(TRIGGER);
      const mutant = join(dir, 'extract-npcdust-mutant.mjs');
      writeFileSync(mutant, src
        .replace("const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');", `const ROOT = ${JSON.stringify(process.cwd())};`)
        .replace(TRIGGER, 'if (false && ai3Locals.has(s)) { // ★变异:摘 ai3Locals 消费支（typedLocal 桶尾错值复现）'));
      const r = spawnSync('node', [mutant, '--probe', '85'], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
      expect(r.status).toBe(0);
      // 桶尾值 37（未建模时的静默错值）=本刀登记线承载力的物证
      expect(r.stdout).toContain('"dust":37');
      expect(r.stdout).not.toContain('idAi3');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    expect(sha256(EXTRACTOR)).toBe(before);
  });
});
