// ★C10e 屏栈补偿回归锁（2026-10-03 用户实报「光标指向 NPC 旗帜远景全消失」定谳刀）。
//
// 机制:桥接 flush 的 presentBatch → glw.end() → pipeBackend.present(fboWorld,
// over=false) = blend-off 直写管线画布。C10e 屏栈模式下管线画布=DOM glCanvas=
// 屏栈折叠面,blend-off 直写把 bg+云+群系背景整组栈内容踩掉且【无 restack 补偿】
// →帧尾合成器采样踩踏态=远景层集合(云+山+森林 bg)整体消失。触发链=旗布悬停
// 名板 measureText(读值面支)→ensureBridged→degradeAcc 换桥→本帧续走桥接 flush
// →悬停期间每帧帧尾恒踩踏=「持续消失」,鼠标移开自然恢复。degradeAcc 尾/
// fullbright/lightFast 三处同型 present 均有 restack 补偿,唯 presentBatch 漏。
//
// 本锁:①行为锁——屏栈模式下桥接 flush 的回贴 drawImage 之后必须 restackScreen
// (顺序判别:readback 先消费踩踏态画布,补偿随后恢复);旗关(screenStackMode=false)
// 零操作。②结构锁——presentBatch 三臂(主臂+两个失败重放臂)都挂补偿。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GLShimExecutor } from '../src/render/glshim/GLShimExecutor';

const EXEC_SRC = readFileSync(join(__dirname, '../src/render/glshim/GLShimExecutor.ts'), 'utf8');

/** 共享事件账:journal.push 跨 raw ctx / wctx / pipe 三方,判 restack 与回贴的顺序 */
function mkJourn(journal: string[]) {
  const mkRaw = () => ({
    a: 1, b: 0, c: 0, d: 1, e: 0, f: 0,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    imageSmoothingEnabled: false,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    filter: 'none',
    font: '10px sans-serif',
    textAlign: 'left',
    getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 } as DOMMatrix; },
    setTransform(x: number, _b: number, _c: number, _d: number, _e: number, _f: number) { journal.push(`raw.setTransform:${x}`); },
    save() { journal.push('raw.save'); },
    restore() { journal.push('raw.restore'); },
    fillText() { journal.push('raw.fillText'); },
    drawImage() { journal.push('raw.drawImage'); },
    fillRect() { journal.push('raw.fillRect'); },
  }) as unknown as CanvasRenderingContext2D;
  // wctx=host.worldCtx()——presentBatch 回贴目标(worldCanvas 2D)
  const wctx = {
    save() { journal.push('wctx.save'); },
    restore() { journal.push('wctx.restore'); },
    setTransform() { journal.push('wctx.setTransform'); },
    drawImage() { journal.push('wctx.drawImage(readback)'); },
    get globalCompositeOperation() { return 'source-over'; },
    set globalCompositeOperation(_v: GlobalCompositeOperation) { journal.push('wctx.gco'); },
  } as unknown as CanvasRenderingContext2D;
  return { raw: mkRaw(), wctx };
}

interface PipeStub { screenStackMode: boolean; restackScreen(): void }

/** GL 可用路径 host:fake 层带 pipeBackend——presentBatch 全链可达 */
function mkGlHost(journal: string[], stackMode: boolean) {
  let restacks = 0;
  const pipe: PipeStub = {
    screenStackMode: stackMode,
    restackScreen() { restacks++; journal.push('pipe.restackScreen'); },
  };
  const restackCount = () => restacks;
  const layer = {
    unavailable: false,
    isAccumOpen: (_n: string) => false,
    endAccumulate: () => null,
    begin: () => { journal.push('layer.begin'); },
    resize: () => {},
    end: () => { journal.push('layer.end'); },
    quadSprite: () => {},
    blendAdditive: () => {},
    blendErase: () => {},
    blendMult: () => {},
    texFromImage: () => ({ tex: {}, w: 8, h: 8, key: 'stub' }),
    texFromRegion: () => ({ tex: {}, w: 8, h: 8, key: 'stub' }),
    texFromData: () => null,
    texRefresh: () => null,
    texAlive: () => true,
    texCheck: () => true,
    pipeBackend: pipe,
  };
  return {
    layer,
    pipe,
    restackCount,
    host: {
      acquireGl: () => layer as never,
      worldCtx: () => null,   // 占位;测试内覆写
      worldW: () => 1280,
      worldH: () => 720,
    },
  };
}

