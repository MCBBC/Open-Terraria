// DDDDDD 批·②：9293480 #89 藤蔓 pass 的 444 误杀解剖——全管线跑，Vines pass
// 前后快照 hive 群，对每个被杀 444 群打印 CheckSuper 门值（完整性/顶锚/液体）
// 与 vanilla dump089 对照。
// SW_D2=1 npx vitest run tools/_dddd2.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_D2 === '1';
const W = 4200, H = 1200, N = W * H;
const G2 = '/tmp/sw-slp/g';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }

(RUN ? it : it.skip)('dddd2 vines-pass 444 kill anatomy', async () => {
  // 藤蔓槽（#42）末快照 + 蜂巢幼虫槽（#48）末快照
  const snaps: Record<string, { typ: Uint16Array; act: Uint8Array; fx: Uint16Array; fy: Uint16Array; lq: Uint8Array; lty: Uint8Array; hf: Uint8Array; sl: Uint8Array }> = {};
  await generateWorld({
    width: W, height: H, seedText: '9293480', evil: 0,
    onWorldPartial: (w, i, name) => {
      if (name !== '藤蔓' && name !== '蜂巢幼虫' && name !== '地表花' && name !== '蛛网蜂巢' && name !== '地表植物' && name !== '丛林植物P2') return;
      const st = w.store;
      snaps[String(i) + name] = {
        typ: st.type.slice(), act: st.flags.slice(), fx: st.frameX.slice(), fy: st.frameY.slice(),
        lq: st.liquid.slice(), lty: st.liquidType.slice(), hf: st.half.slice(), sl: st.slope.slice(),
      };
    },
  });
  const rd = (e: string) => new Uint8Array(readFileSync(`${G2}/089_Vines.${e}`).buffer.slice(0));
  const rd16 = (e: string) => new Uint16Array(readFileSync(`${G2}/089_Vines.${e}`).buffer.slice(0));
  const v = { t: rd16('typ'), a: rd('act'), l: rd('liq'), lt: rd('lty') };
  const vine = Object.entries(snaps).find(([k]) => k.includes('藤蔓'))!;
  const larva = Object.entries(snaps).find(([k]) => k.includes('蜂巢幼虫'));
  console.log('snaps:', Object.keys(snaps).join(','));
  const s = vine[1];
  // 被杀群在 藤蔓前最近槽（丛林植物P2/蛛网蜂巢）末的帧态
  const preKey = Object.keys(snaps).find((k) => k.includes('丛林植物P2')) ?? Object.keys(snaps).find((k) => k.includes('蛛网蜂巢'))!;
  const pre = snaps[preKey];
  const preGroup = (x: number, y: number): string => {
    const parts: string[] = [];
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const i = (y + dy) * W + (x + dx);
      parts.push(`(${x + dx},${y + dy}) T${SHEET[pre.typ[i]!]} fx${pre.fx[i]} fy${pre.fy[i]} act${pre.act[i] & 1}`);
    }
    return parts.join(' | ');
  };
  // vanilla #89 的 444 群清单（2×2 探测）
  const isV444 = (x: number, y: number): boolean => {
    const i = y * W + x;
    return v.a[i] === 1 && v.t[i] === 444;
  };
  const isJ444 = (x: number, y: number): boolean => {
    const i = y * W + x;
    return (s.act[i] & 1) === 1 && SHEET[s.typ[i]!] === 444;
  };
  let groupsVan = 0, groupsJ = 0;
  const seen = new Set<number>();
  const killed: string[] = [];
  for (let y = 6; y < H - 6; y++) {
    for (let x = 6; x < W - 6; x++) {
      if (!isV444(x, y) || seen.has(y * W + x)) continue;
      // 群原点：frameX/18 与 frameY/18 反推（vanilla 帧）
      groupsVan++;
      let all = true;
      for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) { if (!isV444(x + dx, y + dy)) all = false; seen.add((y + dy) * W + x + dx); }
      if (!all) continue;
      const jAll = isJ444(x, y) && isJ444(x + 1, y) && isJ444(x, y + 1) && isJ444(x + 1, y + 1);
      if (jAll) { groupsJ++; continue; }
      // vanilla 有而 JS 无 → 被误杀群：打印门值
      const cells = [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]];
      const parts: string[] = [`group(${x},${y})`];
      for (const [cx, cy] of cells) {
        const i = cy * W + cx;
        parts.push(`(${cx},${cy}) vT444 jT${SHEET[s.typ[i]!]} jAct${s.act[i] & 1} jFx${s.fx[i]} jFy${s.fy[i]} jLq${s.lq[i]}/t${s.lty[i]} vLq${v.l[i]}`);
      }
      // 顶锚（vanilla 侧 y-1 行）
      for (let dx = 0; dx < 2; dx++) {
        const i = (y - 1) * W + x + dx;
        parts.push(`anchor(${x + dx},${y - 1}) vT${v.a[i] ? v.t[i] : 0} jT${(s.act[i] & 1) ? SHEET[s.typ[i]!] : 0} jSl${s.sl[i]} jHf${s.hf[i]}`);
      }
      killed.push(parts.join(' | ') + '\n   PRE: ' + preGroup(x, y));
    }
  }
  console.log(`vanilla 444 cells-groups=${groupsVan} JS-kept=${groupsJ} killed=${killed.length}`);
  console.log(killed.slice(0, 6).join('\n'));
}, 900_000);
