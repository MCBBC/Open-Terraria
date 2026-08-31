// Collision.CanHit / CanHitLine 1:1（★双锚亲读定版：Terarria1457 Collision.cs:373-480
// / :590-785 为主锚。★1456↔1457 字节级对账定谳（diff 实证，2026-08-31，F3 批）：
// 本文件覆盖的两段里，CanHit(Point) 段（Collision.cs:383-480）与 Player.CanHit(Entity)
// （Player.cs 1457 :42858-42865 / 1456 :41886-41893，cmp 逐字节同文实证）两段逐字
// 同文；CanHitLine 两代恰一 token 差——cs:773 while 条件 `(flag || flag2)`(1456) →
// `(flag | flag2)`(1457)，bool 双操作数、均无副作用故行为等价。除此之外区段零改动；
// 未来字节级对账以此为基准判据，防整段误标或漂移假红）：
//   CanHit(Vector2,int,int,…):383-386 → Position.ToPoint() 截断后转 CanHit(Point,…):
//   :388-480（纯整型 tile 提取 + 三 tile 夹杀步进）；CanHitLine:590-785（(int)((X+
//   (float)(W/2))/16f) 浮点提取 + 分数步进，三 tile 一组 ANY 判阻挡）。消费点定谳：
//   Player.CanHit(Entity)（1457 Player.cs:42857-42865 / 1456 :41886-41893 两代逐字
//   同文）A 射线调用形参 (position,width,height,…)=Vector2,int,int → 绑定【Vector2
//   重载】再经 ToPoint 落 Point 重载；Utils.ToPoint（Utils.cs:1911-1914）=(int)v.X,
//   (int)v.Y——读的是 **已存入 Vector2(float32) 后的分量**。
//
// ★2026-08-31 整型语义清零批（C# 强转/int 除法 ≠ Math.floor）：旧实现用
//   Math.floor((x+w/2)/16) 单式通用两条链——错在三处：①半宽必须先按 C# **整型除法**
//   砍掉半像素再加（奇数尺寸盒在半格交界处会翻一格）；②外层除法对负坐标要朝零
//   截断（Math.floor 向下）；③CanHit 多一道 ToPoint 预截断（证明见 canHitStartTile
//   注释）。浮动步行段（CanHitLine num7..num10）与手位/锚点 Vector2 运算全部按
//   C# float32 语义用 Math.fround 逐位复刻。
//
// ★F4 批补遗（2026-08-31，输入侧 Vector2 存储域量化）：原版坐标系是 float32 的
//   Vector2 存储域——position 写入即舍入、任何消费方（ToPoint/Center getter）读到的
//   都是已物化值；SW 实体链为 f64 自由演算（entities/Entity.ts x/y 无量化层，已核证），
//   故凡入本模块的坐标一律在**入口先 Math.fround** 复刻「存进 Vector2 再被读出」的
//   物化语义，之后才谈 (int) 截断/int÷/f32 加法。缺这步时 near-int 边界 f64 值
//   （例 255.999999999）会被裸 trunc 截到整数下侧，与原版（fround 到 256）错开一格
//   ——tests A⑥ 已按修正模型重钉。
//
// ★留证注 L1（η 尾账正式落档，2026-08-31 治理批）：实体链的 f32 规范化【属实体域】，
//   不上提进 LOS 域、也不下沉扩散——本模块只在入口做一次 fr(x)「存储域物化」
//   （canHitStartTile ⓪ / canHitLineStartTile ⓪ / losRayAnchors Center 兜底三处，
//   各自注明），实体对象自身字段保持 f64 原样。理由：(int)截断/f32 除法等逐算子
//   复刻只在 LOS 提取链内被反编译源码锚定，实体的移动/重力/AI 演算另有各自基准；
//   若把 fround 推广到实体写回面会改写全部物理（超出本文件语义边界且无源锚），
//   若去掉入口物化则 A⑥ 扫掠窗重现错格。两侧各安其位即本注结论——后续改动若
//   触碰入口三处物化或 entities 量化层，须同步重审 tests/los-int-semantics A 组。
//
// ★留证注 L2（η 尾账正式落档）：CanHit(Point) 与 CanHitLine 两条 tile 提取基元
//   （canHitStartTile / canHitLineStartTile）按各自反编译式【独立保真、不合并】：
//   一个是 ToPoint 预截断 + int÷ 纯整型链（cs:390-393），一个是 (float)(W/2) 后浮点
//   除以 16f 的混合链（cs:592-595），两代 C# 原文就不同式（负坐标带/bin 穿越窗的
//   合法自异见下方 P1 等价性证明）。禁止为"去重"抽公共基元或以单式近似另一式
//   ——任何合并都会抹掉其中一条链的可观测分叉域；字节级对账判据见本文件头注。
//
// 逐 tile 扫描关键语义（既有认证基建，原文照录）：
//  - 阻挡 tile = active && !inActive(致动) && tileSolid[type] && !tileSolidTop[type]
//    （CanHit 额外要求 slope==0 && !halfBrick；CanHitLine 不查半砖/坡面——原文如此）
//  - 半砖/坡面/平台(solidTop)/已致动 tile 一律不阻挡视线；
//    开门态是独立 tile id（tileSolid=false），天然不阻挡。
//  - CanHit：沿主轴逐格走，"上下(或左右)两邻格均为整块实心"= 被夹住 → false；
//    落脚格本身可穿才继续走，落脚格为整块实心即出循环 → false。
//  - CanHitLine：每步检查 当前+两邻格 ANY 整实心 → false；步末落脚格实心 → false。
//  - 起止 tile 钳制：x∈[1,maxTilesX-1]、y∈[1,maxTilesY-40]；越界 tile 视同 null → false
//    （try/catch{return false} 的兜底面由 isNull/inBounds 承担——clamp 后索引恒在界内，
//    Main.tile[…]==null 分支即越界面）。
import { TILE_DEFS } from '../data/tiles';
import type { TileStore } from '../world/TileStore';
import { TileStore as TS } from '../world/TileStore';

