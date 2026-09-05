// IIII182 N2 定位仪：TrapsPass 写入窗内对 frameX 的【逐写入点】拦截（y<3 目标域）。
// 原理：TrapsPass 主环起点钩 __swTntEv('MB ...')（TrapsPass.ts:2085 tntProbe）触发时，
// 以 Proxy 替换 store.frameX 的实例属性 → 捕获对 y<3 格的全部 frameX 写入（含值+调用栈
// 顶部 .ts 帧+最近 tntProbe/trapEv 相位标签）。地表装饰槽结束时（onWorldPartial 下一拍）
// 拆除 Proxy 恢复原数组（覆盖主环+TNT 环支=post-mainloop，CLIII 夹逼双段）。
// 用法: cd game && SW_I182N2=1 npx vitest run tools/_iii182n2.test.ts
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_I182N2 === '1';
const OUT = process.env.SW_I182N2_OUT ?? '/tmp/iii182-out/n2-fxwrites.json';

interface WRec { i: number; x: number; y: number; v: number; phase: string; stack: string }

(RUN ? it : it.skip)('IIIII182 N2 frame-write interceptor (TrapsPass window)', async () => {
  const W = 4200, H = 1200;
  const recs: WRec[] = [];
  let phase = '';
  let installed = false;
  let done = false;
  const stackOf = (): string => (new Error().stack ?? '')
    .split('\n').slice(2, 14)
    .map((s) => { const m = s.match(/\(?([^\s()]*\.ts):(\d+):\d+/); return m ? `${m[1]!.split('/').pop()}:${m[2]}` : ''; })
    .filter(Boolean).slice(0, 6).join('<');

  let rawArr: Uint16Array | null = null;
  const install = (st: Record<string, unknown>): void => {
    const raw = st.frameX as Uint16Array;
    rawArr = raw;
    const px = new Proxy(raw, {
      get(t, k, r) { return Reflect.get(t, k, r); },
      set(t, k, v, r) {
        if (typeof k === 'string' && /^\d+$/.test(k)) {
          const i = Number(k);
          const y = (i / W) | 0;
          if (y < 3 && recs.length < 4000) {
            recs.push({ i, x: i % W, y, v: Number(v), phase, stack: stackOf() });
          }
        }
        return Reflect.set(t, k, v, r);
      },
    });
    try { Object.defineProperty(st, 'frameX', { get: () => px, set: (v) => { /* no replace */ }, configurable: true }); }
    catch { /* 实例字段不可配置则放弃 */ }
    installed = true;
  };
  const uninstall = (st: Record<string, unknown>): void => {
    try { Object.defineProperty(st, 'frameX', { value: rawArr, writable: true, enumerable: true, configurable: true }); } catch { /* noop */ }
  };

  (globalThis as unknown as { __swTntEv?: (m: string) => void }).__swTntEv = (m: string) => {
    phase = m;
    if (!installed && m.startsWith('MB')) {
      // store 需从 onWorldPartial 捕获的 world 取——用最近一次 partial 的 store
      if (lastSt) install(lastSt as unknown as Record<string, unknown>);
    }
  };
  (globalThis as unknown as { __swTrapEv?: (k: string, a: number, b: number, v: number) => void }).__swTrapEv =
    (k, a, b, v) => { phase = `EV:${k} ${a},${b} v${v}`; };

  let lastSt: unknown = null;
  let lastName = '';
  await generateWorld({
    width: W, height: H, seedText: '1896728457', evil: 1, seedFlags: { noTraps: true },
    onWorldPartial: (w, _i, pn) => {
      if (installed) { uninstall(lastSt as unknown as Record<string, unknown>); }
      lastName = pn;
      lastSt = (w as unknown as { store: unknown }).store;
    },
  });
  writeFileSync(OUT, JSON.stringify({ n: recs.length, lastName, recs: recs.slice(0, 400) }, null, 1));
  console.log(`[i182n2] writes(y<3)=${recs.length} → ${OUT}`);
  const seen = new Set<string>();
  for (const r of recs) {
    const key = `${r.x},${r.y} v=${r.v}`;
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`  (${r.x},${r.y}) fx=${r.v} phase=${r.phase} by=${r.stack.split('<').slice(0, 4).join('<')}`);
    if (seen.size > 24) break;
  }
}, 900_000);
