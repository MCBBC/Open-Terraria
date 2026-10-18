import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
// ★C档可移植:被守卫工具读仓库外反编译树/素材源(game/ 兄弟目录,clone 侧缺=正常形态)——缺则本文件 skip,本机在=真跑零语义变化
const EXT_MISSING = !['Terarria1457'].every((d) => existsSync(new URL(`../../${d}`, import.meta.url)));


// ★BJ215（2026-09-20）：extract-itemcombat.mjs era guard 落闸守卫测试。
//
// 债源：era-guard-family.md 第四节残留清单第 2 顺位（头注陈旧「Terarria1456」+
// writeFileSync 直写双产物无干跑/无现库 diff）。BJ215 定谳：1457 重产 vs 现库逐值零漂移
// （4369 items + 978 useSound,bare 重跑幂等态成立）→ B-form 干跑对拍闸
// （零漂移放行/漂移 exit 1+物证）。BJ205 ⑥ 盘点块在头注,本刀未回退。
//
// era guard 四要素（docs/era-guard-family.md）：①SW_ITEM_VER 缺省 1457 白名单
// {1456,1457,1458}（1456 保留=recon-item-1456-1457.mjs 双实例 --dump 对账）②输出通道
// 三分离（缺省干跑零写盘 / SW_OUT 沙箱 / --write-real 逃生门;双旗互斥;非 1457 禁写真库;
// --dump/--audit 不落盘通道不受限）③锚 fail-loud（methodBody 签名未找到即 throw——
// 原实现静默返空体反模式已修）④判别力自证（本文件变异 M1/M2;★清偿刀 M 2026-09-29
// 增根修行断言+变异 M3=摘根修门复现 F 债/M4=委托链断）。
// 守卫测试习语 = extract-petai-era-guard.test.ts（BJ212）。

const SCRIPT = join(process.cwd(), 'tools', 'extract-itemcombat.mjs');
const LIVE_COMBAT = join(process.cwd(), 'src', 'data', 'vanilla-itemcombat.json');
const LIVE_SOUND = join(process.cwd(), 'src', 'data', 'vanilla-itemusesound.json');
const md5 = (p: string) => createHash('md5').update(readFileSync(p)).digest('hex');
// ★macOS /var→/private/var 符号链接（petai/itemrare 同案）
const TMP = realpathSync(tmpdir());
const sandbox = (dir: string) => ({ ...process.env, SW_OUT: dir });

