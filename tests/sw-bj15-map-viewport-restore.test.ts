// SW-BJ15 2026-09-07：全屏地图首开居中 + Shift+F4 迷雾消除/恢复（用户实报×2）
//
// 实报①地图首开偏左：render() 曾只在 drawFullMap 置 _fmWorldW/_fmWorldH——会话首开
//   时 easeFullMap→applyMapAnchor 以 0 尺寸反解 pan，首帧短差 (W×z/2, H×z/2)
//   （4200 世界实测左偏 1554px）；小地图点击入口另把 anchorMX=floor(屏幕px/TILE)
//   当世界坐标 + anchorU/V 留旧值 → 首开地图左缘钉在屏幕左缘（恒定偏心）。
// 实报②F4 开视野无法恢复：World.toggleFullReveal 快照/写回 + 版本 bump 整幅重建。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { Renderer } from '../src/render/Renderer';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { TILE } from '../src/core/constants';

const here = join(dirname(fileURLToPath(import.meta.url)));
const read = (p: string) => readFileSync(join(here, '..', p), 'utf8');

/** easeFullMap 可驱动的最小 Renderer 桩（只含锚点补偿数学面） */
function fmStub(opts: { viewW: number; viewH: number; worldW: number; worldH: number; fmWorldW?: number; fmWorldH?: number }) {
  const fm = {
    open: true, zoom: 0.5, zoomTarget: 2,
    panX: 0, panY: 0, anchorU: 0, anchorV: 0, anchorMX: opts.viewW / 2, anchorMY: opts.viewH / 2,
  };
  const stub = {
    fullMap: fm,
    canvas: { width: opts.viewW, height: opts.viewH },
    _fmWorldW: opts.fmWorldW ?? opts.worldW,
    _fmWorldH: opts.fmWorldH ?? opts.worldH,
    // 原型方法接入桩（easeFullMap 内 this.applyMapAnchor(...) 直调）
    applyMapAnchor: (Renderer.prototype as unknown as { applyMapAnchor: () => void }).applyMapAnchor,
  } as unknown as Renderer;
  return { stub, fm };
}

/** 玩家在屏幕上的落点（drawFullMap 同式：cx0 = viewW/2 - mapW/2 + panX） */
function playerScreen(fm: { zoom: number; panX: number; panY: number; anchorU: number; anchorV: number },
  viewW: number, viewH: number, worldW: number, worldH: number) {
  const cx0 = viewW / 2 - (worldW * fm.zoom) / 2 + fm.panX;
  const cy0 = viewH / 2 - (worldH * fm.zoom) / 2 + fm.panY;
  return { x: cx0 + fm.anchorU * fm.zoom, y: cy0 + fm.anchorV * fm.zoom };
}

const ease = (r: Renderer) => (Renderer.prototype as unknown as { easeFullMap: () => void }).easeFullMap.call(r);
const anchor = (r: Renderer) => (Renderer.prototype as unknown as { applyMapAnchor: () => void }).applyMapAnchor.call(r);

