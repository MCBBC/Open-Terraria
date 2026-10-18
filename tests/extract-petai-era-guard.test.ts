import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
// ★C档可移植:被守卫工具读仓库外反编译树/素材源(game/ 兄弟目录,clone 侧缺=正常形态)——缺则本文件 skip,本机在=真跑零语义变化
const EXT_MISSING = !['Terarria1457'].every((d) => existsSync(new URL(`../../${d}`, import.meta.url)));


// ★BJ212（2026-09-20）：extract-petai.mjs 1457 重锚 + era guard 落闸守卫测试。
//
// 债源链：BJ183 定谳「暂留 1456 锚」（1457 AI_026/AI_067 局部号重排致 anchorAssert
// 全数失配）→ BJ205 盘点登记重锚债 → 本刀重推全部锚点局部号重锚 1457（1458 三方法
// 体逐字节全等交叉对拍零增量；数据面 79 款逐值零差,仅 meta.source+行号坐标换锚,
// 703 line 66784=fx48 层 1456 旧坐标勘误归 71188）。
//
// era guard 四要素（docs/era-guard-family.md）：①SW_ITEM_VER 缺省 1457 fail-closed
// 白名单（1456 锚集已随重锚退役,1458=逐字节全等对拍面）②输出通道三分离（缺省干跑
// 零写盘 / SW_OUT 沙箱 / --write-real 逃生门;双旗互斥拒跑;非 1457 禁写真库——BJ191
// preflight 写真实 json 同族 footgun）③锚断言 fail-loud（anchorAssert/firstIn/专项
// 锚全数硬校验）④判别力自证（本文件变异:摘干跑门=裸跑写库;毒化锚=漂移报错退出）。
// 守卫测试习语 = extract-itemrare-era-guard.test.ts / extract-npcs-era-guard.test.ts。

const SCRIPT = join(process.cwd(), 'tools', 'extract-petai.mjs');
// ★C档可移植:工具 ROOT 已转 import.meta 相对(era-guard-family ④ 习语)——
//   mutant 置 OS tmp 须前置重锚到本仓项目根(game/ 父目录);工具无该行=无操作
const ROOT_LINE = "const ROOT = process.env.SW_PROJECT_ROOT ?? new URL('../../', import.meta.url).pathname.replace(/\\/+$/, '');   // ★C档可移植:game/ 父目录(反编译树/TEdit/Calamity 源所在)";
const relocateRoot = (src: string) => src.replace(ROOT_LINE, `const ROOT = ${JSON.stringify(join(process.cwd(), '..'))};`);

const LIVE = join(process.cwd(), 'src', 'data', 'vanilla-petai.json');
const md5 = (p: string) => createHash('md5').update(readFileSync(p)).digest('hex');
// ★macOS /var→/private/var 符号链接：mutant 脚本放 /var 下会因 import.meta.url 与
//   argv[1] URL 不匹配走偏——临时目录一律 realpath（extract-itemrare 同案）。
const TMP = realpathSync(tmpdir());
const sandbox = (dir: string) => ({ ...process.env, SW_OUT: dir });