type Store = Pick<TileStore, 'w' | 'h' | 'type' | 'wire' | 'half' | 'slope' | 'inBounds' | 'idx'>;

/** tile == null（未加载/越界）→ 调用方 return false */
function isNull(st: Store, x: number, y: number): boolean {
  return !st.inBounds(x, y);
}

/** CanHit 的整块实心判定（Collision.cs:443-447 / :449-453 条件串）：
 *  active && !inActive && tileSolid && !tileSolidTop && slope==0 && !halfBrick */
function fullSolid(st: Store, x: number, y: number): boolean {
  const i = st.idx(x, y);
  const t = st.type[i];
  if (t === 0) return false;                                   // !active()
  if (st.wire[i] & TS.WIRE_ACTUATED) return false;             // inActive()
  const d = TILE_DEFS[t];
  return !!d && d.solid && !d.platform && st.slope[i] === 0 && st.half[i] === 0;
}

/** CanHitLine 的整块实心判定（不查 slope/halfBrick，cs:707-709） */
function plainSolid(st: Store, x: number, y: number): boolean {
  const i = st.idx(x, y);
  const t = st.type[i];
  if (t === 0) return false;
  if (st.wire[i] & TS.WIRE_ACTUATED) return false;
  const d = TILE_DEFS[t];
  return !!d && d.solid && !d.platform;
}

/** CanHit 循环条件取反：当前格"可穿"才继续走（cs:477） */
function passable(st: Store, x: number, y: number): boolean {
  const i = st.idx(x, y);
  const t = st.type[i];
  if (st.wire[i] & TS.WIRE_ACTUATED) return true;              // inActive → 可穿
  if (t === 0) return true;                                    // !active → 可穿
  const d = TILE_DEFS[t];
  return !d || !d.solid || !!d.platform;                       // !tileSolid || tileSolidTop
}

