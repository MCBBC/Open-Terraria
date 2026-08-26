// VVV 批离线重放：用 /tmp/vvv-out/replay 十通道在窗口入口态上只跑
// quickWater() + waterCheck()（#98 pass 体首段），traceSink 记沉降事件迹。
// 用途：对照 x86 K-log 逐杀定位 JS 首个行为分歧。SW_LQREPLAY=1 启用。
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { LiquidSim } from '../src/world/liquid/LiquidSim';
import { snapshotGenSolid } from '../src/world/gen/vanilla/GenSolid';
import type { World } from '../src/world/World';

const RUN = process.env.SW_LQREPLAY === '1';

it('vvv settle replay', () => {
  if (!RUN) return;
  const dir = '/tmp/vvv-out/replay/';
  const rd = (n: string) => new Uint8Array(readFileSync(dir + n + '.bin'));
  const type = rd('type');
  const dim = type.length;
  const W = Number(process.env.SW_LQREPLAY_W ?? 4200);
  const H = dim / W;
  const stores = {
    w: W, h: H,
    type,
    flags: rd('flags'),
    wall: rd('wall'),
    liquid: rd('liquid'),
    liquidType: rd('liquidType'),
    frameX: new Uint16Array(rd('frameX').buffer),
    frameY: new Uint16Array(rd('frameY').buffer),
    half: rd('half'),
    slope: rd('slope'),
    wire: rd('wire'),
  };
  const st = stores;
  const fakeStore = {
    w: W, h: H,
    ...st,
    idx(x: number, y: number) { return y * W + x; },
    inBounds(x: number, y: number) { return x >= 0 && y >= 0 && x < W && y < H; },
    paint: new Uint8Array(dim),
    onTileChanged(_: unknown) {},
    onLiquidChanged(_: unknown) {},
    setTileSilent(x: number, y: number, t: number) {
      const i = y * W + x;
      st.type[i] = t; st.flags[i] = t === 0 ? 0 : 1; st.half[i] = 0; st.slope[i] = 0;
    },
    setTile(x: number, y: number, t: number, fx?: number, fy?: number) {
      this.setTileSilent(x, y, t);
      const i = y * W + x;
      if (fx !== undefined) st.frameX[i] = fx;
      if (fy !== undefined) st.frameY[i] = fy;
    },
  };
  const world = { store: fakeStore, seed: 9293480 } as unknown as World;
  const sim = new LiquidSim(world);
  sim.passRand = (max) => max - 1; // 掷值占位：本批关注写序非流值
  sim.isGeneratingOrLoadingWorld = true;
  sim.generatingWorld = true;
  sim.applyGenSolidOverrides(snapshotGenSolid());
  sim.worldGenTilesIgnoreWater(true);
  const bbox = String(process.env.SW_LQTRACE ?? '').split(',').map(Number);
  const bx0 = bbox[0] ?? 0, bx1 = bbox[1] ?? 99999, by0 = bbox[2] ?? 0, by1 = bbox[3] ?? 99999;
  const lines: string[] = [];
  sim.traceSink = (ev, x, y) => {
    if (x < bx0 || x > bx1 || y < by0 || y > by1) return;
    lines.push(`${ev} ${x} ${y}`);
  };
  sim.quickWater();
  sim.waterCheck();
  writeFileSync('/tmp/vvv-out/j-replay-trace.txt', lines.join('\n') + '\n');
}, 300000);