describe.skipIf(EXT_MISSING)('extract-itemcombat era guard（B-form 干跑对拍 + 输出通道三分离）', () => {
  it('行为面:缺省干跑零写盘（逐值零漂移 exit 0+双产物 canary）', () => {
    const b1 = md5(LIVE_COMBAT);
    const b2 = md5(LIVE_SOUND);
    const r = spawnSync('node', [SCRIPT], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('干跑对拍');
    expect(r.stderr).toContain('逐值零漂移');
    expect(r.stderr).toContain('零写盘');
    expect(md5(LIVE_COMBAT)).toBe(b1);
    expect(md5(LIVE_SOUND)).toBe(b2);
  });

  it('行为面:SW_OUT 沙箱重产=现库逐字节（幂等回归）+现库零接触', () => {
    const dir = mkdtempSync(join(TMP, 'itemcombat-guard-'));
    const b1 = md5(LIVE_COMBAT);
    const b2 = md5(LIVE_SOUND);
    try {
      const r = spawnSync('node', [SCRIPT], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: sandbox(dir) });
      expect(r.status).toBe(0);
      expect(r.stderr).toContain('SW_OUT 沙箱');
      expect(readFileSync(join(dir, 'vanilla-itemcombat.json')).equals(readFileSync(LIVE_COMBAT))).toBe(true);
      expect(readFileSync(join(dir, 'vanilla-itemusesound.json')).equals(readFileSync(LIVE_SOUND))).toBe(true);
      expect(md5(LIVE_COMBAT)).toBe(b1);
      expect(md5(LIVE_SOUND)).toBe(b2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:SW_OUT 与 --write-real 双旗互斥拒跑', () => {
    const dir = mkdtempSync(join(TMP, 'itemcombat-guard-'));
    const b1 = md5(LIVE_COMBAT);
    try {
      const r = spawnSync('node', [SCRIPT, '--write-real'], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: sandbox(dir) });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('双旗互斥');
      expect(md5(LIVE_COMBAT)).toBe(b1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:非 1457 禁写真库（1456 --write-real 拒）;1456 干跑对拍=漂移 exit 1（旧基线重放洗 1457 终值面被拦）', () => {
    const b1 = md5(LIVE_COMBAT);
    const r6 = spawnSync('node', [SCRIPT, '--write-real'], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
      env: { ...process.env, SW_ITEM_VER: '1456' },
    });
    expect(r6.status).toBe(1);
    expect(r6.stderr).toContain('拒绝写真库');
    expect(r6.stderr).toContain('SW_ITEM_VER=1456≠1457');

    const r6d = spawnSync('node', [SCRIPT], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
      env: { ...process.env, SW_ITEM_VER: '1456' },
    });
    expect(r6d.status).toBe(1);
    expect(r6d.stderr).toContain('漂移');
    expect(md5(LIVE_COMBAT)).toBe(b1);
  });

  it('行为面:非法 SW_ITEM_VER fail-closed（白名单+目录存在性）;--dump 对账通道不受守卫限制', () => {
    const b1 = md5(LIVE_COMBAT);
    const rBad = spawnSync('node', [SCRIPT], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
      env: { ...process.env, SW_ITEM_VER: '1460' },
    });
    expect(rBad.status).toBe(1);
    expect(rBad.stderr).toContain('白名单 1456/1457/1458');

    const rDump = spawnSync('node', [SCRIPT, '--dump'], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, maxBuffer: 64 * 1024 * 1024 });
    expect(rDump.status).toBe(0);
    const dump = JSON.parse(rDump.stdout) as { src: string; items: Record<string, unknown> };
    expect(dump.src).toBe('1457');
    expect(Object.keys(dump.items).length).toBeGreaterThan(4000);
    expect(md5(LIVE_COMBAT)).toBe(b1);
  });

  // ★变异 M1（判别力）:摘掉「缺省干跑」门（OUT_DIR 干跑臂 null 换成假现库目录）→
  //   裸跑（零 env 零旗）静默写「现库」双产物。证明缺省零写盘是唯一拦截面。
  //   ★mutant 前置:ROOT 重锚（本器 ROOT 派生自 import.meta.url,mutant 放 OS tmp 会
  //   因路径失配炸版本门——重锚到 join(process.cwd(),'..') 与盘上等价）。
  it('变异 M1:摘干跑门后裸跑静默写「现库」双产物（哨兵被覆写=写发生）', () => {
    const dir = mkdtempSync(join(TMP, 'itemcombat-guard-'));
    const fakeCombat = join(dir, 'vanilla-itemcombat.json');
    const fakeSound = join(dir, 'vanilla-itemusesound.json');
    writeFileSync(fakeCombat, '{"seeded":true}');   // 哨兵种子（≠工具产物,可判写发生）
    writeFileSync(fakeSound, '{"seeded":true}');
    const beforeCombat = md5(LIVE_COMBAT);
    try {
      const src = readFileSync(SCRIPT, 'utf8');
      const ROOT_TRIGGER = "const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');";
      expect(src).toContain(ROOT_TRIGGER);
      const TRIGGER = ".replace(/\\/+$/, '')}` : null);";
      expect(src).toContain(TRIGGER);
      const mutant = join(dir, 'extract-itemcombat-mutant.mjs');
      writeFileSync(mutant, src
        .replace(ROOT_TRIGGER, "const ROOT = join(process.cwd(), '..'); // ★变异:ROOT 重锚到测试 cwd")
        .replace(TRIGGER, ".replace(/\\/+$/, '')}` : " + JSON.stringify(dir) + '); // ★变异:干跑臂摘除→缺省写「现库」'));
      const r = spawnSync('node', [mutant], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
      expect(r.status).toBe(0);
      expect(readFileSync(fakeCombat, 'utf8')).not.toContain('"seeded":true');
      expect(readFileSync(fakeSound, 'utf8')).not.toContain('"seeded":true');
      expect(md5(fakeCombat)).toBe(md5(LIVE_COMBAT));   // 写的就是全量重产产物
      expect(md5(LIVE_COMBAT)).toBe(beforeCombat);      // 真现库零接触
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ★变异 M2（锚 fail-loud）:毒化 SetDefaults1 方法签名锚 → methodBody throw
  //  （exit≠0+锚点名）——证明「找不到就吃空体」的静默兜底已被硬炸替代。
  it('变异 M2:毒化方法签名锚后 fail-loud（exit≠0+锚点失配指名）', () => {
    const dir = mkdtempSync(join(TMP, 'itemcombat-guard-'));
    const b1 = md5(LIVE_COMBAT);
    try {
      const src = readFileSync(SCRIPT, 'utf8');
      const ROOT_TRIGGER = "const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');";
      expect(src).toContain(ROOT_TRIGGER);
      const TRIGGER = "'void SetDefaults1(int type)'";
      expect(src).toContain(TRIGGER);
      const mutant = join(dir, 'extract-itemcombat-mutant-anchor.mjs');
      writeFileSync(mutant, src
        .replace(ROOT_TRIGGER, "const ROOT = join(process.cwd(), '..'); // ★变异:ROOT 重锚到测试 cwd")
        .replace(TRIGGER, "'void SetDefaultsX1(int type)'")); // ★变异:锚毒化
      const r = spawnSync('node', [mutant], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: sandbox(dir) });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('锚点失配');
      expect(r.stderr).toContain('SetDefaultsX1');
      expect(md5(LIVE_COMBAT)).toBe(b1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ============================================================
  // ★清偿刀 M（2026-09-29）根修判别力:applyRec 委托行判据先于早退门
  //   （F 刀定谳:原序早退门吞纯委托 alias——rec/sound 双空的 SetDefaultsN(M)
  //   委托件连 delegates 都不进,月主九挥砍件 combat+sound 双缺根因。
  //   根修后 F 刀两处手补面已退役,委托链=唯一存活面,以下变异有判别力。）
  // ============================================================
  const NINE = ['2777', '2780', '2781', '2782', '2785', '2786', '3462', '3465', '3466'];
  // ★清偿刀 Q（2026-09-29）：六锯钻（rec={shoot} 载体件）——LUNAR_DELEGATE 手补面退役后
  //  与九纯 alias 同走委托链单源,M4 链断判别面扩至全 15 件。
  const SIX_SAW = ['2778', '2783', '3463', '2779', '2784', '3464'];
  const ALIAS_BASE: Record<string, string> = { '2777': '2772', '2782': '2772', '3462': '2772',
    '2780': '2775', '2785': '2775', '3465': '2775', '2781': '2776', '2786': '2776', '3466': '2776' };

  it('根修行:九挥砍纯委托 alias 原生进 delegates 面——combat≡基底全拷+sound=Item_1（--dump 零写盘）', () => {
    const b1 = md5(LIVE_COMBAT);
    const b2 = md5(LIVE_SOUND);
    const r = spawnSync('node', [SCRIPT, '--dump'], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, maxBuffer: 64 * 1024 * 1024 });
    expect(r.status).toBe(0);
    const dump = JSON.parse(r.stdout) as { items: Record<string, Record<string, unknown>>; useSound: Record<string, string> };
    for (const vid of NINE) {
      const rec = dump.items[vid];
      expect(rec, `${vid} combat 面在表`).toBeDefined();
      // 纯委托 alias 值=基底 case 终态全拷（委托展开语义,逐字段字节等价）
      expect(JSON.stringify(rec)).toBe(JSON.stringify(dump.items[ALIAS_BASE[vid]]));
      expect(dump.useSound[vid], `${vid} UseSound 继承基底`).toBe('Item_1');
    }
    // 对照组:六锯钻（rec={shoot} 载体件）委托展开=基底字段+shoot 覆写（非全拷）
    expect(dump.items['2778']).toMatchObject({ damage: 80, shoot: 429, noMelee: true });
    expect(md5(LIVE_COMBAT)).toBe(b1);
    expect(md5(LIVE_SOUND)).toBe(b2);
  });

  // ★变异 M3（根修摘除）:早退门回位到委托判据之前（复现 F 债原始序）→
  //   九纯 alias 件被吞（items/useSound 双缺）,而载体件 2778（rec 非空）不受影响
  //   ——证明「纯委托先进 delegates」是唯一存活面。
  it('变异 M3:摘根修门（早退门回位）→ 九纯 alias 件 combat+sound 双缺复现 F 债（--dump）', () => {
    const dir = mkdtempSync(join(TMP, 'itemcombat-guard-'));
    const b1 = md5(LIVE_COMBAT);
    try {
      const src = readFileSync(SCRIPT, 'utf8');
      const ROOT_TRIGGER = "const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');";
      const DL_ANCHOR = "  const dl = lines.find((l) => /^SetDefaults\\d?\\(\\d+\\);/.test(l));\n  if (dl) {";
      const GATE = '  if (!Object.keys(rec).length && sound === undefined) return;';
      expect(src).toContain(ROOT_TRIGGER);
      expect(src).toContain(DL_ANCHOR);
      const mutant = join(dir, 'extract-itemcombat-mutant-m3.mjs');
      writeFileSync(mutant, src
        .replace(ROOT_TRIGGER, "const ROOT = join(process.cwd(), '..'); // ★变异:ROOT 重锚")
        // 早退门插回委托判据之前（原始错误序）
        .replace(DL_ANCHOR, `${GATE} // ★变异M3:早退门回位→纯委托 alias 被吞\n${DL_ANCHOR}`)
        // 摘除委托分支之后的早退门（唯一性由后随注释锚定）
        .replace(`${GATE}\n  // 同 id 多处赋值`, '  // 同 id 多处赋值'));
      const r = spawnSync('node', [mutant, '--dump'], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, maxBuffer: 64 * 1024 * 1024 });
      expect(r.status).toBe(0);
      const dump = JSON.parse(r.stdout) as { items: Record<string, Record<string, unknown>>; useSound: Record<string, string> };
      for (const vid of NINE) {
        expect(dump.items[vid], `${vid} combat 面被吞`).toBeUndefined();
        expect(dump.useSound[vid], `${vid} sound 面被吞`).toBeUndefined();
      }
      // 对照:载体件（rec={shoot} 非空,原序本就不受早退门影响）仍全字段
      expect(dump.items['2778']).toMatchObject({ damage: 80, shoot: 429 });
      expect(md5(LIVE_COMBAT)).toBe(b1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ★变异 M4（委托链断）:合并循环 base 摘除 → 委托展开失效,委托件整批不入 combat 表。
  //   ★清偿刀 Q（2026-09-29）退役六锯钻 LUNAR_DELEGATE 手补后判别面=全 15 件月主
  //   委托件（九纯 alias+六锯钻,链断零兜底;退役前手补曾把六锯钻从基底兜底恢复=
  //   掩蔽变异判别）。sound 侧道继承独立于 base 解析,仍通——两通道独立性的旁证。
  it('变异 M4:委托链断（合并 base 摘除）→ 月主 15 件 combat 全失联（sound 侧道独立存活）', () => {
    const dir = mkdtempSync(join(TMP, 'itemcombat-guard-'));
    const b1 = md5(LIVE_COMBAT);
    try {
      const src = readFileSync(SCRIPT, 'utf8');
      const ROOT_TRIGGER = "const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');";
      const MERGE_ANCHOR = 'const base = data.get(d.targetId);';
      expect(src).toContain(ROOT_TRIGGER);
      expect(src).toContain(MERGE_ANCHOR);
      const mutant = join(dir, 'extract-itemcombat-mutant-m4.mjs');
      writeFileSync(mutant, src
        .replace(ROOT_TRIGGER, "const ROOT = join(process.cwd(), '..'); // ★变异:ROOT 重锚")
        .replace(MERGE_ANCHOR, 'const base = undefined; // ★变异M4:委托链断'));
      const r = spawnSync('node', [mutant, '--dump'], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, maxBuffer: 64 * 1024 * 1024 });
      expect(r.status).toBe(0);
      const dump = JSON.parse(r.stdout) as { items: Record<string, Record<string, unknown>>; useSound: Record<string, string> };
      for (const vid of [...NINE, ...SIX_SAW]) {
        expect(dump.items[vid], `${vid} combat 面随链断失联`).toBeUndefined();
      }
      expect(dump.useSound['2777'], 'sound 侧道继承独立于 base 解析').toBe('Item_1');
      expect(dump.useSound['2778'], '锯钻 sound 侧道继承基底 Item_23（与 combat 失联独立）').toBe('Item_23');
      expect(md5(LIVE_COMBAT)).toBe(b1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ============================================================
  // ★清偿刀 J（2026-09-30,BJ408 债#1/#2 收口）四根修判别力:根修 a 嵌套贯穿组 /
  //   b 链式复合除式 / c DefaultToWhip 形参位 / d 守卫链数值面。每根修一刀变异
  //   （摘除后 --dump 断言目标面回落病灶相）,目标件均无 EXTRACT_PATCH 手补=
  //   零掩蔽（3287/2320/1296/5480 皆不在 vanillaItemCombat.ts 补丁面）。
  // ============================================================

  function dumpOf(mutant: string) {
    const r = spawnSync('node', [mutant, '--dump'], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, maxBuffer: 64 * 1024 * 1024 });
    expect(r.status, r.stderr.slice(-400)).toBe(0);
    return JSON.parse(r.stdout) as { items: Record<string, Record<string, unknown>>; useSound: Record<string, string> };
  }

  // ★变异 J1:嵌套贯穿组收集摘除（嵌套 switch 恢复逐 case 切块,复现 BJ408 债#1）→
  //   3287 RedsYoyo damage/kb 双缺（原病灶）;2289 钓竿 anim/time 半缺;对照 3288
  //  （组末 id 原序本就吃到共享体）不受影响。
  it('变异 J1:嵌套贯穿组摘除 → 3287 damage/kb 双缺复现（对照 3288 全值）', () => {
    const dir = mkdtempSync(join(TMP, 'itemcombat-guard-'));
    const b1 = md5(LIVE_COMBAT);
    try {
      const src = readFileSync(SCRIPT, 'utf8');
      const ROOT_TRIGGER = "const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');";
      // 唯一锚:嵌套版用 inner.indexOf（外层 parseSwitch 用 body.indexOf）
      const GROUP_ANCHOR = 'const between = inner.slice(afterColon, marks2[j + 1][1]);';
      expect(src).toContain(ROOT_TRIGGER);
      expect(src).toContain(GROUP_ANCHOR);
      const mutant = join(dir, 'extract-itemcombat-mutant-j1.mjs');
      writeFileSync(mutant, src
        .replace(ROOT_TRIGGER, "const ROOT = join(process.cwd(), '..'); // ★变异:ROOT 重锚")
        // 贯穿组立即断组 → 组内非末 id 回落空块=applyRec 早退
        .replace(GROUP_ANCHOR, `${GROUP_ANCHOR}\n        break; // ★变异J1:嵌套贯穿组摘除`));
      const dump = dumpOf(mutant);
      expect(dump.items['3287']?.damage, '3287 damage 回落病灶（缺）').toBeUndefined();
      expect(dump.items['3287']?.knockBack, '3287 knockBack 回落病灶（缺）').toBeUndefined();
      expect(dump.items['3287']?.useTime, '3287 外层共享体仍在（useTime 25）').toBe(25);
      expect(dump.items['3288'], '对照:组末 id 3288 原序全值不受影响').toMatchObject({ damage: 70, knockBack: 4.5 });
      expect(dump.items['2289']?.useTime, '2289 钓竿 anim/time 半缺复现').toBeUndefined();
      expect(md5(LIVE_COMBAT)).toBe(b1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ★变异 J2:链式/复合/除式 pass 摘除（链式判据门置 false,主字段直写+chain fill 双断）
  //   → 1296/1345/2350/4870 useTime/useAnimation 双缺复现 BJ408 债#2 同族
  //  （2350 手补退役后无兜底=判别面）。
  //  ★清偿刀 Q1（2026-09-30）后 4715 升级为双通道件:DefaultToGuitar 体面供基值
  //  anim12/time12/autoReuse,链式 pass 独占贡献= `useTime /= 2` 除式（12→6）——
  //  摘链式 pass 后 4715 useTime 6→12 漂移=链式 pass 判别面（体面救不掉除式）。
  it('变异 J2:链式赋值 pass 摘除 → 1296/2350 anim/time 双缺复现;4715 useTime 6→12 漂移', () => {
    const dir = mkdtempSync(join(TMP, 'itemcombat-guard-'));
    const b1 = md5(LIVE_COMBAT);
    try {
      const src = readFileSync(SCRIPT, 'utf8');
      const ROOT_TRIGGER = "const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');";
      const CHAIN_ANCHOR = 'if (m && NUM_FIELDS.includes(m[1]) && NUM_FIELDS.includes(m[2])) {';
      expect(src).toContain(ROOT_TRIGGER);
      expect(src).toContain(CHAIN_ANCHOR);
      const mutant = join(dir, 'extract-itemcombat-mutant-j2.mjs');
      writeFileSync(mutant, src
        .replace(ROOT_TRIGGER, "const ROOT = join(process.cwd(), '..'); // ★变异:ROOT 重锚")
        .replace(CHAIN_ANCHOR, 'if (false) { // ★变异J2:链式判据门摘除'));
      const dump = dumpOf(mutant);
      for (const vid of ['1296', '1345', '2350', '4870']) {
        expect(dump.items[vid]?.useTime, `${vid} useTime 缺`).toBeUndefined();
        expect(dump.items[vid]?.useAnimation, `${vid} useAnimation 缺`).toBeUndefined();
      }
      expect(dump.items['4715']?.useAnimation, '4715 体面 anim12 仍在').toBe(12);
      expect(dump.items['4715']?.useTime, '4715 useTime 6→12（除式半边消失=链式 pass 判别）').toBe(12);
      expect(md5(LIVE_COMBAT)).toBe(b1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ★变异 J3:DefaultToWhip 形参位摘除 → 18 鞭回落 {noUseGraphic} 单键原病灶
  //  （BJ408 用户实报相）。★清偿刀 Q1 后调用点正则=全 DefaultTo\w+,Whip 走
  //  DEFAULT_TO_PARAMS 手编规格（体编译跳过手编族）——摘除点=callEffectOf Whip 门。
  it('变异 J3:DefaultToWhip 形参位摘除（callEffectOf Whip 门）→ 5480 回落 noUseGraphic 单键', () => {
    const dir = mkdtempSync(join(TMP, 'itemcombat-guard-'));
    const b1 = md5(LIVE_COMBAT);
    try {
      const src = readFileSync(SCRIPT, 'utf8');
      const ROOT_TRIGGER = "const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');";
      const CE_ANCHOR = 'function callEffectOf(name, argText, id) {\n  const spec = DEFAULT_TO_PARAMS[name];';
      expect(src).toContain(ROOT_TRIGGER);
      expect(src).toContain(CE_ANCHOR);
      const mutant = join(dir, 'extract-itemcombat-mutant-j3.mjs');
      writeFileSync(mutant, src
        .replace(ROOT_TRIGGER, "const ROOT = join(process.cwd(), '..'); // ★变异:ROOT 重锚")
        .replace(CE_ANCHOR, "function callEffectOf(name, argText, id) {\n  if (name === 'DefaultToWhip') return null; // ★变异J3:Whip 形参位摘除\n  const spec = DEFAULT_TO_PARAMS[name];"));
      const dump = dumpOf(mutant);
      expect(dump.items['5480'], '5480 回落 noUseGraphic 单键（damage/kb/anim 全缺）')
        .toEqual({ noUseGraphic: true });
      expect(dump.items['5473']).toEqual({ noUseGraphic: true });
      expect(md5(LIVE_COMBAT)).toBe(b1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ★变异 J4:守卫链数值面摘除（scopeFn 恒 false）→ 2320 战锤整件缺失复现
  //  （BJ408 预报「2320 无条目」的原病灶相）;2421/2422 钓竿对同缺;对照 case 字面件
  //   3287 不受影响（守卫链与 case 域互斥）。
  it('变异 J4:守卫链数值面摘除 → 2320/2421/2422 整件缺失复现', () => {
    const dir = mkdtempSync(join(TMP, 'itemcombat-guard-'));
    const b1 = md5(LIVE_COMBAT);
    try {
      const src = readFileSync(SCRIPT, 'utf8');
      const ROOT_TRIGGER = "const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');";
      const WALK_ANCHOR = 'guardNumericWalk(body, () => true, regions);';
      expect(src).toContain(ROOT_TRIGGER);
      expect(src).toContain(WALK_ANCHOR);
      const mutant = join(dir, 'extract-itemcombat-mutant-j4.mjs');
      writeFileSync(mutant, src
        .replace(ROOT_TRIGGER, "const ROOT = join(process.cwd(), '..'); // ★变异:ROOT 重锚")
        .replace(WALK_ANCHOR, 'guardNumericWalk(body, () => false, regions); // ★变异J4'));
      const dump = dumpOf(mutant);
      for (const vid of ['2320', '2421', '2422']) {
        expect(dump.items[vid], `${vid} 守卫链面摘除后整件缺失`).toBeUndefined();
      }
      expect(dump.items['3287'], '对照:case 域件不受守卫链摘除影响').toMatchObject({ damage: 70 });
      expect(md5(LIVE_COMBAT)).toBe(b1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ============================================================
  // ★清偿刀 Q1（2026-09-30,J 刀登记债「helper 体字段面」收口+C3 尾段数值面）
  //   根修判别力:①helper 体字面面 / ②SetDefaults3 尾段数值面 / ③helper 委托链 /
  //   ④形参消费（fail-loud）。每形态一刀变异;目标件均无 EXTRACT_PATCH 手补兜底
  //   （562/2192/5651/5594 皆不在 vanillaItemCombat.ts 补丁面;5594 补丁在 TS 层,
  //   --dump 断言的是 json 提取面,不受 TS 层影响）。
  // ============================================================

  // 根修行:helper 体面原生直出（--dump 零写盘）——可放置族/宠物/高尔夫/溶液/炸弹/
  // 尾段九件逐族锚。与 vanillaItemCombat.ts Q1 行为锁（combatWeapon 宠物/高尔夫退出）
  // 互为两面。
  it('根修行 Q1:helper 体面原生直出——六族抽样+尾段九件（--dump 零写盘）', () => {
    const b1 = md5(LIVE_COMBAT);
    const b2 = md5(LIVE_SOUND);
    const r = spawnSync('node', [SCRIPT, '--dump'], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, maxBuffer: 64 * 1024 * 1024 });
    expect(r.status).toBe(0);
    const dump = JSON.parse(r.stdout) as { items: Record<string, Record<string, unknown>>; useSound: Record<string, string> };
    // 可放置族（MusicBox 562/Tile 委托 Banner 5651/Wall 4052 time7/Torch 4383）
    expect(dump.items['562']).toEqual({ useTurn: true, useAnimation: 15, useTime: 10, autoReuse: true, consumable: true });
    expect(dump.items['5651']).toEqual({ useAnimation: 15, useTime: 10, useTurn: true, autoReuse: true, consumable: true });
    expect(dump.items['4052']).toMatchObject({ useTime: 7, useAnimation: 15, autoReuse: true, consumable: true, useTurn: true });
    expect(dump.items['4383']).toMatchObject({ useTime: 10, useAnimation: 15, autoReuse: true, consumable: true, useTurn: true });
    // CapturedCritter（261 显式 UseSound 面+体面）与 SeaShell（2625 贯穿组;体无 useTurn）
    expect(dump.items['261']).toEqual({ autoReuse: true, useTurn: true, useAnimation: 15, useTime: 10, consumable: true, noUseGraphic: true });
    expect(dump.items['2625']).toEqual({ autoReuse: true, useAnimation: 15, useTime: 10, consumable: true });
    // Vanitypet（4365:形参 shoot+体 damage0/anim20/time20/noMelee）
    expect(dump.items['4365']).toEqual({ damage: 0, useAnimation: 20, useTime: 20, noMelee: true, shoot: 764 });
    // 高尔夫球/球杆（3989 形参 shoot 721/球 4039 体 shoot722+speed6）
    expect(dump.items['3989']).toEqual({ shoot: 721, shootSpeed: 12, useAnimation: 15, useTime: 15, noUseGraphic: true, noMelee: true });
    expect(dump.items['4039']).toEqual({ shootSpeed: 6, shoot: 722, useTime: 12, useAnimation: 12, noMelee: true });
    // 溶液（5392:形参算式 projId-145 + AmmoID.Solution 枚举）/炸弹（5594:调位 type 算式）
    expect(dump.items['5392']).toEqual({ shoot: 870, ammo: 780, consumable: true });
    expect(dump.items['5594']).toEqual({ shootSpeed: 6, shoot: 1086, consumable: true, useAnimation: 40, useTime: 40, noUseGraphic: true, noMelee: true });
    // 割草机/吉他/发声配件（215 显式行后置覆写=30/30 保有,体面 17/17 不逆写）
    expect(dump.items['4049']).toEqual({ useAnimation: 30, useTime: 10, autoReuse: true });
    expect(dump.items['4057']).toEqual({ autoReuse: true, useTime: 12, useAnimation: 12 });
    expect(dump.items['215']).toEqual({ useTime: 30, useAnimation: 30, useTurn: true, noUseGraphic: true });
    // SetDefaults3 尾段九件（C3 定谳:守卫外尾段 :27621-27626 数值面）
    for (const vid of ['2192', '2193', '2194', '2195', '2196', '2197', '2198', '2203', '2204']) {
      expect(dump.items[vid], `尾段 ${vid}`).toEqual({ useTurn: true, useAnimation: 15, useTime: 10, autoReuse: true, consumable: true });
    }
    // 对照:零 combat 域 helper（Minecart 2343/Accessory 3990）不入表;守卫链面 8 不受扰
    expect(dump.items['2343']).toBeUndefined();
    expect(dump.items['3990']).toBeUndefined();
    expect(dump.items['8']).toMatchObject({ useTime: 10, useAnimation: 15 });
    // 别名后置族（4041-4048/4241 草种子:useTime = useAnimation 吃体面 15,非体面 useTime 10）
    expect(dump.items['4041']).toEqual({ autoReuse: false, useAnimation: 15, useTime: 15, useTurn: true, consumable: true });
    // 既有别名支回归锁:1226 字面先行（useAnimation=32 :15124 → useTime=32）
    expect(dump.items['1226']).toMatchObject({ useAnimation: 32, useTime: 32 });
    expect(md5(LIVE_COMBAT)).toBe(b1);
    expect(md5(LIVE_SOUND)).toBe(b2);
  });

  // ★变异 Q1-A:helper 体面摘除（callEffectOf 体编译规格门置 false）→ 可放置族回落
  //  {useTurn:true} 单键原病灶相（C3:「heldUseAnimation 回落 30+autoReuse 缺」）,
  //  体面新键件（4049/4365/3989/5392）整件/字段消失。
  it('变异 Q1-A:helper 体面摘除 → 562 回落 useTurn 单键;4049/5392 失联;3989 回落 noUseGraphic', () => {
    const dir = mkdtempSync(join(TMP, 'itemcombat-guard-'));
    const b1 = md5(LIVE_COMBAT);
    try {
      const src = readFileSync(SCRIPT, 'utf8');
      const ROOT_TRIGGER = "const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');";
      const BODY_ANCHOR = '  // ★清偿刀 Q1:helper 体编译规格（scanHelperBodySpecs 产物）接续消费\n  const bodySpec = DEFAULT_TO_BODY.get(name);\n  if (bodySpec) return bodySpec(argText, id);\n  return null;';
      expect(src).toContain(ROOT_TRIGGER);
      expect(src).toContain(BODY_ANCHOR);
      const mutant = join(dir, 'extract-itemcombat-mutant-q1a.mjs');
      writeFileSync(mutant, src
        .replace(ROOT_TRIGGER, "const ROOT = join(process.cwd(), '..'); // ★变异:ROOT 重锚")
        .replace(BODY_ANCHOR, '  const bodySpec = DEFAULT_TO_BODY.get(name);\n  if (false && bodySpec) return bodySpec(argText, id); // ★变异Q1-A:体面摘除\n  return null;'));
      const dump = dumpOf(mutant);
      expect(dump.items['562'], '562 回落 useTurn 单键（C3 病灶相）').toEqual({ useTurn: true });
      expect(dump.items['4049'], '4049 割草机整件失联').toBeUndefined();
      expect(dump.items['5392'], '5392 溶液整件失联').toBeUndefined();
      expect(dump.items['3989'], '3989 高尔夫球回落 noUseGraphic 单键').toEqual({ noUseGraphic: true });
      expect(dump.items['2192'], '对照:尾段面独立通道不受体面摘除影响').toMatchObject({ useTurn: true, useAnimation: 15 });
      expect(md5(LIVE_COMBAT)).toBe(b1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ★变异 Q1-B:SetDefaults3 尾段数值面摘除（尾段表回退 useTurn 单键,复现 C3 病灶）
  it('变异 Q1-B:尾段数值面摘除 → 2192 回落 useTurn 单键（C3 病灶相）', () => {
    const dir = mkdtempSync(join(TMP, 'itemcombat-guard-'));
    const b1 = md5(LIVE_COMBAT);
    try {
      const src = readFileSync(SCRIPT, 'utf8');
      const ROOT_TRIGGER = "const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');";
      const TAIL_ANCHOR = 'const SETDEFAULTS3_TAIL = { useTurn: true, useAnimation: 15, useTime: 10, autoReuse: true, consumable: true };';
      expect(src).toContain(ROOT_TRIGGER);
      expect(src).toContain(TAIL_ANCHOR);
      const mutant = join(dir, 'extract-itemcombat-mutant-q1b.mjs');
      writeFileSync(mutant, src
        .replace(ROOT_TRIGGER, "const ROOT = join(process.cwd(), '..'); // ★变异:ROOT 重锚")
        .replace(TAIL_ANCHOR, 'const SETDEFAULTS3_TAIL = { useTurn: true }; // ★变异Q1-B:尾段数值面摘除'));
      const dump = dumpOf(mutant);
      for (const vid of ['2192', '2196', '2203', '2204']) {
        expect(dump.items[vid], `${vid} 回落 useTurn 单键`).toEqual({ useTurn: true });
      }
      // 对照:562 走 helper 体面通道,与尾段互不掩护
      expect(dump.items['562']).toMatchObject({ useAnimation: 15, useTime: 10, autoReuse: true, consumable: true });
      expect(md5(LIVE_COMBAT)).toBe(b1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ★变异 Q1-C:helper 委托链摘除（spec 运行时跳过 delegate 步进）→ Banner/Monolith
  //  体面全失（其 combat 面全来自 PlaceableTile 基座）,三通道 useTurn 继承仍存活
  //  （独立通道旁证,同 M4 sound 侧道独立性判例）。
  it('变异 Q1-C:委托链摘除 → 5651 Banner 回落 useTurn 单键（基座面失联）', () => {
    const dir = mkdtempSync(join(TMP, 'itemcombat-guard-'));
    const b1 = md5(LIVE_COMBAT);
    try {
      const src = readFileSync(SCRIPT, 'utf8');
      const ROOT_TRIGGER = "const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');";
      const DEL_ANCHOR = '        if (st.delegate) {\n          const sub = DEFAULT_TO_BODY.get(st.delegate)(st.argText, id);';
      expect(src).toContain(ROOT_TRIGGER);
      expect(src).toContain(DEL_ANCHOR);
      const mutant = join(dir, 'extract-itemcombat-mutant-q1c.mjs');
      writeFileSync(mutant, src
        .replace(ROOT_TRIGGER, "const ROOT = join(process.cwd(), '..'); // ★变异:ROOT 重锚")
        .replace(DEL_ANCHOR, '        if (st.delegate) {\n          continue; // ★变异Q1-C:委托步进摘除'));
      const dump = dumpOf(mutant);
      expect(dump.items['5651'], '5651 Banner 基座面失联,三通道 useTurn 独立存活').toEqual({ useTurn: true });
      expect(dump.items['5113'], '5113 Monolith 同回落').toEqual({ useTurn: true });
      // 对照:直落体面件（562 无委托）不受扰
      expect(dump.items['562']).toMatchObject({ useAnimation: 15, autoReuse: true, consumable: true });
      expect(md5(LIVE_COMBAT)).toBe(b1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ★变异 Q1-D:形参消费摘除（evalBodyRhs 形参引用支移除）→ 炸弹 shoot=projectileID
  //  不可解 = 编译 fail-loud（era guard ③ 静默兜底禁令的运行时半边——不可解即炸,
  //  禁止把形参位吃成 undefined 静默缺字段）。
  it('变异 Q1-D:形参引用支摘除 → 5594 shoot 求值不可解 fail-loud（exit≠0+指名）', () => {
    const dir = mkdtempSync(join(TMP, 'itemcombat-guard-'));
    const b1 = md5(LIVE_COMBAT);
    try {
      const src = readFileSync(SCRIPT, 'utf8');
      const ROOT_TRIGGER = "const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');";
      const ENV_ANCHOR = '    if (env[s] !== undefined) return evalBodyRhs(env[s], env, id);\n    return evalCallArg(rhs, id);';
      expect(src).toContain(ROOT_TRIGGER);
      expect(src).toContain(ENV_ANCHOR);
      const mutant = join(dir, 'extract-itemcombat-mutant-q1d.mjs');
      writeFileSync(mutant, src
        .replace(ROOT_TRIGGER, "const ROOT = join(process.cwd(), '..'); // ★变异:ROOT 重锚")
        .replace(ENV_ANCHOR, '    // ★变异Q1-D:形参引用支摘除\n    return evalCallArg(rhs, id);'));
      const r = spawnSync('node', [mutant, '--dump'], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, maxBuffer: 64 * 1024 * 1024 });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('不可解');
      // 首个命中=SetDefaults5 首个形参消费调用点（DefaultToGolfBall(721) :35438）
      expect(r.stderr).toContain('DefaultToGolfBall 字段 shoot 不可解:projid');
      expect(md5(LIVE_COMBAT)).toBe(b1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ★变异 Q1-E:后置别名 pass 摘除（useTime = useAnimation 别名行在 helper 调用后
  //  的右值换源支）→ 4041 族 useTime 15→10 回落（体面直填值漏过别名覆写）,
  //  对照 1226（字面先行,既有支解析）不受扰。
  it('变异 Q1-E:后置别名 pass 摘除 → 4041 useTime 15→10 回落;1226 不受扰', () => {
    const dir = mkdtempSync(join(TMP, 'itemcombat-guard-'));
    const b1 = md5(LIVE_COMBAT);
    try {
      const src = readFileSync(SCRIPT, 'utf8');
      const ROOT_TRIGGER = "const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');";
      const ALIAS_ANCHOR = '      if (callAt >= 0 && aliasAt > callAt && !laterLit) rec.useTime = rec.useAnimation;';
      expect(src).toContain(ROOT_TRIGGER);
      expect(src).toContain(ALIAS_ANCHOR);
      const mutant = join(dir, 'extract-itemcombat-mutant-q1e.mjs');
      writeFileSync(mutant, src
        .replace(ROOT_TRIGGER, "const ROOT = join(process.cwd(), '..'); // ★变异:ROOT 重锚")
        .replace(ALIAS_ANCHOR, '      if (false) rec.useTime = rec.useAnimation; // ★变异Q1-E:后置别名支摘除'));
      const dump = dumpOf(mutant);
      expect(dump.items['4041']?.useTime, '4041 useTime 回落体面直填 10（别名覆写丢失）').toBe(10);
      expect(dump.items['4241']?.useTime, '4241 同族回落').toBe(10);
      expect(dump.items['1226']?.useTime, '对照:1226 字面先行走既有支不受扰').toBe(32);
      expect(md5(LIVE_COMBAT)).toBe(b1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
