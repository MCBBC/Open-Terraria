// PPPPPPP 一次性诊断：micro pass 掷流录制（对拍 x86 SW_ROLLWIN="97-97"）
// 用法：cd game && SW_PPP=1 SW_MB_1457=1 npx vitest run tools/_ppp3.test.ts
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { UnifiedRandom } from '../src/core/rng';

const RUN = process.env.SW_PPP === '1';
const SEED = process.env.SW_PPP_SEED ?? '9293480';
const EVIL = Number(process.env.SW_PPP_EVIL ?? 0);
const OUT = process.env.SW_PPP_OUT ?? '/tmp/ppp-out/jsrolls97.txt';

(RUN ? it : it.skip)('ppp3 micro roll recorder', async () => {
  // UnifiedRandom.prototype.internalSample 录制（静态导入防双实例分叉）
  type Rec = { vals: number[]; marks: Array<{ n: string; idx: number }> };
  const rec: Rec = { vals: [], marks: [] } as Rec & { valsMarks: Array<{k:string;c:number;idx:number;coord?:string}> };
(rec as unknown as { valsMarks: Array<{k:string;c:number;idx:number;coord?:string}> }).valsMarks = [];
  let on = false;
  const proto = UnifiedRandom.prototype as unknown as Record<string, (...a: never[]) => number>;
  const key = Object.getOwnPropertyNames(proto).find((k) => /internalSample|sample/.test(k) && !/getSample|ForLarge/.test(k));
  if (!key) throw new Error('no sample method found: ' + Object.keys(proto).join(','));
  const orig = proto[key]!;
  proto[key] = function (this: unknown) {
    const v = orig.call(this);
    if (on) rec.vals.push(v);
    return v;
  };
  (globalThis as { __swSeg?: (n: string, d?: unknown) => void }).__swSeg = (n: string, d?: unknown) => {
    if (n === 'passStart') { on = true; rec.marks.push({ n: 'micro-start', idx: 0 }); return; }
    if (!on) return;
    if (/Count|Attempts|deadCands|deadCount$/.test(n)) rec.marks.push({ n, idx: rec.vals.length });
    else if (n === 'campTry') rec.marks.push({ n: `campTry ${d?.[0]},${d?.[1]}`, idx: rec.vals.length });
    else if ((/^camp|^mx/.test(n)) && n !== 'campCell' && n !== 'campSF' && n !== 'campPW') rec.marks.push({ n: `${n} ${Array.isArray(d) ? d.join(',') : ''}`, idx: rec.vals.length });
    else if (n === 'campSF' || n === 'campPW') rec.valsMarks.push({ k: n, c: d?.[0] as number, idx: rec.vals.length, coord: `${d?.[1]},${d?.[2]}` });
  };

  await generateWorld({ width: 4200, height: 1200, seedText: SEED, evil: EVIL as -1 | 0 | 1 });
  const lines = rec.marks.map((m) => `# ${m.n} @${m.idx}`);
  for (const vm of (rec as unknown as { valsMarks: Array<{k:string;c:number;idx:number;coord?:string}> }).valsMarks) lines.splice(1 + vm.idx, 0, `#E ${vm.k} ${vm.c} @${vm.idx}`);
  // splice 会位移——改为追加段
  lines.length = rec.marks.length;
  for (const vm of (rec as unknown as { valsMarks: Array<{k:string;c:number;idx:number;coord?:string}> }).valsMarks) lines.push(`#E ${vm.k} ${vm.c}@${vm.coord ?? ''} @${vm.idx}`);
  for (const v of rec.vals) lines.push(String(v));
  writeFileSync(OUT, lines.join('\n') + '\n');
  console.log(`rolls=${rec.vals.length} marks=${rec.marks.length} -> ${OUT}`);
}, 600_000);
