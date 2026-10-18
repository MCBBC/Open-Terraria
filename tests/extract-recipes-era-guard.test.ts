import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
// ★C档可移植:被守卫工具读仓库外反编译树/素材源(game/ 兄弟目录,clone 侧缺=正常形态)——缺则本文件 skip,本机在=真跑零语义变化
const EXT_MISSING = !['Terarria1457'].every((d) => existsSync(new URL(`../../${d}`, import.meta.url)));


// ★BJ261（2026-09-22）：extract-recipes.mjs era guard 落闸守卫测试（S5 P2：红队 r25 债
// 「干跑实测 357 条会被抹但无机械闸」清偿——原 R25-B5② 强制门只拦「现库独有被抹」单向,
// 缺省仍直写现库且 fresh-only（现库退化）不计不报）。
//
// 同刀编码面重建（对拍逐值定谳,反编译为准,活库 --write-real 已对齐）：
//   ①单参 SetIngredients(N)（Recipe.cs:16768-16776 Length==1→stack 1）原被 pair 循环整吞
//     → items:[] 假配方 276+ 条;②num/stack 局部变量（:6263 `int num=5; int stack=2;`,
//     53 处 .stack=num/stack 引用）原静默塌 1;③num2-5 变量块（:13179 num2=1970;…
//     SetDefaults(num3)）原整条蒸发 → 高尔夫墙族 14+反向 14;④needTorchGodsFavor/
//     needMechdusa（:349/:353,消费面 vanillaRecipes.ts:411-412 在）原整缺;⑤Turtles 组
//     （:508 GetNPCNameValue(616) 嵌套括号）原被静默跳组 → gid 全体错位,现按源码注册序
//     重编（=原版字典序）;⑥Platforms 死扫描（Main.cs `Platforms[N]=true` 三版全 0 命中,
//     权威=TileID.cs:243 CreateBoolSet(19,427,435-439)）→ 平台反转配方 27 条整族补齐。
//   ⑦3918 (int)((float)num*2.5f) 算式栈量原塌 1,源=12。
//
// era guard 四要素（docs/era-guard-family.md）：①SW_TREE 白名单 {1457,1458} fail-closed
//   （1456 退役显式拒;读域 1457↔1458 md5 全等——Main.cs 依赖已随⑥移除）②输出通道三分离
//   （缺省干跑对拍零写盘·双向 / --out 沙箱 / --write-real 逃生门+非纯增量拒+双旗互斥+
//   非 1457 禁写;--append-loops 遗留通道限 1457+互斥;探测注入面 SW_RECIPES_JSON 与
//   --write-real 混用拒=g1）③锚 fail-loud（基数护栏 3431/34/9+TileID Platforms+组基数）
//   ④判别力自证（M1 摘干跑门/M2 毒化基数锚/M3 摘 fresh-only 轴=恒绿复现）。

const SCRIPT = join(process.cwd(), 'tools', 'extract-recipes.mjs');
// ★C档可移植:工具 ROOT 已转 import.meta 相对(era-guard-family ④ 习语)——
//   mutant 置 OS tmp 须前置重锚到本仓项目根(game/ 父目录);工具无该行=无操作
const ROOT_LINE = "const ROOT = process.env.SW_PROJECT_ROOT ?? new URL('../../', import.meta.url).pathname.replace(/\\/+$/, '');   // ★C档可移植:game/ 父目录(反编译树/TEdit/Calamity 源所在)";
const relocateRoot = (src: string) => src.replace(ROOT_LINE, `const ROOT = ${JSON.stringify(join(process.cwd(), '..'))};`);

const LIVE = join(process.cwd(), 'src', 'data', 'vanilla-recipes.json');
const md5 = (p: string) => createHash('md5').update(readFileSync(p)).digest('hex');
const TMP = realpathSync(tmpdir());   // ★macOS /var→/private/var 符号链接（itemrare 同案）
const sandbox = (path: string) => ['--out', path];

