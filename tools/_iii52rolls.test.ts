// IIII50 一次性仪 v2：FTW 链掷流捕获——按 RNG 实例分流落盘。
// __swOnRoll(v, inst) 每 UnifiedRandom.InternalSample 触发；inst→token(az,bz,…)，
// 每实例独立文件 /tmp/iii52-out/inst-<t>.txt（一行一个 raw internalSample）；
// 标记行 `---MARK reseed <seed>` / `---MARK label <label>` / `---MARK slot <i> <nm>`
// 记入时间线 js-ftw-rolls.txt（标记同时刷新各实例缓冲，保证文件内顺序一致）。
// 主世界生成流 = 样本量最大的实例。用法：cd game && SW_I52R=1 npx vitest run tools/_iii52rolls.test.ts
import { it } from 'vitest';
import { createWriteStream, readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_I52R === '1';

const srcCache = new Map<string, string[]>();
function labelOf(file: string, line: number): string {
  let src = srcCache.get(file);
  if (!src) {
    try { src = readFileSync(file, 'utf8').split('\n'); } catch { src = []; }
    srcCache.set(file, src);
  }
  for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
    const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
    if (m) return m[1].trim();
  }
  return `${file.split('/').pop()}:${line}`;
}

(RUN ? it : it.skip)('JS per-instance roll capture (ftw)', async () => {
  const timeline = '/tmp/iii52-out/js-ftw-rolls.txt';
  const ws = createWriteStream(timeline);
  let marked = new Set<string>();
  let pendingCount = 0;

  const instTok = new Map<object, string>();
  const instWs = new Map<string, ReturnType<typeof createWriteStream>>();
  const instBuf = new Map<string, string[]>();
  const instCnt = new Map<string, number>();
  const mws = createWriteStream('/tmp/iii52-out/merged-rolls.txt');
  let mbuf: string[] = [];
  const tokOf = (inst: object): string => {
    let t = instTok.get(inst);
    if (!t) {
      t = String.fromCharCode(97 + instTok.size) + 'z';
      instTok.set(inst, t);
      instWs.set(t, createWriteStream(`/tmp/iii52-out/inst-${t}.txt`));
      instBuf.set(t, []);
      instCnt.set(t, 0);
    }
    return t;
  };
  const g = globalThis as unknown as { __swOnRoll?: (v: number, inst: object) => void };
  g.__swOnRoll = (v: number, inst: object) => {
    const t = tokOf(inst);
    instCnt.set(t, (instCnt.get(t) ?? 0) + 1);
    const b = instBuf.get(t)!;
    b.push(String(v));
    pendingCount++;
    mbuf.push(t + '|' + String(v));
    if (mbuf.length >= 32768) { mws.write(mbuf.join('\n') + '\n'); mbuf.length = 0; }
    if (b.length >= 16384) { instWs.get(t)!.write(b.join('\n') + '\n'); b.length = 0; }
  };
  function mark(s: string): void {
    if (marked.has(s)) return;
    marked.add(s);
    for (const [t, b] of instBuf) {
      if (b.length > 0) { instWs.get(t)!.write(b.join('\n') + '\n'); b.length = 0; }
    }
    if (mbuf.length > 0) { mws.write('MARK|' + s + '\n' + mbuf.join('\n') + '\n'); mbuf.length = 0; }
    ws.write(`---MARK ${s}\n`);
  }
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    mark(`reseed ${s}`);
    const stack = new Error().stack ?? '';
    for (const line of stack.split('\n')) {
      const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii52rolls')) {
        mark(`label ${labelOf(m[1], Number(m[2]))}`);
        break;
      }
    }
    return oReseed.call(this, s);
  };
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: '1671560105',
      seedFlags: { getGoodWorld: true },
      onWorldPartial: (_w, i, pn) => { mark(`slot ${i} ${pn}`); },
    });
  } finally {
    RNGp.reseed = oReseed;
    delete g.__swOnRoll;
    for (const [t, b] of instBuf) {
      if (b.length > 0) instWs.get(t)!.write(b.join('\n') + '\n');
      instWs.get(t)!.end();
    }
    if (mbuf.length > 0) { mws.write(mbuf.join('\n') + '\n'); mbuf.length = 0; }
    mws.end();
  }
  await new Promise<void>((res) => ws.end(res));
  console.log(`instances=${instTok.size} samples=${pendingCount}`);
}, 900_000);
