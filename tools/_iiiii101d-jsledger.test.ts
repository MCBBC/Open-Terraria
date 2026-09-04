// IIII101d 批主仪：graveyard 链 JS 侧 TRKLOG 全 attempt 台账（与 x86 rig x86-trklog.txt 同格式对拍）。
//   ★血统纪律：仅探针，零代码改动；掷数账=UnifiedRandom.prototype.internalSample 计数
//   （RNG.reseed 每 pass 换 ur 实例，故必须挂 prototype 而非实例）。
//   行格式=rig IIIIdHook 同形：SEG <name> rc=<pos> / LTRK <x>,<y> rc=<place> ok=<b> ap=<pos> /
//   TPFS <x>,<y> rc= / TPFP OK|FAIL len= rc= dir= origin= / TH <i> <x> <y> <slope> <mode> /
//   P1|P2 <k> <x> <y> <ph> <cum> / MAHOG 同 LTRK 形。
// 用法：cd game && SW_I101D=1 npx vitest run tools/_iiiii101d-jsledger.test.ts
//   （SW_I101D_TH=1 抓 TH 全历史；产物 /tmp/iii129-out/js-trklog.txt）
process.env.SW_MB_1457 = '1';
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { __setTrackHistProbe, __setTrackColProbe, __setTrackDraws } from '../src/world/gen/vanilla/TrackPass';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_I101D === '1';
const OUT = '/tmp/iii129-out';
const TH_ON = process.env.SW_I101D_TH === '1';

(RUN ? it : it.skip)('IIIII101d JS graveyard ledger', async () => {
  mkdirSync(OUT, { recursive: true });
  // 掷数账：prototype 级 internalSample 包裹（reseed 换实例不失钩）
  let nDraws = 0;
  const URp = Object.getPrototypeOf(new RNG(1)['vanilla']) as unknown as { internalSample: () => number };
  const origSample = URp.internalSample;
  URp.internalSample = function (this: unknown) { nDraws++; return origSample.call(this); };

  const lines: string[] = [];
  const L = (s: string) => { lines.push(s); };
  (globalThis as unknown as { __swSeg?: (n: string, d?: unknown) => void }).__swSeg =
    (n: string, d?: unknown) => { L(`SEG ${n}${d !== undefined ? ' ' + JSON.stringify(d) : ''} rc=${nDraws}`); };
  (globalThis as unknown as { __swMbDraws?: () => number }).__swMbDraws = () => nDraws;

  __setTrackDraws(() => nDraws);
  __setTrackHistProbe((tag, hist, len, dir, ox, oy) => {
    if (tag === 'TPFS') { L(`TPFS ${ox},${oy} rc=${nDraws}`); return; }
    L(`${tag} len=${len} rc=${nDraws} dir=${dir} origin=${ox},${oy}`);
    if (TH_ON) {
      for (let i = 0; i < len; i++) {
        const h = hist[i]!;
        L(`TH ${i} ${h.x} ${h.y} ${h.slope} ${h.mode}`);
      }
    }
  });
  __setTrackColProbe((loop, k, x, y, ph, rc) => { L(`P${loop} ${k} ${x} ${y} ${ph} ${rc}`); });

  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: 'nightofthelivingdead|20260903', evil: 0,
      seedFlags: { graveyardBloodmoonStart: true },
    });
  } finally {
    __setTrackHistProbe(undefined);
    __setTrackColProbe(undefined);
    __setTrackDraws(undefined);
    (globalThis as unknown as { __swSeg?: unknown }).__swSeg = undefined;
    (globalThis as unknown as { __swMbDraws?: unknown }).__swMbDraws = undefined;
    URp.internalSample = origSample;
  }
  writeFileSync(`${OUT}/js-trklog.txt`, lines.join('\n') + '\n');
  const passStart = lines.find((l) => l.startsWith('SEG passStart')) ?? '';
  const mbTrack = lines.find((l) => l.startsWith('SEG mbTrack')) ?? '';
  const mbEnd = lines.find((l) => l.startsWith('SEG mbEnd')) ?? '';
  console.log(`JS ledger lines=${lines.length}`);
  console.log(`${passStart}\n${mbTrack}\n${mbEnd}`);
}, 900000);
