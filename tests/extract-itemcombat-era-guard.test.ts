import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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

describe('extract-itemcombat era guard（B-form 干跑对拍 + 输出通道三分离）', () => {
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
  //   → 1296/1345/2350/4870/4715 useTime/useAnimation 双缺复现 BJ408 债#2 同族
  //  （2350 手补退役后无兜底=判别面）。
  it('变异 J2:链式赋值 pass 摘除 → 1296/2350/4715 anim/time 双缺复现', () => {
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
      expect(dump.items['4715']?.useAnimation, '4715 链式 anim 缺').toBeUndefined();
      expect(dump.items['4715']?.useTime, '4715 复合除 useTime 缺').toBeUndefined();
      expect(md5(LIVE_COMBAT)).toBe(b1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ★变异 J3:DefaultToWhip 形参位摘除（调用点正则去 Whip）→ 18 鞭回落
  //   {noUseGraphic} 单键原病灶（BJ408 用户实报相;combat 表与 vanilla-whips.json
  //   双源同值,J3 后 combat 单源自证）。
  it('变异 J3:DefaultToWhip 形参位摘除 → 5480 回落 noUseGraphic 单键', () => {
    const dir = mkdtempSync(join(TMP, 'itemcombat-guard-'));
    const b1 = md5(LIVE_COMBAT);
    try {
      const src = readFileSync(SCRIPT, 'utf8');
      const ROOT_TRIGGER = "const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');";
      const WHIP_ANCHOR = '|MagicWeapon|Whip))\\s*\\((.*)\\);\\s*$';
      expect(src).toContain(ROOT_TRIGGER);
      expect(src).toContain('|MagicWeapon|Whip))');
      const mutant = join(dir, 'extract-itemcombat-mutant-j3.mjs');
      writeFileSync(mutant, src
        .replace(ROOT_TRIGGER, "const ROOT = join(process.cwd(), '..'); // ★变异:ROOT 重锚")
        .replace(WHIP_ANCHOR, '|MagicWeapon))\\s*\\((.*)\\);\\s*$')); // ★变异J3
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
});