// ============================================================
// tile 提取基元（★2026-08-31 清零批核心：C# (int)/int÷ 全朝零截断，禁 Math.floor）
// ============================================================

/** Collision.CanHit(Point,…) 起点 tile（1457 Collision.cs:390-393；1456 :390-393 同文）：
 *  `num = ((int)Position.X + Width / 2) / 16`——三段全整型：
 *   ⓪ 坐标先按 **Vector2 float32 存储域**物化（F4 批）：Utils.ToPoint（Utils.cs:
 *      1911-1914 `(int)v.X`）读的 v.X 是已存入 Vector2 的 f32 分量——原版 position
 *      写入即舍入；SW 链 f64 现状下必须在提取前补 Math.fround，否则 near-int 边界值
 *      （例 canHitStartTile(255.999999999,0)：vanilla=tile16）被裸 trunc 截成 255→15；
 *   ① ToPoint 截断朝零 `(int)v.X`；
 *   ② `Width/2` 是 **int 实参上的整型除法**——奇数尺寸先砍半像素再相加
 *      （注意与 Entity.Center 的 `(float)width/2f` 浮点半宽是两条公式，
 *      Entity.cs:54 —— Center 加 .5、提取砍半像素的混态必须分别保真）；
 *   ③ 最外层 `/16` 也是 int÷：朝零截断。
 *  JS 侧 s=T(fr(x))+T(w/2) 是 |s|<2^31 的整数，`s/16` 是 2 的幂除法在 f64 下
 *  **无舍入**，故 trunc(s/16) ≡ C# 整型商——零浮点近似。
 *
 *  ★trunc-vs-floor 修复面精确定界（tests/los-int-semantics.test.ts 钉死）：
 *  与旧 `Math.floor((x+w/2)/16)` 的互异窗恰有两类——
 *  ①【本批修复窗】奇数尺寸 × frac(x)≥0.5 × (T(x)+T(w/2))≡15 (mod 16)：旧版把
 *  .5 半像素计入分子向上进位翻一格，本式=vanilla；
 *  ②【本批修复窗】x 带负小数的近零带 × 大盒（T(x)+T(w/2) 过 16 的倍数）：
 *  旧版未做 ToPoint 预截断且用向下滑，例 (−0.5, w=128)：旧 3 / 本式 4=v vanilla
 *  整型链 (0+64)/16=4；其余全域（含一切深负出界坐标）两式要么经 `if(num<=1)
 *  num=1`(cs:394) 钳制归一同 tile、要么对非负分子 floor==trunc 平凡重合。 */
export function canHitStartTile(x: number, sizePx: number): number {
  const s = Math.trunc(Math.fround(x)) + Math.trunc(sizePx / 2);   // ⓪+①+②
  return cintQuotient(Math.trunc(s / 16));                         // ③ 整型除法朝零
}

/** C# int÷ 商收口：C# 整型无符号零（trunc 负分数在 JS 会产出 −0），tile 下标域内
 *  与 0 数值同值但为杜绝下游到 Be/Object.is 类比较面出现 −0 假差，统一归 +0。 */
function cintQuotient(q: number): number {
  return q === 0 ? 0 : q;
}

/** Collision.CanHitLine 起点 tile（1457 Collision.cs:592-595；1456 :592-595 同文）：
 *  `num = (int)((Position1.X + (float)(Width1 / 2)) / 16f)`——与 CanHit 差异：
 *  ⓪ 坐标同样先按 Vector2 f32 存储域物化（F4 批，同 canHitStartTile ⓪；对原生
 *     f32 值是恒等，不改变任何已钉行为）；① 此后【不】再预截断，小数直进浮点链；
 *  ② 半宽仍是 int/int 先截断再 (float) 转换（任务铁令⑤考证：反编译括号在
 *     `(float)(Width1 / 2)`——整数除法在前，不存在任务假设的 `(float)Width/2f`
 *     写法）；③ 外层 `/16f` 浮点除 = ×2⁻⁴ 指数平移（舍入恒为零），f64 复算同值；
 *     (int) 强转朝零。加法按 C# 字面一次完成 `(X + half)`——禁止改写成
 *     X/16+half/16 类结合性变形（C# 无此式）；Math.fround 复刻 float32 加法舍入。 */
