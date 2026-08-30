// 真实世界门口几何离线重放:从 debug-report 的 areaCamera 网格重建 TileStore,
// 在向导实测出生点跑真 TownNPC.fixedUpdate 流水线,观察开门分支为何不触发。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { TILE } from '../src/core/constants';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
const td = { TILE_DEFS };
import { TownNPC } from '../src/entities/TownNPC';
import type { GameHooks } from '../src/entities/types';

// 最小 GameHooks 桩(npcDoorUpdate 只触 store/playSfx/net 三面)
const g_stub: any = new Proxy({
  world: { store: null as unknown as TileStore, flags: {}, clock: { bloodMoon:false, day:false, time:0 }, seedFlags: {}, journeyPowers: {}, weather: { windSpeedCurrent: 0, setWorldSize() {} }, groundLevel: 400, rockLevel: 800 },
  player: null,
  playSfx() {},
  enemies() { return []; },
  critters() { return []; },
  npcs() { return []; },
}, {
  get(t, p) {
    if (p in t) return (t as Record<string|symbol, unknown>)[p];
    return () => undefined;         // 任意未列钩子安全空转
  },
});
let logNpcDoor: Array<Record<string, unknown>> = [];
let logGateAll: Array<Record<string, unknown>> = [];
  (g_stub as Record<string, unknown>).behavioLog = (k: string, dd: unknown) => { if (k === 'npcDoor') logNpcDoor.push({ ...(dd as Record<string, unknown>) }); else logGateAll.push({ k, ...(dd as Record<string, unknown>) }); };
  g_stub.world.store = g_stub.world.store;

