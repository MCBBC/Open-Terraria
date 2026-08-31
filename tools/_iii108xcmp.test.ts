import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
it('js s58 vs x86 anchors detail', () => {
  const G2 = `${process.env.HOME}/GoldenChains/golden-toadstool`;
  const JS = '/tmp/iii108-out/js3';
  const W = 4200, H = 1200, N = W * H;
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  const NAMEOF = new Map<number, string>();
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const d = TILE_DEFS[i] as { vanilla?: { sheet?: number }; name?: string };
    if (d?.vanilla?.sheet !== undefined) { SHEET[i] = d.vanilla.sheet; if (!NAMEOF.has(d.vanilla.sheet)) NAMEOF.set(d.vanilla.sheet, d.name ?? String(d.vanilla.sheet)); }
  }
  const nm = (s: number) => `${s}(${NAMEOF.get(s) ?? '?'})`;
  const le16 = (p: string) => { const b = readFileSync(p); return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1); };
  const u8 = (p: string) => new Uint8Array(readFileSync(p).buffer ?? readFileSync(p));
  const jT = le16(`${JS}/s58_type.bin`), jA = u8(`${JS}/s58_flags.bin`), jW = le16(`${JS}/s58_wall.bin`), jL = u8(`${JS}/s58_liquid.bin`);
  const loadX = (nmf: string) => ({ a: u8(`${G2}/${nmf}.act`), t: le16(`${G2}/${nmf}.typ`), w: le16(`${G2}/${nmf}.wal`), l: u8(`${G2}/${nmf}.liq`) });
  const X = loadX('-004_PostFinSeed');
  const pair = new Map<string, number>();
  const rows = new Map<number, number>();
  const csv: string[] = [];
  for (let i = 0; i < N; i++) {
    const xa = X.a[i] ? X.t[i] : 0;
    const ja = (jA[i] & 1) ? (SHEET[jT[i]] >= 0 ? SHEET[jT[i]] : 9999) : 0;
    const act = (X.a[i] ? 1 : 0) !== (jA[i] & 1);
    if (act || xa !== ja) {
      const k = act ? `A${X.a[i]}>${jA[i] & 1}` : `T${nm(xa)}>${nm(ja)}`;
      pair.set(k, (pair.get(k) ?? 0) + 1);
      rows.set(Math.floor(i / W), (rows.get(Math.floor(i / W)) ?? 0) + 1);
      if (csv.length < 400000) csv.push(`${i},${i % W},${Math.floor(i / W)},${k}`);
    } else if (X.w[i] !== jW[i]) {
      const k = `W${X.w[i]}>${jW[i]}`;
      pair.set(k, (pair.get(k) ?? 0) + 1);
      rows.set(Math.floor(i / W), (rows.get(Math.floor(i / W)) ?? 0) + 1);
      if (csv.length < 400000) csv.push(`${i},${i % W},${Math.floor(i / W)},${k}`);
    } else if (X.l[i] !== jL[i]) {
      if (csv.length < 400000) csv.push(`${i},${i % W},${Math.floor(i / W)},L${X.l[i]}>${jL[i]}`);
    }
  }
  console.log(`total=${csv.length}`);
  console.log([...pair.entries()].sort((a, b) => b[1]! - a[1]!).slice(0, 25).map(([k, n]) => `${k}×${n}`).join('\n'));
  console.log('rows:', [...rows.entries()].sort((a, b) => b[1]! - a[1]!).slice(0, 14).map(([y, n]) => `y${y}×${n}`).join(' '));
  writeFileSync('/tmp/iii108-out/fc-wrong-cells.csv', `idx,x,y,kind\n${csv.join('\n')}\n`);
}, 60_000);
