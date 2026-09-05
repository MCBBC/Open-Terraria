// ★IIIII210 一次性仪②：#105 Remove_Broken_Traps 断线陷阱清理取证（JS 侧,管线内）。
// mile8 修后新前沿：#105 (1588,404) T135>0×640（压力板,x86 存活 JS 整网拆除）——
// 8ch 不可见面=wire/致动器位：对拍 JS 清理头(≡#104 末)与槽末的 wire 通道
// vs x86 104/105 的 .wire dump（run210d.sh 产出,bit 包 [red,blue,green,yellow,
// actuator,inActive] 与 TileStore 同式）。
// 用法：cd game && SW_MB_1457=1 SW_I210TRAP=1 npx vitest run tools/_iii210trap.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I210TRAP === '1';
const OUT = process.env.SW_I210_OUT ?? '/tmp/iii210-out';
const G2 = process.env.SW_I210_G2 ?? '/tmp/iii210-out/x86-ddual2-wire';   // .wire dump 来源（run210d.sh）
const W = 4200, H = 1200, N = W * H;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = (TILE_DEFS[i] as { vanilla?: { sheet?: number } } | undefined)?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};

(RUN ? it : it.skip)('iii210 broken-trap cleanup forensics', async () => {
  const g = globalThis as Record<string, unknown>;
  const dumpWire = (st: TileStore, dir: string, tag: string) => {
    mkdirSync(dir, { recursive: true });
    const wire = Buffer.alloc(N), typ = Buffer.alloc(N * 2), act = Buffer.alloc(N);
    for (let q = 0; q < N; q++) {
      wire[q] = st.wire[q]!;
      typ[q * 2] = SHEET[st.type[q]]! & 0xff; typ[q * 2 + 1] = (SHEET[st.type[q]]! >> 8) & 0xff;
      act[q] = st.flags[q]! & 1;
    }
    writeFileSync(`${dir}/${tag}.wire`, wire);
    writeFileSync(`${dir}/${tag}.typ`, typ);
    writeFileSync(`${dir}/${tag}.act`, act);
  };
  let phase = 0; // 1=head captured
  g.__swI91Cap = (stRaw: unknown, _gs: unknown, _ch: unknown, name: string) => {
    if (name !== '断线陷阱清理') return;
    dumpWire(stRaw as TileStore, `${OUT}/snap105head`, 'head');
    phase = 1;
  };
  // ★逐槽 wire 位时间线（x86 .wire 全 dump 的 JS 镜像探针）：374 个缺失 wire 格
  //   在 JS 侧哪一槽失去/从未出现——槽名→4 探针格位图
  const PROBES: Array<[number, number]> = [[1589, 404], [1564, 407], [2586, 412], [2568, 415]];
  const timeline: string[] = [];
  const recordSlot = (st: TileStore, name: string): void => {
    const bits = PROBES.map(([px, py]) => {
      const wi = st.wire[st.idx(px, py)]!;
      return `${wi & 1}${(wi >> 4) & 1}`;
    }).join(',');
    timeline.push(`${name}\t${bits}`);
  };
  try {
    await generateWorld({
      width: W, height: H,
      seedText: '1.1.1.0.doubledaringdangers|20260831',
      evil: 0 as -1 | 0 | 1,
      onWorldPartial: (w, _i, name) => {
        recordSlot(w.store, name);
        if (name !== '断线陷阱清理') return;
        dumpWire(w.store, `${OUT}/slot105end`, 'end');
      },
    } as Parameters<typeof generateWorld>[0]);
  } finally {
    delete g.__swI91Cap;
  }
  writeFileSync(`${OUT}/j-wire-timeline.txt`, timeline.join('\n') + '\n');
  if (!phase) throw new Error('断线陷阱清理 slot head never hit');
  // 对拍：JS head wire vs x86 104_Stalac.wire（清理输入态）;JS end vs x86 105（清理输出）
  const xw104 = readFileSync(`${G2}/104_Stalac.wire`);
  const xw105 = readFileSync(`${G2}/105_Remove_Broken_Traps.wire`);
  const jHead = readFileSync(`${OUT}/snap105head/head.wire`);
  const jEnd = readFileSync(`${OUT}/slot105end/end.wire`);
  let dHead = 0, dEnd = 0;
  const headCells: number[] = [];
  for (let i = 0; i < N; i++) {
    if (xw104[i] !== jHead[i]) { dHead++; if (headCells.length < 40) headCells.push(i); }
    if (xw105[i] !== jEnd[i]) dEnd++;
  }
  console.log(`[wire head vs x86#104] diff cells=${dHead}  [wire end vs x86#105] diff cells=${dEnd}`);
  for (const i of headCells.slice(0, 24)) {
    const x = i % W, y = (i - x) / W;
    console.log(`  wire-diff (${x},${y}) x86=${xw104[i]} js=${jHead[i]} typ=${le16(`${G2}/104_Stalac.typ`)[i]}`);
  }
}, 600_000);
