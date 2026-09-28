// BJ378:资产/帧表完整性静态对账闸——判别面 + era guard 行为面 + 变异自证。
// 工具:tools/recon-frame-tables.mjs;金标:tests/golden/frame-tables-recon.json。
// 三源交叉(gore/proj/tile)×四规则(漏配/越界/尺寸错/过配);三起手工案例
// (Gore_1007/1008 竖排 8 帧漏配/tile 752 源矩形越界/projFrames 族)逐一注入复现→红。
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, existsSync, rmSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const GAME = join(__dirname, '..');
const SCRIPT = join(GAME, 'tools', 'recon-frame-tables.mjs');
const GOLDEN = join(GAME, 'tests', 'golden', 'frame-tables-recon.json');
const TMP = realpathSync(mkdtempSync(join(tmpdir(), 'bj378-recon-')));
const md5 = (p: string) => createHash('md5').update(readFileSync(p)).digest('hex');

const CANARY_FILES = [
  GOLDEN,
  join(GAME, 'src/entities/GorePiece.ts'),
  join(GAME, 'src/entities/Arrow.ts'),
  join(GAME, 'src/render/NatureParticles.ts'),
  join(GAME, 'src/render/VanillaTiler.ts'),
  join(GAME, 'src/data/vanilla-projframes.json'),
  join(GAME, 'public/sprites/vanilla.json'),
];
let canaryBefore: Record<string, string> = {};

/** 跑工具(缺省=干跑对拍闸);SW_OUT 捕获报告 JSON */
function run(extraEnv: Record<string, string | undefined> = {}, extraArgs: string[] = []) {
  const r = spawnSync('node', [SCRIPT, ...extraArgs], {
    cwd: GAME, encoding: 'utf8', timeout: 300_000,
    env: { ...process.env, ...extraEnv },
  });
  return { status: r.status ?? -1, out: (r.stdout ?? '') + (r.stderr ?? ''), r };
}
/** 注入面运行:SW_OUT 报告落盘 → 解析 findings */
const INJECT_MAP: Record<string, string> = {
  'GorePiece.mut.ts': 'SW_RECON_GOREPIECE_SRC',
  'projframes.mut.json': 'SW_RECON_PROJFRAMES_JSON',
  'vanilla.mut.json': 'SW_RECON_ATLAS_JSON',
  'VanillaTiler.mut.ts': 'SW_RECON_VTILER_SRC',
};
function runInject(files: Record<string, string>, extraEnv: Record<string, string | undefined> = {}, extraArgs: string[] = []) {
  const env: Record<string, string | undefined> = { ...extraEnv, SW_OUT: join(TMP, 'report.json') };
  for (const [k, v] of Object.entries(files)) {
    expect(INJECT_MAP[k], `未登记的注入键:${k}`).toBeTruthy();
    const path = join(TMP, k);
    writeFileSync(path, v);
    env[INJECT_MAP[k]] = path;
  }
  const res = run(env, extraArgs);
  const reportPath = join(TMP, 'report.json');
  const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : null;
  return { ...res, report };
}

beforeAll(() => {
  canaryBefore = Object.fromEntries(CANARY_FILES.map((p) => [p, md5(p)]));
});
afterAll(() => {
  for (const p of CANARY_FILES) expect(md5(p), `canary 被写:${p}`).toBe(canaryBefore[p]);
  rmSync(TMP, { recursive: true, force: true });
});