function mkImg(id: number): CanvasImageSource {
  return { width: 64, height: 64, __id: id } as unknown as CanvasImageSource;
}

describe('C10e 屏栈补偿:桥接 flush 的 blend-off present 必须跟 restackScreen', () => {
  it('行为锁:屏栈模式下 flush→presentBatch 回贴 drawImage 之后 restackScreen(顺序判别)', () => {
    const journal: string[] = [];
    const { raw, wctx } = mkJourn(journal);
    const { host, pipe, restackCount } = mkGlHost(journal, true);
    (host as unknown as { worldCtx: () => CanvasRenderingContext2D }).worldCtx = () => wctx;
    const ex = new GLShimExecutor(host);
    const wrap = ex.attach(raw);
    expect(wrap).not.toBeNull();
    // 桥接态:drawImage 入队(SO tier) → fillText(DRAWING_TAIL)→flushForFallback
    // →flush→presentBatch→end→回贴 drawImage→restackScreen
    wrap!.drawImage(mkImg(1), 0, 0, 8, 8, 10, 10, 8, 8);
    wrap!.fillText('nameplate', 3, 4);
    expect(restackCount()).toBe(1);
    const readback = journal.indexOf('wctx.drawImage(readback)');
    const restack = journal.indexOf('pipe.restackScreen');
    expect(readback).toBeGreaterThanOrEqual(0);
    expect(restack).toBeGreaterThan(readback);   // 补偿在回贴【之后】(readback 先消费踩踏态)
  });

  it('旗关零操作:screenStackMode=false(非 C10e/回退帧)flush 不触发 restack', () => {
    const journal: string[] = [];
    const { raw, wctx } = mkJourn(journal);
    const { host, pipe, restackCount } = mkGlHost(journal, false);
    (host as unknown as { worldCtx: () => CanvasRenderingContext2D }).worldCtx = () => wctx;
    const ex = new GLShimExecutor(host);
    const wrap = ex.attach(raw);
    wrap!.drawImage(mkImg(2), 0, 0, 8, 8, 0, 0, 8, 8);
    wrap!.fillText('x', 1, 2);
    expect(restackCount()).toBe(0);
    expect(journal).toContain('wctx.drawImage(readback)');   // 回贴照旧(旗关=原 B2 行为)
  });

  it('结构锁:presentBatch 三臂(主臂+两失败重放臂)均挂 restackAfterBlitOff;失败臂补偿在 replay2D 之前', () => {
    // 三处调用点
    expect(EXEC_SRC.match(/this\.restackAfterBlitOff\(glw\);/g)?.length).toBe(3);
    // 主臂顺序:回贴 drawImage → restore → 补偿
    expect(EXEC_SRC).toMatch(/wctx\.drawImage\(glw\.canvas, 0, 0, w, h\);\s*\n\s*wctx\.restore\(\);\s*\n[\s\S]{0,900}?this\.restackAfterBlitOff\(glw\);/);
    // 失败臂顺序:glw.end() → 补偿 → replay2D
    expect(EXEC_SRC.match(/glw\.end\(\);\s*\n\s*this\.restackAfterBlitOff\(glw\);[^\n]*\n\s*this\.replay2D\(\);/g)?.length).toBe(2);
    // 补偿门=pipeBackend.screenStackMode(旗关/非共管=零操作)
    expect(EXEC_SRC).toMatch(/private restackAfterBlitOff\(glw: GLSpriteLayer\): void \{\s*\n\s*const pipe = glw\.pipeBackend;\s*\n\s*if \(pipe && pipe\.screenStackMode\) pipe\.restackScreen\(\);\s*\n\s*\}/);
  });
});
