import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
// ★C档可移植:被守卫工具读仓库外反编译树/素材源(game/ 兄弟目录,clone 侧缺=正常形态)——缺则本文件 skip,本机在=真跑零语义变化
const EXT_MISSING = !['Terarria1457'].every((d) => existsSync(new URL(`../../${d}`, import.meta.url)));


// ★BJ261（2026-09-22）：extract-npcdrops.mjs 1457 重锚 + era guard 落闸守卫测试。
//
// 债源链：红蓝 S5（E1 普查案）定级「唯一旧基线险实弹」——原提取器 1456 硬锚
// （ItemDropDatabase.cs/NPC.cs/SlimeBodyItemDropRule.cs 三源 1456 路径）+ 裸跑直写两活库
// （相对路径 cwd 敏感 + 无通道）。BJ261 重锚 1457（ItemDropDatabase.cs 与 1458 逐字节
// 全等 md5 cdc9c108；NPC.cs SetDefaults/SetDefaultsFromNetId 两读域 1457↔1458 全等；
// SlimeBodyItemDropRule.cs 三版全等），apply1457DropPatches 补丁面退役（12 处 1457 注册锚
// fail-loud 承载同等判别力；干跑对拍实证 630 条目多重集零差——唯一位序差=6173@395 回归
// 源码序 :926，旧补丁「插在 masterAll 后」系位序工件）。
//
// 同刀勘误（活库对账逐值定谳,反编译为准）：①callRule ScalingWithOnlyBadLuck 坍缩成普通
//   common（:179 4271 蓝史莱姆明胶,正运白吃加成）→ 补 onlyBadLuck:1（消费面 NpcDrops.ts:432
//   R14-A1 在）；②vanilla-npcvalue 589:60 系 BJ174 前旧「定窗分段」把 590/591 块 value=60f
//   渗漏进来（type==589 块 1456/1457 均无 value 赋值）→ 删;590/591 真值 60 反整缺（旧 mark
//   正则漏 || 组）→ 补;455-458 真值 0f（缺失≡0 纯形状差）→ 补。
//
// era guard 四要素（docs/era-guard-family.md）：①SW_ITEM_VER 缺省 1457 白名单 {1457,1458}
//   fail-closed（1456 锚集退役显式拒）②输出通道三分离（缺省干跑对拍零写盘·双向 diff /
//   SW_OUT 沙箱 / --write-real 逃生门+非纯增量拒+双旗互斥+非 1457 禁写;探测注入面
//   SW_NPCDROPS_JSON/SW_NPCVALUE_JSON 与 --write-real 混用拒=g1）③锚 fail-loud（12 处
//   1457 注册锚+POOL_METHODS 池回读+三签名+三基数护栏）④判别力自证（本文件变异 M1 摘
//   干跑门/M2 毒化锚/M3 摘 fresh-only 轴=G-1 bossbags 删 spawn 恒绿同族复现）。

const SCRIPT = join(process.cwd(), 'tools', 'extract-npcdrops.mjs');
// ★C档可移植:工具 ROOT 已转 import.meta 相对(era-guard-family ④ 习语)——
//   mutant 置 OS tmp 须前置重锚到本仓项目根(game/ 父目录);工具无该行=无操作
const ROOT_LINE = "const ROOT = process.env.SW_PROJECT_ROOT ?? new URL('../../', import.meta.url).pathname.replace(/\\/+$/, '');   // ★C档可移植:game/ 父目录(反编译树/TEdit/Calamity 源所在)";
const relocateRoot = (src: string) => src.replace(ROOT_LINE, `const ROOT = ${JSON.stringify(join(process.cwd(), '..'))};`);

const LIVE_DROPS = join(process.cwd(), 'src', 'data', 'vanilla-npcdrops.json');
const LIVE_VALUE = join(process.cwd(), 'src', 'data', 'vanilla-npcvalue.json');
const md5 = (p: string) => createHash('md5').update(readFileSync(p)).digest('hex');
// ★macOS /var→/private/var 符号链接：临时目录一律 realpath（extract-itemrare/petai 同案）
const TMP = realpathSync(tmpdir());
const sandbox = (dir: string) => ({ ...process.env, SW_OUT: dir });

