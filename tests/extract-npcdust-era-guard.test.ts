import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ★BJ254（2026-09-21）：extract-npcdust.mjs era guard 守卫测试。
//
// era guard 四要素（docs/era-guard-family.md，习语=extract-petai-era-guard.test.ts）：
//   ① SW_ITEM_VER 白名单 {1457,1458} 缺省 1457 fail-closed（1456 锚集未建显式拒）；
//   ② 输出三分离：缺省干跑零写盘 / SW_OUT 沙箱 / --write-real 逃生门（双旗互斥；
//      非 1457 禁写真库）；
//   ③ 锚 fail-loud：方法签名 :82492 / 方法尾 :90939 / 尘调用基数 629 / 探针组锚行
//      （86360=112 族、86539=59 族、89905=290、85162=372 族、90918=type!=156）；
//   ④ 判别力自证（变异）：M1 摘干跑门=裸跑写「现库」（假现库哨兵被覆写,真现库零接触）；
//      M2 毒化探针锚=fail-loud 指名；M3 篡改输出面=对拍闸漂移 exit 1。
// 1458 交叉：HitEffect 区 :82492-:90939 与 1457 逐字节全等（2026-09-21 diff 实证）→
// 1458 重产剥 meta.source 后与现库逐字节全等。

const SCRIPT = join(process.cwd(), 'tools', 'extract-npcdust.mjs');
const LIVE = join(process.cwd(), 'src', 'data', 'vanilla-npcdust.json');
const md5 = (p: string) => createHash('md5').update(readFileSync(p)).digest('hex');
// ★macOS /var→/private/var 符号链接（era-guard-family §④）：临时目录一律 realpath
const TMP = realpathSync(tmpdir());

