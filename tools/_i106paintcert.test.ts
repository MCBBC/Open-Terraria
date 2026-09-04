// IIII106：涂装/涂层四链 paint 位面认证仪——JS 终态 TileStore 的 paint/paintWall/coat
// 与 x86 认证链（~/GoldenChains/i106/x86-<chain>，iii109 世系+paint 钩）#105_Final_Cleanup
// 的 .pnt/.pwal/.cbt 三通道【逐位置直比】。
// 依据：单旗标全涂变体（gray/negative 全涂、illuminant/echo 全涂、无 JustX 组合派生位）
// 的 paint 位面与底格内容正交（覆盖域只由 W/H 与 5/25 边距决定）⇒ 逐位置相等即端点
// 字节级认证（含 WF 位编码与 TileStore.COAT_* 反映射）。
// 用法：SW_MB_1457=1 npx vitest run tools/_i106paintcert.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TileStore } from '../src/world/TileStore';

const ROOT = process.env.SW_I106_PG2 ?? `${process.env.HOME}/GoldenChains/i106`;
const W = 4200, H = 1200;
const N = W * H;

const CASES: Array<{ chain: string; flagText: string }> = [
  { chain: 'monochrome', flagText: 'monochrome|106108' },
  { chain: 'negativeinfinity', flagText: 'negativeinfinity|106109' },
  { chain: 'xrayvision', flagText: 'xrayvision|106107' },
  { chain: 'invisibleplane', flagText: 'invisibleplane|106106' },
];

it('IIIII106 paint-plane certification', async () => {
  let allOk = true;
  for (const c of CASES) {
    const pre = `${ROOT}/x86-${c.chain}/105_Final_Cleanup`;
    const pnt = readFileSync(`${pre}.pnt`);
    const pwal = readFileSync(`${pre}.pwal`);
    const cbt = readFileSync(`${pre}.cbt`);
    const w = await generateWorld({
      width: W, height: H,
      seedText: `1.1.1.0.${c.flagText}`,
      // evil 由配方段派生（1→0 腐化），与 rig serverconfig 同口径
    });
    const st = w.store as unknown as Record<string, Uint8Array>;
    let dP = 0, dPw = 0, dCb = 0;
    let firstP = '', firstCb = '';
    for (let i = 0; i < N; i++) {
      if (pnt[i] !== st.paint[i]) { dP++; if (!firstP) firstP = `(${i % W},${(i / W) | 0}) v${pnt[i]} j${st.paint[i]}`; }
      if (pwal[i] !== st.paintWall[i]) { dPw++; }
      // x86 cbt 位包 → JS coat 常量反映射（INV_B2/INV_W4/FB_B8/FB_W16 → 位0..3）
      const want = ((cbt[i] & 1) ? TileStore.COAT_INVISIBLE_BLOCK : 0)
        | ((cbt[i] >> 1 & 1) ? TileStore.COAT_INVISIBLE_WALL : 0)
        | ((cbt[i] >> 2 & 1) ? TileStore.COAT_FULLBRIGHT_BLOCK : 0)
        | ((cbt[i] >> 3 & 1) ? TileStore.COAT_FULLBRIGHT_WALL : 0);
      if (st.coat[i] !== want) { dCb++; if (!firstCb) firstCb = `(${i % W},${(i / W) | 0}) v${cbt[i]} j${st.coat[i]}`; }
    }
    const ok = dP === 0 && dPw === 0 && dCb === 0;
    if (!ok) allOk = false;
    console.log(`${ok ? '✓' : '✗'} ${c.chain}: dP=${dP} dPw=${dPw} dCb=${dCb}${firstP ? ' firstP ' + firstP : ''}${firstCb ? ' firstCb ' + firstCb : ''}`);
  }
  if (!allOk) throw new Error('IIIII106 paint-plane certification FAILED');
}, 900_000);