describe('BJ378 基线:干跑对拍闸全绿', () => {
  it('缺省运行 exit 0 + findings 全零 + 基线双向零差', () => {
    const { status, out } = run();
    expect(status).toBe(0);
    expect(out).toMatch(/frame-tables-recon: OK/);
    expect(out).toMatch(/missing=0\/over=0\/sizeMismatch=0/);
    expect(out).toMatch(/基线双向零差/);
  });
  it('金标存在且 deterministic:两次运行报告逐字节相等', () => {
    expect(existsSync(GOLDEN)).toBe(true);
    const a = join(TMP, 'det-a.json'), b = join(TMP, 'det-b.json');
    expect(run({}, ['--out', a]).status).toBe(0);
    expect(run({}, ['--out', b]).status).toBe(0);
    expect(readFileSync(a, 'utf8')).toBe(readFileSync(b, 'utf8'));
  });
  it('金标钉值:三域权威面 spot 值(补表面冻结双锁)', () => {
    const rep = JSON.parse(readFileSync(GOLDEN, 'utf8'));
    // gore:FRAME_ROWS(BJ377 面)+ 权威 63 多帧 id
    expect(rep.gore.frameRows).toEqual({ 1007: 8, 1008: 8, 1201: 4, 1208: 4, 1217: 3, 1218: 3, 1225: 3 });
    expect(rep.gore.multiFrameCount).toBe(63);
    expect(rep.gore.authority['706']).toMatchObject({ cols: 1, rows: 15 });   // IsDrip
    expect(rep.gore.authority['910']).toMatchObject({ cols: 32, rows: 8 });   // 油漆叶 32×8
    expect(rep.gore.authority['1007']).toMatchObject({ cols: 1, rows: 8 });   // 竖排 8 帧
    expect(rep.gore.authority['907']).toMatchObject({ cols: 1, rows: 3 });    // dormant
    expect(rep.gore.dormant.map((d: { id: number }) => d.id)).toEqual([907, 908, 909]);
    // proj:284 权威(id 221 双赋值 last-wins)
    expect(rep.proj.authorityCount).toBe(284);
    expect(rep.proj.authority['1078']).toBe(3);
    expect(rep.proj.authority['254']).toBe(5);
    expect(rep.proj.assignSpan).toEqual([8582, 8866]);
    expect(rep.proj.dupes).toEqual([{ id: 221, value: 3, line: 8743, prev: 3 }]);
    // tile:GetTileDrawData 103 覆写（★BJ389 fall-through 修正:旧 40=case 组漏记基线,
    // 仅组末标签存活;修正后 h18 家具族 :4954-4982 全组归账）+ 752 verbatim(4583-4584)
    expect(rep.tile.authority['752']).toEqual({ w: 36, h: 38 });
    expect(rep.tile.authority['14']).toEqual({ h: 18 });     // fall-through 组非末位成员
    expect(rep.tile.authority['16']).toEqual({ h: 18 });     // :4981 组首位
    expect(rep.tile.authority['2']).toEqual({ w: 24 });      // 宽度轴覆写（:5719）
    expect(rep.tile.authority['716']).toEqual({ h: 18 });    // :4981 组末位（旧基线唯一幸存者）
    expect(Object.keys(rep.tile.authority).length).toBe(103);
    expect(rep.tile.exempt.map((e: { id: number }) => e.id)).toEqual([752]);   // ★BJ399:405/406 债清偿摘除
    expect(rep.tile.drawAdjustLiteral['405']).toEqual({ fit: [[16, 18]], sw: [], sh: [18] });   // BJ399 件1
    expect(rep.tile.drawAdjustLiteral['406']).toEqual({ fit: [[16, 18]], sw: [], sh: [18] });
    expect(rep._meta.tile.rule5Debt).toEqual([]);            // ★BJ399 件1:债登记清空（机制留位）
    expect(rep._meta.tile.rule5Height18Count).toBe(53);      // HEIGHT_18 集合承载（规则⑤轴 b）
    expect(rep._meta.tile.rule5Height18Anchor).toBe(true);   // default 臂字面锚
    // 三域 findings 全零
    for (const dom of ['gore', 'proj', 'tile']) {
      for (const [k, v] of Object.entries(rep[dom].findings)) expect(v, `${dom}.${k}`).toEqual([]);
    }
  });
});

