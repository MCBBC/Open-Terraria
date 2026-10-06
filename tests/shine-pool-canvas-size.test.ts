// ★TileShine 池化回归锁（2026-10-07 用户实报「跑满 120 场景行走突发掉 80/90fps」）：
//
// 定谳链（活机抓捕 scripts/_fps-srcoob-hunt.mjs + trace x-ray trace-timeline）：
//   池化刀（2026-10-06）把消费点 createElement 收编进 acquireShineCanvas 时丢失
//   `.width=S/.height=S` 尺寸赋值 → 池 miss 新建画布=缺省 300×150 → chunk blit
//   (drawTileShineGrid TileShine.ts:1634 `ctx.drawImage(e.mul, 0,0,S,S, …)`) 源矩形
//   (0,0,256,256) 部分越界（sy+sh=256 > 150）→ GLShimExecutor srcoob 门逐次
//   flushForFallback+presentBatch 全幅回贴（活机实测每帧 15-18 次）= 帧预算
//   8.3ms→12.5ms+（120→80fps）；同时 shine 下 106px 源裁剪缺失（视觉损失）。
//   池 hit 分支 clearRect(0,0,S,S) 只清 256² 域——污染画布回池=全池 300×150。
// 锁面（Node 域无 DOM,画布行为面归浏览器通道 digest;本锁钉源级结构）：
//   ①miss 分支尺寸赋值 ②池污染归一（重设尺寸=清空全域 ⊇ clearRect）
//   ③语义序（miss→尺寸→return / pop→归一→clearRect）防重排漂移。
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const TSHINE = readFileSync(join(__dirname, '../src/render/TileShine.ts'), 'utf8');

/** 提取 acquireShineCanvas 函数体（平衡花括号扫描） */
function acquireBody(): string {
  const head = TSHINE.indexOf('function acquireShineCanvas');
  expect(head, 'acquireShineCanvas 必须存在').toBeGreaterThanOrEqual(0);
  const open = TSHINE.indexOf('{', head);
  let depth = 0, i = open;
  for (; i < TSHINE.length; i++) {
    if (TSHINE[i] === '{') depth++;
    else if (TSHINE[i] === '}') { depth--; if (depth === 0) break; }
  }
  return TSHINE.slice(open, i + 1);
}

describe('TileShine 池化画布尺寸回归锁（300×150 缺省尺寸 → srcoob 降级风暴）', () => {
  it('①池 miss 新建分支必须显式设 S² 尺寸（漏设=缺省 300×150→部分越界降级风暴+shine 裁剪）', () => {
    const body = acquireBody();
    expect(body).toMatch(/if \(!c\) \{[\s\S]*?document\.createElement\('canvas'\);[\s\S]*?nc\.width = S; nc\.height = S;[\s\S]*?return nc;/);
  });

  it('②池 hit 分支必须有尺寸归一（早代污染画布回池=重设尺寸清空全域 ⊇ clearRect 256² 域）', () => {
    const body = acquireBody();
    expect(body).toMatch(/if \(c\.width !== S \|\| c\.height !== S\) \{ c\.width = S; c\.height = S; \}/);
  });

  it('③语义序：归一必须在 clearRect 之前（重设尺寸即清空,clearRect 随后为幂等防御）', () => {
    const body = acquireBody();
    const norm = body.indexOf('c.width !== S');
    const clear = body.indexOf('clearRect(0, 0, S, S)');
    expect(norm).toBeGreaterThan(0);
    expect(clear).toBeGreaterThan(norm);
  });

  it('④消费点接线不变（entry.mul/entry.add 均经 acquireShineCanvas——尺寸只能由 acquire 单点保证）', () => {
    expect(TSHINE).toContain('entry.add = acquireShineCanvas();');
    expect(TSHINE).toContain('entry.mul = acquireShineCanvas();');
    // 消费点不得出现旧式直 createElement（防双路漂移——尺寸赋值在消费点曾随池化丢失）
    expect(TSHINE).not.toMatch(/entry\.(mul|add)\s*=\s*document\.createElement/);
  });
});
