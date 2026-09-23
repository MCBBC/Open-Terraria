// ★BJ315（2026-09-23）：南瓜株成长链（GrowPumpkin WorldGen.cs:52950-53015 +
// UpdateWorld_OvergroundTile 派发 :72912-72917）回归钉——用户实报
// 「南瓜子种下去一段时间就不见了」定谳：
//   成长写面曾走 setTile（挂 onTileChanged）→ 首写半写态（左上格已 +36 余三格
//   未写）触发 DECOR 3×3 扫（Game.checkDecorSquareFrame :7058）→ 'pumpkin'
//   完整性裁决（Check2x2Style :52753 同判据）→ killDecorTile→breakPumpkin
//   整株清;stage 0→1 帧段（fx<72）零掉落 = 无声消失（fx=0 门 1/1 恒真 →
//   首次采样必死）。原版成长=裸 frameX 直写（:53006-53012,无 TileFrame 级联,
//   仅 netMode==2 SendTileSquare :53012-53014）→ 修复=setTileSilent 化 +
//   afterSilentTileWrite 渲染补标（陨石/花苞同款）。
// 判别面：
//   ① 存活+逐级推进（fx 0/18→36/54→…→144/162,stage≥4 停,cs:52541-52543）
//   ② 写面静默（TileStore 监听零触发=裸写契约;setTile 变异下 spy 必响=证红）
//   ③ 门阶 1/1·1/4·1/8·1/11（Next((fx+10)/10),cs:72914 逐档对拍）
//   ④ 完整性/支撑双门（混帧/失草族支撑拒长,cs:52545-52556）
//   ⑤ 变体带（frameY）跨级保持（GrowPumpkin 只动 frameX）
// 掷位：overgroundTile 对 !flooded 格先掷 plantDye 门（1/3000,cs:72795 语义）
//   再入 sheet 链 → 脚本一律 [0.9(plantDye 落空), 门掷];南瓜臂/成长体无第二掷。
import { describe, it, expect } from 'vitest';
import { WorldEvolution, type EvolutionHost } from '../src/world/evolution/WorldEvolution';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';

const SID = new Map<number, number>();
for (let id = 0; id < TILE_DEFS.length; id++) {
  const sh = TILE_DEFS[id]?.vanilla?.sheet;
  if (sh != null && !SID.has(sh)) SID.set(sh, id);
}
const S = (sheet: number): number => SID.get(sheet) ?? 0;

function makeEvo(st: TileStore, over: Partial<EvolutionHost> = {}): WorldEvolution {
  const host: EvolutionHost = {
    store: st,
    seed: 20260923,
    worldSurface: 50,
    rockLevel: 500,
    dungeonX: 600, difficulty: 0,
    flags: {},
    crimson: false, isDay: true, raining: false,
    maxRaining: 0, windSpeedCurrent: 0, playerTile: () => null,
    ...over,
  };
  return new WorldEvolution(host);
}

/** spreadRng.next 脚本化：逐掷返回 script 值,末尾兜底 0.9（门后无掷,兜底不触达写面） */
function scriptRng(evo: WorldEvolution, script: number[]): void {
  const rngAny = evo as unknown as { spreadRng: { next(): number } };
  let k = 0;
  rngAny.spreadRng.next = () => (k < script.length ? script[k++] : 0.9);
}

/** 种 2×2 南瓜株（stage 0..4,变体带 band=frameY 档）+ 草族支撑行。
 *  行 y/y+1 为株体,y+2 为草;株左上=(x,y)。 */
function plantPumpkin(st: TileStore, x: number, y: number, stage: number, band = 0): void {
  for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
    st.setTileSilent(x + dx, y + dy, S(254), dx * 18 + stage * 36, dy * 18 + band);
  }
  st.setTileSilent(x, y + 2, S(2));       // 草族支撑行（GrowPumpkin cs:52552-52556 判 {2,109,477,492}）
  st.setTileSilent(x + 1, y + 2, S(2));
}

type Priv = { overgroundTile(i: number, j: number, wallDist: number): void };
const priv = (evo: WorldEvolution): Priv => evo as unknown as Priv;

/** 帧态快照（行主序：左上/右上/左下/右下） */
function snap(st: TileStore, x: number, y: number): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    const i = st.idx(x + dx, y + dy);
    out.push([st.type[i], st.frameX[i], st.frameY[i]]);
  }
  return out;
}

const STAGE1 = (): Array<[number, number, number]> => [
  [S(254), 36, 0], [S(254), 54, 0],
  [S(254), 36, 18], [S(254), 54, 18],
];
const STAGE4 = (): Array<[number, number, number]> => [
  [S(254), 144, 0], [S(254), 162, 0],
  [S(254), 144, 18], [S(254), 162, 18],
];

