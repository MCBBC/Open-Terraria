import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, realpathSync, mkdirSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ★清债（2026-09-18，BJ114-e 同族普查）：extract-projectiles.mjs producer 追加时代守卫
// ——vanilla-projectiles.json 现库含 producer 输出面之外的增量字段（鞭/多弹族
// localNPCHitCooldown / idStaticNPCHitCooldown / 1117·1122 宽高元组等 33 键，恢复指引
// = src/data/vanillaProjectiles.ts 头注手补清单），本 producer=纯全量覆写（不读现有），
// SW_ITEM_VER=1456 跑会把 1457 特有弹段 1111-1135（ProjectileID.Count=1136 的 25 弹）
// 整段洗掉——CLAUDE.md「vanilla-projectiles.json 曾被 1456 提取器重跑，须对照 1457
// 逐值校验」的制度化解法。照 era guard 判例（atlas 四连 / recipes R25-B5② / npcs 债
// 刀-3）落闸：守卫=重产 vs 现库【动态 diff】①缺 id（1111-1135 段整缺=1456 源指纹，
// 探测动态比对不硬编码 id 清单）+②损失面（现库独有字段=洗列 / 同字段值差=真值变）。
// 守卫测试习语 = extract-npcs-era-guard.test.ts / extract-itemrare-era-guard.test.ts。
//
// ★反哺批（2026-09-18，BJ127 33 键收口）：手补增量已反哺进 producer 输出面（免疫四列/
// 元组/ApplyGemStaffStats/switch(2) 常量支/MaxUpdates 算式+num2 别名+15/MaxUpdates 除式
// ——形态清单与行号锚见 tools/extract-projectiles.mjs 头注①-⑥），重产 vs 现库=零损失
// →【守卫放行】（判据细化:损失面=缺 id/独有字段/值差,拒绝;增益面=重产新增覆盖字段
// ——producer 面超前于 json 冻结态=预期,放行+高声通告,拦截增益=把反哺成果当事故）。
// ★BJ129③（2026-09-18）：嵌套 if/else 裸 else 支漏入已修（头注⑧）+json 走双旗通道
//   重产落表（245 键增益+9 键宽高勘正全部落库,recon DRIFT=0）——producer vs 现库=
//   零增益零损失【静默放行】,原「增益面高声通告」断言随落库翻转;勘正九键
//   76/77/326/327/400/401/567/1107/1108 入行为锚（567/568 同块 else 支本即真值不动）。
// 判别力锁:损失夹具（现库独有字段 alpha + 值差 light）默认运行必拒、摘守卫必静默洗掉。
//
// ★g1 footgun 硬化测试（2026-09-18，红蓝-F①）：探测 env（SW_PROJ_JSON）设置而
// SW_OUT 缺省 → 拒跑 exit 1（fail-closed——守卫探测将读夹具零缺失放行，写盘却落
// 缺省现库路径=绕守卫洗库）；同场景 + 显式 SW_OUT → 放行；变异=摘硬化 → 探测
// 夹具+缺 SW_OUT 下写盘落「缺省现库」路径（变异里把缺省 OUT_JSON 换成沙箱假现库
// =真现库副本+alpha 洗列物证种子）复现洗库，真现库零接触。

const SCRIPT = join(process.cwd(), 'tools', 'extract-projectiles.mjs');
const LIVE = join(process.cwd(), 'src', 'data', 'vanilla-projectiles.json');
const md5 = (p: string) => createHash('md5').update(readFileSync(p)).digest('hex');
// ★macOS /var→/private/var 符号链接:import.meta.url 是 realpath 而 pathToFileURL(argv[1])
//   不是——mutant 脚本放 /var 下会因 URL 不匹配跳过 CLI 分支。临时目录一律取 realpath。
const TMP = realpathSync(tmpdir());
/** 注入面:SW_OUT 重定向写盘(守卫失灵时测试也伤不到现库)+探测路径显式钉回现库
 *  (缺省探测路径跟随 SW_OUT,不钉=探测落空,守卫测不到真实现库)。 */
const rejectEnv = (dir: string) => ({
  ...process.env,
  SW_OUT: dir,
  SW_PROJ_JSON: LIVE,
});

