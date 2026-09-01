// IIII104b（2026-09-01）真值侧 .wir 复原的 w.wld 末态交叉验证：
//   parseWld(golden-ftw/w.wld) → 八通道 FNV 对拍 slot-#105 dump + wire 平面 ↔ regen .wir。
// 判据（任务①「三方裁定」第二腿）：若 wld 末态八通道 ≡ #105 dump ⇒ 解码器语义正确，
//   则其 wire 平面 = 独立于 regen 的第二条真值路径；两条 .wire 应逐位相等。
import { readFileSync } from 'node:fs';
import { it } from 'vitest';
import { TILE_DEFS } from '../src/data/tiles';
import { parseWld } from '../src/wld/WldParser';

const G2 = process.env.SW_I135_G2 ?? `${process.env.HOME}/GoldenChains/golden-ftw-wir`;
const W = Number(process.env.SW_I135_W ?? 4200), H = Number(process.env.SW_I135_H ?? 1200);
const N = W * H;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

it('wld final state cross-check', () => {
  const buf = readFileSync(`${G2}/w.wld`);
  const world = parseWld(new Uint8Array(buf));
  console.log(`wld version=${world.version} title=${world.title} size=${world.width}x${world.height}`);
  const t = new Uint16Array(N), a = new Uint8Array(N), w = new Uint16Array(N),
    lq = new Uint8Array(N), lt = new Uint8Array(N), hf = new Uint8Array(N),
    sl = new Uint8Array(N), ia = new Uint8Array(N), wr = new Uint8Array(N);
  const td = world.tiles!;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const j = y * W + x;
      const act = td.active[j] ? 1 : 0;
      const sheet = td.type[j];
      // 内部 id 反查：dump 记录 vanilla sheet——须把 sheet→内部 id 再读不回 sheet?
      // 直接用 sheet 本身对拍 dump typ 通道（JJHook 写的是 t.type=内部值?
      // 不——canon JJHook 写 Main.tile[x,y].type 即 **原版 id**，所以这里直接用 sheet 恰好同域）
      t[j] = act ? sheet : 0;
      a[j] = act;
      w[j] = td.wall[j];
      lq[j] = td.liquid[j];
      lt[j] = td.liquidType[j];
      hf[j] = td.half[j] ? 1 : 0;
      sl[j] = td.slope[j];
      ia[j] = 0;                      // 保存格式无独立 inActive 位? inActive=slope==0..? 实测见 diff
      wr[j] = td.wire[j];
    }
  }
  const rd16 = (p: string) => new Uint16Array(readFileSync(p).buffer, 0, N * (p.endsWith('.typ') || p.endsWith('.wal') ? 1 : 0.5)) as unknown as Uint16Array;
  void rd16;
  const name105 = `${G2}/105_Final_Cleanup`;
  const gt = new Uint16Array(readFileSync(`${name105}.typ`).buffer, 0, N);
  const ga = readFileSync(`${name105}.act`), gw = new Uint16Array(readFileSync(`${name105}.wal`).buffer, 0, N),
    gl = readFileSync(`${name105}.liq`), glt = readFileSync(`${name105}.lty`),
    ghf = readFileSync(`${name105}.half`), gsl = readFileSync(`${name105}.slope`),
    gia = readFileSync(`${name105}.inact`), gwr = readFileSync(`${name105}.wir`);
  let dT = 0, dA = 0, dW = 0, dL = 0, dLt = 0, dHf = 0, dSl = 0, dWir = 0, firstWir = -1, firstT = -1;
  for (let i = 0; i < N; i++) {
    if (t[i] !== gt[i]) { dT++; if (firstT < 0) firstT = i; }
    if (a[i] !== ga[i]) dA++;
    if (w[i] !== gw[i]) dW++;
    if (lq[i] !== gl[i]) dL++;
    if (lt[i] !== glt[i]) dLt++;
    if (hf[i] !== ghf[i]) dHf++;
    if (sl[i] !== gsl[i]) dSl++;
    if ((wr[i] & 63) !== gwr[i]) { dWir++; if (firstWir < 0) firstWir = i; }
  }
  console.log(`vs #105_Final_Cleanup: dTyp=${dT}(first=${firstT}) dAct=${dA} dWal=${dW} dLiq=${dL} dLty=${dLt} dHalf=${dHf} dSlope=${dSl}`);
  console.log(`wire plane: dWir=${dWir} first=${firstWir >= 0 ? `(${firstWir % W},${Math.floor(firstWir / W)})` : 'identical'}`);
}, 900_000);
