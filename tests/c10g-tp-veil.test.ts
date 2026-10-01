// ★C10g 传送幕帘+预算占位扩账 源锚锁（2026-10-01,用户实报「进世界/传送后可见
//  逐块渲染」定谳修复）
//
// 定谳：ChunkCache 帧内烘焙预算（bakeBudgetMs=8,巨帧护栏）超限块建占位对跨帧摊,
// 占位对「刻意不入账」→ 入场覆盖门 viewportCovered() 对其【全盲】= 幕布掀开时
// 余块仍逐帧渐进可见（进世界本体）;传送无任何门=必然可见（落点 ~40 块×0.47ms
// > 8ms 预算,摊 2-4 帧）。修=①预算占位对入账 budgetAwaiting（覆盖门同权）
// ②传送幕帘（玩家单帧位移>1000px 判定传送→保持上帧画面→幕帘帧面预烘目标视口
// →viewportCovered 或 600ms 保险后揭幕=「逐块渲染完毕后再传送」用户令）。
// 运行时行为 node 无法验（无 canvas/rAF）——本文件锁接线不漂移,活机探针兜底。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const CC = readFileSync(resolve(__dirname, '../src/render/ChunkCache.ts'), 'utf8');
const GAME = readFileSync(resolve(__dirname, '../src/core/Game.ts'), 'utf8');

describe('C10g 预算占位扩账（ChunkCache.budgetAwaiting）', () => {
  it('账本存在+viewportCovered 同权消费（workerAwaiting ∪ budgetAwaiting 双扫;残 key 自洁）', () => {
    expect(CC).toContain('readonly budgetAwaiting = new Set<number>();');
    // 双扫结构:workerAwaiting 分支原样 + budgetAwaiting 分支（残 key=已真对/已淘汰跳过）
    expect(CC).toMatch(/viewportCovered\(\): boolean \{\s*\n\s*const v = this\.animView;\s*\n\s*if \(!v\) return true;\s*\n\s*if \(this\.workerAwaiting\.size === 0 && this\.budgetAwaiting\.size === 0\) return true;[\s\S]{0,400}for \(const k of this\.budgetAwaiting\) \{\s*\n\s*const c = this\.chunks\.get\(k\);\s*\n\s*if \(!c \|\| !c\.placeholder\) continue;/);
  });

  it('三账点:预算占位建对入账/原位重烘出账/直接烘出账;dispose 清账', () => {
    // 建对入账（预算支）
    expect(CC).toMatch(/this\.chunks\.set\(k, pair\);\s*\n\s*this\.budgetAwaiting\.add\(k\);/);
    // 原位重烘成真对=出账（get 预算支）
    expect(CC).toMatch(/this\.workerAwaiting\.delete\(k\);\s*\n\s*this\.budgetAwaiting\.delete\(k\);/);
    // 直接烘路径出账
    expect(CC).toMatch(/this\.workerAwaiting\.delete\(k\);[^\n]*\n\s*this\.budgetAwaiting\.delete\(k\);\s*\n\s*this\.chunks\.set\(k, c\);/);
    // dispose 清账（世界整弃）
    expect(CC).toMatch(/this\.workerAwaiting\.clear\(\);\s*\n\s*this\.budgetAwaiting\.clear\(\);/);
    // 定谳史注在场（防无证据改回「不入账」政策）
    expect(CC).toContain('覆盖门全盲');
  });
});

describe('C10g 传送幕帘（Game._tpVeil）', () => {
  it('签名检测:fixedUpdate 后单帧玩家位移>1000px 判定（合法移动远不可达）,600ms 保险帽', () => {
    expect(GAME).toContain('private static readonly TP_VEIL_JUMP_PX = 1000;');
    expect(GAME).toContain('private static readonly TP_VEIL_CAP_MS = 600;');
    expect(GAME).toMatch(/if \(!this\._tpVeil && Number\.isFinite\(this\._lastPlayerCx\)\s*\n\s*&& \(Math\.abs\(this\.player\.cx - this\._lastPlayerCx\) > Game\.TP_VEIL_JUMP_PX\s*\n\s*\|\| Math\.abs\(this\.player\.cy - this\._lastPlayerCy\) > Game\.TP_VEIL_JUMP_PX\)\) \{[\s\S]{0,120}this\._tpVeil = true;/);
    // 检测位在 fixedUpdate 步进循环之后（落点已定）
    const iSteps = GAME.indexOf('this.fixedUpdate(FIXED_DT);');
    const iDetect = GAME.indexOf('Game.TP_VEIL_JUMP_PX');
    expect(iSteps).toBeGreaterThan(-1);
    expect(iDetect).toBeGreaterThan(-1);
    expect(iDetect).toBeGreaterThan(iSteps);
  });

  it('幕帘分支:模拟暂停+wheel 重锚+tpVeilTick;渲染门跳过=保持上帧画面', () => {
    // 幕帘分支在入场冻结分支之后（冻结优先——入口由幕布覆盖门管,互斥）
    expect(GAME).toMatch(/this\.entryFreezeTick\(\);\s*\n\s*\} else if \(this\._tpVeil\) \{[\s\S]{0,300}this\.tpVeilTick\(\);/);
    expect(GAME).toMatch(/\} else if \(this\._tpVeil\) \{\s*\n\s*\/\/ ★C10g 传送幕帘帧[\s\S]{0,200}this\.acc = 0;\s*\n\s*this\.input\.resetWheelAccumulators\(\);\s*\n\s*this\.tpVeilTick\(\);/);
    // 渲染门（C10g 注在场=防无证据摘除）
    expect(GAME).toMatch(/if \(!this\._tpVeil\) this\.render\(\);/);
    expect(GAME).toContain('逐块渲染完毕后再传送');
  });

  it('幕帘帧面 tpVeilTick:相机收敛+animView 先置+预烘循环+光照+双门落幕（covered∨deadline）', () => {
    expect(GAME).toContain('private tpVeilTick(): void {');
    const at = GAME.indexOf('private tpVeilTick');
    const body = GAME.slice(at, GAME.indexOf('private entryFreezeTick', at));
    expect(body).toContain('cc.animView = { x0: cam.x - hw, y0: cam.y - hh, x1: cam.x + hw, y1: cam.y + hh };');
    expect(body).toContain('cc.flushDirty();');
    // 预烘循环（渲染循环 get() 的替代口——幕帘帧不 render,烘焙在此驱动）
    expect(body).toMatch(/for \(let cy = cy0; cy <= cy1; cy\+\+\) \{\s*\n\s*for \(let cx = cx0; cx <= cx1; cx\+\+\) cc\.get\(cx, cy\);\s*\n\s*\}/);
    expect(body).toContain('this.tickLighting(viewTW, viewTH);');
    // 落幕双门:covered ∨ deadline 保险（防烘焙异常永久持帧）
    expect(body).toMatch(/if \(performance\.now\(\) >= this\._tpVeilDeadline \|\| cc\.viewportCovered\(\)\) this\._tpVeil = false;/);
    // 帧面在 entryFreezeTick 之前定义（紧邻=同族帧面聚合）
    expect(at).toBeLessThan(GAME.indexOf('private entryFreezeTick'));
  });
});
