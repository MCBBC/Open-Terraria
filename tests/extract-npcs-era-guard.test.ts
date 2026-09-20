import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync, mkdtempSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ★债刀-3（2026-09-17）：extract-npcs.mjs producer 退役态守卫——1405 锚时代 producer
// 对 vanilla-npcs.json 纯全量覆写（不读现有），误重跑一次洗掉 587-696 全部新增 NPC
// + critter/color/value/boss/rarity/hide 白名单外字段 + 586 以内 1457 终值修正。
// vanilla-atlas.mjs 全量重跑四连事故同族 → 照 atlas era guard 判例落闸：
// 检测现库含 producer 输出面之外的键（id>586 或白名单外字段）即拒 exit 1+指引走
// recon-npc-1456-1457.mjs --fix 活通道；--force-full 单旗仍拒，原地强推须双旗
// --force-full --overwrite-append-era。守卫测试习语 = sw-fx23-atlas-era-guard.test.ts。
//
// ★BJ207 2026-09-20 ——— 合并语义提取器守卫（extract-npccolors / extract-critters,
// preflight 事故防再犯闸）：两工具读真实现库并【原地合入】,裸跑一次=写库（preflight
// 对拍曾裸跑洗库一次,三方字节全等零漂移纯属侥幸,机械闸此前缺位）。照 era guard 家族/
// BJ191 处方落闸：缺省=【干跑对拍】零写盘（合入产物 vs 输入基线逐字节对拍,漂移
// exit 1+物证）;写盘两通道都必须显式——SW_OUT=<dir>（沙箱）或 --write-real（逃生门,
// 真实现库合入流）;探测注入面 SW_NPCS_JSON 与 --write-real 混用而 SW_OUT 缺省=读夹具
// 写真库（g1 footgun 洗库面）→ 拒 exit 1。附带定谳（BJ207）：extract-npccolors 旧
// find 取首个赋值违背顺序覆盖终值语义（523:块内 alpha=0 后 alpha=255,终值 255）——
// 已修 findLast,干跑对拍恢复零漂移。守卫测试=下方 BJ207 段。

const SCRIPT = join(process.cwd(), 'tools', 'extract-npcs.mjs');
const LIVE = join(process.cwd(), 'public', 'sprites', 'vanilla-npcs.json');
const md5 = (p: string) => createHash('md5').update(readFileSync(p)).digest('hex');

/** 增量夹具：id>586 条目 + 白名单外字段（守卫两条判据各踩一条） */
const INCREMENT_FIXTURE = JSON.stringify({
  1: { id: 1, name: 'Blue Slime', frames: 2, lifeMax: 25, color: '175,220,90' },  // 白名单外字段
  587: { id: 587, name: 'Eyeball Flying Fish', frames: 4, lifeMax: 300 },          // id>586
});
/** 零增量夹具：纯 producer 输出面字段（守卫须放行） */
const CLEAN_FIXTURE = JSON.stringify({
  1: { id: 1, name: 'Blue Slime', frames: 2, lifeMax: 25, damage: 7, defense: 2 },
  3: { id: 3, name: 'Zombie', frames: 3, lifeMax: 45, damage: 14 },
});

