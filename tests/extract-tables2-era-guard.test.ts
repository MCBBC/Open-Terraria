import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, realpathSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
// ★C档可移植:被守卫工具读仓库外反编译树/素材源(game/ 兄弟目录,clone 侧缺=正常形态)——缺则本文件 skip,本机在=真跑零语义变化
const EXT_MISSING = !['Terarria1457'].every((d) => existsSync(new URL(`../../${d}`, import.meta.url)));


// ★BJ298（2026-09-23）：E1 续批尾 era guard 落闸守卫测试（acc-drawslots / dyes /
// shimmer / hairdyes / research / bestiary-spawn / bestiary / fishing / itemsorting
// 九件 B 形 + journey-browser / equip-prefix / itemfunc 三件降级面补缺省干跑臂）。
// npcdrops（BJ261）/ BJ284 extract-tables 同款习语：
//
// 行为面：缺省干跑对拍零写盘（md5 canary）/ SW_OUT·SW_FX53_OUT·ITEMFUNC_OUT 沙箱
//   byte-perfect（B 形九件）/ 双旗互斥 / 非 1457 禁写真库（research 1458=合法定谳
//   基线豁免）/ 1456 显式拒+退役指引 / g1 探测注入面×--write-real 混用拒 /
//   fresh-only（现库退化,★G-1/S3 处方）与 live-only（洗库预警）双向轴。
// 变异：M1 摘干跑门（OUT null 臂→假现库,哨兵被覆写=裸跑静默写库复现,真现库零接触）/
//   M2 毒化锚（哨兵/基数护栏 fail-loud 指名）/ M3 摘 fresh-only 轴恒绿复现。
// 落闸定谳（BJ298 对拍实证）：九件 1457 fresh 与现库双向零差;读域 1457↔1458 逐域
//   亲核全等（各器头注 md5 账）→ 白名单 {1457,1458}。equip-prefix 选报产物
//   （accfx/itemstats 登记手增面）/ itemfunc fresh-only 登记未采纳面 = shops 刻意
//   剥离面同款家族变体（选报不拒跑）。

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
  /** M1 干跑臂摘除触发串（缺省=TD 习语 `${outName}\` : null);`） */
  m1Trigger?: string;
  /** ROOT 派生自 import.meta.url 的工具,mutant 置 tmp 须前置重锚（era-guard-family ④ 习语） */
  rootTrigger?: string;
  rootAbs?: string;
  /** 重锚变量名（缺省 ROOT;fishing=ROOT0 家族变体） */
  rootVar?: string;
  /** 1458 --write-real 是否合法定谳基线（research 特例=豁免禁写测试） */
  allow1458WriteReal?: boolean;
  m2: { trigger: string; poison: string; errTag: string };
}