/** 稳定零增量夹具：与 1457 重产输出逐字段相等（守卫不误伤基线;取自现库未反哺波及
 *  键 3/16 的稳定原版值——3 无免疫/无算式列,16 的 light=0.8 字面） */
const CLEAN_FIXTURE = JSON.stringify({
  3: { aiStyle: 2, width: 22, height: 22, penetrate: 4, friendly: true, ranged: true },
  16: { aiStyle: 9, width: 32, height: 32, light: 0.8, friendly: true, magic: true, ignoreWater: true },
});
/** 损失夹具（反哺后判别力载体）：id 3 带 alpha=255（alpha 未入 NUM_FIELDS=重产永不
 *  产出=现库独有字段形态）;id 16 的 light 拧成 0.9（同字段值差=真值变形态）。
 *  两形态默认运行都必须被拒——这是「守卫拦截手补被洗/被改」的活体样本。 */
const LOSS_FIXTURE = JSON.stringify({
  3: { aiStyle: 2, width: 22, height: 22, penetrate: 4, friendly: true, ranged: true, alpha: 255 },
  16: { aiStyle: 9, width: 32, height: 32, light: 0.9, friendly: true, magic: true, ignoreWater: true },
});

describe('extract-projectiles 追加时代守卫（缺 id+损失面双判据;反哺后增益面放行）', () => {
  it('行为面:BJ127 反哺+BJ129③ 勘正重产后 vs 现库=零 diff 静默放行,现库字节零改动', () => {
    const dir = mkdtempSync(join(TMP, 'proj-guard-'));
    const out = join(dir, 'regen.json');
    const before = md5(LIVE);
    try {
      const r = spawnSync('node', [SCRIPT], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_OUT: out, SW_PROJ_JSON: LIVE },
      });
      expect(r.status).toBe(0);                                  // 零损失=放行（反哺前此面 33 键漂移必拒）
      expect(r.stderr).not.toContain('反哺增益面');               // BJ129③ 重产落库后零增益=静默（重产前此面曾通告 245 键）
      expect(r.stderr).not.toContain('拒绝全量覆写');             // 零损失面（BJ129③ 九键勘正已落表）
      expect(md5(LIVE)).toBe(before);                             // 放行路径零接触现库（SW_OUT 注入）
      // ★33 键全覆盖行为锚（反哺目标=重产不再洗手补清单;值=vanillaProjectiles.ts
      //   手补台账 1:1,源码锚见提取器头注①-⑤）:
      const prod = JSON.parse(readFileSync(out, 'utf8')) as Record<string, Record<string, unknown>>;
      expect(Object.keys(prod).length).toBeGreaterThan(1000);
      expect('1111' in prod).toBe(true);                          // 1457 特有弹段在位
      expect(prod['76']?.localNPCHitCooldown).toBe(30);           // switch(2) 常量支+num2 别名（:1583-1593）
      expect(prod['76']?.usesLocalNPCImmunity).toBe(true);
      expect(prod['121']?.localNPCHitCooldown).toBe(60);          // ApplyGemStaffStats() 展开（:10685-10691）
      expect(prod['121']?.timeLeft).toBe(300);
      expect(prod['301']?.localNPCHitCooldown).toBe(10);
      expect(prod['309']?.localNPCHitCooldown).toBe(10);
      expect(prod['639']?.localNPCHitCooldown).toBe(-1);          // :6886-6887 字面对
      expect(prod['639']?.timeLeft).toBe(90);                     // MaxUpdates*45 算式（:6883-6884）
      expect(prod['639']?.extraUpdates).toBe(1);                  // MaxUpdates=2 别名折算
      expect(prod['932']?.localNPCHitCooldown).toBe(60);
      expect(prod['1117']?.width).toBe(16);                       // 元组 (height=16) 展开（:10431）
      expect(prod['1117']?.height).toBe(16);
      expect(prod['1122']?.width).toBe(16);
      expect(prod['1122']?.idStaticNPCHitCooldown).toBe(10);      // :10449-10450
      expect(prod['1128']?.idStaticNPCHitCooldown).toBe(30);
      expect(prod['1134']?.idStaticNPCHitCooldown).toBe(20);
      expect(prod['1135']?.idStaticNPCHitCooldown).toBe(10);
      expect(prod['1112']?.localNPCHitCooldown).toBe(9);
      expect(prod['1091']?.width).toBe(16);                       // :10179 元组（手补清单外新增覆盖）
      expect(prod['466']?.timeLeft).toBe(600);                    // 120*(extraUpdates+1)（:5404）
      expect(prod['933']?.localNPCHitCooldown).toBe(7);           // 15/MaxUpdates C# 整除（:8872）
      // 放行不等于洗白：现库 33 键的值必须与重产逐键同值（损失面判据已在守卫内验证,
      // 此处抽样钉死——值漂移会先被守卫拒绝到不了这里）
      expect(prod['1119']?.localNPCHitCooldown).toBe(30);
      expect(prod['1131']?.localNPCHitCooldown).toBe(60);
      // ★BJ129③ 嵌套 if/else 裸 else 支漏入勘正（头注⑧;源码亲读 1457 P.cs）：
      //   76=10×22(:1561-1564)/77=18×24(:1565-1568)——曾吃 else(78) 支 22×24;
      //   326=14×16(:4196)/327=12×14(:4200)——曾吃 else(328) 支 6×12;
      //   400=14×16(:4815)/401=12×14(:4819);567=14×14(:6190,SW-FX1 DATA_PATCH 先例);
      //   1107=14×16(:10319)/1108=12×14(:10324)。else 支本尊 78/328/402/568/1109 不变。
      expect(prod['76']?.width).toBe(10);
      expect(prod['76']?.height).toBe(22);
      expect(prod['77']?.width).toBe(18);
      expect(prod['77']?.height).toBe(24);
      expect(prod['78']?.width).toBe(22);
      expect(prod['78']?.height).toBe(24);
      expect(prod['326']?.width).toBe(14);
      expect(prod['326']?.height).toBe(16);
      expect(prod['327']?.width).toBe(12);
      expect(prod['327']?.height).toBe(14);
      expect(prod['328']?.width).toBe(6);
      expect(prod['400']?.width).toBe(14);
      expect(prod['400']?.height).toBe(16);
      expect(prod['401']?.width).toBe(12);
      expect(prod['401']?.height).toBe(14);
      expect(prod['567']?.width).toBe(14);
      expect(prod['567']?.height).toBe(14);
      expect(prod['568']?.width).toBe(16);
      expect(prod['1107']?.width).toBe(14);
      expect(prod['1107']?.height).toBe(16);
      expect(prod['1108']?.width).toBe(12);
      expect(prod['1108']?.height).toBe(14);
      expect(prod['1109']?.width).toBe(6);
      expect(prod['1109']?.height).toBe(12);
      // ★J1 反哺批（红蓝-J1①,2026-09-18）：UseGroupStaticImmunity(int Type) 参数化展开
      //   （helper :10678-10683 + 7 活调用点 :2686=181/:5816=511/:5828=511/:5840=511/
      //   :6185=181/:6206=567/:6219=569 亲读核实）——10 id 得三列 usesIDStaticNPCImmunity/
      //   idStaticNPCHitCooldown=10/immunityIdentity（组键行,:12595 门/:13823/:14037 写）。
      //   组键映射：566→181、512/513→511、568→567、570/571→569（其余=自身）;头注④旧判
      //   「仅 switch(2) 死支可达」为假命题,76-78 死支（switch(2) case 1）不得命中。
      for (const id of ['181', '511', '512', '513', '566', '567', '568', '569', '570', '571']) {
        expect(prod[id]?.usesIDStaticNPCImmunity).toBe(true);
        expect(prod[id]?.idStaticNPCHitCooldown).toBe(10);
      }
      expect(prod['181']?.immunityIdentity).toBe(181);
      expect(prod['511']?.immunityIdentity).toBe(511);
      expect(prod['512']?.immunityIdentity).toBe(511);
      expect(prod['513']?.immunityIdentity).toBe(511);
      expect(prod['566']?.immunityIdentity).toBe(181);
      expect(prod['567']?.immunityIdentity).toBe(567);
      expect(prod['568']?.immunityIdentity).toBe(567);
      expect(prod['569']?.immunityIdentity).toBe(569);
      expect(prod['570']?.immunityIdentity).toBe(569);
      expect(prod['571']?.immunityIdentity).toBe(569);
      expect(prod['76']?.usesIDStaticNPCImmunity).toBeUndefined();   // 死支纪律:case 1 照弃
      expect(prod['77']?.immunityIdentity).toBeUndefined();
      expect(prod['78']?.idStaticNPCHitCooldown).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:SW_ITEM_VER=1456 跑被缺 id 判据拒（1457 特有弹段 1111-1135 指纹动态捕获）', () => {
    const dir = mkdtempSync(join(TMP, 'proj-guard-'));
    const before = md5(LIVE);
    try {
      const r = spawnSync('node', [SCRIPT], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...rejectEnv(dir), SW_ITEM_VER: '1456' },
      });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('缺 id');
      expect(r.stderr).toContain('25 个');                        // 1457 新增 25 弹整缺
      expect(r.stderr).toContain('1111');                         // 段首 id（动态列举,非硬编码断言源）
      expect(md5(LIVE)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:损失夹具（现库独有字段 alpha+值差 light）默认运行被拒,现库字节零改动', () => {
    const dir = mkdtempSync(join(TMP, 'proj-guard-'));
    const fixture = join(dir, 'loss.json');
    const out = join(dir, 'out.json');
    writeFileSync(fixture, LOSS_FIXTURE);
    const before = md5(LIVE);
    try {
      const r = spawnSync('node', [SCRIPT], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_PROJ_JSON: fixture, SW_OUT: out },
      });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('拒绝全量覆写');
      expect(r.stderr).toContain('损失面');
      expect(r.stderr).toContain('现库独有字段');                 // 判据②a:洗列形态
      expect(r.stderr).toContain('alpha');
      expect(r.stderr).toContain('值差');                         // 判据②b:真值变形态
      expect(r.stderr).toContain('--force-full');                 // 双旗逃生指引
      expect(md5(LIVE)).toBe(before);                             // 拒绝路径零写盘
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:--force-full 单旗仍被拒（双旗第二键 --overwrite-append-era 在位）', () => {
    const dir = mkdtempSync(join(TMP, 'proj-guard-'));
    const fixture = join(dir, 'loss.json');
    const out = join(dir, 'out.json');
    writeFileSync(fixture, LOSS_FIXTURE);
    const before = md5(LIVE);
    try {
      const r = spawnSync('node', [SCRIPT, '--force-full'], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_PROJ_JSON: fixture, SW_OUT: out },
      });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('拒绝全量覆写');
      expect(r.stderr).toContain('--overwrite-append-era');
      expect(md5(LIVE)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('结构锁:拒绝路径守卫块内零写盘+双旗逃生门/损失面探测/活通道锚在位', () => {
    const src = readFileSync(SCRIPT, 'utf8');
    const guardStart = src.indexOf('const appendEra');
    const guardEnd = src.indexOf('process.exit(1)', guardStart);
    expect(guardStart).toBeGreaterThan(-1);
    expect(guardEnd).toBeGreaterThan(guardStart);
    const guardBlock = src.slice(guardStart, guardEnd);
    expect(guardBlock).not.toContain('writeFileSync(');   // 拒绝路径零写盘的结构前提
    expect(src).toContain('--force-full');
    expect(src).toContain('--overwrite-append-era');
    // 探测式=动态现库 diff（缺 id + 损失面[现库独有字段/值差] + 增益面[重产新增覆盖]），
    // 非硬编码 id 清单
    expect(src).toContain('jsonEq(');
    expect(src).toContain('appendEra = missingIds.length > 0 || lossKeys.length > 0');
    // 活通道锚在位
    expect(src).toContain('recon-item-1456-1457.mjs');
  });

  it('行为面:双旗逃生门放行（SW_OUT 注入 /tmp,全量重算=真实覆写语义,现库零接触）', () => {
    const dir = mkdtempSync(join(TMP, 'proj-guard-'));
    const out = join(dir, 'full.json');
    const before = md5(LIVE);
    try {
      const r = spawnSync('node', [SCRIPT, '--force-full', '--overwrite-append-era'], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_OUT: out },
      });
      expect(r.status).toBe(0);
      const prod = JSON.parse(readFileSync(out, 'utf8')) as Record<string, Record<string, unknown>>;
      expect(Object.keys(prod).length).toBeGreaterThan(1000);   // 1457 全量重算产物
      expect('1111' in prod).toBe(true);                        // 1457 特有弹段在位
      // ★反哺后重产【自带】手补清单值（提取器头注①-⑤）——「重产不含手补增量」
      //   的旧断言随反哺翻转:76 免疫冷却=源码 switch(2) 常量支 num2 别名终值
      expect(prod['76']?.localNPCHitCooldown).toBe(30);
      expect(prod['1117']?.height).toBe(16);
      expect(md5(LIVE)).toBe(before);                           // 现库零接触
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:零增量夹具放行（守卫不误伤;SW_PROJ_JSON/SW_OUT 双注入,零接触现库）', () => {
    const dir = mkdtempSync(join(TMP, 'proj-guard-'));
    const fixture = join(dir, 'clean.json');
    const out = join(dir, 'out.json');
    writeFileSync(fixture, CLEAN_FIXTURE);
    const before = md5(LIVE);
    try {
      const r = spawnSync('node', [SCRIPT], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_PROJ_JSON: fixture, SW_OUT: out },
      });
      expect(r.status).toBe(0);
      const written = JSON.parse(readFileSync(out, 'utf8')) as Record<string, unknown>;
      expect(Object.keys(written).length).toBeGreaterThan(1000);   // 全量重算产物落注入路径
      expect(md5(LIVE)).toBe(before);                              // 注入面隔离,现库零接触
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ★变异（判别力）:摘掉守卫判据 → 损失夹具被静默洗掉（exit 0+alpha 列消失/
  //   light 值差被打回落盘）。证明「守卫是手补增量下唯一的拦截面」，摘 guard 必红
  //  （重跑抹手补清单事故重演,vanillaProjectiles.ts 头注⚠即此案）。
  it('变异:摘守卫判据后损失夹具被静默洗掉(证明 guard 判别力)', () => {
    const dir = mkdtempSync(join(TMP, 'proj-guard-'));
    const mutant = join(dir, 'extract-projectiles-mutant.mjs');
    const fixture = join(dir, 'loss.json');
    const out = join(dir, 'out.json');
    const src = readFileSync(SCRIPT, 'utf8');
    const TRIGGER = 'const appendEra = missingIds.length > 0 || lossKeys.length > 0;';
    expect(src).toContain(TRIGGER);
    writeFileSync(mutant, src.replace(TRIGGER, 'const appendEra = false; // ★变异:守卫判据摘除'));
    writeFileSync(fixture, LOSS_FIXTURE);
    const before = md5(LIVE);
    try {
      const r = spawnSync('node', [mutant], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_PROJ_JSON: fixture, SW_OUT: out },
      });
      expect(r.status).toBe(0);                                 // 无 guard → 放行
      const written = JSON.parse(readFileSync(out, 'utf8')) as Record<string, Record<string, unknown>>;
      expect(written['3']?.alpha).toBeUndefined();              // 现库独有字段被静默洗掉=事故重演
      expect(written['16']?.light).toBe(0.8);                   // 值差被打回重产值
      expect(md5(LIVE)).toBe(before);                           // 注入面隔离,现库零接触
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ★g1 footgun 硬化（红蓝-F①,2026-09-18）：探测 env 设置而 SW_OUT 缺省 → fail-closed
  //  拒跑 exit 1。定谳:守卫探测将读夹具（零缺失→放行）而写盘落缺省 OUT_JSON=现库
  //  game/src/data/vanilla-projectiles.json——探测与写盘分离=守卫被绕过洗库。
  it('行为面:探测 env 设置而 SW_OUT 缺省 → 拒跑 exit 1（footgun fail-closed）,现库字节零改动', () => {
    const dir = mkdtempSync(join(TMP, 'proj-guard-'));
    const fixture = join(dir, 'clean.json');
    writeFileSync(fixture, CLEAN_FIXTURE);
    const before = md5(LIVE);
    try {
      const env: Record<string, string | undefined> = {
        ...process.env, SW_PROJ_JSON: fixture,
      };
      delete env.SW_OUT;   // footgun 场景=写盘路径缺省（显式剥除防运行环境污染）
      const r = spawnSync('node', [SCRIPT], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: env as NodeJS.ProcessEnv,
      });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('SW_OUT 缺省');
      expect(r.stderr).toContain('fail-closed');
      expect(r.stderr).toContain('探测注入面');
      expect(r.stderr).toContain('--dump 对账通道不写盘不受此限');   // dump 通道豁免指引在位
      expect(md5(LIVE)).toBe(before);                            // 拒绝路径零写盘
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:同 footgun 场景 + 显式 SW_OUT → 放行（写盘落 SW_OUT）,现库零接触', () => {
    const dir = mkdtempSync(join(TMP, 'proj-guard-'));
    const fixture = join(dir, 'clean.json');
    const out = join(dir, 'out.json');
    writeFileSync(fixture, CLEAN_FIXTURE);
    const before = md5(LIVE);
    try {
      const r = spawnSync('node', [SCRIPT], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_PROJ_JSON: fixture, SW_OUT: out },
      });
      expect(r.status).toBe(0);                                  // 硬化只拦 SW_OUT 缺省
      const written = JSON.parse(readFileSync(out, 'utf8')) as Record<string, unknown>;
      expect(Object.keys(written).length).toBeGreaterThan(1000); // 全量重算产物落显式 SW_OUT
      expect(md5(LIVE)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ★变异（判别力）:摘 footgun 硬化 → 探测夹具（零缺失）+缺 SW_OUT 下守卫被绕过,
  //  写盘落缺省「现库」路径=footgun 复现。变异里把缺省 OUT_JSON 换成沙箱假现库
  //  （种子=真现库副本+id3 alpha 洗列物证）——重产洗掉 alpha=洗库物证;真现库零接触。
  it('变异:摘 footgun 硬化后探测夹具+缺 SW_OUT 写盘落缺省现库路径（alpha 被洗=footgun 复现）', () => {
    const dir = mkdtempSync(join(TMP, 'proj-guard-'));
    const fakeLive = join(dir, 'live');
    mkdirSync(fakeLive, { recursive: true });
    // 假现库=真现库副本 + id3 alpha=255（现库独有字段形态=洗列物证）
    const seeded = JSON.parse(readFileSync(LIVE, 'utf8')) as Record<string, Record<string, unknown>>;
    seeded['3'] = { ...seeded['3'], alpha: 255 };
    writeFileSync(join(fakeLive, 'vanilla-projectiles.json'), JSON.stringify(seeded));
    const fixture = join(dir, 'clean.json');
    writeFileSync(fixture, CLEAN_FIXTURE);
    const src = readFileSync(SCRIPT, 'utf8');
    const TRIGGER = 'const PROBE_ENV_SET = process.env.SW_PROJ_JSON !== undefined;';
    const OUT_LINE = 'const OUT_JSON = process.env.SW_OUT ?? `${ROOT}/game/src/data/vanilla-projectiles.json`;';
    expect(src).toContain(TRIGGER);
    expect(src).toContain(OUT_LINE);
    const mutant = join(dir, 'extract-projectiles-mutant.mjs');
    writeFileSync(mutant, src
      .replace(TRIGGER, 'const PROBE_ENV_SET = false; // ★变异:footgun 硬化摘除')
      .replace(OUT_LINE, 'const OUT_JSON = process.env.SW_MUTANT_FAKE_LIVE;'));
    const before = md5(LIVE);
    try {
      const env: Record<string, string | undefined> = {
        ...process.env, SW_PROJ_JSON: fixture, SW_MUTANT_FAKE_LIVE: join(fakeLive, 'vanilla-projectiles.json'),
      };
      delete env.SW_OUT;
      const r = spawnSync('node', [mutant], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: env as NodeJS.ProcessEnv,
      });
      expect(r.status).toBe(0);                                 // 硬化摘除 → footgun 放行
      const washed = JSON.parse(readFileSync(join(fakeLive, 'vanilla-projectiles.json'), 'utf8')) as Record<string, Record<string, unknown>>;
      expect(washed['3']?.alpha).toBeUndefined();               // 假现库被重产洗掉独有字段=洗库复现
      expect(washed['3']?.aiStyle).toBe(2);                     // 写盘确为重产全量（非空非原样）
      expect(md5(LIVE)).toBe(before);                           // 真现库零接触（OUT_JSON 已换沙箱）
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ★J1 变异①（判别力,2026-09-18）：摘参数化辅助展开 → 10 id 三列整缺（重产 vs 现库
  //  =现库独有字段损失面,守卫必拒;双旗强推后列被洗=J1 数据面回滚复现）。证明展开支
  //  是 10 id 免疫三列的唯一拦截面,摘掉必红。
  it('变异:摘 UseGroupStaticImmunity 参数化展开后 10 id 三列被洗(证明展开判别力)', () => {
    const dir = mkdtempSync(join(TMP, 'proj-guard-'));
    const mutant = join(dir, 'extract-projectiles-mutant-j1.mjs');
    const out = join(dir, 'out.json');
    const src = readFileSync(SCRIPT, 'utf8');
    const TRIGGER = 'const g = /^UseGroupStaticImmunity\\((-?[\\d.]+)\\);$/.exec(l);';
    expect(src).toContain(TRIGGER);
    writeFileSync(mutant, src.replace(
      TRIGGER,
      'const g = null; // ★变异:参数化辅助展开摘除（红蓝-J1①）',
    ));
    const before = md5(LIVE);
    try {
      // 守卫面对被洗产物=损失面（现库独有字段）必拒 → 双旗强推走洗库复现
      const r = spawnSync('node', [mutant, '--force-full', '--overwrite-append-era'], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_OUT: out },
      });
      expect(r.status).toBe(0);
      const written = JSON.parse(readFileSync(out, 'utf8')) as Record<string, Record<string, unknown>>;
      expect(written['181']?.usesIDStaticNPCImmunity).toBeUndefined();   // 三列整缺=J1 回滚
      expect(written['181']?.immunityIdentity).toBeUndefined();
      expect(written['566']?.idStaticNPCHitCooldown).toBeUndefined();
      expect(written['181']?.aiStyle).toBe(36);                          // 写盘确为全量重产
      expect(md5(LIVE)).toBe(before);                                    // 现库零接触
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ★J1 变异②（判别力）：组键代入变异（g[1]→0）→ immunityIdentity 全变 0（组键映射
  //  566→181/568→567/570→569 消失=组共享行语义崩坏）。证明代入点是组键唯一载体。
  it('变异:组键实值代入改 0 后 immunityIdentity 组键映射消失(证明代入判别力)', () => {
    const dir = mkdtempSync(join(TMP, 'proj-guard-'));
    const mutant = join(dir, 'extract-projectiles-mutant-j1b.mjs');
    const out = join(dir, 'out.json');
    const src = readFileSync(SCRIPT, 'utf8');
    const TRIGGER = ", 'g'), g[1]));";
    expect(src).toContain(TRIGGER);
    writeFileSync(mutant, src.replace(
      TRIGGER,
      ", 'g'), 0)); // ★变异:组键代入改 0（红蓝-J1①）",
    ));
    const before = md5(LIVE);
    try {
      const r = spawnSync('node', [mutant, '--force-full', '--overwrite-append-era'], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_OUT: out },
      });
      expect(r.status).toBe(0);
      const written = JSON.parse(readFileSync(out, 'utf8')) as Record<string, Record<string, unknown>>;
      expect(written['181']?.immunityIdentity).toBe(0);                  // 组键全变 0
      expect(written['566']?.immunityIdentity).toBe(0);                  // 566→181 映射消失
      expect(written['568']?.immunityIdentity).toBe(0);                  // 568→567 映射消失
      expect(written['570']?.immunityIdentity).toBe(0);                  // 570→569 映射消失
      expect(written['181']?.idStaticNPCHitCooldown).toBe(10);           // 其余两列不受影响
      expect(md5(LIVE)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