describe('BJ378 判别面:人工注入→红(规则①②③④逐一)', () => {
  it('规则①漏配(1007 形态):FRAME_ROWS 摘 1007 → gore.missing=[1007] 且不误伤 1008', () => {
    const src = readFileSync(join(GAME, 'src/entities/GorePiece.ts'), 'utf8');
    const mut = src.replace('1225: 3, 1007: 8, 1008: 8 }', '1225: 3, 1008: 8 }');
    expect(mut).not.toBe(src);
    const { status, report } = runInject({ 'GorePiece.mut.ts': mut });
    expect(status).toBe(1);
    expect(report.gore.findings.missing.map((m: { id: number }) => m.id)).toEqual([1007]);
    expect(report.gore.findings.over).toEqual([]);
  });
  it('规则④过配(FRAME_ROWS 多帧但权威单帧):加 9999:5 → gore.over=[9999]', () => {
    const src = readFileSync(join(GAME, 'src/entities/GorePiece.ts'), 'utf8');
    const mut = src.replace('const FRAME_ROWS: Record<number, number> = {', 'const FRAME_ROWS: Record<number, number> = { 9999: 5,');
    const { status, report } = runInject({ 'GorePiece.mut.ts': mut });
    expect(status).toBe(1);
    expect(report.gore.findings.over.map((m: { id: number }) => m.id)).toEqual([9999]);
    expect(report.gore.findings.missing).toEqual([]);
  });
  it('规则④过配+①漏配(proj):json 键 9999:7 → over;摘 1078 → missing', () => {
    const j = JSON.parse(readFileSync(join(GAME, 'src/data/vanilla-projframes.json'), 'utf8'));
    const mut1 = { ...j, '9999': 7 };
    const { status: s1, report: r1 } = runInject({ 'projframes.mut.json': JSON.stringify(mut1) });
    expect(s1).toBe(1);
    expect(r1.proj.findings.over.map((m: { id: number }) => m.id)).toEqual([9999]);
    const { '1078': _, ...mut2 } = j;
    const { status: s2, report: r2 } = runInject({ 'projframes.mut.json': JSON.stringify(mut2) });
    expect(s2).toBe(1);
    expect(r2.proj.findings.missing.map((m: { id: number }) => m.id)).toEqual([1078]);
  });
  it('规则③值漂移(proj):1078: 3→4 → drift', () => {
    const j = JSON.parse(readFileSync(join(GAME, 'src/data/vanilla-projframes.json'), 'utf8'));
    const { status, report } = runInject({ 'projframes.mut.json': JSON.stringify({ ...j, '1078': 4 }) });
    expect(status).toBe(1);
    expect(report.proj.findings.drift).toContainEqual({ id: 1078, live: 4, authority: 3 });
  });
  it('规则②越界(tile 752 形态):atlas grid 752 抬到 64×64 → atlasGridOOB', () => {
    const j = JSON.parse(readFileSync(join(GAME, 'public/sprites/vanilla.json'), 'utf8'));
    j.tiles['752'] = { ...j.tiles['752'], grid: [64, 64] };
    const { status, report } = runInject({ 'vanilla.mut.json': JSON.stringify(j) });
    expect(status).toBe(1);
    expect(report.tile.findings.atlasGridOOB).toContainEqual({ id: 752, grid: [64, 64], png: [38, 36] });
  });
  it('规则②变体(drawAdjust fit 恒败=BJ365 死守卫形态):case 529 fit 抬到 999×999 → deadFit', () => {
    const src = readFileSync(join(GAME, 'src/render/VanillaTiler.ts'), 'utf8');
    const mut = src.replace('if (fit(fx, 34 * v, 16, 32))', 'if (fit(fx, 34 * v, 999, 999))');
    expect(mut).not.toBe(src);
    const { status, report } = runInject({ 'VanillaTiler.mut.ts': mut });
    expect(status).toBe(1);
    expect(report.tile.findings.deadFit.map((m: { id: number }) => m.id)).toEqual([529]);
  });
  // ★BJ389 规则⑤判别面：tileHeight 覆写×grid 不整除且无承载=红（承载三轴=case
  //  capture/HEIGHT_18 集合缺省臂/underHeightDebt 债登记——两轴各一发变异自证）。
  it('规则⑤(HEIGHT_18 承载轴是活闸):集合摘 15 → tile.rule5=[15]（:4981 组 h18 候选失承载）', () => {
    const src = readFileSync(join(GAME, 'src/render/VanillaTiler.ts'), 'utf8');
    const mut = src.replace('new Set([14, 15, 16, 17,', 'new Set([14, 16, 17,');
    expect(mut).not.toBe(src);
    const { status, report } = runInject({ 'VanillaTiler.mut.ts': mut });
    expect(status).toBe(1);
    expect(report.tile.findings.rule5.map((m: { id: number }) => m.id)).toEqual([15]);
  });
  // ★BJ399 改判（2026-09-29）：405/406 债已清偿（RULE5_DEBT 空,exemptAnchorLost 对
  //  规则⑤无存活成员）——新鲜度锚测试改判为 case 承载轴活闸：摘 BJ399 新 case 两条
  //  → 405/406 失承载 → tile.rule5 硬红（coverage axis a「case 摘除=capture 消失=
  //  当拍失覆盖即红」的债位继承面）。
  it('规则⑤(case 承载轴活闸):摘 BJ399 case 405/406 → tile.rule5=[405,406]', () => {
    const src = readFileSync(join(GAME, 'src/render/VanillaTiler.ts'), 'utf8');
    const anchor = '    case 405: if (fy > 0 && fit(fx, fy, 16, 18)) a.sh = 18; break;\n'
      + '    case 406: if (fy % 54 >= 36 && fit(fx, fy, 16, 18)) a.sh = 18; break;\n';
    expect(src.includes(anchor)).toBe(true);
    const mut = src.replace(anchor, '');
    const { status, report } = runInject({ 'VanillaTiler.mut.ts': mut });
    expect(status).toBe(1);
    expect(report.tile.findings.rule5.map((m: { id: number }) => m.id)).toEqual([405, 406]);
  });
});