const TOOLS: ToolSpec[] = [
  {
    name: 'extract-acc-drawslots.mjs',
    live: join(ROOT, 'src', 'data', 'vanilla-acc-drawslots.json'),
    probe: 'SW_ACC_DRAWSLOTS_JSON',
    outName: 'vanilla-acc-drawslots.json',
    rejectTag: '[extract-acc-drawslots]',
    // ★M1 触发=干跑门臂条件+OUT_JSON 两行块（OUT_JSON 在 write-real/SW_OUT 臂内,单换行内死码）
    m1Trigger: "} else if (WRITE_REAL || SW_OUT) {\n  const OUT_JSON = WRITE_REAL ? TARGET : `${SW_OUT.replace(/\\/+$/, '')}/vanilla-acc-drawslots.json`;",
    rootTrigger: "const ROOT = new URL('../../', import.meta.url).pathname;",
    rootAbs: join(ROOT, '..') + '/',
    m2: {
      trigger: "['49', 'handOn', 2],",
      poison: "['49', 'handOn', 999],",
      errTag: '哨兵 vid 族位漂移',
    },
  },
  {
    name: 'extract-dyes.mjs',
    live: join(ROOT, 'src', 'data', 'vanilla-dyes.json'),
    probe: 'SW_DYES_JSON',
    outName: 'vanilla-dyes.json',
    rejectTag: '[extract-dyes]',
    rootTrigger: "const ROOT = join(here, '..');",
    rootAbs: ROOT,
    m2: {
      trigger: "1007: ['ArmorColored', [1, 0, 0]],",
      poison: "1007: ['ArmorColoredX', [1, 0, 0]],",
      errTag: '锚点 1007',
    },
  },
  {
    name: 'extract-shimmer.mjs',
    live: join(ROOT, 'src', 'data', 'vanilla-shimmer.json'),
    probe: 'SW_SHIMMER_JSON',
    outName: 'vanilla-shimmer.json',
    rejectTag: '[extract-shimmer]',
    rootTrigger: "const ROOT = process.env.SW_PROJECT_ROOT ?? new URL('../../', import.meta.url).pathname.replace(/\\/+$/, '');   // ★C档可移植:game/ 父目录(反编译树/TEdit/Calamity 源所在)",
    rootAbs: join(ROOT, '..'),
    m2: {
      trigger: 'itemTransformTo: 300,',
      poison: 'itemTransformTo: 99999,',
      errTag: '基数护栏',
    },
  },
  {
    name: 'extract-hairdyes.mjs',
    live: join(ROOT, 'src', 'data', 'vanilla-hairdyes.json'),
    probe: 'SW_HAIRDYES_JSON',
    outName: 'vanilla-hairdyes.json',
    rejectTag: '[extract-hairdyes]',
    rootTrigger: "const ROOT = join(here, '..');",
    rootAbs: ROOT,
    m2: {
      trigger: "removerCase: ['\\t\\tcase 1990:', 21293],",
      poison: "removerCase: ['\\t\\tcase 1990:', 99999],",
      errTag: '锚点校验失败',
    },
  },
  {
    name: 'extract-research.mjs',
    live: join(ROOT, 'src', 'data', 'vanilla-research.json'),
    probe: 'SW_RESEARCH_JSON',
    outName: 'vanilla-research.json',
    rejectTag: '[extract-research]',
    rootTrigger: "const ROOT = process.env.SW_PROJECT_ROOT ?? new URL('../../', import.meta.url).pathname.replace(/\\/+$/, '');   // ★C档可移植:game/ 父目录(反编译树/TEdit/Calamity 源所在)",
    rootAbs: join(ROOT, '..'),
    allow1458WriteReal: true,   // ★基线 1458 系刻意（R24）,读域双档全等 → write-real 合法
    m2: {
      trigger: 'Object.keys(need).length < 6000',
      poison: 'Object.keys(need).length < 99999',
      errTag: '基数护栏',
    },
  },
  {
    name: 'extract-bestiary-spawn.mjs',
    live: join(ROOT, 'src', 'data', 'vanilla-bestiary-spawn.json'),
    probe: 'SW_BESTIARYSPAWN_JSON',
    outName: 'vanilla-bestiary-spawn.json',
    rejectTag: '[extract-bestiary-spawn]',
    rootTrigger: "const ROOT = process.env.SW_PROJECT_ROOT ?? new URL('../../', import.meta.url).pathname.replace(/\\/+$/, '');   // ★C档可移植:game/ 父目录(反编译树/TEdit/Calamity 源所在)",
    rootAbs: join(ROOT, '..'),
    m2: {
      trigger: 'if (nCond < 60 ||',
      poison: 'if (nCond < 6000 ||',
      errTag: '基数护栏',
    },
  },
  {
    name: 'extract-bestiary.mjs',
    live: join(ROOT, 'src', 'data', 'vanilla-bestiary.json'),
    probe: 'SW_BESTIARY_JSON',
    outName: 'vanilla-bestiary.json',
    rejectTag: '[extract-bestiary]',
    rootTrigger: "const ROOT = process.env.SW_PROJECT_ROOT ?? new URL('../../', import.meta.url).pathname.replace(/\\/+$/, '');   // ★C档可移植:game/ 父目录(反编译树/TEdit/Calamity 源所在)",
    rootAbs: join(ROOT, '..'),
    m2: {
      trigger: 'Object.keys(data.npcStats).length !== 761) {',
      poison: 'Object.keys(data.npcStats).length !== 7610) {',
      errTag: '基数护栏',
    },
  },
  {
    name: 'extract-fishing.mjs',
    live: join(ROOT, 'src', 'data', 'vanilla-fishing.json'),
    probe: 'SW_FISHING_JSON',
    outName: 'vanilla-fishing.json',
    rejectTag: '[extract-fishing]',
    rootTrigger: "const ROOT0 = process.env.SW_PROJECT_ROOT ?? new URL('../../', import.meta.url).pathname.replace(/\\/+$/, '');   // ★C档可移植",
    rootAbs: join(ROOT, '..'),
    rootVar: 'ROOT0',
    m2: {
      trigger: 'if (rules.length < 140) {',
      poison: 'if (rules.length < 9999) {',
      errTag: '基数护栏',
    },
  },
  {
    name: 'extract-itemsorting.mjs',
    live: join(ROOT, 'src', 'data', 'vanilla-itemsorting.json'),
    probe: 'SW_ITEMSORTING_JSON',
    outName: 'vanilla-itemsorting.json',
    rejectTag: '[extract-itemsorting]',
    rootTrigger: "const ROOT = process.env.SW_PROJECT_ROOT ?? new URL('../../', import.meta.url).pathname.replace(/\\/+$/, '');   // ★C档可移植:game/ 父目录(反编译树/TEdit/Calamity 源所在)",
    rootAbs: join(ROOT, '..'),
    m2: {
      trigger: "if (!BUFF_INT_SETS.SortingPriorityFoodBuffs) throw new Error('BuffID.Sets.SortingPriorityFoodBuffs 缺档');",
      poison: "if (!BUFF_INT_SETS.SortingPriorityFoodBuffsX) throw new Error('BuffID.Sets.SortingPriorityFoodBuffs 缺档');",
      errTag: 'SortingPriorityFoodBuffs 缺档',
    },
  },
];

