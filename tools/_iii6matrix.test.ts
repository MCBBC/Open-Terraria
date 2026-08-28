// ★IIIIIII6 一次性取证仪：JS celeb 世界 vs x86 g1458-celeb 槽链 105_Final_Cleanup
// 通道（typ/act/wal/half/slope=严格；liq=「有无」容差——沉降时序；lty/inact 登记
// 不比）在「起始镇民域」区域对拍。窗口 = 沙滩出生带 cols[230..360] × rows[180..300]
// （覆盖 spawn=285±、五锚 ±10 格）。编码约定承 tests/_dgidiff.test.ts：
// rig typ/wal=u16LE(vanilla id)、其余 u8；JS type 经 TILE_DEFS vid 映射。
// /tmp 缺链自动 skip（可再生：/tmp/nnn-build/run-chain.sh）。
import { it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const W = 4200, H = 1200;
const READY = existsSync('/tmp/sw-slp/g1458-celeb/105_Final_Cleanup.typ');
const DUMP = '/tmp/sw-slp/g1458-celeb/105_Final_Cleanup';
const STRICT = ['typ', 'wal', 'act', 'half', 'slope'];
const WIN = { x0: 230, x1: 360, y0: 180, y1: 300 };

(READY ? it : it.skip)('starter 域通道对拍 vs x86 g1458-celeb 终槽', { timeout: 240_000 }, async () => {
  const world = await generateWorld({ width: W, height: H, seedText: '1999040562', seedFlags: { tenthAnniversary: true }, evil: 0 });
  const st = world.store;
  const vid = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') vid[i] = s;
  }
  const js: Record<string, Uint16Array> = {
    typ: new Uint16Array(W * H), wal: new Uint16Array(W * H),
    act: new Uint16Array(W * H), half: new Uint16Array(W * H),
    slope: new Uint16Array(W * H), liq: new Uint16Array(W * H),
  };
  for (let i = 0; i < W * H; i++) {
    js.typ[i] = st.flags[i] ? (vid[st.type[i]] ?? 0xffff) : 0;
    js.wal[i] = st.wall[i];
    js.act[i] = st.flags[i] ? 1 : 0;
    js.half[i] = st.half[i];
    js.slope[i] = st.slope[i];
    js.liq[i] = st.liquid[i];
  }
  const report: Record<string, unknown> = {};
  let green = true;
  const rigAct = readFileSync(`${DUMP}.act`);
  const jsAct = js.act;
  for (const ch of [...STRICT, 'liq']) {
    const buf = readFileSync(`${DUMP}.${ch}`);
    const isU16 = ch === 'typ' || ch === 'wal';
    let winDiff = 0, winTotal = 0, worldDiff = 0;
    const samples: string[] = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const xv = isU16 ? buf.readUInt16LE(i * 2) : buf[i];
        const jv = js[ch][i];
        // 口径承 tests/_dgidiff.test.ts：
        //   typ 只在【两侧同活性】下比活性面差（非活性格 rig 保留残值——幽灵域单独观察）；
        //   act 直接比；wal/half/slope/liq 全格比（wal 独立于活性；liq 比"有无"容沉降时序）
        let eq: boolean;
        if (ch === 'typ') {
          const ra = rigAct[i] !== 0, ja = jsAct[i] !== 0;
          eq = ra === ja ? (!ra || xv === jv) : false;
        } else if (ch === 'act') {
          eq = xv === jv;
        } else if (ch === 'liq') {
          eq = (xv > 0) === (jv > 0);
        } else {
          eq = xv === jv;
        }
        if (!eq) {
          worldDiff++;
          if (x >= WIN.x0 && x <= WIN.x1 && y >= WIN.y0 && y <= WIN.y1) {
            winDiff++;
            if (samples.length < 6) samples.push(`(${x},${y}) rig=${xv} js=${jv}`);
          }
        }
        if (x >= WIN.x0 && x <= WIN.x1 && y >= WIN.y0 && y <= WIN.y1) winTotal++;
      }
    }
    report[ch] = { worldDiff, winDiff, winTotal, samples };
    console.log(`[${ch}] winDiff=${winDiff}/${winTotal} worldDiff=${worldDiff} ${samples.slice(0, 3).join('; ')}`);
    // 容差线：strict 通道=窗面积(171×121≈20k 格)的 0.2%；liq 放宽到 2%（沉降时序已定域备案）
    if (winTotal > 0 && winDiff / winTotal > (ch === 'liq' ? 0.02 : 0.002)) green = false;
  }
  writeFileSync('/tmp/iii6-out/matrix-evidence.json', JSON.stringify(report, null, 1));
  console.log(green ? 'STARTER-WINDOW-GREEN' : 'STARTER-WINDOW-DIFF');
});
