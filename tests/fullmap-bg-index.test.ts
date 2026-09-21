// 全屏地图背景选取（Main.cs:55804 DrawMapFullscreenBackground 1:1）回归：
// ① 深度档看【视口顶的世界 tile】（screenPosition.Y 语义 = -cy0/zoom）——
//    旧式 (cy0+mapH/2)/zoom 是"地图底边屏幕坐标÷zoom"纯错位量，随缩放剧烈漂移
//    （2026-08-19 用户实报"背景图随缩放自己变动"根因）
// ② 其余档 = 玩家墙/群系（与视口无关）
import { describe, it, expect } from 'vitest';
import { Renderer } from '../src/render/Renderer';
import { World } from '../src/world/World';

const TILE = 16;

function makeThis(world: World, opts: {
  zoom: number; panY: number; viewH?: number;
  playerTile: [number, number]; sceneZones?: Record<string, boolean>;
}) {
  const viewH = opts.viewH ?? 862;
  const mapH = world.h * opts.zoom;
  const cy0 = viewH / 2 - mapH / 2 + opts.panY;
  return {
    fullMap: { zoom: opts.zoom, panX: 0, panY: opts.panY },
    canvas: { width: 1512, height: viewH },
    _lastPlayer: { cx: opts.playerTile[0] * TILE, cy: opts.playerTile[1] * TILE },
    scene: Object.assign({
      zoneDungeon: false, zoneGlowshroom: false, zoneCorrupt: false, zoneCrimson: false,
      zoneHallow: false, zoneDesert: false, zoneSnow: false, zoneJungle: false,
      zoneRockLayerHeight: false,
    }, opts.sceneZones ?? {}),
  } as unknown as Renderer;
}

describe('fullMapBgIndex（DrawMapFullscreenBackground :55804-55860）', () => {
  it('同一视口顶世界位置下，缩放不改变背景档（旧公式随 zoom 漂移）', () => {
    const w = new World(400, 600, 7, 'bgtest');
    w.groundLevel = 100; w.rockLevel = 200;
    // 视口顶世界 tile = 150（地表下）：以 zoom 反推 panY 使 -cy0/zoom = 150
    for (const z of [0.5, 1, 2, 3, 4, 6]) {
      const cy0 = -150 * z;
      const panY = cy0 - (862 / 2 - (600 * z) / 2);
      const idx = (Renderer.prototype.fullMapBgIndex as unknown as (w: World) => number)
        .call(makeThis(w, { zoom: z, panY, playerTile: [200, 150] }), w);
      expect(idx, `zoom ${z}`).toBe(1);   // 地表下泥土档（非群系默认 1）
    }
  });

  it('视口顶深过 h-232 → 地狱档(2)；玩家仍在地表墙档', () => {
    const w = new World(400, 600, 7, 'bgtest');
    w.groundLevel = 100;
    const z = 2, vyTop = 600 - 200;
    const cy0 = -vyTop * z;
    const panY = cy0 - (862 / 2 - (600 * z) / 2);
    const idx = (Renderer.prototype.fullMapBgIndex as unknown as (w: World) => number)
      .call(makeThis(w, { zoom: z, panY, playerTile: [200, 90] }), w);
    expect(idx).toBe(2);
  });

  it('玩家群系档优先于深度默认（地牢=4 恒最前之一）', () => {
    const w = new World(400, 600, 7, 'bgtest');
    w.groundLevel = 100;
    const idx = (Renderer.prototype.fullMapBgIndex as unknown as (w: World) => number)
      .call(makeThis(w, { zoom: 2, panY: 0, playerTile: [200, 300], sceneZones: { zoneDungeon: true } }), w);
    expect(idx).toBe(4);
  });

  it('视口顶在地表之上 → 地表档 0（即使玩家在地下）', () => {
    const w = new World(400, 600, 7, 'bgtest');
    w.groundLevel = 100;
    const z = 1;
    // 视口顶 = tile 40（地表之上）
    const cy0 = -40 * z;
    const panY = cy0 - (862 / 2 - (600 * z) / 2);
    const idx = (Renderer.prototype.fullMapBgIndex as unknown as (w: World) => number)
      .call(makeThis(w, { zoom: z, panY, playerTile: [200, 300] }), w);
    expect(idx).toBe(0);
  });
});
