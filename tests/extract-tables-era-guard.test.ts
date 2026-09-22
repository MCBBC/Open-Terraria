import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// ★BJ284（2026-09-22）：五件小表提取器 era guard 落闸守卫测试（banners / mapcolors /
// tile-collision / npcbestiaryoffset / cursor-icon-tables）。npcdrops（BJ261）同款习语：
//
// 行为面：缺省干跑对拍零写盘（md5 canary）/ SW_OUT 沙箱 byte-perfect / 双旗互斥 /
//   非 1457 禁写真库 / g1 探测注入面与 --write-real 混用拒 / fresh-only（现库退化缺键型,
//   ★G-1/S3 处方）与 live-only（洗库预警）双向轴。
// 变异：M1 摘干跑门（OUT_JSON null 臂→假现库,哨兵被覆写=裸跑静默写库复现,真现库零接触）/
//   M2 毒化锚（签名/基数护栏 fail-loud 指名）。mutant 置 OS tmp 时 ROOT 派生自
//   import.meta.url 的工具须先 ROOT_TRIGGER 前置重锚（era-guard-family ④ 习语）。
// 落闸定谳（BJ284 对拍实证）：五器 1457 fresh 与现库逐字节零差;1458 交叉重放亦零差
//   （白名单 {1457,1458} 依据）。

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const md5 = (p: string) => createHash('md5').update(readFileSync(p)).digest('hex');
// ★macOS /var→/private/var 符号链接：临时目录一律 realpath（extract-itemrare/petai 同案）
const TMP = realpathSync(tmpdir());
const sandbox = (dir: string) => ({ ...process.env, SW_OUT: dir });

interface ToolSpec {
  name: string;
  live: string;
  probe: string;
  outName: string;
  rejectTag: string;
  rootTrigger: string | null; // ROOT 派生自 import.meta.url 的工具,mutant 置 tmp 须前置重锚
  rootAbs: string | null;
  m2: { trigger: string; poison: string; errTag: string };
}

const TOOLS: ToolSpec[] = [
  {
    name: 'extract-banners.mjs',
    live: join(ROOT, 'src', 'data', 'vanilla-banners.json'),
    probe: 'SW_BANNERS_JSON',
    outName: 'vanilla-banners.json',
    rejectTag: '[extract-banners]',
    rootTrigger: null, // 绝对路径 ROOT,mutant 免重锚
    rootAbs: null,
    m2: {
      trigger: "for (const sig of ['public static int NPCtoBanner', 'public static int BannerToItem', 'public static int BannerToNPC'])",
      poison: "for (const sig of ['public static int NPCtoBannerX', 'public static int BannerToItem', 'public static int BannerToNPC'])",
      errTag: 'NPCtoBannerX',
    },
  },
  {
    name: 'extract-mapcolors.mjs',
    live: join(ROOT, 'src', 'data', 'vanilla-mapcolors.json'),
    probe: 'SW_MAPCOLORS_JSON',
    outName: 'vanilla-mapcolors.json',
    rejectTag: '[extract-mapcolors]',
    rootTrigger: null,
    rootAbs: null,
    m2: {
      trigger: "const INIT_SIG = 'public static void Initialize()';",
      poison: "const INIT_SIG = 'public static void InitializeX()';",
      errTag: 'InitializeX() 签名未找到',
    },
  },
  {
    name: 'extract-tile-collision.mjs',
    live: join(ROOT, 'src', 'data', 'vanilla-tilecollision.json'),
    probe: 'SW_TILECOLLISION_JSON',
    outName: 'vanilla-tilecollision.json',
    rejectTag: '[extract-tile-collision]',
    rootTrigger: "const ROOT = new URL('../../', import.meta.url).pathname;",
    rootAbs: '/Users/vinlic/Project/GLM/SandboxWorld/',
    m2: {
      trigger: '/Platforms = Factory\\.CreateBoolSet\\(([^)]*)\\)/',
      poison: '/PlatformsX = Factory\\.CreateBoolSet\\(([^)]*)\\)/',
      errTag: 'Platforms = Factory.CreateBoolSet 未找到',
    },
  },
  {
    name: 'extract-npcbestiaryoffset.mjs',
    live: join(ROOT, 'src', 'data', 'vanilla-npcbestiaryoffset.json'),
    probe: 'SW_NPCBESTIARYOFFSET_JSON',
    outName: 'vanilla-npcbestiaryoffset.json',
    rejectTag: '[extract-npcbestiaryoffset]',
    rootTrigger: "const ROOT = new URL('../../', import.meta.url).pathname;   // 仓库根（SandboxWorld/）",
    rootAbs: '/Users/vinlic/Project/GLM/SandboxWorld/',
    m2: {
      trigger: 'if (total < 600) throw new Error(`[extract-npcbestiaryoffset] 锚点失配: 合并基数 ${total} < 600（解析面漂移,禁止静默半表）`);',
      poison: 'if (total < 6000) throw new Error(`[extract-npcbestiaryoffset] 锚点失配: 合并基数 ${total} < 6000（解析面漂移,禁止静默半表）`);',
      errTag: '< 6000',
    },
  },
  {
    name: 'extract-cursor-icon-tables.mjs',
    live: join(ROOT, 'src', 'data', 'vanilla-hovericons.json'),
    probe: 'SW_HOVERICONS_JSON',
    outName: 'vanilla-hovericons.json',
    rejectTag: '[extract-cursor-icon-tables]',
    rootTrigger: null,
    rootAbs: null,
    m2: {
      trigger: "['beds', Object.keys(beds).length, 50],",
      poison: "['beds', Object.keys(beds).length, 5000],",
      errTag: 'beds 55 < 5000',
    },
  },
];