export function canHitLineStartTile(x: number, sizePx: number): number {
  const px = Math.fround(x);                                     // ⓪ Vector2 存储域物化
  return cintQuotient(Math.trunc(Math.fround(px + Math.trunc(sizePx / 2)) / 16));
}

/* ★等价性证明 P1（两提取式互异域的精确定界——原版【自身】就不同式；F4 批后
 * 两式共享同一入口物化 fr(x)，下列分域均以该公共前提取值）：
 * 记 p=T(fr(x))（朝零）、f=fr(x)−p、h=T(w/2)、s=p+h=16k+m（m∈{0..15} 数学模）、
 * q=s/16。hit=T(q)=k 或 k+1（k<0∧m>0 时后者）；line=T(fround(fr(x)+h)/16)，f32 舍入
 * |δ|≤ulp(|s|)/2，且 [x,x+h] 跨过 2 的幂界时 f32 ulp 变细一档（见下第三类窗）。
 * 【常规正带（无 bin 穿越）⇒ 恒等】：f∈[0,1)。line 相对 hit 的位移 t=f+δ∈(−ε,1)：
 * 上行翻格须 t≥16−m ⇒ 仅 m=15∧t≥1 可达=f 高于上舍阈值的点测度窗；下行翻格须
 * m≤−t 无解；m=0 处 q 为整、t≥0 从右侧逼近不翻转（T 右连续）。fr(x) 对 f32 可
 * 表示输入恒等；对非表示近整 f64 输入两侧同被上舍，互差不产生。tests 扫掠钉定。
 * 【x<0 带负小数带 ⇒ 合法自异】：f∈(−1,0]，t<0 时若 s≡0 (mod 16)（q 恰整数）
 * 则从左侧逼近 T 掉一格：例 x=−0.25,w=96 ⇒ hit=(0+48)/16=3 而 line=T(47.75/16)=2
 * ——这是 CanHit(Point)/CanHitLine 两条 C# 公式在负坐标带的固有分叉。
 * 【正域 bin 穿越窗 ⇒ 合法自异（F4 批实证新增类）】：x 与 x+h 分属不同 2 幂指
 * 数 bin 时 line 的加法落入更细粒度（half-ulp 更小）格点，near-integer 和被 ties-
 * even 上舍到整数线再除：例 x=131039.9921875（[2¹⁶,2¹⁷) 域 f32 恰可表示，frac=
 * 127/128），h=48 后 x+h 落 [2¹⁷,2¹⁸) 域为 half-ulp 中点 → 上舍 131088 → line=
 * 8193；hit 侧 T(fr(x)) 保持 131039 → (131039+48)/16 截断=8192。大世界（8400 格
 * =134400px>131072）可达；锚值已钉 tests A⑦（hit8192/line8193）。本文件双基元
 * 各按各自反编译式保真（不合并、不近似），终值经钳制吸收面见 tests B 组。 */

/** 原版钳制 1:1（cs:394-425：每轴两段独立 if 非 else-if，保持字面序防 future 重排）
 *  x 形态 hi=maxTilesX→写 maxTilesX-1；y 形态 hi=maxTilesY-40（含上界本身）两式 */
function clampXTile(n: number, maxTilesX: number): number {
  if (n <= 1) n = 1;
  if (n >= maxTilesX) n = maxTilesX - 1;
  return n;
}

