// 提取器自审计测试(锁 2026-08-13 "铜剑丢出去"机制=extract-itemcombat targetId 错基底):
// ① 常跑层:直接查已提交 JSON——3507/3509 钉死断言(错基底时必翻)+基数护栏
// ② 审计层:C# 源存在时 spawn --audit——anomalies 为空+pinned 与已提交 JSON deep equal
//    (同时抓"提取器坏但数据没重生成"和"数据被重生成坏"两个方向)
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import itemCombatJson from '../src/data/vanilla-itemcombat.json';
import projStatusJson from '../src/data/vanilla-projstatus.json';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CS_PRESENT = existsSync(join(ROOT, '..', 'Terarria1456', 'Terraria', 'Item.cs'));
const TABLE = itemCombatJson as unknown as Record<string, Record<string, unknown>>;

describe('提取器自审计·常跑层(已提交 JSON,不依赖 C# 源)', () => {
  it('3507 铜短剑钉死(bug#2 一行式回归锁):直刺投射物语义', () => {
    // 错取 targetId=1(铁镐)时:autoReuse:true 且无 shoot → 两条断言必翻其一
    const r = TABLE['3507'];
    expect(r.shoot).toBe(938);
    expect(r.noMelee).toBe(true);
    expect(r.autoReuse).toBe(false);
    expect(r.shootSpeed).toBe(2.1);
  });

  it('3509 铜镐钉死:纯工具不得带 shoot("丢出去"的另一面)', () => {
    const r = TABLE['3509'];
    expect('shoot' in r).toBe(false);
    expect(r.melee).toBe(true);
    expect(r.useTime).toBe(15);
  });

  it('基数护栏:提取器结构漂移后数据量骤降必翻', () => {
    expect(Object.keys(TABLE).length).toBeGreaterThanOrEqual(2500);
    let melee = 0;
    for (const v of Object.values(TABLE)) if (v.melee) melee++;
    expect(melee).toBeGreaterThanOrEqual(250); // 实测 302;护栏取 80% 量级防骤降
  });

  it('projstatus 基数:88 型号/97 条基线(互斥组语义修正后)', () => {
    const entries = Object.values(projStatusJson as unknown as Record<string, unknown[]>)
      .reduce((n, v) => n + v.length, 0);
    expect(Object.keys(projStatusJson).length).toBeGreaterThanOrEqual(85);
    expect(entries).toBeGreaterThanOrEqual(95);
  });
});

// 审计层:C# 反编译源不存在(其他环境)时 warn 跳过,不阻塞
(CS_PRESENT ? describe : describe.skip)('提取器自审计·审计层(spawn --audit)', () => {
  const run = (tool: string): { stdout: string; status: number | null } => {
    const r = spawnSync('node', [join(ROOT, 'tools', tool), '--audit'], {
      cwd: ROOT, encoding: 'utf8', timeout: 120_000,
    });
    return { stdout: r.stdout ?? '', status: r.status };
  };

  it('extract-itemcombat:anomalies 为空 + pinned 3507/3509 与已提交 JSON deep equal', () => {
    const { stdout, status } = run('extract-itemcombat.mjs');
    const j = JSON.parse(stdout.trim().split('\n').pop()!);
    expect(j.anomalies).toEqual([]);
    expect(j.delegates).toBeGreaterThanOrEqual(20); // X-04 基数
    expect(j.pinned['3507']).toEqual(TABLE['3507']);
    expect(j.pinned['3509']).toEqual(TABLE['3509']);
    void status;
  });

  it('extract-projstatus:跳过数 ≤ 基线(语义修正后 16,护栏 25)', () => {
    const { stdout } = run('extract-projstatus.mjs');
    // 该脚本 console.log 混入 stdout——取最后一行 JSON
    const line = stdout.trim().split('\n').pop()!;
    const j = JSON.parse(line);
    expect(j.types).toBeGreaterThanOrEqual(85);
    expect(j.skipped).toBeLessThanOrEqual(25);
  });
});