describe('BJ378 era guard 行为面', () => {
  it('双旗逃生门:--freeze 单旗拒', () => {
    const { status, out } = run({}, ['--freeze']);
    expect(status).toBe(1);
    expect(out).toMatch(/--freeze 须与 --force-full 双旗同给/);
  });
  it('g1 footgun:探测注入面 + --freeze 双旗 → 拒(探测与写盘分离)', () => {
    const src = readFileSync(join(GAME, 'src/entities/GorePiece.ts'), 'utf8');
    writeFileSync(join(TMP, 'GorePiece.g1.ts'), src);
    const { status, out } = run({ SW_RECON_GOREPIECE_SRC: join(TMP, 'GorePiece.g1.ts') }, ['--freeze', '--force-full']);
    expect(status).toBe(1);
    expect(out).toMatch(/探测注入面.*已设置而 --freeze 将写真实金标/);
  });
  it('金标缺失 → exit 1 + 冻结指引;金标坏损/漂移 → exit 1', () => {
    const ghost = join(TMP, 'nonexistent-golden.json');
    const { status: s1, out: o1 } = run({ SW_RECON_GOLDEN: ghost });
    expect(s1).toBe(1);
    expect(o1).toMatch(/金标缺失/);
    const sentinel = join(TMP, 'sentinel-golden.json');
    writeFileSync(sentinel, JSON.stringify({ sentinel: true }));
    const { status: s2, out: o2 } = run({ SW_RECON_GOLDEN: sentinel });
    expect(s2).toBe(1);
    expect(o2).toMatch(/diff 非空/);
  });
  it('1456 退役拒;1458 交叉重放 exit 0(读域 fingerprint 相等,ver/source 豁免)', () => {
    const { status: s1, out: o1 } = run({ SW_ITEM_VER: '1456' });
    expect(s1).toBe(1);
    expect(o1).toMatch(/1456 锚已退役/);
    const { status: s2, out: o2 } = run({ SW_ITEM_VER: '1458' });
    expect(s2).toBe(0);
    expect(o2).toMatch(/基线双向零差/);
  });
});