describe.skipIf(EXT_MISSING)('extract-petai era guard（1457 重锚 + 输出通道三分离）', () => {
  it('行为面:缺省干跑零写盘（exit 0+家族分布摘要+现库字节零改动）', () => {
    const before = md5(LIVE);
    const r = spawnSync('node', [SCRIPT], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('干跑（零写盘）');
    expect(r.stderr).toContain('家族分布');
    expect(r.stderr).toContain('"hover":14,"ground":51,"fly":14');   // fx48 定谳族分布
    expect(md5(LIVE)).toBe(before);                                   // 零写入
  });

  it('行为面:SW_OUT 沙箱重产对现库 byte-perfect（裸重跑幂等回归）', () => {
    const dir = mkdtempSync(join(TMP, 'petai-guard-'));
    const before = md5(LIVE);
    try {
      const r = spawnSync('node', [SCRIPT], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: sandbox(dir) });
      expect(r.status).toBe(0);
      expect(r.stderr).toContain('SW_OUT 沙箱');
      const fresh = readFileSync(join(dir, 'vanilla-petai.json'));
      expect(fresh.equals(readFileSync(LIVE))).toBe(true);   // 重产=现库逐字节（锚漂移即红）
      expect(md5(LIVE)).toBe(before);                        // 现库零接触
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:SW_OUT 与 --write-real 双旗互斥拒跑（exit 1+现库零改动）', () => {
    const dir = mkdtempSync(join(TMP, 'petai-guard-'));
    const before = md5(LIVE);
    try {
      const r = spawnSync('node', [SCRIPT, '--write-real'], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: sandbox(dir),
      });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('双旗互斥');
      expect(r.stderr).toContain('--write-real');
      expect(md5(LIVE)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:非 1457 禁写真库（1458 --write-real 拒;1456 显式注入拒+退役指引）', () => {
    const before = md5(LIVE);
    const r8 = spawnSync('node', [SCRIPT, '--write-real'], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
      env: { ...process.env, SW_ITEM_VER: '1458' },
    });
    expect(r8.status).toBe(1);
    expect(r8.stderr).toContain('拒绝写真库');
    expect(r8.stderr).toContain('SW_ITEM_VER=1458≠1457');
    expect(md5(LIVE)).toBe(before);

    const r6 = spawnSync('node', [SCRIPT, '--write-real'], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
      env: { ...process.env, SW_ITEM_VER: '1456' },
    });
    expect(r6.status).toBe(1);
    expect(r6.stderr).toContain('1456 锚集已随 BJ212 重锚退役');   // 白名单 fail-closed（旧锚集不在位,重放必失配）
    expect(md5(LIVE)).toBe(before);
  });

  it('行为面:非法 SW_ITEM_VER fail-closed（exit 1+白名单指引）', () => {
    const r = spawnSync('node', [SCRIPT], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
      env: { ...process.env, SW_ITEM_VER: '1460' },
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('白名单 1457/1458');
  });

  it('行为面:SW_ITEM_VER=1458 沙箱重放放行（逐字节全等对拍面;数据面唯一差=meta.source+行号+1）', () => {
    const dir = mkdtempSync(join(TMP, 'petai-guard-'));
    const before = md5(LIVE);
    try {
      const r = spawnSync('node', [SCRIPT], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_ITEM_VER: '1458', SW_OUT: dir },
      });
      expect(r.status).toBe(0);
      const fresh = JSON.parse(readFileSync(join(dir, 'vanilla-petai.json'), 'utf8')) as {
        meta: { source: string }; pets: Record<string, Record<string, unknown>>;
      };
      const live = JSON.parse(readFileSync(LIVE, 'utf8')) as typeof fresh;
      expect(fresh.meta.source).toContain('Terarria1458');
      // 数据面零增量：剥 line/行号坐标后 79 款逐值全等（1458 三方法体与 1457 逐字节全等实证）
      const strip = (o: Record<string, unknown>) => {
        const c = { ...o }; delete c.line; return c;
      };
      expect(Object.keys(fresh.pets).length).toBe(79);
      for (const k of Object.keys(live.pets)) {
        expect(JSON.stringify(strip(fresh.pets[k]))).toBe(JSON.stringify(strip(live.pets[k])));
      }
      expect(md5(LIVE)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ★变异 M1（判别力）:摘掉「缺省干跑」门（OUT_JSON 的 null 干跑臂改指沙箱假现库=
  //   现库副本种子）→ 裸跑（零 env 零旗）静默写「现库」。证明缺省干跑是 BJ191
  //   preflight 写真实 json 同族 footgun 的唯一拦截面,摘门必红（写发生于假现库,
  //   真现库零接触）。
  it('变异:摘干跑门后裸跑静默写「现库」（证明缺省零写盘是唯一拦截面）', () => {
    const dir = mkdtempSync(join(TMP, 'petai-guard-'));
    const fakeLive = join(dir, 'vanilla-petai.json');
    writeFileSync(fakeLive, '{"seeded":true}');         // 哨兵种子（≠工具产物,可判写发生）
    const beforeLive = md5(LIVE);
    try {
      const src = relocateRoot(readFileSync(SCRIPT, 'utf8'));
      const TRIGGER = '/vanilla-petai.json` : null);';   // OUT_JSON 干跑臂（null）尾部,全文件唯一
      expect(src).toContain(TRIGGER);
      const mutant = join(dir, 'extract-petai-mutant.mjs');
      writeFileSync(mutant, src.replace(TRIGGER, `/vanilla-petai.json\` : ${JSON.stringify(fakeLive)}); // ★变异:干跑门摘除→缺省写「现库」(重定向假现库)`));
      const r = spawnSync('node', [mutant], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
      expect(r.status).toBe(0);
      expect(readFileSync(fakeLive, 'utf8')).not.toContain('"seeded":true');  // 哨兵被覆写=写发生（守卫在位时必为零写入干跑）
      expect(md5(fakeLive)).toBe(md5(LIVE));        // 且写的就是全量重产产物
      expect(md5(LIVE)).toBe(beforeLive);           // 真现库零接触（mutant 缺省臂已重定向）
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ★变异 M2（锚 fail-loud）:毒化一处锚文本 → 源码漂移场景报错退出（exit≠0+锚点名）,
  // 证明锚断言是「表与源码静默失配」的硬闸（BJ183 事故面:锚失配必须炸红而非静默旧值）。
  it('变异:毒化锚后 fail-loud（exit 1+锚点失配指名）', () => {
    const dir = mkdtempSync(join(TMP, 'petai-guard-'));
    const beforeLive = md5(LIVE);
    try {
      const src = relocateRoot(readFileSync(SCRIPT, 'utf8'));
      const TRIGGER = "AI026.text.indexOf('float num47 = 2000f;')";
      expect(src).toContain(TRIGGER);
      const mutant = join(dir, 'extract-petai-mutant-anchor.mjs');
      writeFileSync(mutant, src.replace(TRIGGER, "AI026.text.indexOf('float num47 = 9999f;') // ★变异:锚毒化"));
      const r = spawnSync('node', [mutant], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: sandbox(dir) });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('AI_026 飞行瞬移阈值未找到');
      expect(md5(LIVE)).toBe(beforeLive);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