function clampYTile(n: number, maxTilesY: number): number {
  if (n <= 1) n = 1;
  if (n >= maxTilesY - 40) n = maxTilesY - 40;                 // cs:414-416 含上界字面
  return n;
}

/** Collision.CanHit(Vector2, 0, 0, Vector2, 0, 0) 点对通道（★2026-08-31 新增导出）：
 *  AI_007 城镇 NPC 全部 Center 点对站点的字面形态——危险扫描 LOS 门
 *  （NPC.cs:54030 `!Collision.CanHit(base.Center,0,0,Main.npc[m].Center,0,0)`）、
 *  入态支内重验（近战 :56019-56026 / 魔法 :56061 段 / 挥击退出链 :55656/:55658）、
 *  危险侧前探 32px 墙探（:55649-55650）。语义与 rect 版同管线：两端点 = 各自
 *  「中心 tile」，0 尺寸盒的中心 tile 即坐标所在格；与 `canHit(st,cx,cy,0,0,…)`
 *  等价，仅作站点形状保真（红队 R5 leftover#4 口径）。 */
export function canHitPoint(st: Store, x1: number, y1: number, x2: number, y2: number): boolean {
  return canHit(st, x1, y1, 0, 0, x2, y2, 0, 0);
}

/** Collision.CanHitLine(Vector2, 0, 0, Vector2, 0, 0) 点对通道（弓支 :56044/:56058
 *  与医师触发 :55996 一带的字面形态；CanHitLine rect/point 端点 tile 同构） */
export function canHitLinePoint(st: Store, x1: number, y1: number, x2: number, y2: number): boolean {
  return canHitLine(st, x1, y1, 0, 0, x2, y2, 0, 0);
}

/** Collision.CanHit（cs:388-480）：起点矩形左上角像素坐标 + 尺寸 → 目标同构 */
export function canHit(st: Store, x1: number, y1: number, w1: number, h1: number,
  x2: number, y2: number, w2: number, h2: number): boolean {
  let num = canHitStartTile(x1, w1);                          // cs:390
  let num2 = canHitStartTile(y1, h1);                         // cs:391
  let num3 = canHitStartTile(x2, w2);                         // cs:392
  let num4 = canHitStartTile(y2, h2);                         // cs:393
  num = clampXTile(num, st.w);                                // cs:394-400
  num3 = clampXTile(num3, st.w);                              // cs:402-408
  num2 = clampYTile(num2, st.h);                              // cs:410-416
  num4 = clampYTile(num4, st.h);                              // cs:418-424
  for (;;) {
    const d5 = Math.abs(num - num3), d6 = Math.abs(num2 - num4);
    if (num === num3 && num2 === num4) return true;
    if (d5 > d6) {
      num += num >= num3 ? -1 : 1;
      if (isNull(st, num, num2 - 1) || isNull(st, num, num2 + 1)) return false;
      if (fullSolid(st, num, num2 - 1) && fullSolid(st, num, num2 + 1)) return false;
    } else {
      num2 += num2 >= num4 ? -1 : 1;
      if (isNull(st, num - 1, num2) || isNull(st, num + 1, num2)) return false;
      if (fullSolid(st, num - 1, num2) && fullSolid(st, num + 1, num2)) return false;
    }
    if (isNull(st, num, num2)) return false;
    if (!passable(st, num, num2)) return false;                // 落脚格整实心 → 阻挡
  }
}

/** Collision.CanHitLine（cs:590-785）：分数步进逐格扫描，ANY 整实心即阻挡。
 *  步行段浮点量（num5..num10 为 C# float 变量）逐位 fround 复刻 f32 语义：
 *  比率 num7=num5/num6 与累加器 num9+=num7 的舍入节奏在长程射线上可观测
 *  （f64 无舍入会让 (int)截断节拍与原版错位），这是 cs:674-711 步数表的真语义。 */