describe('extract-npcs 追加时代守卫（债刀-3）', () => {
  it('行为面:现库增量态下默认运行被拒（exit 1+活通道指引）,现库字节零改动', () => {
    const before = md5(LIVE);
    const r = spawnSync('node', [SCRIPT], { cwd: process.cwd(), encoding: 'utf8', timeout: 120_000 });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('拒绝全量重写');
    expect(r.stderr).toContain('recon-npc-1456-1457.mjs');   // 活通道指引
    expect(r.stderr).toContain('--fix');
    expect(r.stderr).toContain('--force-full');
    expect(r.stderr).toContain('110 条');                     // 真实增量物证（587-696）
    expect(md5(LIVE)).toBe(before);                           // 拒绝路径零写盘
  });

  it('行为面:--force-full 单旗在增量态仍被拒（双旗第二键 --overwrite-append-era 在位）', () => {
    const before = md5(LIVE);
    const r = spawnSync('node', [SCRIPT, '--force-full'], { cwd: process.cwd(), encoding: 'utf8', timeout: 120_000 });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('拒绝全量重写');
    expect(r.stderr).toContain('--overwrite-append-era');
    expect(md5(LIVE)).toBe(before);
  });

  it('结构锁:守卫块内零写盘(拒绝路径的结构前提)+双旗逃生门与探测式在位', () => {
    const src = readFileSync(SCRIPT, 'utf8');
    const guardStart = src.indexOf('追加时代守卫');
    const guardEnd = src.indexOf('process.exit(1)', guardStart);
    expect(guardStart).toBeGreaterThan(-1);
    expect(guardEnd).toBeGreaterThan(guardStart);
    const guardBlock = src.slice(guardStart, guardEnd);
    expect(guardBlock).not.toContain('writeFileSync(');   // 拒绝路径零写盘
    expect(src).toContain('--force-full');
    expect(src).toContain('--overwrite-append-era');
    // 探测式=两条键集判据（id>MAX_ID 白名单外字段），与现库真实增量同源
    expect(src).toContain('beyondIds');
    expect(src).toContain('extraFields');
    // 活通道锚在位
    expect(src).toContain('recon-npc-1456-1457.mjs');
  });

  it('行为面:双旗逃生门放行（SW_OUT 注入 /tmp,producer 全量重算,现库零接触）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'npcs-guard-'));
    const out = join(dir, 'full.json');
    const before = md5(LIVE);
    try {
      const r = spawnSync('node', [SCRIPT, '--force-full', '--overwrite-append-era'], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_OUT: out },
      });
      expect(r.status).toBe(0);
      const prod = JSON.parse(readFileSync(out, 'utf8')) as Record<string, unknown>;
      expect(Object.keys(prod).length).toBeGreaterThan(500);   // 1405 全量重算产物
      expect(md5(LIVE)).toBe(before);                           // 现库零接触
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:零增量夹具放行（守卫不误伤;SW_NPCS_JSON/SW_OUT 双注入,零接触现库）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'npcs-guard-'));
    const fixture = join(dir, 'clean.json');
    const out = join(dir, 'out.json');
    writeFileSync(fixture, CLEAN_FIXTURE);
    const before = md5(LIVE);
    try {
      const r = spawnSync('node', [SCRIPT], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_NPCS_JSON: fixture, SW_OUT: out },
      });
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('npcs');
      const written = JSON.parse(readFileSync(out, 'utf8')) as Record<string, unknown>;
      expect(Object.keys(written).length).toBeGreaterThan(500);
      expect(md5(LIVE)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ★变异（判别力）:摘掉守卫判据 → 增量夹具被静默洗掉（exit 0+写盘）。
  // 证明「守卫是增量态下唯一的拦截面」,摘 guard 必红。
  it('变异:摘守卫判据后增量夹具被静默全量覆写(证明 guard 判别力)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'npcs-guard-'));
    const fixture = join(dir, 'incr.json');
    const out = join(dir, 'out.json');
    const mutant = join(dir, 'extract-npcs-mutant.mjs');
    writeFileSync(fixture, INCREMENT_FIXTURE);
    const src = readFileSync(SCRIPT, 'utf8');
    expect(src).toContain('beyondIds.length > 0 || extraFields.size > 0');
    writeFileSync(mutant, src.replace(
      'const appendEra = beyondIds.length > 0 || extraFields.size > 0;',
      'const appendEra = false; // ★变异:守卫判据摘除',
    ));
    const before = md5(LIVE);
    try {
      const r = spawnSync('node', [mutant], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_NPCS_JSON: fixture, SW_OUT: out },
      });
      expect(r.status).toBe(0);                                 // 无 guard → 放行
      const written = JSON.parse(readFileSync(out, 'utf8')) as Record<string, { id: number }>;
      // 1405 全量覆写:夹具增量(id 587/color 字段)已被洗掉——守卫缺失即事故重演
      expect(written['587']).toBeUndefined();
      expect(written['1'] && (written['1'] as Record<string, unknown>).color).toBeUndefined();
      expect(md5(LIVE)).toBe(before);                           // 注入面隔离,现库零接触
    } finally {
      for (const f of [fixture, out, mutant]) { try { unlinkSync(f); } catch { /* noop */ } }
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ★g1 footgun 硬化测试（红蓝-J1②,2026-09-18）：探测 env（SW_NPCS_JSON）设置而 SW_OUT
  //   缺省 → 拒跑 exit 1（fail-closed——守卫探测读干净夹具零增量放行,写盘却落缺省
  //   现库路径 public/sprites/vanilla-npcs.json=绕守卫洗库）。同场景 + 显式 SW_OUT →
  //   放行;变异=摘硬化 → footgun 复现（探测夹具+缺 SW_OUT 下写盘落「缺省现库」路径,
  //   变异里把缺省 OUT_JSON 换成沙箱假现库=真现库副本+id587 增量物证种子,真现库零接触）。
  it('行为面:探测 env 设置而 SW_OUT 缺省 → 拒跑 exit 1（footgun fail-closed）,现库字节零改动', () => {
    const dir = mkdtempSync(join(tmpdir(), 'npcs-guard-'));
    const fixture = join(dir, 'clean.json');
    writeFileSync(fixture, CLEAN_FIXTURE);
    const before = md5(LIVE);
    try {
      const env: Record<string, string | undefined> = {
        ...process.env, SW_NPCS_JSON: fixture,
      };
      delete env.SW_OUT;   // footgun 场景=写盘路径缺省（显式剥除防运行环境污染）
      const r = spawnSync('node', [SCRIPT], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: env as NodeJS.ProcessEnv,
      });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('SW_OUT 缺省');
      expect(r.stderr).toContain('fail-closed');
      expect(r.stderr).toContain('探测注入面');
      expect(md5(LIVE)).toBe(before);                            // 拒绝路径零写盘
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:同 footgun 场景 + 显式 SW_OUT → 放行（写盘落 SW_OUT）,现库零接触', () => {
    const dir = mkdtempSync(join(tmpdir(), 'npcs-guard-'));
    const fixture = join(dir, 'clean.json');
    const out = join(dir, 'out.json');
    writeFileSync(fixture, CLEAN_FIXTURE);
    const before = md5(LIVE);
    try {
      const r = spawnSync('node', [SCRIPT], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_NPCS_JSON: fixture, SW_OUT: out },
      });
      expect(r.status).toBe(0);                                  // 硬化只拦 SW_OUT 缺省
      const written = JSON.parse(readFileSync(out, 'utf8')) as Record<string, unknown>;
      expect(Object.keys(written).length).toBeGreaterThan(500);  // 全量重算产物落显式 SW_OUT
      expect(md5(LIVE)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ★变异（判别力）:摘 g1 硬化 → 探测夹具（零增量）+缺 SW_OUT 下守卫被绕过,写盘落
  //   缺省「现库」路径=footgun 复现。变异里把缺省 OUT_JSON 换成沙箱假现库（种子=
  //   真现库副本+id587 增量物证）——重产洗掉 587=洗库物证;真现库零接触。
  it('变异:摘 g1 硬化后探测夹具+缺 SW_OUT 写盘落缺省现库路径（587 被洗=footgun 复现）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'npcs-guard-'));
    const fakeLive = join(dir, 'live');
    mkdirSync(fakeLive, { recursive: true });
    // 假现库=真现库副本 + id587（producer 输出面外增量=洗库物证）
    const seeded = JSON.parse(readFileSync(LIVE, 'utf8')) as Record<string, Record<string, unknown>>;
    seeded['587'] = { id: 587, name: 'FootgunWitness', frames: 4, lifeMax: 300 };
    writeFileSync(join(fakeLive, 'vanilla-npcs.json'), JSON.stringify(seeded));
    const fixture = join(dir, 'clean.json');
    writeFileSync(fixture, CLEAN_FIXTURE);
    const src = readFileSync(SCRIPT, 'utf8');
    const TRIGGER = 'const PROBE_ENV_SET = process.env.SW_NPCS_JSON !== undefined;';
    const OUT_LINE = 'const OUT_JSON = process.env.SW_OUT ?? `${ROOT}/game/public/sprites/vanilla-npcs.json`;';
    expect(src).toContain(TRIGGER);
    expect(src).toContain(OUT_LINE);
    const mutant = join(dir, 'extract-npcs-mutant-g1.mjs');
    writeFileSync(mutant, src
      .replace(TRIGGER, 'const PROBE_ENV_SET = false; // ★变异:g1 硬化摘除（红蓝-J1②）')
      .replace(OUT_LINE, 'const OUT_JSON = process.env.SW_MUTANT_FAKE_LIVE;'));
    const before = md5(LIVE);
    try {
      const env: Record<string, string | undefined> = {
        ...process.env, SW_NPCS_JSON: fixture, SW_MUTANT_FAKE_LIVE: join(fakeLive, 'vanilla-npcs.json'),
      };
      delete env.SW_OUT;
      const r = spawnSync('node', [mutant], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: env as NodeJS.ProcessEnv,
      });
      expect(r.status).toBe(0);                                 // 硬化摘除 → footgun 放行
      const washed = JSON.parse(readFileSync(join(fakeLive, 'vanilla-npcs.json'), 'utf8')) as Record<string, Record<string, unknown>>;
      expect(washed['587']).toBeUndefined();                    // 假现库被重产洗掉增量=洗库复现
      expect(washed['1']?.lifeMax).toBe(25);                    // 写盘确为重产全量（非空非原样）
      expect(md5(LIVE)).toBe(before);                           // 真现库零接触（OUT_JSON 已换沙箱）
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ============================================================
// ★BJ207 2026-09-20 ——— 合并语义提取器守卫（extract-npccolors / extract-critters，
// 头注见上）：缺省干跑零写盘 + 写盘显式通道 + g1 footgun 拒跑 + 漂移拦截 + 判别力变异。
// ============================================================
describe('extract-npccolors / extract-critters 合并语义守卫（BJ207 干跑 fail-closed）', () => {
  const SCRIPTS = {
    npccolors: join(process.cwd(), 'tools', 'extract-npccolors.mjs'),
    critters: join(process.cwd(), 'tools', 'extract-critters.mjs'),
  } as const;
  type Tool = keyof typeof SCRIPTS;
  const md5Of = md5;   // 既有 helper 同义
  /** 漂移夹具种子：npccolors 摘 1 号 color（合入必回填）;critters 摘 46 号 critter 旗 */
  const seededFixture = (tool: Tool): Record<string, Record<string, unknown>> => {
    const j = JSON.parse(readFileSync(LIVE, 'utf8')) as Record<string, Record<string, unknown>>;
    if (tool === 'npccolors') delete j['1'].color;
    else delete j['46'].critter;
    return j;
  };
  /** 见证字段断言：夹具摘掉的字段被合入回填=「写盘已发生」物证 */
  const witnessOf = (tool: Tool, j: Record<string, Record<string, unknown>>): unknown =>
    tool === 'npccolors' ? j['1']?.color : j['46']?.critter;

  for (const tool of Object.keys(SCRIPTS) as Tool[]) {
    it(`行为面[${tool}]:缺省=干跑对拍零写盘零漂移（exit 0,现库字节恒等）`, () => {
      const before = md5Of(LIVE);
      const r = spawnSync('node', [SCRIPTS[tool]], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
      expect(r.status).toBe(0);
      expect(r.stderr).toContain('干跑对拍');
      expect(r.stderr).toContain('零漂移');
      expect(r.stderr).toContain('SW_OUT');                       // 写盘显式通道指引在位
      expect(md5Of(LIVE)).toBe(before);                           // 缺省零写盘
    });

    it(`行为面[${tool}]:SW_OUT 沙箱写盘（产物与现库 byte-perfect,现库零接触）`, () => {
      const dir = mkdtempSync(join(tmpdir(), 'npcs-merge-guard-'));
      const before = md5Of(LIVE);
      try {
        const r = spawnSync('node', [SCRIPTS[tool]], {
          cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
          env: { ...process.env, SW_OUT: dir },
        });
        expect(r.status).toBe(0);
        const out = join(dir, 'vanilla-npcs.json');
        expect(readFileSync(out).equals(readFileSync(LIVE))).toBe(true);   // 零漂移态=byte-perfect
        expect(md5Of(LIVE)).toBe(before);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it(`行为面[${tool}]:--write-real+SW_OUT 同给 → SW_OUT 优先（沙箱落盘,真库零接触）`, () => {
      const dir = mkdtempSync(join(tmpdir(), 'npcs-merge-guard-'));
      const before = md5Of(LIVE);
      try {
        const r = spawnSync('node', [SCRIPTS[tool], '--write-real'], {
          cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
          env: { ...process.env, SW_OUT: dir },
        });
        expect(r.status).toBe(0);
        expect(r.stderr).toContain('SW_OUT 优先');
        expect(existsSync(join(dir, 'vanilla-npcs.json'))).toBe(true);
        expect(md5Of(LIVE)).toBe(before);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it(`行为面[${tool}]:探测 env+--write-real 而 SW_OUT 缺省 → 拒跑 exit 1（footgun fail-closed）`, () => {
      const dir = mkdtempSync(join(tmpdir(), 'npcs-merge-guard-'));
      const fixture = join(dir, 'base.json');
      writeFileSync(fixture, JSON.stringify(seededFixture(tool)));
      const before = md5Of(LIVE);
      try {
        const env: Record<string, string | undefined> = {
          ...process.env, SW_NPCS_JSON: fixture,
        };
        delete env.SW_OUT;   // footgun 场景=写盘路径缺省（显式剥除防运行环境污染）
        const r = spawnSync('node', [SCRIPTS[tool], '--write-real'], {
          cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: env as NodeJS.ProcessEnv,
        });
        expect(r.status).toBe(1);
        expect(r.stderr).toContain('fail-closed');
        expect(r.stderr).toContain('探测与写盘分离');
        expect(md5Of(LIVE)).toBe(before);                        // 拒绝路径零写盘
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it(`行为面[${tool}]:干跑对拍漂移拦截（夹具缺字段 → exit 1+键物证,夹具/现库双零写）`, () => {
      const dir = mkdtempSync(join(tmpdir(), 'npcs-merge-guard-'));
      const fixture = join(dir, 'base.json');
      writeFileSync(fixture, JSON.stringify(seededFixture(tool)));
      const before = md5Of(LIVE);
      try {
        const r = spawnSync('node', [SCRIPTS[tool]], {
          cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
          env: { ...process.env, SW_NPCS_JSON: fixture },        // 无 SW_OUT/--write-real=干跑
        });
        expect(r.status).toBe(1);
        expect(r.stderr).toContain('漂移 1 键');                  // 摘一字段=恰好 1 键漂移
        expect(md5Of(fixture)).not.toBe(md5Of(LIVE));            // 夹具确为摘字段种子（非空判据）
        expect(md5Of(LIVE)).toBe(before);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it(`变异[${tool}]:摘守卫判据 → 缺省跑静默写盘落「现库」路径（写盘已发生=事故重演,证明守卫是唯一拦截面）`, () => {
      const dir = mkdtempSync(join(tmpdir(), 'npcs-merge-guard-'));
      const fakeLive = join(dir, 'vanilla-npcs.json');
      writeFileSync(fakeLive, JSON.stringify(seededFixture(tool)));   // 假现库=摘字段种子
      const src = readFileSync(SCRIPTS[tool], 'utf8');
      const TRIGGER = 'if (!OUT_PATH && !WRITE_REAL) {';
      const LIVE_LINE = 'const LIVE_OUT = `${ROOT}/game/public/sprites/vanilla-npcs.json`;';
      expect(src).toContain(TRIGGER);
      expect(src).toContain(LIVE_LINE);
      const mutant = join(dir, 'mutant.mjs');
      writeFileSync(mutant, src
        .replace(TRIGGER, 'if (false) { // ★变异:干跑守卫判据摘除')
        .replace(LIVE_LINE, 'const LIVE_OUT = process.env.SW_MUTANT_FAKE_LIVE;'));
      const before = md5Of(LIVE);
      try {
        const env: Record<string, string | undefined> = {
          ...process.env, SW_MUTANT_FAKE_LIVE: fakeLive,
        };
        delete env.SW_OUT;
        delete env.SW_NPCS_JSON;
        const r = spawnSync('node', [mutant], {
          cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: env as NodeJS.ProcessEnv,
        });
        expect(r.status).toBe(0);                                // 守卫摘除 → 放行
        const washed = JSON.parse(readFileSync(fakeLive, 'utf8')) as Record<string, Record<string, unknown>>;
        expect(witnessOf(tool, washed)).toBeDefined();           // 摘掉的字段被合入回填=写盘已发生（事故重演）
        expect(md5Of(LIVE)).toBe(before);                        // 真现库零接触（LIVE_OUT 已换沙箱）
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }

  it('结构锁:干跑分支零 writeFileSync+显式通道双锚+footgun 拒跑块在位（双工具）', () => {
    for (const script of Object.values(SCRIPTS)) {
      const src = readFileSync(script, 'utf8');
      const dryStart = src.indexOf('if (!OUT_PATH && !WRITE_REAL) {');
      const elseMark = src.indexOf('} else {', dryStart);
      expect(dryStart).toBeGreaterThan(-1);
      expect(elseMark).toBeGreaterThan(dryStart);
      expect(src.slice(dryStart, elseMark)).not.toContain('writeFileSync(');   // 干跑分支零写盘的结构前提
      expect(src).toContain('--write-real');
      expect(src).toContain('SW_NPCS_JSON');
      expect(src).toContain('探测与写盘分离');
    }
  });
});