describe('door 重放', () => {
  it('report 几何回放', () => {
    const camGrid: Record<string, number[]> = JSON.parse(readFileSync('/tmp/fx/cam-grid.json', 'utf8'));
    const X0 = 4078, Y0 = 427;
    const st = new TileStore(8400, 2400);
    // ★sheet 域 → 内部 id 域换算(本批核心教训的又一次现身)
    const s2i = new Map<number, number>();
    td.TILE_DEFS.forEach((d, idxId) => { const sh = (d as unknown as { vanilla?: { sheet?: number } })?.vanilla?.sheet;
      if (typeof sh === 'number' && !s2i.has(sh)) s2i.set(sh, idxId); });
    const put = (x: number, y: number, v: number[]) => {
      if (!st.inBounds(x, y)) return;
      const internal = s2i.get(v[0]);
      if (internal === undefined || internal < 0) return;
      const i = st.idx(x, y);
      st.type[i] = internal; st.flags[i] = 1;
      st.frameX[i] = v[1]; st.frameY[i] = v[2];
      st.wall[i] = v[3]; st.half[i] = v[5]; st.slope[i] = v[6];
    };
    for (const key of Object.keys(camGrid)) {
      const [gx, gy] = key.split(',').map(Number);
      put(gx - X0 + 4000, gy - Y0 + 400, camGrid[key]);   // 平移到安全区
    }
    // 门相对坐标换算:原 door col 4140,y447 → 新 (4062, 420)
    const doorCol = 4140 - X0 + 4000;
    let totalDoors = 0;
    for (let yy = 400; yy < 520; yy++) for (let xx = 3950; xx < 4150; xx++) if (st.type[st.idx(xx, yy)] === TILE_BY_KEY['door_closed']) totalDoors++;
    console.log('postbuild doors near region:', totalDoors);
    const doorTop = 447 - Y0 + 400;

    const n = new TownNPC('guide', 0, 0);
    // 原报告位置:tile(4149,445)→新 x=4149-X0+4000
    n.x = ((4149 - X0 + 4000) * 16) + 4;
    n.y = ((445 - Y0 + 400) * 16) - n.h + 2;
    g_stub.world.store = st;

    const P = TownNPC.prototype;
    type AnyP = Record<string, (...a: unknown[]) => unknown>;
  const AP = P as unknown as AnyP;
  const oW = AP.wanderUpdate, oS = AP.socialUpdate, oA = AP.attackUpdate;
    AP.wanderUpdate = function () {
      const txp = this.cx / 16;
      if (!this.closeDoor && txp > doorCol + 0.8) return -1;   // 门外侧向门走
      if (this.closeDoor && txp > doorCol - 2) return -1;      // 开门后继续穿越触发回关
      return 0;
    };
    AP.socialUpdate = function () { return false; };
    AP.attackUpdate = function () { return false; };
    let openedAtTick = -1, taps = 0, probes = 0;
    const oScan = AP.tryOpenDoorAhead;
    AP.tryOpenDoorAhead = function (...a: unknown[]) {
      probes++;
      const r = (oScan as (...b: unknown[]) => boolean).apply(this, a);
      if (r) taps++;
      return r;
    };
    g_stub.behavioLog('npcDoor', { phase: 'selftest' });
    console.log('SELFTEST count=', JSON.stringify(logGateAll), 'directArr=', JSON.stringify(logNpcDoor));
    let fuCalls=0, nduCalls=0, gateSeen=0;
    const oFU=(AP as unknown as Record<string,(...a2:unknown[])=>unknown>).fixedUpdate;
    (AP as unknown as Record<string,(...a2:unknown[])=>unknown>).fixedUpdate=function(this:unknown,...a2:unknown[]){fuCalls++;return oFU.apply(this,a2);};
    const oNDU=(AP as unknown as Record<string,(...a2:unknown[])=>unknown>).npcDoorUpdate;
    (AP as unknown as Record<string,(...a2:unknown[])=>unknown>).npcDoorUpdate=function(this:unknown,...a2:unknown[]){nduCalls++; if((globalThis as unknown as{__DOORDBG?:boolean}).__DOORDBG && nduCalls%200===1) console.log('NDU@',nduCalls); return oNDU.apply(this,a2);};
    const DK = TILE_BY_KEY['door_closed'], DO = TILE_BY_KEY['door_open'];
    (globalThis as unknown as { __DOORDBG?: boolean }).__DOORDBG = true;
    console.log('REF doorCol='+doorCol+' doorTop='+doorTop+' typeNow='+st.type[st.idx(doorCol,doorTop)]+' tileByKeyClosed='+TILE_BY_KEY['door_closed']);
    for (let tick = 0; tick < 2400; tick++) {
      const drv = n as unknown as { walkMode: number; walkT: number; facing: number; doorCarry: boolean };
      void drv;
      if (!drv.doorCarry) { drv.walkMode = 1; drv.walkT = Math.max(drv.walkT, 120); drv.facing = -1; }
      else { drv.walkMode = 1; drv.facing = -1; }
      if (!drv.doorCarry && tick % 120 === 60) {
        const pxF = Math.floor((n.cx + drv.facing * (n.w / 2 + 2)) / TILE);
        const pyF = Math.floor((n.y + n.h - 8) / TILE);
        const cells = [[pxF,pyF],[pxF,pyF-1]].map(([ax,ay])=>{
          const i2 = st.idx(ax,ay);
          return st.flags[i2] ? `${st.type[i2]}@${st.frameX[i2]},${st.frameY[i2]} sl${st.slope[i2]} hf${st.half[i2]}` : 'air';
        });
        console.log(`T${tick} cx=${n.cx.toFixed(1)} w=${n.w} h=${n.h} fx=${pxF} fy=${pyF} probe=[${cells.join(' | ')}] doorTopCellType=${st.type[st.idx(doorCol,doorTop)]}`);
      }
      n.fixedUpdate(1 / 60, g_stub);
      if (openedAtTick < 0 && st.type[st.idx(doorCol, doorTop)] === DO) openedAtTick = tick;
      if (n.dead) break;
    }
    const gateEvts = logNpcDoor.filter(() => true);
    console.log('GATESNIP', JSON.stringify(gateEvts.slice(0, 3)));
    console.log('REPLAY', JSON.stringify({
      doorTypeFinal: st.type[st.idx(doorCol, doorTop)],
      openSheetId: DO,
      openedAtTick, attemptsRolled: taps, probeCalls: probes,
      endX: Math.round(n.cx / 16), endY: Math.round(n.cy / 16),
      carryAfterLoop: n.doorCarry === true,
      npcDead: n.dead,
    }));
    AP.wanderUpdate = oW; AP.socialUpdate = oS; AP.attackUpdate = oA; AP.tryOpenDoorAhead = oScan;
    expect(true).toBe(true);
  });
});
