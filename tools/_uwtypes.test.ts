// 一次性诊断：截取 JS 全管线 ▶Underworld 重播点（=Webs 末态）的 liquidType 快照
// （dump 四通道不含液体类型——隔离重放需真值导入；JS 侧该时点的类型数组由
//  Desert/MarbleGranite 等已验证 pass 写入，含岩浆类型位）。
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';

(RUN ? it : it.skip)('snapshot liquidType at Underworld reseed', async () => {
  const origReseed = RNG.prototype.reseed;
  let captured: Uint8Array | null = null;
  const onReseed = function (this: RNG, seed: number) {
    origReseed.call(this, seed);
    if (captured) return;
    const stackLine = (new Error().stack ?? '').split('\n')
      .find((l) => l.includes('/src/') && !l.includes('rng.ts')) ?? '?';
    if (stackLine.includes('UnderworldPass') || /WorldGen\.ts:72[0-9]/.test(stackLine)) {
      // WorldGen.ts:724 ▶Underworld 头——但 reseed 帧在 WorldGen;改抓下一帧:
    }
    if (stackLine.includes('WorldGen.ts:724')) {
      // 该 reseed 即 ▶Underworld（cs:13697）——调用栈拿不到 store,由外部闭包取
    }
  };
  void onReseed;
  // 简化:generateWorld 的 onWorldPartial 每槽回调拿 store;▶Underworld 重播发生在
  // 「生物群系」槽内——改用 reseed 帧定位 + 最后一次 onWorldPartial 的 store 引用,
  // 在 reseed 时同步拷贝 liquidType
  let storeRef: { liquidType: Uint8Array; liquid: Uint8Array; flags: Uint8Array } | null = null;
  const hook = function (this: RNG, seed: number) {
    origReseed.call(this, seed);
    if (captured || !storeRef) return;
    const stackLine = (new Error().stack ?? '').split('\n')
      .find((l) => l.includes('/src/') && !l.includes('rng.ts')) ?? '?';
    if (stackLine.includes('WorldGen.ts:724')) {   // ▶Underworld cs:13697
      captured = Uint8Array.from(storeRef.liquidType);
      writeFileSync('/tmp/sw-uw-liqtype.bin', captured);
      console.log('captured liquidType at ▶Underworld, bytes=', captured.length,
        'lava cells=', captured.reduce((a, v) => a + (v === 2 ? 1 : 0), 0),
        'water cells=', captured.reduce((a, v) => a + (v === 1 ? 1 : 0), 0));
    }
  };
  (RNG.prototype as { reseed: unknown }).reseed = hook;
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: '9293480', evil: 0,
      onWorldPartial: (w, _i, _name) => { storeRef = w.store; },
    });
  } finally {
    (RNG.prototype as { reseed: unknown }).reseed = origReseed;
  }
  console.log('done, captured=', !!captured);
}, 480000);