describe('BJ378 变异自证(守卫是唯一拦截面;假现库/沙箱,真库零接触)', () => {
  const TOOL_SRC = readFileSync(SCRIPT, 'utf8');
  function makeMutant(name: string, trigger: string, replacement: string): string {
    expect(TOOL_SRC.includes(trigger), `变异触发串不存在:${trigger.slice(0, 50)}`).toBe(true);
    const p = join(TMP, name);
    // ROOT 重锚习语(mutant 置 OS tmp 须回指真 game/,era-guard 家族 ROOT_TRIGGER 前置)
    const src = TOOL_SRC
      .replace("const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');", `const ROOT = ${JSON.stringify(GAME)};`)
      .replace(trigger, replacement);
    writeFileSync(p, src);
    return p;
  }
  it('M-A 摘 gore 漏配闸:注入 1007 缺失恒绿(证明 findings 闸是规则面唯一拦截面)', () => {
    const mut = makeMutant(
      'recon-frames-MA.mjs',
      "findings.missing.push({ id, authority: a, via: 'GorePiece-reachable' });",
      ';',
    );
    const src = readFileSync(join(GAME, 'src/entities/GorePiece.ts'), 'utf8');
    const inj = src.replace('1225: 3, 1007: 8, 1008: 8 }', '1225: 3, 1008: 8 }');
    const injPath = join(TMP, 'GorePiece.MA.ts');
    writeFileSync(injPath, inj);
    // 沙箱金标=注入态报告(先由真工具产出):使基线 diff 归零,隔离出 findings 闸单独承责
    const probe = run({ SW_RECON_GOREPIECE_SRC: injPath, SW_OUT: join(TMP, 'report-MA.json') });
    expect(probe.status).toBe(1);
    expect(probe.out).toMatch(/findings 非空/);
    // 沙箱金标=注入态报告剥 findings(findings 是活闸不进基线;基线只冻数据面)
    const probeReport = JSON.parse(readFileSync(join(TMP, 'report-MA.json'), 'utf8'));
    for (const dom of ['gore', 'proj', 'tile']) {
      for (const k of Object.keys(probeReport[dom].findings)) probeReport[dom].findings[k] = [];
    }
    writeFileSync(join(TMP, 'golden-MA.json'), JSON.stringify(probeReport, null, 1) + '\n');
    const realTool = spawnSync('node', [SCRIPT], {
      cwd: GAME, encoding: 'utf8', timeout: 300_000,
      env: { ...process.env, SW_RECON_GOREPIECE_SRC: injPath, SW_RECON_GOLDEN: join(TMP, 'golden-MA.json') },
    });
    const mutant = spawnSync('node', [mut], {
      cwd: GAME, encoding: 'utf8', timeout: 300_000,
      env: { ...process.env, SW_RECON_GOREPIECE_SRC: injPath, SW_RECON_GOLDEN: join(TMP, 'golden-MA.json') },
    });
    expect(realTool.status).toBe(1);   // 真工具:基线零差但 findings 闸红(规则面唯一拦截)
    expect(realTool.stdout + realTool.stderr).toMatch(/findings 非空/);
    expect(mutant.status).toBe(0);     // 摘闸后:绿 = footgun 复现(漏配溜过无人拦)
    expect(mutant.stdout).toMatch(/基线双向零差/);
  });
  it('M-B 摘金标 diff 闸:坏损金标恒绿(证明冻结 diff 是唯一拦截面)', () => {
    const mut = makeMutant('recon-frames-MB.mjs', 'if (!washEmpty) {', 'if (false) {');
    const sentinel = join(TMP, 'sentinel-MB.json');
    writeFileSync(sentinel, JSON.stringify({ sentinel: true }));
    const good = spawnSync('node', [SCRIPT], {
      cwd: GAME, encoding: 'utf8', timeout: 300_000,
      env: { ...process.env, SW_RECON_GOLDEN: sentinel },
    });
    const mutant = spawnSync('node', [mut], {
      cwd: GAME, encoding: 'utf8', timeout: 300_000,
      env: { ...process.env, SW_RECON_GOLDEN: sentinel },
    });
    expect(good.status).toBe(1);   // 真工具:哨兵金标 → diff 非空红
    expect(mutant.status).toBe(0); // 摘闸后:绿 = 冻结闸被摘
    expect(mutant.stdout).toMatch(/基线双向零差/);
  });
});
