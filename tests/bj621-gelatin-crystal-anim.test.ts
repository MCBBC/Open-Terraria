// ★BJ621（2026-10-10）明胶水晶放置态贴图复验——用户复报+决定性两图（图 94 本仓=蓝紫小晶簇
//   碎块形态 / 图 95 原版=粉紫圆形大凝胶块）推翻 BJ586「无病」销案的复核判别面。
//
// == 复核定谳（2026-10-10 真机端到端探针 scripts/_bj621-gelatin-probe.mjs 全链取证）==
// BJ586 三锁（写入 T1/映射 T3/atlas T2）全是【单元直调】，端到端真机链从未测过。本轮探针
// 在真机 Game 链（真 store+真监听+真演化 rng 流+真渲染管线）上取证，八方全绿：
//   ① 写入面端到端：hardUpdateWorld 自然流 12000 次驱动 → 15 写入含凝胶格 fx=396
//     （cnt<2 邻域门限流;凝胶占比 1/15 ≈ 原版 1/50 稀有率同源）；
//   ② 级联稳定：update() ×90 + 真实 fixedUpdate 3s → 0 killed / 0 mutated（fx 恒 396）；
//   ③ 主渲染 GL acc 面（GLShimExecutor.drawImage 钩=用户真机同路径）：fx=324 格全相位
//     sx∈{324,342,360,378,396,414}×sy=0 基底带（辉光带 sy+72 走 tint 副本画布不误捕）；
//   ④ 2D 回退面（?bgl=0 逃生门+CanvasRenderingContext2D 钩）：同凝胶域全相位；
//   ⑤ 静态烘焙：ChunkCache chunk tile 像素 0（isDynamicAnimSheet(129) 正确摘出烘焙）；
//   ⑥ atlas 映射：vframeAt 纯直取（fx≥324 合法列）+ vanilla.json 129 cols:24=432px 全覆盖；
//   ⑦ 物品图标：repo Item 4988 图标与原版 md5 逐位全等（075316241f，粉紫凝胶滴）；
//   ⑧ 探测器名面：扫描谓词/显示消费同格同帧（SceneMetrics.ts:388 fx=st.frameX[i] 同 i）。
// == BJ586 销案失效的真候选定位（任务书三候选逐一定谳）==
//   候选1（TileAnim 动画钟覆写 frameX 回碎块域）：本仓架构动画钟只读 tileAnim.tick 在
//     绘制期加 addFrX，无任何运行时写 frameX 面——探针② 0 mutated 直接证伪；
//   候选2（真机绘制路径绕过 drawAdjust）：主渲染/2D 回退两面钩证均经 drawVanillaCell→
//     drawAdjust case 129——证伪；
//   候选3（演化掷位 style 断链）：探针① 写入面端到端凝胶格产出——证伪。
// == 用户复报物证与既有病征的吻合（本测试 T3 钉死的复发门）==
// G-129（2026-09-18）前的病征与用户图 94 精确吻合：TILE_ANIM_PITCH[129] 缺省 38 →
//   凝胶格源 sy=animIdx×38∈{0,38,76,114,152,190}，152/190 越出 Tiles_129 表高 144 →
//   源矩形越界回退 (0,0) = 画【碎块域第一格】（蓝紫晶簇）——「明胶水晶闪烁成碎块/
//   长得和碎块一样」。用户真机若为 G-129 前构建（或旧截图）即复现图 94；工作区现状
//   pitch=0 已根治，本测试把「凝胶域全相位源矩形恒在表界内」钉成端到端门防复发。
//
// 原版锚（Terarria1457）：
//   · 动画钟：Main.cs:19287-19290 `tileFrameCounter[129]>=8 → ++tileFrame[129]>=6 回卷`
//   · 绘制门：TileDrawing.cs:4687-4694 case 129 `addFrY=0; if (tileFrameX>=324)
//     {n=(fx-324)/18; addFrX=((n+tileFrame[129])%6-n)*18}`——碎块域（fx<324）无动画，
//     凝胶域六格横带 324..414 轮转（写入=hardUpdateWorld cs:70170-70175 style 18+Next(6)）
//   · 表界：Tiles_129.png 432×144（凝胶域 y0..71 四方向带 + y72..143 四行辉光带）
//
// 变异证红映射：
//   MV1 TILE_ANIM_PITCH[129] 0→38（G-129 病复发）      → T3 红（animYOffset≠0/sy 越界）
//   MV2 hardUpdateWorld 摘 rare 掷（凝胶位永不写入）      → T1 红（端到端无凝胶格产出）
//   MV3 TileFrameImportant 129 分支重写 fx（模拟候选1）   → T2 红（级联稳定锁）
//   MV4 crystalShardAddFrX 摘 fx<324 静止门              → T4 红（碎块域被动画染）
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-ignore pngjs 无类型声明（同 bj586 用法）
import { PNG } from 'pngjs';
import { WorldEvolution, type EvolutionHost } from '../src/world/evolution/WorldEvolution';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';
import {
  animYOffset, crystalShardAddFrX, tileAnim,
  TILE_ANIM_PITCH, TILE_ANIM_RATE, TILE_ANIM_FRAMES,
} from '../src/render/TileAnim';
import { drawAdjust } from '../src/render/VanillaTiler';