export function canHitLine(st: Store, x1: number, y1: number, w1: number, h1: number,
  x2: number, y2: number, w2: number, h2: number): boolean {
  let num = canHitLineStartTile(x1, w1);                      // cs:592
  let num2 = canHitLineStartTile(y1, h1);                     // cs:593
  const num3 = canHitLineStartTile(x2, w2);                   // cs:594
  const num4 = canHitLineStartTile(y2, h2);                   // cs:595
  num = clampXTile(num, st.w);                                // cs:596-603
  num2 = clampYTile(num2, st.h);                              // cs:612-619
  const cxTgt = clampXTile(num3, st.w);                       // cs:604-611
  const cyTgt = clampYTile(num4, st.h);                       // cs:620-627
  const d5 = Math.abs(num - cxTgt), d6 = Math.abs(num2 - cyTgt);   // num5/num6(float)
  if (d5 === 0 && d6 === 0) return true;
  let stepX = 1, stepY = 1;                                   // num7/num8
  if (d5 === 0) stepX = 0;
  else if (d6 === 0) stepY = 0;
  else if (d5 > d6) stepX = Math.fround(d5 / d6);             // cs:649 float 除法
  else stepY = Math.fround(d6 / d5);                          // cs:653
  let accX = 0, accY = 0;                                     // num9/num10
  let phase = num2 < cyTgt ? 2 : 1;                           // num11：2=先行 X 步(:658)
  let remX = Math.trunc(d5), remY = Math.trunc(d6);           // (int)num5/num6:662-663
  const sx = Math.sign(cxTgt - num), sy = Math.sign(cyTgt - num2);   // :664-665
  let cx = num, cy = num2;
  let done = false, lastSingle = false;                       // flag / flag2
  for (;;) {
    if (phase === 2) {
      accX = Math.fround(accX + stepX);                       // cs:676 num9+=num7
      const steps = Math.trunc(accX);                         // cs:677 (int)num9
      accX = Math.fround(accX - steps);                       // cs:678 num9-=(float)num17
      for (let j = 0; j < steps; j++) {
        if (isNull(st, cx, cy - 1) || isNull(st, cx, cy) || isNull(st, cx, cy + 1)) return false;
        if (plainSolid(st, cx, cy - 1) || plainSolid(st, cx, cy + 1) || plainSolid(st, cx, cy)) return false;
        if (remX === 0 && remY === 0) { done = true; break; }
        cx += sx; remX--;
        if (remX === 0 && remY === 0 && steps === 1) lastSingle = true;
      }
      if (remY !== 0) phase = 1;                              // cs:712-715
    } else {
      accY = Math.fround(accY + stepY);
      const steps = Math.trunc(accY);                         // cs:721 (int)num10
      accY = Math.fround(accY - steps);
      for (let i = 0; i < steps; i++) {
        if (isNull(st, cx - 1, cy) || isNull(st, cx, cy) || isNull(st, cx + 1, cy)) return false;
        if (plainSolid(st, cx - 1, cy) || plainSolid(st, cx + 1, cy) || plainSolid(st, cx, cy)) return false;
        if (remX === 0 && remY === 0) { done = true; break; }
        cy += sy; remY--;
        if (remX === 0 && remY === 0 && steps === 1) lastSingle = true;
      }
      if (remX !== 0) phase = 2;                              // cs:756-759
    }
    if (isNull(st, cx, cy)) return false;                     // cs:763-765
    if (plainSolid(st, cx, cy)) return false;                 // cs:767-770 落脚复检
    if (done || lastSingle) return true;                      // while(!(flag|flag2))
  }
}

