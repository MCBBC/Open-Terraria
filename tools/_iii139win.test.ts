// IIII108b2（2026-09-04）winter 三单格 A 格 (1862,1047) 写序反演仪（一次性诊断）。
// 零 src 改动：@UWHEAD 钩把 TileStore 五通道 type/flags/wall/slope/half 换成窗口过滤
// Proxy（写序逐条记录）+ setHfTrace 抓 HellFort 每屋几何/平台事件；@CORRHEAD 落盘即弃。
// 用法：cd game && SW_I139=1 npx vitest run tools/_iii139win.test.ts
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { setHfTrace } from '../src/world/gen/vanilla/HellFortPass';

const RUN = process.env.SW_I139 === '1';
const SEED = process.env.SW_I139_SEED ?? '1.1.1.0.winteriscoming|20260914';
const OUT = '/tmp/iii139-out';
const W = 4200, H = 1200;
// 取证窗：A 格 (1862,1047) ±裕量
const X0 = Number(process.env.SW_I139_X0 ?? 1845), X1 = Number(process.env.SW_I139_X1 ?? 1880);
const Y0 = Number(process.env.SW_I139_Y0 ?? 1030), Y1 = Number(process.env.SW_I139_Y1 ?? 1070);
const inWin = (x: number, y: number): boolean => x >= X0 && x <= X1 && y >= Y0 && y <= Y1;

interface Store {
  w: number; h: number;
  type: Uint16Array; flags: Uint8Array; wall: Uint16Array; slope: Uint8Array; half: Uint8Array;
  liquid: Uint8Array; idx(x: number, y: number): number;
}

const log: string[] = [];
let writes = 0;
let armed = false;
let calls = 0;
let store: Store | null = null;

const snap = (st: Store, label: string): void => {
  log.push(`SNAP ${label}`);
  for (let y = Y0; y <= Y1; y++) {
    let row = `${y} `;
    for (let x = X0; x <= X1; x++) {
      const k = st.idx(x, y);
      row += `${st.type[k]}:${st.flags[k] & 1}:${st.wall[k]} `;
    }
    log.push(row);
  }
};

(RUN ? it : it.skip)('III139 winter hellfort write-order forensics', async () => {
  mkdirSync(OUT, { recursive: true });
  setHfTrace((s: string) => { if (armed) log.push(`HF ${s}`); });
  (globalThis as { __swI87Cap?: unknown }).__swI87Cap = (rawSt: unknown) => {
    calls++;
    const st = rawSt as unknown as Store;
    if (calls === 1) {           // @UWHEAD：先拍基座,再武装 Proxy
      snap(st, `UWHEAD base`);
      armed = true;
      store = st;
      const chans: Array<['type' | 'flags' | 'wall' | 'slope' | 'half', number]> = [
        ['type', 1], ['flags', 1], ['wall', 1], ['slope', 1], ['half', 1],
      ];
      for (const [name] of chans) {
        const target = st[name] as unknown as Record<string | number, number>;
        const proxied = new Proxy(target, {
          set(t, p, v): boolean {
            const i = typeof p === 'string' ? Number(p) : (typeof p === 'number' ? p : NaN);
            if (Number.isInteger(i) && i >= 0) {
              const x = i % W, y = (i - (i % W)) / W;
              if (x >= X0 && x <= X1 && y >= Y0 && y <= Y1 && t[i] !== v) {
                log.push(`W#${writes} ${name} (${x},${y}) ${t[i]}->${v}`);
                writes++;
              }
            }
            t[i] = v;
            return true;
          },
        });
        (st as unknown as Record<string, unknown>)[name] = proxied;
      }
      log.push(`ARMED @UWHEAD`);
      return;
    }
    if (calls === 2) {           // @CORRHEAD：HellFort 后=Underworld 槽末
      log.push(`DONE writes=${writes}`);
      snap(store as unknown as Store, `CORRHEAD final`);
      writeFileSync(`${OUT}/writelog.txt`, log.join('\n'));
      throw new Error('III139 captured—early abort');
    }
  };
  await generateWorld({ width: W, height: H, seedText: SEED }).catch((e: unknown) => {
    const msg = String((e as Error)?.message ?? e);
    if (!msg.includes('III139 captured')) throw e;
  });
}, 600_000);