const spawn = (script: string, args: string[] = [], env: Record<string, string> = {}) =>
  spawnSync('node', [script, ...args], { cwd: ROOT, encoding: 'utf8', timeout: 300_000, env: { ...process.env, ...env } });

describe.skipIf(EXT_MISSING)('extract-tables2 era guard（BJ298 E1 续批尾落闸）', () => {
  describe('B 形九件（banners 同构四要素闸）', () => {
    for (const T of TOOLS) {
      const script = join(ROOT, 'tools', T.name);

      it(`${T.name} 行为面:缺省干跑对拍零写盘（exit 0+双向零差+现库字节零改动）`, () => {
        const before = md5(T.live);
        const r = spawn(script);
        expect(r.status).toBe(0);
        expect(r.stderr + r.stdout).toContain('零写盘');
        expect(md5(T.live)).toBe(before);
      });

      it(`${T.name} 行为面:SW_OUT 沙箱重产对现库 byte-perfect（幂等回归）`, () => {
        const dir = mkdtempSync(join(TMP, 'tables2-guard-'));
        const before = md5(T.live);
        try {
          const r = spawn(script, [], sandbox(dir));
          expect(r.status).toBe(0);
          expect(readFileSync(join(dir, T.outName)).equals(readFileSync(T.live))).toBe(true);
          expect(md5(T.live)).toBe(before);
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      });

      it(`${T.name} 行为面:SW_OUT 与 --write-real 双旗互斥拒（exit 1+现库零改动）`, () => {
        const dir = mkdtempSync(join(TMP, 'tables2-guard-'));
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

      it(`${T.name} 行为面:非 1457 禁写真库（1458 --write-real 拒;research 刻意基线豁免）;1456 显式拒+退役指引`, () => {
        const before = md5(T.live);
        if (!T.allow1458WriteReal) {
          const r8 = spawn(script, ['--write-real'], { SW_ITEM_VER: '1458' });
          expect(r8.status).toBe(1);
          expect(r8.stderr).toContain('拒绝写真库');
        }
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
        const dir = mkdtempSync(join(TMP, 'tables2-guard-'));
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
        const dir = mkdtempSync(join(TMP, 'tables2-guard-'));
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
        const dir = mkdtempSync(join(TMP, 'tables2-guard-'));
        const fake = join(dir, T.outName);
        writeFileSync(fake, '{"seeded":true}');   // 哨兵种子（≠工具产物,可判写发生）
        const before = md5(T.live);
        try {
          let src = readFileSync(script, 'utf8');
          // ROOT_TRIGGER 前置重锚（import.meta.url 派生工具的 mutant 置 tmp 必备习语）
          if (T.rootTrigger && T.rootAbs) {
            expect(src).toContain(T.rootTrigger);
            src = src.replace(T.rootTrigger, `const ${T.rootVar ?? 'ROOT'} = ${JSON.stringify(T.rootAbs)};`);
          }
          const td = T.m1Trigger ?? `/${T.outName}\` : null);`;
          expect(src).toContain(td);
          const replacement = T.m1Trigger
            ? `} else if (true) {\n  const OUT_JSON = ${JSON.stringify(fake)}; // ★变异:干跑门摘除`
            : `/${T.outName}\` : ${JSON.stringify(fake)}); // ★变异:干跑门摘除`;
          const mutant = join(dir, 'mutant.mjs');
          writeFileSync(mutant, src.replace(td, replacement));
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
        const dir = mkdtempSync(join(TMP, 'tables2-guard-'));
        const before = md5(T.live);
        try {
          let src = readFileSync(script, 'utf8');
          if (T.rootTrigger && T.rootAbs) {
            src = src.replace(T.rootTrigger, `const ${T.rootVar ?? 'ROOT'} = ${JSON.stringify(T.rootAbs)};`);
          }
          expect(src).toContain(T.m2.trigger);
          const mutant = join(dir, 'mutant-anchor.mjs');
          writeFileSync(mutant, src.replace(T.m2.trigger, T.m2.poison));
          const r = spawnSync('node', [mutant], { cwd: ROOT, encoding: 'utf8', timeout: 300_000, env: { ...process.env, SW_OUT: join(dir, 'sb') } });
          expect(r.status).not.toBe(0);
          expect(r.stderr).toContain(T.m2.errTag);
          expect(md5(T.live)).toBe(before);
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      });
    }

    it('变异 M3:摘 fresh-only 轴后对退化现库恒绿复现（G-1 盲区判别力,acc-drawslots 代表）', () => {
      const dir = mkdtempSync(join(TMP, 'tables2-guard-'));
      try {
        writeFileSync(join(dir, 'degraded.json'), '{}');
        const probeEnv = { SW_ACC_DRAWSLOTS_JSON: join(dir, 'degraded.json') };
        const script = join(ROOT, 'tools', 'extract-acc-drawslots.mjs');
        // 真工具:fresh-only 轴在位 → exit 1
        const real = spawn(script, [], probeEnv);
        expect(real.status).toBe(1);
        // 变异体:fresh-only 轴摘除 → exit 0（恒绿复现）
        let src = readFileSync(script, 'utf8');
        const RT = "const ROOT = new URL('../../', import.meta.url).pathname;";
        expect(src).toContain(RT);
        src = src.replace(RT, `const ROOT = ${JSON.stringify(join(ROOT, '..') + '/')};`);   // ★C档可移植:运行时计算
        const TRIGGER = 'for (const k of Object.keys(fresh)) if (!lk.has(k)) outW.freshOnly.push(`${prefix}.${k}`);';
        expect(src).toContain(TRIGGER);
        const mutant = join(dir, 'mutant-freshonly.mjs');
        writeFileSync(mutant, src.replace(TRIGGER, 'if (false) outW.freshOnly.push(`${prefix}.${k}`); // ★变异:fresh-only 轴摘除'));
        const r = spawnSync('node', [mutant], { cwd: ROOT, encoding: 'utf8', timeout: 300_000, env: { ...process.env, ...probeEnv } });
        expect(r.status).toBe(0);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('降级面三件补缺省干跑臂（journey-browser / equip-prefix / itemfunc）', () => {
    const JB = join(ROOT, 'tools', 'extract-journey-browser.mjs');
    // ★C档可移植:三器 ROOT 已转 import.meta 相对——mutant 置 tmp 须前置重锚
    const ROOT_LINE = "const ROOT = process.env.SW_PROJECT_ROOT ?? new URL('../../', import.meta.url).pathname.replace(/\\/+$/, '');   // ★C档可移植:game/ 父目录(反编译树/TEdit/Calamity 源所在)";
    const relocateRoot = (src: string) => src.replace(ROOT_LINE, `const ROOT = ${JSON.stringify(join(ROOT, '..'))};`);

    const EP = join(ROOT, 'tools', 'extract-equip-prefix.mjs');
    const IF = join(ROOT, 'tools', 'extract-itemfunc.mjs');
    const JB_LIVE = join(ROOT, 'src', 'data', 'vanilla-journeycat.json');
    const EP_EQUIP = join(ROOT, 'src', 'data', 'vanilla-equip.json');
    const EP_ACCFX = join(ROOT, 'src', 'data', 'vanilla-accfx.json');
    const IF_LIVE = join(ROOT, 'src', 'data', 'vanilla-itemfunc.json');

    it('journey-browser 行为面:缺省干跑零写盘（exit 0+canary）', () => {
      const before = md5(JB_LIVE);
      const r = spawn(JB);
      expect(r.status).toBe(0);
      expect(r.stderr).toContain('零写盘');
      expect(md5(JB_LIVE)).toBe(before);
    });

    it('journey-browser 行为面:SW_FX53_OUT 沙箱 byte-perfect;双旗互斥拒', () => {
      const dir = mkdtempSync(join(TMP, 'tables2-guard-'));
      const before = md5(JB_LIVE);
      try {
        const r = spawn(JB, [], { SW_FX53_OUT: dir });
        expect(r.status).toBe(0);
        expect(readFileSync(join(dir, 'vanilla-journeycat.json')).equals(readFileSync(JB_LIVE))).toBe(true);
        const m = spawn(JB, ['--write-real'], { SW_FX53_OUT: dir });
        expect(m.status).toBe(1);
        expect(m.stderr).toContain('双旗互斥');
        expect(md5(JB_LIVE)).toBe(before);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('journey-browser 变异 M1:现库重定向到空对象 → fresh-only 拒跑（exit 1,真现库零接触）', () => {
      const dir = mkdtempSync(join(TMP, 'tables2-guard-'));
      const before = md5(JB_LIVE);
      try {
        const fake = join(dir, 'fake-jc.json');
        writeFileSync(fake, '{}');
        const src = relocateRoot(readFileSync(JB, 'utf8'));
        const td = 'const JC_LIVE = `${ROOT}/game/src/data/vanilla-journeycat.json`;';
        expect(src).toContain(td);
        const mutant = join(dir, 'mutant.mjs');
        writeFileSync(mutant, src.replace(td, `const JC_LIVE = ${JSON.stringify(fake)}; // ★变异:现库重定向`));
        const r = spawnSync('node', [mutant], { cwd: ROOT, encoding: 'utf8', timeout: 300_000 });
        expect(r.status).toBe(1);
        expect(r.stderr).toContain('fresh-only');
        expect(md5(JB_LIVE)).toBe(before);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('equip-prefix 行为面:缺省干跑零写盘（exit 0;选报产物 loud 不拒跑）', () => {
      const b1 = md5(EP_EQUIP);
      const b2 = md5(EP_ACCFX);
      const r = spawn(EP);
      expect(r.status).toBe(0);
      expect(r.stderr).toContain('选报不拒跑');   // accfx/itemstats 登记手增面
      expect(md5(EP_EQUIP)).toBe(b1);
      expect(md5(EP_ACCFX)).toBe(b2);
    });

    it('equip-prefix 行为面:SW_FX53_OUT 沙箱 byte-perfect（拒产物 equip）;双旗互斥拒', () => {
      const dir = mkdtempSync(join(TMP, 'tables2-guard-'));
      const before = md5(EP_EQUIP);
      try {
        const r = spawn(EP, [], { SW_FX53_OUT: dir });
        expect(r.status).toBe(0);
        expect(existsSync(join(dir, 'vanilla-equip.json'))).toBe(true);
        expect(readFileSync(join(dir, 'vanilla-equip.json')).equals(readFileSync(EP_EQUIP))).toBe(true);
        const m = spawn(EP, ['--write-real'], { SW_FX53_OUT: dir });
        expect(m.status).toBe(1);
        expect(m.stderr).toContain('双旗互斥');
        expect(md5(EP_EQUIP)).toBe(before);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('equip-prefix 变异 M1:equip 现库重定向到空对象 → 拒产物 fresh-only 拒跑（exit 1）', () => {
      const dir = mkdtempSync(join(TMP, 'tables2-guard-'));
      const before = md5(EP_EQUIP);
      try {
        const fake = join(dir, 'fake-equip.json');
        writeFileSync(fake, '{}');
        const src = relocateRoot(readFileSync(EP, 'utf8'));
        const td = 'writeOut(`${ROOT}/game/src/data/vanilla-equip.json`, JSON.stringify(equip));';
        expect(src).toContain(td);
        const mutant = join(dir, 'mutant.mjs');
        writeFileSync(mutant, src.replace(td, `writeOut(${JSON.stringify(fake)}, JSON.stringify(equip)); // ★变异:现库重定向`));
        const r = spawnSync('node', [mutant], { cwd: ROOT, encoding: 'utf8', timeout: 300_000 });
        expect(r.status).toBe(1);
        expect(r.stderr).toContain('fresh-only');
        expect(md5(EP_EQUIP)).toBe(before);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('itemfunc 行为面:缺省干跑零写盘（exit 0;fresh-only 登记未采纳面选报 loud）', () => {
      const before = md5(IF_LIVE);
      const r = spawn(IF);
      expect(r.status).toBe(0);
      expect(r.stderr).toContain('选报');
      expect(r.stderr).toContain('live-only/drift 双零');
      expect(md5(IF_LIVE)).toBe(before);
    });

    it('itemfunc 行为面:ITEMFUNC_OUT 沙箱写;双旗互斥拒', () => {
      const dir = mkdtempSync(join(TMP, 'tables2-guard-'));
      const before = md5(IF_LIVE);
      try {
        const r = spawn(IF, [], { ITEMFUNC_OUT: join(dir, 'vanilla-itemfunc.json') });
        expect(r.status).toBe(0);
        expect(existsSync(join(dir, 'vanilla-itemfunc.json'))).toBe(true);
        const m = spawn(IF, ['--write-real'], { ITEMFUNC_OUT: join(dir, 'vanilla-itemfunc.json') });
        expect(m.status).toBe(1);
        expect(m.stderr).toContain('双旗互斥');
        expect(md5(IF_LIVE)).toBe(before);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('itemfunc 变异 M1:现库重定向到哨兵 → live-only 拒跑（exit 1,真现库零接触）', () => {
      const dir = mkdtempSync(join(TMP, 'tables2-guard-'));
      const before = md5(IF_LIVE);
      try {
        const fake = join(dir, 'fake-if.json');
        writeFileSync(fake, '{"seeded":true}');
        let src = relocateRoot(readFileSync(IF, 'utf8'));
        // ★mutant 置 tmp:相对兄弟 import（extract-itemcombat）重写为绝对路径
        src = src.replace("from './extract-itemcombat.mjs'", `from ${JSON.stringify(join(ROOT, 'tools', 'extract-itemcombat.mjs'))}`);
        const td = 'const LIVE_JSON = `${ROOT}/game/src/data/vanilla-itemfunc.json`;';
        expect(src).toContain(td);
        const mutant = join(dir, 'mutant.mjs');
        writeFileSync(mutant, src.replace(td, `const LIVE_JSON = ${JSON.stringify(fake)}; // ★变异:现库重定向`));
        const r = spawnSync('node', [mutant], { cwd: ROOT, encoding: 'utf8', timeout: 300_000 });
        expect(r.status).toBe(1);
        expect(r.stderr).toContain('live-only');
        expect(md5(IF_LIVE)).toBe(before);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
