// NNN 批照妖镜②：用录得的 InternalSample 原始流独立直译 vanilla MarblePiles 段
// （cs:16358-16388 + 10433-10573），对拍 vanilla 实际写入；y0=floor(ws/2) 暴力扫描。
// 用法：SW_NNNSIM=1 npx vitest run tools/_nnn2.test.ts
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

const RUN = process.env.SW_NNNSIM === '1';
const W = 4200, H = 1200, N = W * H;
const SCALE = 4.656612875245797e-10;

(RUN ? it : it.skip)('replay vanilla MarblePiles on jspre with recorded samples', async () => {
  const le16 = (p: string): Uint16Array => {
    const b = readFileSync(p);
    return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
  };
  const u8 = (p: string): Uint8Array => new Uint8Array(readFileSync(p));
  const pre = '/tmp/nnn-out/jspre';
  const typ = le16(`${pre}.typ`), act = u8(`${pre}.act`), wal = le16(`${pre}.wal`);
  const half = u8(`${pre}.half`), slope = u8(`${pre}.slope`), iav = u8(`${pre}.inact`);
  const { TILE_DEFS } = await import('../src/data/tiles');
  const { STATUE_LIST } = await import('../src/world/gen/vanilla/StatuesPass');
  const SOLID = new Uint8Array(TILE_DEFS.length), SOLIDTOP = new Uint8Array(TILE_DEFS.length);
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const d2 = TILE_DEFS[i]!;
    if (d2.solid) SOLID[i] = 1;
    const s = d2.vanilla?.sheet;
    if (typeof s === 'number') { SHEET[i] = s; if (s === 19 || s === 427 || (s >= 435 && s <= 439) || s === 239 || s === 380) SOLIDTOP[i] = 1; }
  }
  let MARBLE = -1, LWOOD = -1;
  const REV = new Int32Array(20000).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    if (SHEET[i] === 367) MARBLE = i;
    if (SHEET[i] === 191) LWOOD = i;
    const s = SHEET[i];
    if (s >= 0 && REV[s] < 0) REV[s] = i;   // dump typ(sheet) → 内部 id
  }
  const tid = (i: number): number => REV[typ[i]] ?? -1;
  const idx = (x: number, y: number): number => y * W + x;
  const inW = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < W && y < H;
  // 大理石写覆盖层（后续尝试的扫描须看到先前堆的写入）
  const ov = new Uint8Array(N);
  const ovStatue = new Uint8Array(N);
  let OV_ON = false;
  const { genSolidType } = await import('../src/world/gen/vanilla/GenSolid');
  const solidTileFull = (x: number, y: number): boolean => {
    if (!inW(x, y)) return false;
    const i = idx(x, y);
    if (OV_ON && ov[i]) return true;
    if (act[i] !== 1 || (iav[i] === 1)) return false;
    const t = tid(i);
    if (t < 0) return false;
    const d2 = TILE_DEFS[t]!;
    return !!d2 && genSolidType(t) && !d2.platform && !half[i] && slope[i] === 0;
  };
  const solidTile2x = (x: number, y: number): boolean => {
    if (!inW(x, y)) return false;
    const i = idx(x, y);
    if (act[i] !== 1 || (iav[i] === 1)) return false;
    const t = tid(i);
    return t >= 0 && genSolidType(t) === true && slope[i] === 0 && half[i] === 0;
  };
  const activeAt = (x: number, y: number): boolean => {
    if (!inW(x, y)) return false;
    const i = idx(x, y);
    return act[i] === 1 || ov[i] === 1 || ovStatue[i] === 1;
  };
  const sheetAt = (x: number, y: number): number => {
    if (!inW(x, y)) return -1;
    const i = idx(x, y);
    if (ovStatue[i]) return 105;
    if (ov[i]) return 367;
    const t = tid(i);
    return t >= 0 ? SHEET[t]! : -1;
  };
  const wallAt = (x: number, y: number): number => (inW(x, y) ? wal[idx(x, y)]! : 0);

  const lines = readFileSync('/tmp/nnn-out/jsrolls.txt', 'utf8').split('\n').filter(Boolean).map(Number);
  let rp = 0;
  let y0dbg = false;
  const smp = (): number => {
    if (rp >= lines.length) throw new Error(`samples exhausted @${rp}`);
    return lines[rp++]!;
  };
  const nextDouble = (): number => smp() * SCALE;
  const nextInt = (max: number): number => Math.trunc(smp() * SCALE * max);
  const nextRange = (min: number, max: number): number => (Math.trunc(smp() * SCALE * (max - min)) + min) | 0;

  const out = new Uint8Array(N);
  const STATUE_LEN = STATUE_LIST.length;
  function marblePile(X: number, Y: number, ws: number): boolean {
    let num = Y;
    while (!solidTileFull(X, num)) {
      num++;
      if (num > ws) return false;
    }
    const t0 = sheetAt(X, num);
    if (process.env.SIM_Y0 && X === Number(process.env.SIM_X ?? -1)) console.log(`[sim] X=${X} firstSolid=${num} sheet=${t0} wall=${wallAt(X, num)}`);
    if (t0 !== 0 && t0 !== 2) return false;
    if (wallAt(X, num) > 0) return false;
    const cl = (v: number, lo: number, hi: number): number => v < lo ? lo : v > hi ? hi : v;
    if (process.env.SIM_NOWIN !== '1') {
      const wxr = Number(process.env.SIM_WX ?? '130'), wyr = Number(process.env.SIM_WY ?? '60');
      for (let i = cl(X - wxr, 30, W - 30); i <= cl(X + wxr, 30, W - 30); i++) {
        for (let j = cl(num - wyr, 30, H - 30); j <= cl(num + wyr, 30, H - 30); j++) {
          if (activeAt(i, j)) {
            const sh = sheetAt(i, j);
            if (sh === 367 || sh === 191) return false;
          }
        }
      }
    }
    num--;
    let vx = X, vy = num;
    let dvx = nextDouble() * 0.6 - 0.3;
    let dvy = nextDouble() * 0.5 + 0.5;
    const num8 = nextRange(2, 4) + ((process.env.SIM_R4 === '1' ? true : false) || nextInt(10) === 0 ? 1 : 0);
    let num9 = nextRange(3, 6);
    while (num9 > 0) {
      num9--;
      for (let k = X - num8 * 5; k <= X + num8 * 5; k++) {
        let num10 = num + num8 * 3;
        while (num10 > num - num8 * 3) {
          const jit = nextRange(70, 91);
        const mult = Number(process.env.SIM_MULT ?? '0.01');
        const f120 = Number(process.env.SIM_F ?? '1.2');
        const num11 = process.env.SIM_DIV === '1'
          ? num8 * (jit / 90) * f120
          : num8 * jit * mult * f120;
          const ex = vx - k, ey = vy - num10;
          if (Math.sqrt(ex * ex + ey * ey) > 30) {
            vx = X; vy = num;
            dvx = nextDouble() * 0.6 - 0.3;
            dvy = nextDouble() * 0.5 + 0.5;
          } else {
            const sxsc = Number(process.env.SIM_SX ?? '0.25');
            const sysc = Number(process.env.SIM_SY ?? '0.8');
            const fx = ex * sxsc, fy = ey * sysc;
            if (inW(k, num10)) {
              const ii = idx(k, num10);
              if (Math.sqrt(fx * fx + fy * fy) < num11 && activeAt(k, num10)) { out[ii] = 1; ov[ii] = 1; }
            }
          }
          num10--;
        }
      }
      vx += dvx;
      dvx += nextDouble() * 0.2 - 0.1;
      dvy += (0.1 + nextDouble() * 0.1) * 0.8;
      if (process.env.SIM_CLAMP === '1') dvx = Math.min(0.3, Math.max(-0.3, dvx));
      if (process.env.SIM_CLAMP === '1') dvy = Math.min(1, Math.max(0.5, dvy));
    }
    let num12 = 0;
    const statSmp = rp;
    let statCalls = 0;
    for (let l = X - num8 * 5; l <= X + num8 * 5; l++) {
      if (num12 >= 3) break;
      if (l % 2 !== 1 && (num12 <= 0 || nextInt(5) === 0)) {
        // 先扫面（vanilla：tile.type==367 且上格空才调 Statue→掷 Next(2,len)）
        let sy = Math.trunc(vy) - 20;
        while (sy < H && !activeAt(l, sy)) sy++;
        let ok = false;
        if (sy > 0 && sy < H && sheetAt(l, sy) === 367 && !activeAt(l, sy - 1)) {
          const si = nextRange(2, STATUE_LEN);   // Statue 头 Next(2,len)
          statCalls++;
          // PlaceTile(forced)：2×3 占用格（y-2..y）须非 active + 双列底座 SolidTile2
          ok = true;
          for (let dx2 = 0; dx2 < 2 && ok; dx2++) {
            for (let dy2 = -2; dy2 <= 0 && ok; dy2++) {
              if (activeAt(l + dx2, sy - 1 + dy2)) ok = false;
            }
            if (ok && !solidTile2x(l + dx2, sy)) ok = false;
          }
          if (ok && process.env.SIM_NOPLACE !== '1') {
            for (let dx2 = 0; dx2 < 2; dx2++) for (let dy2 = -2; dy2 <= 0; dy2++) ovStatue[idx(l + dx2, sy - 1 + dy2)] = 1;
          }
        }
        if (ok) num12++;
      }
    }
    if (process.env.SIM_Y0 && y0dbg) console.log(`[sim] pile X=${X} num=${num} r=${num8} statues=${num12} statSmp=${statSmp} statEnd=${rp} calls=${statCalls}`);
    return true;
  }

  const names: Record<number, string> = {};
  for (const f of readdirSync('/tmp/jjj-out/g1457-const')) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m) names[Number(m[1])] = m[2];
  }
  const vaTyp = le16(`/tmp/jjj-out/g1457-const/051_${names[51]}.typ`);
  const vbTyp = le16(`/tmp/jjj-out/g1457-const/052_${names[52]}.typ`);
  const vaAct = u8(`/tmp/jjj-out/g1457-const/051_${names[51]}.act`);
  const vbAct = u8(`/tmp/jjj-out/g1457-const/052_${names[52]}.act`);
  const vanNew = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (vbAct[i] === 1 && vbTyp[i] === 367 && !(vaAct[i] === 1 && vaTyp[i] === 367)) vanNew[i] = 1;
  }
  const target = Math.trunc(5.0 * (W / 4200));
  const mid = Math.trunc(W / 2);
  let best = { hit: -1, missV: 0, extra: 0, y0: -1, used: 0 };
  for (let y0 = 140; y0 <= 200; y0++) {
    rp = 0; out.fill(0); ov.fill(0); ovStatue.fill(0); OV_ON = true;
    if (y0 === Number(process.env.SIM_Y0 ?? -1)) {
      const di = idx(2587, 319);
      console.log(`[sim] probe 2587@319: act=${act[di]} iav=${iav[di]} tid=${tid(di)} genSolid=${genSolidType(tid(di))} half=${half[di]} slope=${slope[di]} solidFull=${solidTileFull(2587, 319)}`);
    }
    let placed = 0;
    const xs: number[] = [];
    try {
      for (let i = 0; i < 80; i++) {
        let x = nextRange(100, W - 100);
        if (x >= mid - 100 && x <= mid + 100) {
          x = nextRange(100, W - 100);
          if (x >= mid - 100 && x <= mid + 100) continue;
        }
        y0dbg = y0 === Number(process.env.SIM_Y0);
        const ok = marblePile(x, y0, y0 * 2 + 1);
        xs.push(x);
        if (y0dbg) console.log(`[sim] try x=${x} ok=${ok} smp=${rp}`);
        if (ok) placed++;
        if (placed >= target) break;
      }
    } catch (e) {
      if (y0 === Number(process.env.SIM_Y0 ?? -1)) console.log(`y0=${y0} THROW: ${(e as Error).message} xs=${xs}`);
      continue;
    }
    let hit = 0, missV = 0, extra = 0;
    for (let i = 0; i < N; i++) {
      if (vanNew[i] && out[i]) hit++;
      else if (vanNew[i] && !out[i]) missV++;
      else if (!vanNew[i] && out[i]) extra++;
    }
    // 与 JS 实测序列对分（NNN 调试）：JS try 序列 ok 集={2587,478,2336,3055,1803}
    if (process.env.SIM_SEQCHECK === '1') {
      const jsOk = new Set([2587, 478, 2336, 3055, 1803]);
      const xsSet = new Set(xs);
      let agree = 0;
      for (const v of jsOk) if (xsSet.has(v)) agree++;
      console.log(`[seqcheck] y0=${y0} agree=${agree}/5 xs=${xs.join(',')}`);
    }
    if (hit > best.hit) best = { hit, missV, extra, y0, used: rp };
    if (missV === 0 && extra === 0) { console.log(`EXACT y0=${y0} used=${rp} samples xs=${xs}`); break; }
    if (y0 === Number(process.env.SIM_Y0 ?? -1)) console.log(`y0=${y0} xs=${xs} used=${rp}`);
  }
  console.log(`best: y0=${best.y0} hit=${best.hit} missV=${best.missV} extra=${best.extra} used=${best.used} (vanilla 新大理石=${vanNew.reduce((a, b) => a + b!, 0)})`);
}, 300_000);