describe('SW-BJ15① 全屏地图首开居中（锚点补偿数学）', () => {
  const W = 4200, H = 1200, viewW = 1280, viewH = 800;
  const playerTile = [2097.5, 273];   // 任意非中心点（偏心判别更灵敏）

  it('整段缓动（0.5→2）玩家恒钉在屏幕中心（_fmWorldW 就位时）', () => {
    const { stub, fm } = fmStub({ viewW, viewH, worldW: W, worldH: H });
    fm.anchorU = playerTile[0];
    fm.anchorV = playerTile[1];
    fm.panX = (W * fm.zoom) / 2 - fm.anchorU * fm.zoom;   // toggleFullMap 同式预置
    fm.panY = (H * fm.zoom) / 2 - fm.anchorV * fm.zoom;
    let frames = 0;
    while (fm.zoom !== fm.zoomTarget && frames < 200) {
      ease(stub);
      const p = playerScreen(fm, viewW, viewH, W, H);
      // 收敛帧（|diff|<0.002 早退不反解）带 <0.01px 亚像素残余——实机不可见
      expect(Math.abs(p.x - viewW / 2)).toBeLessThan(0.01);
      expect(Math.abs(p.y - viewH / 2)).toBeLessThan(0.01);
      frames++;
    }
    expect(fm.zoom).toBe(2);
    expect(frames).toBeGreaterThan(5);   // 缓动确实发生（非一次到位）
  });

  it('判别力：_fmWorldW=0（修复前首开态）首帧偏移 = -(W×z/2, H×z/2)', () => {
    const { stub, fm } = fmStub({ viewW, viewH, worldW: W, worldH: H, fmWorldW: 0, });
    (stub as unknown as { _fmWorldH: number })._fmWorldH = 0;
    fm.anchorU = playerTile[0];
    fm.anchorV = playerTile[1];
    fm.panX = (W * fm.zoom) / 2 - fm.anchorU * fm.zoom;
    fm.panY = (H * fm.zoom) / 2 - fm.anchorV * fm.zoom;
    ease(stub);   // 首帧：applyMapAnchor 以 0 尺寸反解 → pan 塌掉 (W×z)/2 项
    const p = playerScreen(fm, viewW, viewH, W, H);
    const z = fm.zoom;
    expect(p.x - viewW / 2).toBeCloseTo(-(W * z) / 2, 6);
    expect(p.y - viewH / 2).toBeCloseTo(-(H * z) / 2, 6);
    // 4200 小世界第一帧 ≈ 左偏 1554px（与实报探针同量级）
    expect(Math.abs(p.x - viewW / 2)).toBeGreaterThan(1000);
  });

  it('applyMapAnchor 反解与 Game.toggleFullMap 预置逐值一致（双入口不踩）', () => {
    const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
    const world = new World(W, H, 7, 'bj15');
    const player = { cx: playerTile[0] * TILE, cy: playerTile[1] * TILE };
    const fm = {
      open: false, zoom: 0.5, zoomTarget: 0.5, panX: 0, panY: 0,
      anchorU: 0, anchorV: 0, anchorMX: 0, anchorMY: 0,
    };
    g.world = world;
    g.player = player;
    g.refreshPylons = () => {};
    g.renderer = {
      canvas: { width: viewW, height: viewH },
      fullMap: fm,
      _mapInit: true,
      _mapOpenClick: false,
    };
    (g as unknown as { toggleFullMap: () => void }).toggleFullMap();
    expect(fm.open).toBe(true);
    expect(fm.zoomTarget).toBe(2);
    expect(fm.anchorMX).toBe(viewW / 2);
    // 把预置喂给 Renderer 反解：pan 不动 = 玩家已居中（首帧即中，无跳变）
    const stub = fmStub({ viewW, viewH, worldW: W, worldH: H });
    Object.assign(stub.fm, fm);
    anchor(stub.stub);
    expect(stub.fm.panX).toBeCloseTo(fm.panX, 6);
    expect(stub.fm.panY).toBeCloseTo(fm.panY, 6);
  });

  it('openFullMapFocusedOnPlayer 预置与 toggleFullMap 同式（小地图点击入口）', () => {
    const stub = fmStub({ viewW, viewH, worldW: W, worldH: H });
    const r = stub.stub as unknown as Record<string, unknown>;
    r._mapInit = true;
    r._mapOpenClick = false;
    (Renderer.prototype as unknown as { openFullMapFocusedOnPlayer: (p: { cx: number; cy: number }, w: number, h: number) => void })
      .openFullMapFocusedOnPlayer.call(stub.stub, { cx: playerTile[0] * TILE, cy: playerTile[1] * TILE }, W, H);
    const fm = stub.fm;
    expect(fm.open).toBe(true);
    expect(fm.zoom).toBe(0.5);
    expect(fm.zoomTarget).toBe(2);
    expect(fm.anchorU).toBeCloseTo(playerTile[0], 6);
    expect(fm.anchorMX).toBe(viewW / 2);
    expect(r._mapOpenClick).toBe(true);   // 开图点击不参与拖拽
    // 预置 pan 下玩家首帧即居中
    const p = playerScreen(fm, viewW, viewH, W, H);
    expect(Math.abs(p.x - viewW / 2)).toBeLessThan(1e-6);
    expect(Math.abs(p.y - viewH / 2)).toBeLessThan(1e-6);
  });
});