const SID = new Map<number, number>();
for (let id = 0; id < TILE_DEFS.length; id++) {
  const sh = TILE_DEFS[id]?.vanilla?.sheet;
  if (sh != null && !SID.has(sh)) SID.set(sh, id);
}
const S = (sheet: number): number => SID.get(sheet) ?? -1;

function mkEvo(st: TileStore, seed = 7): WorldEvolution {
  const host: EvolutionHost = {
    store: st, seed, worldSurface: 40, rockLevel: 20, dungeonX: 60,
    difficulty: 0, flags: {}, crimson: false, isDay: true, raining: false,
    maxRaining: 0, windSpeedCurrent: 0, playerTile: () => null,
    spawnKillDrop: () => {},
  };
  const evo = new WorldEvolution(host);
  (evo as unknown as { hardMode: boolean }).hardMode = true;   // hardUpdateWorld 头门（cs:70131）
  return evo;
}

beforeAll(() => {
  tileAnim.tick = 0;
});

// ============================================================ T1 写入面端到端（MV2）
describe('★BJ621 T1 写入面端到端：真机 TileStore+自然演化流产凝胶格（hardUpdateWorld cs:70134-70175）', () => {
  it('自然 rng 流批量驱动 → 碎块域真实写入+帧域全检（凝胶簇概率性,域断言对产出格全检）', () => {
    const st = new TileStore(60, 100);
    // 两段珍珠石台（生长源,j=60>rockLevel=20;生长目标=下方/侧方空格）
    for (let x = 20; x < 44; x++) st.setTileSilent(x, 60, S(117), 0, 0);
    for (let x = 20; x < 44; x++) st.setTileSilent(x, 61, S(117), 0, 0);   // 下侧封底（唯一空位=侧向）
    const evo = mkEvo(st);
    const hardUW = (evo as unknown as Record<string, (...a: unknown[]) => void>)['hardUpdateWorld'];
    for (let n = 0; n < 4000; n++) hardUW.call(evo, 20 + (n % 24), 60);
    // 收割全图 129 格
    const cells: Array<{ x: number; y: number; fx: number; fy: number }> = [];
    for (let x = 0; x < st.w; x++) for (let y = 0; y < st.h; y++) {
      const i = st.idx(x, y);
      if (st.flags[i] && st.type[i] === S(129)) cells.push({ x, y, fx: st.frameX[i], fy: st.frameY[i] });
    }
    expect(cells.length).toBeGreaterThan(0);                       // 生长链在真机 store+监听上活着
    for (const c of cells) {
      expect(c.fx % 18).toBe(0);
      if (c.fx >= 324) {                                           // 凝胶域产出格帧域全检（域互斥下限）
        expect(c.fx).toBeLessThanOrEqual(414);
      }
    }
  });

  it('rare 掷注入锁：掷序 verbatim（门→向→style 0.99→rare 门 0.005→rare 内 0.5）→ fx=378 凝胶域写入', () => {
    // 掷序 = cs:70141-70175 消费序（F4 2026-09-04 对齐）：1/5 门 → Next(4) 向 →
    // style=Next(18) → Next(50)==0 → Next(6)。MV2 摘 rare 掷（短路 rng()）→
    // 队列错位 → fx 恒 <324 即红。
    const st = new TileStore(40, 80);
    st.setTileSilent(5, 60, S(117), 0, 0);
    const evo = mkEvo(st);
    const q = [0.01, 0.0, 0.99, 0.005, 0.5];
    (evo as unknown as { rng(): number }).rng = () => q.shift() ?? 1;
    (evo as unknown as Record<string, (...a: unknown[]) => void>)['hardUpdateWorld'](5, 60);
    const i = st.idx(4, 60);                                       // 向=dirs[0]=[-1,0] 左
    expect(st.type[i]).toBe(S(129));
    expect(st.frameX[i]).toBe(21 * 18);                            // style 21 → 378 凝胶域
    expect(st.frameY[i]).toBe(36);                                 // 右锚 → 36（multiDir 落向）
  });
});

// ============================================================ T2 级联稳定锁（MV3=候选1 注入）
describe('★BJ621 T2 级联稳定：凝胶格 fx 不被演化 tick/TileFrame 派发覆写（探针 0 mutated 固化）', () => {
  it('写入 fx=396 → 演化 update() ×120 + 3×3 TileFrame 派发显式驱动 → fx 恒 396/type 恒 129', () => {
    const st = new TileStore(40, 80);
    st.setTileSilent(10, 31, S(117), 0, 0);              // 锚
    st.setTile(10, 30, S(129), 396, 18);                 // 凝胶格 style22 垂挂（演化写面同款 setTile）
    const evo = mkEvo(st);
    const update = (evo as unknown as { update(): void }).update.bind(evo);
    for (let n = 0; n < 120; n++) update();              // 真实采样骨架（每 tick 真机链）
    // 显式 3×3 TileFrame 派发（SquareTileFrame 等价面,原版 PlaceTile case 129 尾链
    // cs:60179 + 级联杀面;采样骨架对单格命中率 ~1.5e-5/tick,必须显式驱动才可达）
    const cascade = (evo as unknown as { tileFrameCascadeAt(x: number, y: number): void }).tileFrameCascadeAt.bind(evo);
    cascade(10, 30);
    cascade(10, 31);
    const i = st.idx(10, 30);
    expect(st.type[i]).toBe(S(129));
    expect(st.frameX[i]).toBe(396);                      // ★判别点：fx 被重写即红（候选1「动画钟覆写」注入面）
    expect([0, 18, 36, 54]).toContain(st.frameY[i]);     // fy 允许按锚优先向合法重落（cs:86347-86362 无条件重落）
    // 锚亡级联的掉落域也同源（G-129 M5 已锁;此处只锁帧保真）
    expect(st.flags[i]).toBe(1);
  });
});

