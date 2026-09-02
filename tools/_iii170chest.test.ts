// IIII170 批一次性取证（内容级先行——欠约束值拟合会造假象，本批纪律）：REMIX #60
// Surface_Chests 4 箱错位——x86 真值 w.wld 直读箱清单 vs JS 全链生成箱清单，逐箱对表。
//   x86 真值 = /tmp/iii160-out/x86/w.wld（IIII160 rig 复跑，IIIII166 批已认证 dump 对
//   golden-remix md5 全等；本批再用 dumps 抽样 md5 复核一次防串档）。
//   JS 侧   = generateWorld remix seed=1138154190（evil=-1 与 mile8 缺省同口径）。
// 对拍带：remix 地表箱 Y 域 [h-400, h-150) = [800,1050)，外扩 ±6；输出：带内 x86-only /
// JS-only / 双侧同位（附 loot 恒等性）三组 + 全带箱数。
// 用法：cd game && SW_I170=1 npx vitest run tools/_iii170chest.test.ts
import { it } from 'vitest';
import { readFileSync, createHash } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';

const RUN = process.env.SW_I170 === '1';
const X86WLD = process.env.SW_I170_WLD ?? '/tmp/iii160-out/x86/w.wld';
const X86DUMPS = process.env.SW_I170_DUMPS ?? '/tmp/iii160-out/x86/dumps';
const GOLDEN = process.env.SW_I170_GOLDEN ?? `${process.env.HOME}/GoldenChains/golden-remix/dumps`;
const SEED = process.env.SW_I170_SEED ?? '1138154190';
const YLO = Number(process.env.SW_I170_YLO ?? 794);
const YHI = Number(process.env.SW_I170_YHI ?? 1056);

type C = { x: number; y: number; items: Array<{ id: number; stack: number } | null>; name?: string };
const lootOf = (c: C): string => JSON.stringify(c.items.filter(Boolean).map((i) => `${i!.id}x${i!.stack}`));

(RUN ? it : it.skip)('iii170 remix surface-band chest forensics', { timeout: 900_000 }, async () => {
  // ---- 0) rig 复跑保真复核（dumps 抽样 md5 vs golden-remix）----
  const md5 = (p: string): string => createHash('md5').update(readFileSync(p)).digest('hex');
  let fidelity = '';
  try {
    const sample = ['059_Buried_Chests', '060_Surface_Chests', '061_Jungle_Chests_Placement'];
    let eq = 0;
    for (const nm of sample) {
      for (const ext of ['typ', 'act', 'wal']) {
        if (md5(`${X86DUMPS}/${nm}.${ext}`) === md5(`${GOLDEN}/${nm}.${ext}`)) eq++;
      }
    }
    fidelity = `${eq}/9 全等`;
  } catch (e) {
    fidelity = `skip(${(e as Error).message.slice(0, 40)})`;
  }
  console.log(`I170 fidelity(x86 rerun vs golden): ${fidelity}`);

  // ---- 1) x86 真值箱清单 ----
  const xw = parseWld(Uint8Array.from(readFileSync(X86WLD)));
  console.log(`I170 x86 wld chests total=${xw.chests.length}`);
  const band = (c: C): boolean => c.y >= YLO && c.y <= YHI;
  const x86 = xw.chests.filter(band).sort((a, b) => a.x - b.x || a.y - b.y);

  // ---- 2) JS 侧全链生成 ----
  const { generateWorld } = await import('../src/world/gen/WorldGen');
  const w = await generateWorld({
    width: 4200, height: 1200, seedText: SEED, evil: -1 as -1 | 0 | 1,
    seedFlags: { remix: true },
  });
  const js = (w as unknown as { chests: C[] }).chests.filter(band).sort((a, b) => a.x - b.x || a.y - b.y);
  console.log(`I170 band [${YLO},${YHI}] x86=${x86.length} js=${js.length}`);

  const xk = new Map<string, C>(x86.map((c) => [`${c.x},${c.y}`, c]));
  const jk = new Map<string, C>(js.map((c) => [`${c.x},${c.y}`, c]));
  const onlyX = x86.filter((c) => !jk.has(`${c.x},${c.y}`));
  const onlyJ = js.filter((c) => !xk.has(`${c.x},${c.y}`));
  const both = x86.filter((c) => jk.has(`${c.x},${c.y}`));
  const lootMismatch = both.filter((c) => lootOf(c) !== lootOf(jk.get(`${c.x},${c.y}`)!));
  console.log(`I170 both=${both.length} lootMismatch=${lootMismatch.length} onlyX86=${onlyX.length} onlyJS=${onlyJ.length}`);
  console.log('--- I170 onlyX86 ---');
  for (const c of onlyX) console.log(`I170 X @(${c.x},${c.y}) loot=${lootOf(c)}`);
  console.log('--- I170 onlyJS ---');
  for (const c of onlyJ) console.log(`I170 J @(${c.x},${c.y}) loot=${lootOf(c)}`);
  if (lootMismatch.length) {
    console.log('--- I170 lootMismatch (same pos) ---');
    for (const c of lootMismatch) console.log(`I170 M @(${c.x},${c.y}) x86=${lootOf(c)} js=${lootOf(jk.get(`${c.x},${c.y}`)!)}`);
  }
  console.log('--- I170 all band x86 ---');
  for (const c of x86) console.log(`I170 XA @(${c.x},${c.y}) loot=${lootOf(c)}`);
  console.log('--- I170 all band js ---');
  for (const c of js) console.log(`I170 JA @(${c.x},${c.y}) loot=${lootOf(c)}`);
});