describe('SW-BJ15② Shift+F4 迷雾消除/恢复（World.toggleFullReveal）', () => {
  const W = 400, H = 300;
  const makeWorld = () => {
    const w = new World(W, H, 7, 'bj15-fog');
    w.markExplored(200, 150, 18);   // 出生点邻域正常探索态
    return w;
  };
  const eq = (a: Uint8Array, b: Uint8Array) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  };

  it('消除=快照+全图置1+版本bump；恢复=位图逐字节等价+快照释放', () => {
    const w = makeWorld();
    const before = w.explored.slice();
    const v0 = w.exploredVersion;
    expect(w.toggleFullReveal()).toBe(true);          // 消除
    expect(w.exploredRevealSnapshot).not.toBeNull();
    for (let i = 0; i < w.explored.length; i++) expect(w.explored[i]).toBe(1);
    expect(w.exploredVersion).toBe(v0 + 1);
    expect(w.exploredDirty).toBeNull();               // 整幅重建失效标记（渲染端消费）
    expect(w.toggleFullReveal()).toBe(false);         // 恢复
    expect(eq(w.explored, before)).toBe(true);        // ★位图逐字节等价
    expect(w.exploredRevealSnapshot).toBeNull();      // 快照释放（~1.2MB 归还）
    expect(w.exploredVersion).toBe(v0 + 2);
  });

  it('切换可循环；全开期间 markExplored 短路不污染快照', () => {
    const w = makeWorld();
    const before = w.explored.slice();
    w.toggleFullReveal();
    const vRevealed = w.exploredVersion;
    w.markExplored(50, 50, 20);                       // 全开态下继续"探索"
    expect(w.exploredVersion).toBe(vRevealed);        // 全 1 短路：无新点亮无 bump
    expect(w.exploredRevealSnapshot!.some((v) => v === 0)).toBe(true);   // 快照未被污染成全 1
    w.toggleFullReveal();
    expect(eq(w.explored, before)).toBe(true);
    // 循环第二遍
    w.toggleFullReveal();
    for (let i = 0; i < w.explored.length; i++) expect(w.explored[i]).toBe(1);
    w.toggleFullReveal();
    expect(eq(w.explored, before)).toBe(true);
  });

  it('恢复后玩家邻域随 markExplored 重新点亮（雾可再开）', () => {
    const w = makeWorld();
    w.toggleFullReveal();
    w.toggleFullReveal();
    const before = w.explored.slice();
    w.markExplored(10, 10, 6);                        // 恢复态正常探索照常工作
    expect(w.explored[10 * W + 10]).toBe(1);
    expect(before[10 * W + 10]).toBe(0);
    expect(w.exploredDirty).not.toBeNull();           // 脏盒恢复增量更新
  });

  it('重绘失效（像素级）：恢复后雾缓冲回填未探索雾色（ensureFogData 整幅重扫）', () => {
    const w = makeWorld();
    const FOG = 0xff080505;   // 未探索雾色（ABGR，Renderer.ensureFogData 常量）
    const ensure = (Renderer.prototype as unknown as {
      ensureFogData: (w: World) => unknown;
    }).ensureFogData;
    const r = {
      fogPix: null, fogP32: null, fogImage: null, fogW: 0, fogH: 0,
      fogVersion: -1, fogRebuildRow: 0, fogWorld: null,
      fogFullRebuilds: 0, fogIncrUpdates: 0, fogFullWhy: '',
    } as unknown as Renderer;
    const runToDone = () => {
      for (let i = 0; i < 20; i++) {
        ensure.call(r, w);
        const row = (r as unknown as { fogRebuildRow: number }).fogRebuildRow;
        const h = Math.ceil(H / 2);
        if (row >= h) break;
      }
    };
    const fogStats = () => {
      const p32 = (r as unknown as { fogP32: Uint32Array | null }).fogP32!;
      let fog = 0, lit = 0;
      for (let i = 0; i < p32.length; i++) { if (p32[i] === FOG) fog++; else if (p32[i] === 0) lit++; }
      return { fog, lit };
    };
    // 初始：探索区透明、未探索区雾
    runToDone();
    let s = fogStats();
    expect(s.lit).toBeGreaterThan(0);
    expect(s.fog).toBeGreaterThan(0);
    // 消除：全图透明（无雾）
    w.toggleFullReveal();
    runToDone();
    s = fogStats();
    expect(s.fog).toBe(0);
    expect(s.lit).toBe(Math.ceil(W / 2) * Math.ceil(H / 2));
    // 恢复：雾回填（整幅重扫生效——版本 bump 失效标记被渲染端消费）
    w.toggleFullReveal();
    runToDone();
    s = fogStats();
    expect(s.fog).toBeGreaterThan(0);
    const p32 = (r as unknown as { fogP32: Uint32Array }).fogP32;
    expect((r as unknown as { fogVersion: number }).fogVersion).toBe(w.exploredVersion);
    void p32;
  });
});