/** WorldGen.SolidTile(i,j) 公共口（Terarria1457 WorldGen.cs:70642-70661；1456 :70155
 *  同式）：active && tileSolid && !tileSolidTop(platform) && !halfBrick && slope==0
 *  && !inActuated——与 fullSolid 同判定式的越界安全版。语义要点：
 *  - 不含平台族（tileSolidTop）——与 TileStore.isSolid（含平台）互斥，消费方须按
 *    调用点选对：目标格快退（AI_137_CanHit Projectile.cs:71577）等 WorldGen.SolidTile
 *    站点一律本式；
 *  - 出界/未加载格原版返回 true（Main.tile[i,j]==null → return true 的守门怪癖
 *    :70646-70649），照搬保真——目标态常态在界内,少触发。
 *  （2026-08-30 实体侧对账批新增导出；既有函数体零改动） */
export function solidTileAt(st: Store, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return true;                         // Main.tile==null → true（怪癖保真）
  const i = st.idx(x, y);
  const t = st.type[i];
  if (t === 0) return false;                                   // !active()
  if (st.wire[i] & TS.WIRE_ACTUATED) return false;             // inActive()
  const d = TILE_DEFS[t];
  return !!d && d.solid && !d.platform && st.slope[i] === 0 && st.half[i] === 0;
}

/** 原版 Player.CanHit(Entity ent)（Terarria1457/Terraria/Player.cs:42858-42865；
 *  1456 :41886-41893）1:1——近战挥击对 NPC 的视线门，消费点 = ProcessHitAgainstNPC
 *  （1457 :44641 / 1456 :43619 `!flag || (!nPC.noTileCollide && !CanHit(nPC))`）。
 *  四条射线任一通过即可命中：A) Collision.CanHit 整盒对整盒；B/C/D) 三条
 *  "手位点→目标锚点"的 CanHitLine（int÷/f32 站点级语义见 losRayAnchors 与
 *  canHitStartTile/canHitLineStartTile）。手位 = Center+(direction*width/2,
 *  gravDir*-height/3)——★F1 活语义批：gravDir 由 p.gravDir 传入（缺省 1，
 *  与 SmartSelect.ts 同口径；SW 已有 Gravitation 药水翻转 Game.ts 重力药水段与
 *  FTW 克脑 consumeBrainOfGravity 两处活翻转面，恒 1 前提不成立）。
 *  目标三锚点 = Center±(0,height/3 int÷截断) 与 Center 本体。p 只需 Player 盒面
 *  （Entity 基类即满足），e 为目标盒。 */
export interface LOSBox { x: number; y: number; w: number; h: number;
  cx?: number; cy?: number; facing?: number; gravDir?: number }

/** Player.CanHit(Entity) B/C/D 三条"手位点→目标锚点"CanHitLine 射线端点单源
 *  （1457 Player.cs:42858-42862 / 1456 :41888-41890 两代逐字节同文；tests 直驱
 *   钉值用，playerCanHitEntity 内部消费——改一处两处同步）。逐算子 C# 语义：
 *  - 手位 X 偏移 `direction * width / 2` 全是 **int 运算**（direction/width 均
 *    int，Entity.cs:20-22）→ 截断朝零：w=21,dir=−1 得 −10 而非 −10.5。注意与
 *    Center 的浮点半宽叠加后奇数宽呈 ±10 半像素不对称混态——原版字面如此；
 *  - 手位 Y 偏移 `gravDir * (float)(-height) / 3f` 是浮点链（cast 在前 ÷3f 在后）
 *    ——★F1 活语义批改为读 p.gravDir（缺省 1 保持既有调用零改动合法）：
 *    SW 活翻转面 = Gravitation 药水（core/Game.ts 重力药水段 gravDir=-1↔1）与
 *    FTW 克脑 forcedGravityT（entities/Player.ts consumeBrainOfGravity），恒 1
 *    前提被仓内代码否决；调用方传真值即翻转 B/C 支起点侧别（D 支不受影响，
 *    与原版 :42862 字面 0f 一致）；fround 复刻 f32 乘除；
 *  - Center 兜底 `position+size/2` 是 `(float)width/2f` 浮点半宽（Entity.cs:54）；
 *    ★F4 批：position 分量先按 Vector2 存储域物化（fr(p.x)/fr(p.y)）再做 f32
 *    加法半宽（SW 实体链 f64 自由演算、无量化层，已核证故须在入口补齐）；
 *  - 目标锚 `ent.Center ± ent.height / 3`：**ent.height 为 int ÷ 字面量 3 无 f
 *    后缀 → int/int 向零截断后隐转 float 进 Vector2 构造器**（h=41 → −13/+13，
 *    floor 会给 −14——★F3 定案的截断语义在此钉牢）。 */