describe.skipIf(EXT_MISSING)('extract-npcdrops era guard（BJ261 1457 重锚 + 输出通道三分离）', () => {
  it('行为面:缺省干跑对拍零写盘（exit 0+双向零差+两活库字节零改动）', () => {
    const beforeD = md5(LIVE_DROPS);
    const beforeV = md5(LIVE_VALUE);
    const r = spawnSync('node', [SCRIPT], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('干跑对拍');
    expect(r.stderr).toContain('双向零差');
    expect(r.stderr).toContain('零写盘');
    expect(md5(LIVE_DROPS)).toBe(beforeD);
    expect(md5(LIVE_VALUE)).toBe(beforeV);
  });

  it('行为面:SW_OUT 沙箱重产对现库 byte-perfect（重锚后幂等回归）', () => {
    const dir = mkdtempSync(join(TMP, 'npcdrops-guard-'));
    const beforeD = md5(LIVE_DROPS);
    const beforeV = md5(LIVE_VALUE);
    try {
      const r = spawnSync('node', [SCRIPT], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: sandbox(dir) });
      expect(r.status).toBe(0);
      expect(r.stderr).toContain('SW_OUT 沙箱');
      expect(readFileSync(join(dir, 'vanilla-npcdrops.json')).equals(readFileSync(LIVE_DROPS))).toBe(true);
      expect(readFileSync(join(dir, 'vanilla-npcvalue.json')).equals(readFileSync(LIVE_VALUE))).toBe(true);
      expect(md5(LIVE_DROPS)).toBe(beforeD);
      expect(md5(LIVE_VALUE)).toBe(beforeV);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:SW_OUT 与 --write-real 双旗互斥拒跑（exit 1+现库零改动）', () => {
    const dir = mkdtempSync(join(TMP, 'npcdrops-guard-'));
    const beforeD = md5(LIVE_DROPS);
    try {
      const r = spawnSync('node', [SCRIPT, '--write-real'], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: sandbox(dir),
      });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('双旗互斥');
      expect(md5(LIVE_DROPS)).toBe(beforeD);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:非 1457 禁写真库（1458 --write-real 拒;1456 显式注入拒+退役指引）', () => {
    const beforeD = md5(LIVE_DROPS);
    const beforeV = md5(LIVE_VALUE);
    const r8 = spawnSync('node', [SCRIPT, '--write-real'], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
      env: { ...process.env, SW_ITEM_VER: '1458' },
    });
    expect(r8.status).toBe(1);
    expect(r8.stderr).toContain('拒绝写真库');
    expect(r8.stderr).toContain('SW_ITEM_VER=1458≠1457');
    const r6 = spawnSync('node', [SCRIPT, '--write-real'], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
      env: { ...process.env, SW_ITEM_VER: '1456' },
    });
    expect(r6.status).toBe(1);
    expect(r6.stderr).toContain('1456 锚集已随 BJ261 重锚退役');
    expect(md5(LIVE_DROPS)).toBe(beforeD);
    expect(md5(LIVE_VALUE)).toBe(beforeV);
  });

  it('行为面:非法 SW_ITEM_VER fail-closed（exit 1+白名单指引）', () => {
    const r = spawnSync('node', [SCRIPT], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
      env: { ...process.env, SW_ITEM_VER: '1460' },
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('白名单 1457/1458');
  });

  it('行为面:1458 沙箱重放放行（读域与 1457 逐字节全等,重产对现库零差）', () => {
    const dir = mkdtempSync(join(TMP, 'npcdrops-guard-'));
    const beforeD = md5(LIVE_DROPS);
    try {
      const r = spawnSync('node', [SCRIPT], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_ITEM_VER: '1458', SW_OUT: dir },
      });
      expect(r.status).toBe(0);
      expect(readFileSync(join(dir, 'vanilla-npcdrops.json')).equals(readFileSync(LIVE_DROPS))).toBe(true);
      expect(readFileSync(join(dir, 'vanilla-npcvalue.json')).equals(readFileSync(LIVE_VALUE))).toBe(true);
      expect(md5(LIVE_DROPS)).toBe(beforeD);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:g1 探测注入面（SW_NPCDROPS_JSON/SW_NPCVALUE_JSON）与 --write-real 混用拒', () => {
    const beforeD = md5(LIVE_DROPS);
    const r = spawnSync('node', [SCRIPT, '--write-real'], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
      env: { ...process.env, SW_NPCVALUE_JSON: '/tmp/whatever.json' },
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('探测注入面');
    expect(md5(LIVE_DROPS)).toBe(beforeD);
  });

  // ★行为面（活通道对拍双向轴,S3/G-1 处方）:现库退化（fresh-only 非空）必须 exit 1+物证
  //   ——假现库经探测 env 注入（读侧重定向,真现库零接触）。drops 缺条+values 缺键两轴。
  it('行为面:fresh-only 轴（现库退化/缺键型）干跑拒跑（exit 1+fresh-only 物证）', () => {
    const dir = mkdtempSync(join(TMP, 'npcdrops-guard-'));
    try {
      copyFileSync(LIVE_DROPS, join(dir, 'degraded-drops.json'));
      writeFileSync(join(dir, 'degraded-value.json'), '{}');   // values 整缺 → valueFresh 全表
      const r = spawnSync('node', [SCRIPT], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: {
          ...process.env,
          SW_NPCDROPS_JSON: join(dir, 'degraded-drops.json'),
          SW_NPCVALUE_JSON: join(dir, 'degraded-value.json'),
        },
      });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('fresh-only');
      expect(r.stderr).toContain('value 重产独有键');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:live-only 轴（现库领先/洗库预警）干跑拒跑（exit 1+live-only 物证）', () => {
    const dir = mkdtempSync(join(TMP, 'npcdrops-guard-'));
    try {
      const live = JSON.parse(readFileSync(LIVE_DROPS, 'utf8'));
      live.entries.push({ npcs: [9999], rule: { k: 'common', item: 999, denom: 3, min: 1, max: 1 } });   // 领先条目
      writeFileSync(join(dir, 'ahead-drops.json'), JSON.stringify(live));
      copyFileSync(LIVE_VALUE, join(dir, 'ahead-value.json'));
      const r = spawnSync('node', [SCRIPT], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: {
          ...process.env,
          SW_NPCDROPS_JSON: join(dir, 'ahead-drops.json'),
          SW_NPCVALUE_JSON: join(dir, 'ahead-value.json'),
        },
      });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('live-only');
      expect(r.stderr).toContain('现库独有条目');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ★变异 M1（判别力）:摘掉「缺省干跑」门（OUT_*/null 干跑臂改指假现库=哨兵种子）→
  //   裸跑（零 env 零旗）静默写「现库」。证明缺省零写盘是 BJ191「探测与写盘分离=守卫
  //   被绕过」同族 footgun 的唯一拦截面,摘门必红（写发生于假现库,真现库零接触）。
  it('变异 M1:摘干跑门后裸跑静默写「现库」（证明缺省零写盘是唯一拦截面）', () => {
    const dir = mkdtempSync(join(TMP, 'npcdrops-guard-'));
    const fakeDrops = join(dir, 'vanilla-npcdrops.json');
    const fakeValue = join(dir, 'vanilla-npcvalue.json');
    writeFileSync(fakeDrops, '{"seeded":true}');     // 哨兵种子（≠工具产物,可判写发生）
    writeFileSync(fakeValue, '{"seeded":true}');
    const beforeD = md5(LIVE_DROPS);
    const beforeV = md5(LIVE_VALUE);
    try {
      const src = relocateRoot(readFileSync(SCRIPT, 'utf8'));
      const TD = '/vanilla-npcdrops.json` : null);';
      const TV = '/vanilla-npcvalue.json` : null);';
      expect(src).toContain(TD);
      expect(src).toContain(TV);
      const mutant = join(dir, 'extract-npcdrops-mutant.mjs');
      writeFileSync(mutant, src
        .replace(TD, `/vanilla-npcdrops.json\` : ${JSON.stringify(fakeDrops)}); // ★变异:干跑门摘除`)
        .replace(TV, `/vanilla-npcvalue.json\` : ${JSON.stringify(fakeValue)}); // ★变异:干跑门摘除`));
      const r = spawnSync('node', [mutant], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
      expect(r.status).toBe(0);
      expect(readFileSync(fakeDrops, 'utf8')).not.toContain('"seeded":true');   // 哨兵被覆写=写发生
      expect(readFileSync(fakeValue, 'utf8')).not.toContain('"seeded":true');
      expect(md5(fakeDrops)).toBe(md5(LIVE_DROPS));    // 写的就是全量重产产物
      expect(md5(LIVE_DROPS)).toBe(beforeD);           // 真现库零接触
      expect(md5(LIVE_VALUE)).toBe(beforeV);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ★变异 M2（锚 fail-loud）:毒化一处 1457 注册锚 → exit≠0+锚点名,证明「树回滚/提取器
  //   静默退化」是硬闸（itemrare 1456 裸跑洗 6147-6195 同族的事前面）。
  it('变异 M2:毒化 1457 注册锚后 fail-loud（exit≠0+锚点失配指名）', () => {
    const dir = mkdtempSync(join(TMP, 'npcdrops-guard-'));
    const beforeD = md5(LIVE_DROPS);
    try {
      const src = relocateRoot(readFileSync(SCRIPT, 'utf8'));
      const TRIGGER = "'⑫ 179/83 6159 1/25', 'RegisterToMultipleNPCs(ItemDropRule.Common(6159, 25), 179, 83)'";
      expect(src).toContain(TRIGGER);
      const mutant = join(dir, 'extract-npcdrops-mutant-anchor.mjs');
      writeFileSync(mutant, src.replace(TRIGGER, "'⑫ 毒化', 'RegisterToMultipleNPCs(ItemDropRule.Common(9999, 25), 179, 83)'"));
      const r = spawnSync('node', [mutant], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: sandbox(dir) });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('锚点失配');
      expect(r.stderr).toContain('⑫ 毒化');
      expect(md5(LIVE_DROPS)).toBe(beforeD);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ★变异 M3（G-1 fresh-only 轴判别力）:摘掉 value fresh-only 轴 + 现库退化夹具 →
  //   恒绿复现（真工具 exit 1 / 变异体 exit 0）——证明 fresh-only 轴是「源侧删除/
  //   现库退化」的唯一拦截面（bossbags 删 spawn 恒绿同族,只算 live-only 的对拍闸盲区）。
  it('变异 M3:摘 fresh-only 轴后对退化现库恒绿复现（G-1 盲区判别力）', () => {
    const dir = mkdtempSync(join(TMP, 'npcdrops-guard-'));
    try {
      copyFileSync(LIVE_DROPS, join(dir, 'degraded-drops.json'));
      writeFileSync(join(dir, 'degraded-value.json'), '{}');
      const probeEnv = {
        ...process.env,
        SW_NPCDROPS_JSON: join(dir, 'degraded-drops.json'),
        SW_NPCVALUE_JSON: join(dir, 'degraded-value.json'),
      };
      // 真工具:fresh-only 轴在位 → exit 1
      const real = spawnSync('node', [SCRIPT], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: probeEnv });
      expect(real.status).toBe(1);
      // 变异体:fresh-only 轴摘除 → exit 0（恒绿复现）
      const src = relocateRoot(readFileSync(SCRIPT, 'utf8'));
      const TRIGGER = 'if (liveV[k] === undefined) wash.valueFresh.push(`${k}:${v}`);';
      expect(src).toContain(TRIGGER);
      const mutant = join(dir, 'extract-npcdrops-mutant-freshonly.mjs');
      writeFileSync(mutant, src.replace(TRIGGER, 'if (false) wash.valueFresh.push(`${k}:${v}`); // ★变异:fresh-only 轴摘除'));
      const r = spawnSync('node', [mutant], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: probeEnv });
      expect(r.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