describe('extract-npcdust era guard（BJ254）', () => {
  it('行为面:缺省干跑零写盘（exit 0+对拍零漂移+现库字节零改动）', () => {
    const before = md5(LIVE);
    const r = spawnSync('node', [SCRIPT], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('调用=629');       // 619 裸 NewDust + 10 Direct
    expect(r.stdout).toContain('对拍零漂移');      // 重产=现库逐字节
    expect(md5(LIVE)).toBe(before);               // 零写入（canary）
  });

  it('行为面:SW_OUT 沙箱重产对现库 byte-perfect（重放确定性;现库零接触）', () => {
    const dirA = mkdtempSync(join(TMP, 'npcdust-guard-'));
    const dirB = mkdtempSync(join(TMP, 'npcdust-guard-'));
    const before = md5(LIVE);
    try {
      const rA = spawnSync('node', [SCRIPT], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: { ...process.env, SW_OUT: dirA } });
      const rB = spawnSync('node', [SCRIPT], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: { ...process.env, SW_OUT: dirB } });
      expect(rA.status).toBe(0);
      expect(rB.status).toBe(0);
      // 双沙箱互拷全等=重放确定性
      expect(readFileSync(join(dirA, 'vanilla-npcdust.json')).equals(readFileSync(join(dirB, 'vanilla-npcdust.json')))).toBe(true);
      // 且与现库逐字节全等
      expect(readFileSync(join(dirA, 'vanilla-npcdust.json')).equals(readFileSync(LIVE))).toBe(true);
      expect(md5(LIVE)).toBe(before);
    } finally {
      rmSync(dirA, { recursive: true, force: true });
      rmSync(dirB, { recursive: true, force: true });
    }
  });

  it('行为面:SW_OUT 与 --write-real 双旗互斥拒跑（exit 1+现库零改动）', () => {
    const dir = mkdtempSync(join(TMP, 'npcdust-guard-'));
    const before = md5(LIVE);
    try {
      const r = spawnSync('node', [SCRIPT, '--write-real'], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: { ...process.env, SW_OUT: dir },
      });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('互斥');
      expect(md5(LIVE)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:非 1457 禁写真库（1458 --write-real 拒）+非法版本 fail-closed', () => {
    const before = md5(LIVE);
    const r8 = spawnSync('node', [SCRIPT, '--write-real'], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
      env: { ...process.env, SW_ITEM_VER: '1458' },
    });
    expect(r8.status).toBe(1);
    expect(r8.stderr).toContain('非 1457 禁写真库');
    expect(md5(LIVE)).toBe(before);

    const r6 = spawnSync('node', [SCRIPT], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
      env: { ...process.env, SW_ITEM_VER: '1456' },
    });
    expect(r6.status).toBe(1);
    expect(r6.stderr).toContain('不在白名单');
    expect(md5(LIVE)).toBe(before);
  });

  it('行为面:SW_ITEM_VER=1458 沙箱重放（HitEffect 区逐字节全等→剥 meta.source 后与现库全等）', () => {
    const dir = mkdtempSync(join(TMP, 'npcdust-guard-'));
    const before = md5(LIVE);
    try {
      const r = spawnSync('node', [SCRIPT], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_ITEM_VER: '1458', SW_OUT: dir },
      });
      expect(r.status).toBe(0);
      const fresh = JSON.parse(readFileSync(join(dir, 'vanilla-npcdust.json'), 'utf8')) as Record<string, unknown>;
      const live = JSON.parse(readFileSync(LIVE, 'utf8')) as Record<string, unknown>;
      // 数据面零增量：剥 meta.source 后逐字节全等（1457↔1458 HitEffect 全等实证）
      const strip = (o: Record<string, unknown>) => {
        const m = { ...(o._meta as Record<string, unknown>) };
        delete m.source;
        return JSON.stringify({ ...o, _meta: m });
      };
      expect(strip(fresh)).toBe(strip(live));
      expect(md5(LIVE)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ★变异 M1（判别力）:摘掉「缺省干跑零写盘」门（缺省臂注入 writeFileSync+REAL_OUT
  //   重定向假现库）→ 裸跑静默写「现库」。哨兵种子被覆写=写发生（守卫在位时恒零写入）,
  //   真现库零接触——证明缺省干跑是 BJ191「preflight 写真实 json」同族 footgun 的
  //   唯一拦截面。
  it('变异:摘干跑门后裸跑静默写「现库」（证明缺省零写盘是唯一拦截面）', () => {
    const dir = mkdtempSync(join(TMP, 'npcdust-guard-'));
    const fakeLive = join(dir, 'vanilla-npcdust.json');
    writeFileSync(fakeLive, '{"sentinel":"BJ254-era-guard"}');   // 哨兵种子（≠工具产物）
    const beforeLive = md5(LIVE);
    try {
      const src = readFileSync(SCRIPT, 'utf8');
      const T_REAL = "const REAL_OUT = join(ROOT, 'src', 'data', OUT_NAME);";
      const T_DRY = 'if (!SW_OUT && !WRITE_REAL) {';
      expect(src).toContain(T_REAL);
      expect(src).toContain(T_DRY);
      const mutant = join(dir, 'extract-npcdust-mutant.mjs');
      // ★ROOT_TRIGGER 前置（era-guard-family §四）：工具 ROOT 派生自 import.meta.url,
      //   mutant 置 OS tmp 会走偏——先重锚 ROOT=process.cwd() 再做行为变异
      writeFileSync(mutant, src
        .replace("const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');", `const ROOT = ${JSON.stringify(process.cwd())};`)
        .replace(T_REAL, `const REAL_OUT = ${JSON.stringify(fakeLive)}; // ★变异:重定向假现库`)
        .replace(T_DRY, `writeFileSync(REAL_OUT, json); if (false) { // ★变异:摘干跑门→缺省写「现库」`));
      const r = spawnSync('node', [mutant], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
      expect(r.status).toBe(0);
      expect(readFileSync(fakeLive, 'utf8')).not.toContain('"sentinel":"BJ254-era-guard"');  // 哨兵被覆写=写发生
      expect(md5(LIVE)).toBe(beforeLive);          // 真现库零接触
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ★变异 M2（锚 fail-loud）:毒化一处探针锚文本 → exit 1+「锚失配」指名——证明锚
  //   断言是「表与源码静默失配」的硬闸（BJ183/BJ212 同案:失配必须炸红而非静默旧值）。
  it('变异:毒化探针锚后 fail-loud（exit 1+锚点失配指名）', () => {
    const dir = mkdtempSync(join(TMP, 'npcdust-guard-'));
    const beforeLive = md5(LIVE);
    try {
      const src = readFileSync(SCRIPT, 'utf8');
      const TRIGGER = "[86360, 'type == 112 || type == 666'],";
      expect(src).toContain(TRIGGER);
      const mutant = join(dir, 'extract-npcdust-mutant.mjs');
      writeFileSync(mutant, src
        .replace("const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');", `const ROOT = ${JSON.stringify(process.cwd())};`)
        .replace(TRIGGER, "[86360, 'type == 999 || type == 666'], // ★变异:毒化锚"));
      const r = spawnSync('node', [mutant], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('锚失配');
      expect(r.stderr).toContain('探针锚行 :86360');
      expect(md5(LIVE)).toBe(beforeLive);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ★变异 M3（对拍闸判别力）:篡改输出面（59 岩浆族 hitK 80→81）→ 裸跑干跑对拍
  //   报漂移 exit 1——证明「重产=现库逐字节」是硬闸,表值被静默改动必红。
  it('变异:篡改输出面后干跑对拍报漂移（exit 1+漂移物证）', () => {
    const beforeLive = md5(LIVE);
    const src = readFileSync(SCRIPT, 'utf8');
    const TRIGGER = "const json = JSON.stringify(data, null, 1) + '\\n';";
    expect(src).toContain(TRIGGER);
    const dir = mkdtempSync(join(TMP, 'npcdust-guard-'));
    try {
      const mutant = join(dir, 'extract-npcdust-mutant.mjs');
      writeFileSync(mutant, src
        .replace("const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');", `const ROOT = ${JSON.stringify(process.cwd())};`)
        .replace(TRIGGER,
          `if (data['59']) data['59'].hit[0].hitK = 81; // ★变异:篡改输出面（.mjs 无 TS 断言）\n${TRIGGER}`));
      const r = spawnSync('node', [mutant], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
      expect(r.status).toBe(1);
      expect(r.stdout).toContain('对拍漂移');
      expect(r.stdout).toContain('59');
      expect(md5(LIVE)).toBe(beforeLive);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