export interface LOSRayAnchors {
  hx: number; hyBC: number; hyD: number;                      // 手位 X 与 B/C、D 两支 Y
  exTop: number; eyTop: number;                               // Center±(0,-h/3)
  exMid: number; eyMid: number;                               // Center 本体
  exBot: number; eyBot: number;                               // Center+(0,+h/3)
}

export function losRayAnchors(p: LOSBox, e: LOSBox): LOSRayAnchors {
  const pcx = p.cx ?? Math.fround(Math.fround(p.x) + Math.fround(p.w / 2));  // Entity.Center(:54)
  const pcy = p.cy ?? Math.fround(Math.fround(p.y) + Math.fround(p.h / 2));
  const dxHand = Math.trunc(((p.facing ?? 1) * p.w) / 2);      // direction*width/2 全整型
  const gd = p.gravDir ?? 1;                                   // ★F1：gravDir 进位面（缺省 1）
  const dyHand = Math.fround(Math.fround(gd * -p.h) / 3);      // gravDir*(float)(-height) 物化 → /3f 浮点除舍入
  const hx = Math.fround(pcx + dxHand);                        // Center + Vector2(dx,dy) 加法
  const ecx = Math.fround(Math.fround(e.x) + Math.fround(e.w / 2));
  const ecy = Math.fround(Math.fround(e.y) + Math.fround(e.h / 2));
  const bTop = Math.trunc(-e.h / 3);                           // `-ent.height / 3` int÷
  const dBot = Math.trunc(e.h / 3);                            // `ent.height / 3` int÷
  return {
    hx,
    hyBC: Math.fround(pcy + dyHand),
    hyD: pcy,                                                  // :42862 y 分量字面 0f→Center.Y 原样
    exTop: ecx, eyTop: Math.fround(ecy + bTop),
    exMid: ecx, eyMid: ecy,
    exBot: ecx, eyBot: Math.fround(ecy + dBot),
  };
}

/** 原版 Player.CanHit(Entity ent)（Terarria1457/Terraria/Player.cs:42857-42865；
 *  1456 :41886-41893 两代逐字节同文，cmp 实证）1:1——近战挥击对 NPC 的视线门，
 *  消费点 = ProcessHitAgainstNPC（1457 :44641 / 1456 :43619）。四条射线任一通过
 *  即可命中：A) CanHit(position,width,height,ent.position,ent.width,ent.height)：
 *  实参类型绑定【CanHit(Vector2,int,int,…) 重载】→ ToPoint 截断 → Point 纯整型
 *  提取链；B/C/D) 三条手位→目标锚 CanHitLine（losRayAnchors 单源，gravDir 活语义
 *  见其注释）。p 只需 Player 盒面，e 为目标盒。 */
export function playerCanHitEntity(st: Store, p: LOSBox, e: LOSBox): boolean {
  if (canHit(st, p.x, p.y, p.w, p.h, e.x, e.y, e.w, e.h)) return true;
  const a = losRayAnchors(p, e);
  return canHitLine(st, a.hx, a.hyBC, 0, 0, a.exTop, a.eyTop, 0, 0)
    || canHitLine(st, a.hx, a.hyBC, 0, 0, a.exMid, a.eyMid, 0, 0)
    || canHitLine(st, a.hx, a.hyD, 0, 0, a.exBot, a.eyBot, 0, 0);
}