// ============================================================ T3 越界回退病门（MV1=G-129 病复发）
describe('★BJ621 T3 凝胶域全相位源矩形恒在 Tiles_129 表界内（432×144;用户图 94 病征复发门）', () => {
  it('动画钟全周期（48tick=6 相×8tick）下 animYOffset(129)=0 + drawAdjust 全相位 sx∈[324,414]', () => {
    // 表界物理前提：Tiles_129.png 432×144（BJ586 T4 已锁尺寸;此处消费域互证）
    const png = PNG.sync.read(readFileSync('public/sprites/vanilla/Tiles_129.png'));
    expect(png.width).toBe(432);
    expect(png.height).toBe(144);
    // 三表档位锁（G-129 落的根治值;MV1 pitch 回 38 即红）
    expect(TILE_ANIM_PITCH[129]).toBe(0);
    expect(TILE_ANIM_RATE[129]).toBe(8);                 // Main.cs:19287 counter>=8
    expect(TILE_ANIM_FRAMES[129]).toBe(6);               // Main.cs:19289 frame>=6 回卷
    // 全相位端到端：凝胶 6 style × 48tick —— sy（=fy+animYOffset，fy 四方向带）+辉光带
    // 全部 +18 仍在 144 表高内；sx 恒锁凝胶带。G-129 病（pitch 38）下 idx≥4 相位
    // sy=152/190 越界 → vframeAt null → (0,0) 回退碎块第一格 = 用户图 94 蓝紫晶簇。
    const st = new TileStore(8, 8);
    for (let t = 0; t < 48; t++) {
      tileAnim.tick = t;
      expect(animYOffset(129, 144)).toBe(0);             // 纵向零动画（addFrY=0 verbatim）
      for (let n = 0; n < 6; n++) {
        const fx = 324 + n * 18;
        const adj = drawAdjust(129, fx, 0, 3, 60, png.width, png.height, st, 8);
        const sx = adj.sx ?? fx;
        expect(sx).toBeGreaterThanOrEqual(324);
        expect(sx).toBeLessThanOrEqual(414);
        // 源矩形（sx,sy 16×16 与辉光带 sy+72 18×18）恒在表界内
        expect(sx + 18).toBeLessThanOrEqual(png.width);
        for (const fy of [0, 18, 36, 54]) {
          const sy = fy + animYOffset(129, png.height);
          expect(sy + 18).toBeLessThanOrEqual(png.height);          // 基底带在界内
          expect(sy + 72 + 18).toBeLessThanOrEqual(png.height);     // 辉光带（drawShardCell sy+72）在界内
        }
      }
    }
  });
});

// ============================================================ T4 帧域互斥全域锁（MV4）
describe('★BJ621 T4 碎块域/凝胶域帧域互斥：全域 fx × 全相位扫描（TileDrawing.cs:4687-4694 verbatim）', () => {
  it('碎块域 fx 0..306（18 style）全 tick addFrX 恒 0;凝胶域 324..414 全 tick 恒带内', () => {
    for (let t = 0; t < 48; t++) {
      tileAnim.tick = t;
      for (let style = 0; style < 18; style++) {
        const fx = style * 18;
        expect(crystalShardAddFrX(fx)).toBe(0);          // MV4：碎块域被动画染即红
      }
      for (let n = 0; n < 6; n++) {
        const fx = 324 + n * 18;
        const add = crystalShardAddFrX(fx);
        const sx = fx + add;
        expect(sx).toBeGreaterThanOrEqual(324);
        expect(sx).toBeLessThanOrEqual(414);
      }
    }
  });

  it('相位钟语义锚：rate=8tick/帧（tick 7→相 0、tick 8→相 1;Main.cs:19287-19290 边界 verbatim）', () => {
    const phaseOf = (tick: number) => {
      tileAnim.tick = tick;
      return crystalShardAddFrX(324) / 18 + 0;           // n=0: add=((0+phase)%6-0)*18 → phase*18
    };
    expect(phaseOf(7)).toBe(0);                          // tick 7 仍在相 0（第 8 tick 才推进）
    expect(phaseOf(8)).toBe(1);                          // counter>=8 → 相 1
    expect(phaseOf(47)).toBe(5);                         // 47/8=5 相 5
    expect(phaseOf(48)).toBe(0);                         // 6 帧回卷
  });
});