describe('BJ315 南瓜株成长链（GrowPumpkin cs:52950 / 派发 cs:72912）', () => {
  it('stage0 采样 → 存活且整株 fx+=36（0/18→36/54）,写面零监听触发', () => {
    const st = new TileStore(80, 80);
    plantPumpkin(st, 40, 20, 0);
    const evo = makeEvo(st);
    const fires: Array<[number, number]> = [];
    st.onTileChanged((x, y) => fires.push([x, y]));   // 静默面：裸写契约
    scriptRng(evo, [0.9, 0.0]);                       // plantDye 落空;fx=0 → Next(1) 恒过
    priv(evo).overgroundTile(40, 20, 3);              // 采样左上格（fx=0）
    expect(fires).toEqual([]);                        // ★判别面:setTile 变异下必响（半写态→真机=DECOR 扫整株清）
    expect(snap(st, 40, 20)).toEqual(STAGE1());
    expect(st.type[st.idx(40, 22)]).toBe(S(2));       // 支撑行不动
  });

  it('渲染补标 afterSilentTileWrite = 2×2 外扩 1 格（SendTileSquare 单机等价）', () => {
    const st = new TileStore(80, 80);
    plantPumpkin(st, 40, 20, 0);
    const marks: Array<[number, number, number, number]> = [];
    const evo = makeEvo(st, {
      afterSilentTileWrite: (x0, y0, x1, y1) => marks.push([x0, y0, x1, y1]),
    });
    scriptRng(evo, [0.9, 0.0]);
    priv(evo).overgroundTile(40, 20, 3);
    expect(marks).toEqual([[39, 19, 41, 21]]);
  });

  it('门阶 1/4·1/8·1/11（Next((fx+10)/10) 逐档）+ stage≥4 停（cs:52541-52543）', () => {
    // stage1（fx=36 → Next(4)=1/4）:0.2 过 / 0.9 不过
    for (const [roll, grows] of [[0.2, true], [0.9, false]] as const) {
      const st = new TileStore(80, 80);
      plantPumpkin(st, 40, 20, 1);
      const evo = makeEvo(st);
      scriptRng(evo, [0.9, roll]);
      priv(evo).overgroundTile(40, 20, 3);
      expect(st.frameX[st.idx(40, 20)]).toBe(grows ? 72 : 36);
    }
    // stage2（fx=72 → Next(8)=1/8）:0.05 过 / 0.9 不过
    for (const [roll, grows] of [[0.05, true], [0.9, false]] as const) {
      const st = new TileStore(80, 80);
      plantPumpkin(st, 40, 20, 2);
      const evo = makeEvo(st);
      scriptRng(evo, [0.9, roll]);
      priv(evo).overgroundTile(40, 20, 3);
      expect(st.frameX[st.idx(40, 20)]).toBe(grows ? 108 : 72);
    }
    // stage3（fx=108 → Next(11)=1/11）:0.01 过 / 0.95 不过 → 熟档 144/162
    for (const [roll, grows] of [[0.01, true], [0.95, false]] as const) {
      const st = new TileStore(80, 80);
      plantPumpkin(st, 40, 20, 3);
      const evo = makeEvo(st);
      scriptRng(evo, [0.9, roll]);
      priv(evo).overgroundTile(40, 20, 3);
      expect(st.frameX[st.idx(40, 20)]).toBe(grows ? 144 : 108);
    }
    // stage4（fx=144 → 门 1/15 过,num4>=4 早退=熟瓜不再长,cs:52541-52543）
    const st4 = new TileStore(80, 80);
    plantPumpkin(st4, 40, 20, 4);
    const evo4 = makeEvo(st4);
    scriptRng(evo4, [0.9, 0.0]);
    priv(evo4).overgroundTile(40, 20, 3);
    expect(snap(st4, 40, 20)).toEqual(STAGE4());
  });

  it('完整性门：块内混帧（右下格缺）→ 拒长不半写（cs:52545-52551 flag 面）', () => {
    const st = new TileStore(80, 80);
    plantPumpkin(st, 40, 20, 0);
    st.setTileSilent(41, 21, 0);                       // 右下格清 → 块不完整
    const evo = makeEvo(st);
    scriptRng(evo, [0.9, 0.0]);
    priv(evo).overgroundTile(40, 20, 3);
    expect(st.frameX[st.idx(40, 20)]).toBe(0);         // 左上未推进
    expect(st.frameX[st.idx(40, 21)]).toBe(0);         // 无逐格半写
  });

  it('支撑门：下方须草族 {2,109,477,492} 实心（cs:52552-52556）', () => {
    for (const [sheet, ok] of [[0, false], [1, false], [2, true], [109, true], [477, true], [492, true]] as const) {
      const st = new TileStore(80, 80);
      plantPumpkin(st, 40, 20, 0);
      st.setTileSilent(40, 22, sheet ? S(sheet) : 0);  // 左柱支撑换型（逐列独立判）
      st.setTileSilent(41, 22, sheet ? S(sheet) : 0);
      const evo = makeEvo(st);
      scriptRng(evo, [0.9, 0.0]);
      priv(evo).overgroundTile(40, 20, 3);
      const fx = st.frameX[st.idx(40, 20)];
      expect(fx).toBe(ok ? 36 : 0);
    }
  });

  it('变体带保持：frameY（PlacePumpkin Next(6)*36 带）跨级不动（只动 frameX）', () => {
    const st = new TileStore(80, 80);
    plantPumpkin(st, 40, 20, 0, 180);                  // 带档 5（180/198）
    const evo = makeEvo(st);
    scriptRng(evo, [0.9, 0.0]);
    priv(evo).overgroundTile(40, 20, 3);
    expect(snap(st, 40, 20)).toEqual([
      [S(254), 36, 180], [S(254), 54, 180],
      [S(254), 36, 198], [S(254), 54, 198],
    ]);
  });

  it('采样株内任意格：右列格（fx=18）→ 门 1/2,锚归一整株推进（cs:52527-52540）', () => {
    const st = new TileStore(80, 80);
    plantPumpkin(st, 40, 20, 0);
    const evo = makeEvo(st);
    scriptRng(evo, [0.9, 0.4]);                        // (18+10)/10=2 → 1/2:0.4 过
    priv(evo).overgroundTile(41, 20, 3);               // 采样右上格
    expect(snap(st, 40, 20)).toEqual(STAGE1());
    // 进阶后从右上格（fx=54）再采样：(54+10)/10=6 → 1/6,0.9 不过=停在 stage1
    scriptRng(evo, [0.9, 0.9]);
    priv(evo).overgroundTile(41, 20, 3);
    expect(st.frameX[st.idx(40, 20)]).toBe(36);
  });
});