const spawn = (script: string, args: string[] = [], env: Record<string, string> = {}) =>
  spawnSync('node', [script, ...args], { cwd: ROOT, encoding: 'utf8', timeout: 300_000, env: { ...process.env, ...env } });

describe('extract-tables era guard（BJ284 五小件落闸）', () => {
  for (const T of TOOLS) {
    const script = join(ROOT, 'tools', T.name);

    it(`${T.name} 行为面:缺省干跑对拍零写盘（exit 0+双向零差+现库字节零改动）`, () => {
      const before = md5(T.live);
      const r = spawn(script);
      expect(r.status).toBe(0);
      expect(r.stderr).toContain('干跑对拍');
      expect(r.stderr).toContain('双向零差');
      expect(r.stderr).toContain('零写盘');
      expect(md5(T.live)).toBe(before);
    });

    it(`${T.name} 行为面:SW_OUT 沙箱重产对现库 byte-perfect（幂等回归）`, () => {
      const dir = mkdtempSync(join(TMP, 'tables-guard-'));
      const before = md5(T.live);
      try {
        const r = spawn(script, [], sandbox(dir));
        expect(r.status).toBe(0);
        expect(r.stderr).toContain('SW_OUT 沙箱');
        expect(readFileSync(join(dir, T.outName)).equals(readFileSync(T.live))).toBe(true);
        expect(md5(T.live)).toBe(before);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it(`${T.name} 行为面:SW_OUT 与 --write-real 双旗互斥拒（exit 1+现库零改动）`, () => {
      const dir = mkdtempSync(join(TMP, 'tables-guard-'));
      const before = md5(T.live);
      try {
        const r = spawn(script, ['--write-real'], sandbox(dir));
        expect(r.status).toBe(1);
        expect(r.stderr).toContain('双旗互斥');
        expect(md5(T.live)).toBe(before);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it(`${T.name} 行为面:非 1457 禁写真库（1458 --write-real 拒;1456 显式拒+退役指引）`, () => {
      const before = md5(T.live);
      const r8 = spawn(script, ['--write-real'], { SW_ITEM_VER: '1458' });
      expect(r8.status).toBe(1);
      expect(r8.stderr).toContain('拒绝写真库');
      const r6 = spawn(script, [], { SW_ITEM_VER: '1456' });
      expect(r6.status).toBe(1);
      expect(r6.stderr).toContain('1456 锚集已退役');
      expect(md5(T.live)).toBe(before);
    });

    it(`${T.name} 行为面:g1 探测注入面（${T.probe}）与 --write-real 混用拒`, () => {
      const before = md5(T.live);
      const r = spawn(script, ['--write-real'], { [T.probe]: '/tmp/whatever.json' });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('探测注入面');
      expect(md5(T.live)).toBe(before);
    });

    it(`${T.name} 行为面:fresh-only 轴（现库退化=空对象）干跑拒跑（exit 1+fresh-only 物证）`, () => {
      const dir = mkdtempSync(join(TMP, 'tables-guard-'));
      try {
        writeFileSync(join(dir, 'degraded.json'), '{}');
        const r = spawn(script, [], { [T.probe]: join(dir, 'degraded.json') });
        expect(r.status).toBe(1);
        expect(r.stderr).toContain('fresh-only');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it(`${T.name} 行为面:live-only 轴（现库领先/洗库预警）干跑拒跑（exit 1+live-only 物证）`, () => {
      const dir = mkdtempSync(join(TMP, 'tables-guard-'));
      try {
        const live = JSON.parse(readFileSync(T.live, 'utf8'));
        (live as Record<string, unknown>).__ahead_sentinel__ = { ahead: true };   // 领先键
        writeFileSync(join(dir, 'ahead.json'), JSON.stringify(live));
        const r = spawn(script, [], { [T.probe]: join(dir, 'ahead.json') });
        expect(r.status).toBe(1);
        expect(r.stderr).toContain('live-only');
        expect(r.stderr).toContain('现库独有');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it(`${T.name} 变异 M1:摘干跑门后裸跑静默写「现库」（证明缺省零写盘是唯一拦截面）`, () => {
      const dir = mkdtempSync(join(TMP, 'tables-guard-'));
      const fake = join(dir, T.outName);
      writeFileSync(fake, '{"seeded":true}');   // 哨兵种子（≠工具产物,可判写发生）
      const before = md5(T.live);
      try {
        let src = readFileSync(script, 'utf8');
        // ROOT_TRIGGER 前置重锚（import.meta.url 派生工具的 mutant 置 tmp 必备习语）
        if (T.rootTrigger && T.rootAbs) {
          expect(src).toContain(T.rootTrigger);
          src = src.replace(T.rootTrigger, `const ROOT = ${JSON.stringify(T.rootAbs)};`);
        }
        const TD = `/${T.outName}\` : null);`;
        expect(src).toContain(TD);
        const mutant = join(dir, 'mutant.mjs');
        writeFileSync(mutant, src.replace(TD, `/${T.outName}\` : ${JSON.stringify(fake)}); // ★变异:干跑门摘除`));
        const r = spawnSync('node', [mutant], { cwd: ROOT, encoding: 'utf8', timeout: 300_000 });
        expect(r.status).toBe(0);
        expect(readFileSync(fake, 'utf8')).not.toContain('"seeded":true');   // 哨兵被覆写=写发生
        expect(md5(fake)).toBe(md5(T.live));    // 写的就是全量重产产物
        expect(md5(T.live)).toBe(before);       // 真现库零接触
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it(`${T.name} 变异 M2:毒化锚后 fail-loud（exit≠0+锚点失配指名）`, () => {
      const dir = mkdtempSync(join(TMP, 'tables-guard-'));
      const before = md5(T.live);
      try {
        let src = readFileSync(script, 'utf8');
        if (T.rootTrigger && T.rootAbs) {
          src = src.replace(T.rootTrigger, `const ROOT = ${JSON.stringify(T.rootAbs)};`);
        }
        expect(src).toContain(T.m2.trigger);
        const mutant = join(dir, 'mutant-anchor.mjs');
        writeFileSync(mutant, src.replace(T.m2.trigger, T.m2.poison));
        const r = spawnSync('node', [mutant], { cwd: ROOT, encoding: 'utf8', timeout: 300_000, env: sandbox(dir) });
        expect(r.status).not.toBe(0);
        expect(r.stderr).toContain('锚点失配');
        expect(r.stderr).toContain(T.m2.errTag);
        expect(md5(T.live)).toBe(before);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }

  it('变异 M3:摘 fresh-only 轴后对退化现库恒绿复现（G-1 盲区判别力,banners 代表）', () => {
    const dir = mkdtempSync(join(TMP, 'tables-guard-'));
    try {
      writeFileSync(join(dir, 'degraded.json'), '{}');
      const probeEnv = { SW_BANNERS_JSON: join(dir, 'degraded.json') };
      const script = join(ROOT, 'tools', 'extract-banners.mjs');
      // 真工具:fresh-only 轴在位 → exit 1
      const real = spawn(script, [], probeEnv);
      expect(real.status).toBe(1);
      // 变异体:fresh-only 轴摘除 → exit 0（恒绿复现）
      const src = readFileSync(script, 'utf8');
      const TRIGGER = "for (const k of Object.keys(fresh)) if (!lk.has(k)) out.freshOnly.push(`${prefix}.${k}`);";
      expect(src).toContain(TRIGGER);
      const mutant = join(dir, 'mutant-freshonly.mjs');
      writeFileSync(mutant, src.replace(TRIGGER, 'if (false) out.freshOnly.push(`${prefix}.${k}`); // ★变异:fresh-only 轴摘除'));
      const r = spawnSync('node', [mutant], { cwd: ROOT, encoding: 'utf8', timeout: 300_000, env: { ...process.env, ...probeEnv } });
      expect(r.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