describe('SW-BJ15 结构锁（源文本锚，防静默回退）', () => {
  const rs = read('src/render/Renderer.ts');

  it('render() 在 easeFullMap 前喂 _fmWorldW/_fmWorldH（首开偏移根因锁）', () => {
    const iEase = rs.indexOf('this.easeFullMap();');
    const iW = rs.indexOf('this._fmWorldW = world.w;');
    const iH = rs.indexOf('this._fmWorldH = world.h;');
    expect(iEase).toBeGreaterThan(-1);
    expect(iW).toBeGreaterThan(-1);
    expect(iH).toBeGreaterThan(-1);
    expect(iW).toBeLessThan(iEase);
    expect(iH).toBeLessThan(iEase);
  });

  it('小地图点击入口走 openFullMapFocusedOnPlayer 且带 !fullMap.open 门', () => {
    expect(rs).toContain('!this.fullMap.open && !this._minimapBtnClicked');
    expect(rs).toContain('this.openFullMapFocusedOnPlayer(player, world.w, world.h);');
    expect(rs).not.toContain('anchorMX = Math.floor(mx / TILE)');   // 旧垃圾锚点已删
  });

  it('openFullMapFocusedOnPlayer 预置主角锚定三要素', () => {
    const i0 = rs.indexOf('openFullMapFocusedOnPlayer(player: Player, worldW: number, worldH: number): void {');
    expect(i0).toBeGreaterThan(-1);
    const body = rs.slice(i0, i0 + 1200);
    expect(body).toContain('fm.anchorU = player.cx / TILE;');
    expect(body).toContain('fm.anchorMX = this.canvas.width / 2;');
    expect(body).toContain('fm.zoomTarget = 2;');
  });

  it('main.ts Shift+F4 走 toggleFullReveal（不再裸 fill(1)）', () => {
    const ms = read('src/main.ts');
    expect(ms).toContain('game.world.toggleFullReveal()');
    expect(ms).not.toContain('game.world.explored.fill(1)');
  });

  it('mainFlow devMode 揭示路径保留（域外不受影响）', () => {
    const mf = read('src/mainFlow.ts');
    expect(mf).toContain('g.world.explored.fill(1)');
  });
});