describe.skipIf(EXT_MISSING)('extract-recipes era guard（BJ261 落闸 + 编码面重建）', () => {
  it('行为面:缺省干跑对拍零写盘（exit 0+双向零差+现库字节零改动）', () => {
    const before = md5(LIVE);
    const r = spawnSync('node', [SCRIPT], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('干跑对拍');
    expect(r.stderr).toContain('双向零差');
    expect(md5(LIVE)).toBe(before);
  });

  it('行为面:--out 沙箱重产对现库逐字节（重锚后幂等回归）', () => {
    const dir = mkdtempSync(join(TMP, 'recipes-guard-'));
    const out = join(dir, 'vanilla-recipes.json');
    const before = md5(LIVE);
    try {
      const r = spawnSync('node', [SCRIPT, ...sandbox(out)], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
      expect(r.status).toBe(0);
      expect(r.stderr).toContain('--out 沙箱');
      expect(readFileSync(out).equals(readFileSync(LIVE))).toBe(true);
      expect(md5(LIVE)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:--out 与 --write-real 双旗互斥拒跑（exit 1+现库零改动）', () => {
    const before = md5(LIVE);
    const r = spawnSync('node', [SCRIPT, '--out', '/tmp/whatever.json', '--write-real'], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('双旗互斥');
    expect(md5(LIVE)).toBe(before);
  });

  it('行为面:非 1457 禁写真库（1458 --write-real 拒;1456 显式注入拒+退役指引）', () => {
    const before = md5(LIVE);
    const r8 = spawnSync('node', [SCRIPT, '--write-real'], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
      env: { ...process.env, SW_TREE: 'Terarria1458' },
    });
    expect(r8.status).toBe(1);
    expect(r8.stderr).toContain('拒绝写真库');
    expect(md5(LIVE)).toBe(before);
    const r6 = spawnSync('node', [SCRIPT], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
      env: { ...process.env, SW_TREE: 'Terarria1456' },
    });
    expect(r6.status).toBe(1);
    expect(r6.stderr).toContain('1456 锚集已随 BJ261 编码面重建退役');
  });

  it('行为面:g1 探测注入面（SW_RECIPES_JSON）与 --write-real 混用拒（exit 1）', () => {
    const before = md5(LIVE);
    const r = spawnSync('node', [SCRIPT, '--write-real'], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
      env: { ...process.env, SW_RECIPES_JSON: '/tmp/whatever.json' },
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('探测注入面');
    expect(md5(LIVE)).toBe(before);
  });

  it('行为面:fresh-only 轴（现库退化/缺键型）干跑拒跑（exit 1+fresh-only 物证）', () => {
    const dir = mkdtempSync(join(TMP, 'recipes-guard-'));
    try {
      const live = JSON.parse(readFileSync(LIVE, 'utf8'));
      live.recipes = live.recipes.filter((r: { create: number }) => r.create !== 8);   // 缺一条 → fresh-only
      writeFileSync(join(dir, 'degraded.json'), JSON.stringify(live));
      const r = spawnSync('node', [SCRIPT], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_RECIPES_JSON: join(dir, 'degraded.json') },
      });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('fresh-only');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:live-only 轴（现库领先/洗库预警）干跑拒跑（exit 1+live-only 物证）', () => {
    const dir = mkdtempSync(join(TMP, 'recipes-guard-'));
    try {
      const live = JSON.parse(readFileSync(LIVE, 'utf8'));
      live.recipes.push({ create: 9999, createStack: 1, tile: -1, items: [{ id: 999, stack: 1 }], groups: [] });
      writeFileSync(join(dir, 'ahead.json'), JSON.stringify(live));
      const r = spawnSync('node', [SCRIPT], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_RECIPES_JSON: join(dir, 'ahead.json') },
      });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('live-only');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ★变异 M1（判别力）:摘掉「缺省干跑」门（OUT_PATH null 臂改指假现库=哨兵种子）→
  //   裸跑（零 env 零旗）静默写「现库」。证明缺省零写盘是 r25「全量重生成抹 357 条」
  //   同族 footgun 的唯一拦截面,摘门必红（写发生于假现库,真现库零接触）。
  it('变异 M1:摘干跑门后裸跑静默写「现库」（证明缺省零写盘是唯一拦截面）', () => {
    const dir = mkdtempSync(join(TMP, 'recipes-guard-'));
    const fakeLive = join(dir, 'vanilla-recipes.json');
    writeFileSync(fakeLive, '{"seeded":true}');
    const before = md5(LIVE);
    try {
      const src = relocateRoot(readFileSync(SCRIPT, 'utf8'));
      const TRIGGER = 'const OUT_PATH = outIdx >= 0 ? process.argv[outIdx + 1] : null;';
      expect(src).toContain(TRIGGER);
      const mutant = join(dir, 'extract-recipes-mutant.mjs');
      writeFileSync(mutant, src.replace(TRIGGER, `const OUT_PATH = outIdx >= 0 ? process.argv[outIdx + 1] : ${JSON.stringify(fakeLive)}; // ★变异:干跑门摘除`));
      const r = spawnSync('node', [mutant], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
      expect(r.status).toBe(0);
      expect(readFileSync(fakeLive, 'utf8')).not.toContain('"seeded":true');   // 哨兵被覆写=写发生
      expect(md5(fakeLive)).toBe(md5(LIVE));   // 写的就是全量重产产物
      expect(md5(LIVE)).toBe(before);          // 真现库零接触
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ★变异 M2（锚 fail-loud）:毒化基数护栏锚 → exit≠0+锚点失配指名,证明「解析面静默
  //   半表」是硬闸（BJ183 循环段蒸发事故的事前面）。
  it('变异 M2:毒化基数护栏后 fail-loud（exit≠0+锚点失配指名）', () => {
    const dir = mkdtempSync(join(TMP, 'recipes-guard-'));
    const before = md5(LIVE);
    try {
      const src = relocateRoot(readFileSync(SCRIPT, 'utf8'));
      const TRIGGER = 'if (out.length < 3400) throw';
      expect(src).toContain(TRIGGER);
      const mutant = join(dir, 'extract-recipes-mutant-anchor.mjs');
      writeFileSync(mutant, src.replace(TRIGGER, 'if (out.length < 99999) throw // ★变异:基数锚毒化'));
      const r = spawnSync('node', [mutant], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('锚点失配');
      expect(r.stderr).toContain('配方基数');
      expect(md5(LIVE)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ★变异 M3（G-1 fresh-only 轴判别力）:摘掉 fresh-only 轴 + 退化夹具 → 恒绿复现
  //   （真工具 exit 1 / 变异体 exit 0）——bossbags 删 spawn 恒绿同族。
  it('变异 M3:摘 fresh-only 轴后对退化现库恒绿复现（G-1 盲区判别力）', () => {
    const dir = mkdtempSync(join(TMP, 'recipes-guard-'));
    try {
      const live = JSON.parse(readFileSync(LIVE, 'utf8'));
      live.recipes = live.recipes.filter((r: { create: number }) => r.create !== 8);
      writeFileSync(join(dir, 'degraded.json'), JSON.stringify(live));
      const probeEnv = { ...process.env, SW_RECIPES_JSON: join(dir, 'degraded.json') };
      const real = spawnSync('node', [SCRIPT], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: probeEnv });
      expect(real.status).toBe(1);
      const src = relocateRoot(readFileSync(SCRIPT, 'utf8'));
      const TRIGGER = 'for (const [s, n] of fc) { if (n > (lc.get(s) ?? 0)) wash.freshOnly.push(JSON.parse(s)); }';
      expect(src).toContain(TRIGGER);
      const mutant = join(dir, 'extract-recipes-mutant-freshonly.mjs');
      writeFileSync(mutant, src.replace(TRIGGER, 'for (const [s, n] of fc) { if (false) wash.freshOnly.push(JSON.parse(s)); } // ★变异:fresh-only 轴摘除'));
      const r = spawnSync('node', [mutant], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: probeEnv });
      expect(r.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
