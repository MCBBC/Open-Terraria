// BJ254（2026-09-21）NPC.HitEffect 受击/死亡尘单源消费——vanilla-npcdust.json 查表驱动。
// BJ296（2026-09-23）批2 概率门接入：语句级分支（roll 单掷二选一）/循环组（loop body 逐拍
// 按序）/pre 臂条件（判负→e 臂不掷=原版 && 短路）与 gate 区域门（判负→整支跳过）/idRand 逐尘掷 id/
// scaleAddR01 post（scale+=NextFloat）。
// BJ304（2026-09-23）批3 fadeIn 定谳翻案接入：★fadeIn=生长目标语义（原版 Dust.cs :2148-2171:
// 0<fadeIn<100 时 scale+=0.03/t 至超 fadeIn 归零转衰落,无 alpha 参与——BJ296 曾误登记
// 「alpha 渐入/本仓不可用」;本仓 VDust.fadeIn 在位+老化链 1:1 fx/VanillaDust.ts :740-745）
// → 新 post 算子 ['fadeIn',N]（活尘对象后置赋值=原版 NewDust 后写同相）;无臂 branch=
// 掷流占位（roll 照耗零尘,524 静态死臂）。
// BJ327（2026-09-24）批4 尘面收官批：
//   · 402 oldPos 轨迹盒 6 组——★Enemy 定谳=【有】轨迹环（histXAt/histYAt/historyDepth,
//     容量 60≥TrailCacheLength[402]=36 NPCID.cs:4809,TrailingMode[402]=7 逐拍推入,Enemy.ts
//     recordTrailHistory）→ 无需扩展直接接。loop.over='oldPos'（逐 index 走 body,首遇零位
//     index 出 brk）+ stmt.pos='oldPos'（盒顶左=hist[index] 绝对位）+ {brk} 标记
//     （oldPos[i]==Zero→break,原版掷门【后】求值同序）+ branch.skip（Next(4)!=0 continue=
//     roll 过→跳过本轮余下 body）。
//   · 426/427 SelectRandom 带权 id 环——stmt.idPick=[…]=choices[Next(len)]（Utils.cs:2628
//     SelectRandom 直译,重复项=权重:426 [229,240,161] 均一/427 [229,229,240] 2:1,逐尘 1 掷）;
//     ★noLight 定谳翻案（BJ304「字段在位但引擎不消费」判词误——VDust.noLight 引擎光链
//     VanillaDust.ts :551 烟雾族 !noLight 门消费,240/161 原文本无光=no-op 同相,缺的只是
//     消费面算子,同 fadeIn 判例三步定性）→ std 算子 ['noLight',true]。
//   · 661 光女四缺口一次接齐：①colorHsl={div,sat,lum,mul}=hslToRgb 纯函数 std-expressible
//     （Main.cs :48689-:48717 直译,hue=Math.fround(idx/div%1) float32 环索循环 index,
//     Math.Round=ToEven,乘色走 float 域=LeashedCritter.ts:1577 White×0.5 同源判例）;
//     ②['posCircular']=position=Center+NextVector2Circular(w,h)（Utils.cs:1301-1303=
//     unit(θ)×(w,h)×NextFloat,2 掷:角+幅,Game.ts:42040 同源判例）;
//     ③['velFromCenter',k]=velocity=(position−Center)×k（0 掷派生,posCircular 后求值）;
//     ④stmt.clone={posts}=CloneDust 回声（Dust.cs :260-288,引擎 VanillaDust.clone 1:1 在位,
//     GameHooks.cloneDust 钩子新建;`numX != 6000` 池满守卫=spawn null 短路同面）。
// BJ411（2026-09-30）批5 流星头 23 接入（用户实报「流星头粒子没有」定谳面之一）：HitEffect
//   :90567-90605（1458 同行逐字节全等）——hit=for(hitK100){idPick[6,25]尘(hd,-1)+
//   d6(vel×0.2,α100,s2,ng)}→return（原版无通用尾=表外型零尘同相）;death=50×idPick尘(2hd,-2)
//   +50×d6(vel×0.2,α100,s2.5,vel×6,ng)。★idPick[6,25]=`int numN=25;if(Next(2)==0) numN=6`
//   等价直译（idPick[roll]:0→6/1→25,1 掷同拍）——该局部 id 模式提取器当时未支持,条目曾
//   手工录入（_meta.batch5,已退役）。FindFrame 火尾
//   :74803-74809（每 tick dust 6 盒=position−velocity）不在本表——Enemy.swarmerAI 直刀。
// BJ479（2026-10-03）批6 宝箱怪受击/死亡尘族接入 + 批5 手工条目提取器原生转正：
//   ①85（Mimic）/629（Ice Mimic）共支 HitEffect :89766-89801 亲读——根级 ai[3] 门=段位选尘
//   （num722=7,ai[3]==2→10/==3→37;hit=ceil(dmg/lifeMax×50),death=20;gore 61/62/63 归
//   extract-gore.mjs）。段位=AI_025 生成时锁（NPC.cs:25684-25697:1 地表/2 地下/3 地狱;
//   341/629 每 tick 强制 1 :25699-25701→629 恒段 1 恒尘 7）→ 新 stmt 字段 idAi3={m}：
//   dust=ai[3]∈m?m[ai3]:dust（0 掷,读 Enemy.ai3=mimicAI BJ464 锁定值）。★提取器此前对
//   num722 三重赋值以 typedLocal 桶尾值 37 静默错解析（未接线掩盖）——ai3Locals 建模转正。
//   ②23 同刀转正：roll 条件 id 局部提取器原生复现（idPick=[6,25]+空门帧占位支摘除,
//   1 掷同拍;era guard 对拍 3 红复绿,_meta.batch5→batch6）。
// BJ484（2026-10-03）批6 名单扩宝箱怪同构支 341/473-476（BJ479 滚动清单出清）：亲读定谳
//   341 PresentMimic（HitEffect :89741-:89765 `int num718 = 196`）与 473-476 BigMimic 四系
//   共支（:89799-:89829 `int num726 = 31`）均为【常量 id 支,无 ai[3] 门】——hit=hitK50/
//   death=n20,gore 61/62/63 归 extract-gore.mjs（vanilla-gore.json L89756+/L89814+ 已备）。
//   纯数据走通用 emitStmt 路径（dust/hitK/n 全 std）,无需 idAi3/解释器新算子——★341 虽与
//   85/629 同族（aiStyle 25,mimicAI 恒段 1）但其 HitEffect 不读 ai[3],ai3 任意值尘恒 196;
//   473-476（aiStyle 87 bigMimicAI）同理恒 31。AI_087（:37845）零 Dust.NewDust=激活/俯冲
//   链无尘专项。
//
// 数据源：tools/extract-npcdust.mjs（Terarria1457/Terraria/NPC.cs HitEffect
// :82492-:90939 机械提取；1458 同区逐字节全等）。首批 = 78 门组 / 275 型（BJ254）；
// 批2 = 概率门族 15 型（134-136/262-265/407/409/410/411/428/478/516/636,BJ296）；
// 批3 = fadeIn 定谳翻案族 18 型（415-421/423-427/429/518/524-527,BJ304）；
// 批4 = 尘面收官 4 型（402/426/427/661,BJ327）；
// 批6 = 宝箱怪族 85/629（ai[3] 段位选尘）+23 手工条目转正（BJ479）+同构常量支
// 341/473-476（BJ484 名单扩,尘 196/31 无 ai[3] 门）；
// _meta.pending = 未接组滚动清单（根级门组:daybreak/gold-critter/ai[1]/netMode/
// IsShimmerVariant/TownPet/!wet/forStep/pos 派生/color 派生族;ai[3] 段位门已随批6 建模
// 出清,宝箱怪同构常量支已随 BJ484 出清）。
//
// 语义（对齐 Dust.NewDust :75-196 执行语义 + HitEffect 源序）：
//   · hit 相 count = ceil(dmg/lifeMax×hitK)（`for (num < dmg/(double)lifeMax*K)` 直译）；
//     death 相 = 固定 n；无 n/hitK = 1。
//   · ★掷序纪律（playbook 反伪影）：所有 Main.rand 掷与原版同拍同序——循环组逐拍走
//     body（先出尘后掷门/先掷门后出尘按源序）；分支单掷二选一（勿双掷）；pre 谓词在
//     掷前短路（life 判负→走 else 臂且不耗掷,与 C# && 短路同相）；alt/leaf 掷在 spawn
//     之后（post 形）。掷流通道 = Math.random（批1 alt 同源;测试侧 seededRandom 钉流）。
//   · hd = hitDirection（StrikeNPC 入参,调用侧恒 ±1；本仓由 kbx 符号蒸馏,0 兜 1）。
//   · alpha='npc' → npc.alpha（本仓 spawnAlpha）；color='npc' → npc.color（本仓
//     colorRGBA,null=default(Color)）；scale='npc' → npc.scale（本仓 vanillaScale）。
//   · pre 谓词（命中时点 hp=post-deduction,StrikeNPC :82206/:82213 life-=num 先于
//     HitEffect :82325——与原版 HitEffect 相位内 life 同相）：
//     lifeGtHalf = hp > floor(maxHp/2)（C# lifeMax/2 整除）；lifeLt0 = hp < 0（265
//     `life>=0 return`：life==0 拍原版不出尘）。
//   · posts 逐尘后置：ng/velMul/velDiv/scaleMul/scaleDiv/scaleSet/scaleSetNpc/
//     scaleAddR01（velMul/velDiv 对应 vanilla `velocity *= / /=`——先叠 NewDust 通用
//     ±2 抖动再乘除,由引擎 VanillaDust.spawn 侧保真,此处只做调用侧算子）。
//   · alt = `if (Main.rand.Next(K) op V) {posts} [else {posts}]` 逐尘掷骰直译
//     （59/60/151 尘 6 的 Next(8)!=0→noGravity 7/8、112/666 尘 18 的 Next(2)==0
//     → scale×0.6 否则 vel×1.4+noGravity）。
//   · anchor='center' → 盒顶左 = Center+(dx,dy)（372/373 中心±25 盒 50×50）。
//
// carve-out 不在本表/本模块：泼岩浆（BJ246 deathLavaSplash1457）、亡体 NewNPC 分裂链
// （母史莱姆/四柱/115 饿魂）、gore（vanilla-gore.json/GorePiece）、音效、135 探针生成。
import dustTableJson from '../data/vanilla-npcdust.json';
import type { Enemy } from './Enemy';
import type { GameHooks } from './types';

/** 尘色（0-255 域;★批4 661/clone 乘色为 float 半程值如 127.5——XNA Color×float 乘 RGBA
 *  四通道,本仓尘色域=float RGBA（LeashedCritter.ts:1577 White×0.5={127.5×4} 同源判例）） */
export interface NpcDustColor { r: number; g: number; b: number; a: number }

/** post 算子（提取器 compilePostStmts 直译） */
type DustOp =
  | ['ng', boolean]
  | ['velMul', number] | ['velDiv', number]
  | ['scaleMul', number] | ['scaleDiv', number]
  | ['scaleSet', number] | ['scaleSetNpc', number]
  | ['scaleAddR01']
  | ['fadeIn', number]   // ★BJ304 批3:原版生长目标语义（Dust.cs :2148-2171）,引擎侧老化 1:1
  | ['fadeInR01', number, number]   // ★批4 661:fadeIn = A + NextFloat()×span（1 掷）
  | ['fadeInMul', number]           // ★批4 661 clone 回声:fadeIn ×= k（0 掷）
  | ['noLight', boolean]            // ★批4 426/427:noLight=b（引擎光链 VanillaDust.ts :551 消费;0 掷）
  | ['posCircular']                 // ★批4 661:position=Center+NextVector2Circular(w,h)（2 掷:角+幅）
  | ['velFromCenter', number]       // ★批4 661:velocity=(position−Center)×k（0 掷派生）
  | ['colorSet', NpcDustColor]      // ★批4 661 clone 回声:color=new Color(...)×k（0 掷）
  | ['alpha', number];              // ★BJ503 519:alpha=N 后置直赋（NewDust alpha 入参同面,0 掷）

/** 谓词求值：pre=臂条件（判负→e 臂不掷）|gate=区域门（判负→整元素跳过）；均不耗掷 */
export type NpcDustPre = 'lifeGtHalf' | 'lifeLt0';

/** `if (Main.rand.Next(K) op V) {ifOps} else {elseOps}` 概率分支（逐尘掷骰） */
interface DustAlt {
  k: number; op: '==' | '!='; v: number;
  ifOps: DustOp[] | null; elseOps: DustOp[] | null;
}

export interface NpcDustStmt {
  dust: number;
  idRand?: number;         // dust = dust + Next(idRand) 逐尘掷 id（478：237/238）
  idPick?: number[];       // ★批4 426/427:dust = idPick[Next(len)] 带权掷表（Utils.SelectRandom 直译,重复项=权重;dust 字段=0 占位）
  idAi3?: { m: Record<number, number> };   // ★批6 BJ479 85/629:dust = ai[3]∈m ? m[ai3] : dust（段位选尘 0 掷,HitEffect :89766-89801;dust 字段=缺省=段 1）
  n?: number;              // 固定计数（缺省 1）
  hitK?: number;           // ceil(dmg/lifeMax×K)——hit 相专用
  gate?: NpcDustPre[];     // 区域门（phaseAfterPre 早退面）：判负→整 stmt 跳过,不耗掷
  anchor?: 'center';       // 盒锚：Center+(dx,dy) 为盒顶左（缺省=实体 position）
  pos?: 'oldPos';          // ★批4 402:盒顶左 = Enemy 轨迹环 hist[oldIdx] 绝对位（TrailingMode 环,oldIdx 由 over-oldPos 环绑定）
  dx?: number; dy?: number;
  w?: number; h?: number;  // 盒尺寸（缺省=实体 w/h）
  sx?: number | string; sy?: number | string;
  alpha?: number | 'npc';
  color?: NpcDustColor | 'npc';
  colorHsl?: { div: number; sat: number; lum: number; mul: number };   // ★批4 661:hslToRgb(fround(idx/div%1),sat,lum)×mul（彩虹色相环索循环 index）
  scale?: number | 'npc';
  posts?: DustOp[];
  clone?: { posts: DustOp[] };   // ★批4 661:CloneDust 回声（Dust.cs :260-288）——施于克隆尘的字段写
  alt?: DustAlt;
  line: number;            // HitEffect 源锚行（守卫/对账反查用,运行时不消费）
}

/** 语句级概率分支：`if (Main.rand.Next(K) op V) {t} [else {e}]`（单掷二选一；pre 先短路） */
export interface NpcDustBranch {
  pre?: NpcDustPre[];      // 臂条件（与 roll 同一 if）：判负→e 臂且不耗掷（&& 短路同相）
  gate?: NpcDustPre[];     // 区域门（早退面）：判负→整支跳过
  roll: { k: number; op: '==' | '!='; v: number };
  skip?: boolean;          // ★批4 402:continue 语义——roll 过且无 t 臂 → 跳过本轮余下 body（Next(4)!=0 continue）
  n?: number; hitK?: number;
  t?: NpcDustEl[];
  e?: NpcDustEl[];
  line: number;
}

/** 循环组：for 体多元素（逐拍按序走 body——掷流/出尘序与原版同相） */
export interface NpcDustLoop {
  n?: number; hitK?: number;
  over?: 'oldPos';         // ★批4 402:oldPos 轨迹环——len 拍逐 index 走 body（oldPos.Length=TrailCacheLength[型]）
  len?: number;            // 环长（NPCID.cs:4809,402=36;缺省 10）
  stride?: number;         // ★BJ503 519:index 步进（`num126 += 3` → oldPos[0,3,6,…]，缺省 1）
  body: NpcDustEl[];
  line?: number;
}

/** ★批4 402:oldPos 零位 break 标记——`if (oldPos[i]==Vector2.Zero) break;`（原版掷门【后】
 *  求值:越轨迹深度/零位 → 跳出所在 over-oldPos 环;余下臂体不出） */
export interface NpcDustBrk { brk: true; line: number }

export type NpcDustEl = NpcDustStmt | NpcDustBranch | NpcDustLoop | NpcDustBrk;

/** 掷流/环索上下文（逐拍同相核心）:idx=普通环计数器（colorHsl 色相源）,
 *  oldIdx=oldPos 环 index（pos='oldPos'/brk 消费）,brk/skip=控制流旗（环界捕获后清,不外泄） */
interface DustCtx { idx: number; oldIdx: number; brk: boolean; skip: boolean }

interface NpcDustPhase { hit?: NpcDustEl[]; death?: NpcDustEl[]; }

const DUST_TABLE = dustTableJson as unknown as Record<string, NpcDustPhase>;

/** spX/spY token 求值（提取器白名单直译;白名单外 token 表里不会有,兜 0） */
function resolveSpeed(v: number | string | undefined, hd: number, e: Enemy): number {
  if (v === undefined) return 0;
  if (typeof v === 'number') return v;
  switch (v) {
    case 'hd': return hd;
    case '2hd': return 2 * hd;
    case '2.5hd': return 2.5 * hd;
    case '1.5hd': return 1.5 * hd;
    case '6hd': return 6 * hd;
    case '-1hd': return -hd;
    case '-1.5hd': return -1.5 * hd;
    case 'velX': return e.vx;
    case 'velY': return e.vy;
    case 'negVelX*0.2': return -e.vx * 0.2;
    case 'negVelY*0.2': return -e.vy * 0.2;
    case 'velX*0.2': return e.vx * 0.2;
    case 'velY*0.2': return e.vy * 0.2;
  }
  return 0;
}

/** pre 谓词求值（命中/死亡时点 hp = post-deduction,与原版 HitEffect 相位内 life 同相） */
function prePass(pre: NpcDustPre[] | undefined, e: Enemy): boolean {
  if (!pre) return true;
  for (const p of pre) {
    if (p === 'lifeGtHalf' && !(e.hp > Math.floor(e.maxHp / 2))) return false;
    if (p === 'lifeLt0' && !(e.hp < 0)) return false;
  }
  return true;
}

/** C# Math.Round(double) = MidpointRounding.ToEven（银行家圆整）——hue2rgb 通道×255 的
 *  值域（hue=fround(k/100),k≤99 逐值核验）不含精确 .5 中点,按 1:1 纪律仍以 ToEven 实现 */
function roundToEven(x: number): number {
  const f = Math.floor(x);
  const d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

/** Main.hue2rgb（Main.cs :48720-:48736 直译,双精度全程,表达式序=原文左结合） */
function hue2rgb(c: number, t1: number, t2: number): number {
  if (c < 0) c += 1;
  if (c > 1) c -= 1;
  if (6 * c < 1) return t1 + (t2 - t1) * 6 * c;
  if (2 * c < 1) return t2;
  if (3 * c < 2) return t1 + (t2 - t1) * (2 / 3 - c) * 6;
  return t1;
}

/** Main.hslToRgb（Main.cs :48689-:48717 直译）——sat==0 灰档/其余 hue2rgb 三通道,
 *  (byte)Math.Round(c*255) ToEven;hue 调用侧已 fround（(float)numN/100f%1f float32 链） */
function npcHslToRgb(hue: number, sat: number, lum: number): NpcDustColor {
  let r: number, g: number, b: number;
  if (sat === 0) {
    r = g = b = roundToEven(lum * 255);
  } else {
    const t2 = lum < 0.5 ? lum * (1 + sat) : lum + sat - lum * sat;
    const t1 = 2 * lum - t2;
    r = roundToEven(hue2rgb(hue + 1 / 3, t1, t2) * 255);
    g = roundToEven(hue2rgb(hue, t1, t2) * 255);
    b = roundToEven(hue2rgb(hue - 1 / 3, t1, t2) * 255);
  }
  return { r, g, b, a: 255 };
}

/** 活尘对象面（spawnDust 返回 + cloneDust 返回共用;noLight/color/x/y 为批4 扩展消费位） */
interface LiveDust {
  x: number; y: number;
  noGravity: boolean; vx: number; vy: number; scale: number; fadeIn: number;
  noLight: boolean; color: NpcDustColor | null;
  alpha: number;           // ★BJ503 519:alpha post 算子（NewDust alpha 入参同面,VDust.alpha 在位 VanillaDust.ts:69）
}

/** post 算子应用（spawnDust/cloneDust 返回的活尘对象;池满 null 静默跳过=原版尘池语义） */
function applyOps(d: LiveDust, ops: DustOp[] | null | undefined, e: Enemy): void {
  if (!ops) return;
  for (const op of ops) {
    switch (op[0]) {
      case 'ng': d.noGravity = op[1]; break;
      case 'velMul': d.vx *= op[1]; d.vy *= op[1]; break;
      case 'velDiv': d.vx /= op[1]; d.vy /= op[1]; break;
      case 'scaleMul': d.scale *= op[1]; break;
      case 'scaleDiv': d.scale /= op[1]; break;
      case 'scaleSet': d.scale = op[1]; break;
      case 'scaleSetNpc': d.scale = op[1] * (e.vanillaScale ?? 1); break;
      case 'scaleAddR01': d.scale += Math.random(); break;   // vanilla `scale += Main.rand.NextFloat()`
      case 'fadeIn': d.fadeIn = op[1]; break;                // vanilla `dust.fadeIn = N`（生长目标,首拍引擎老化链消费）
      case 'fadeInR01': d.fadeIn = op[1] + Math.random() * op[2]; break;   // ★批4 661:`fadeIn = A + NextFloat()×span`
      case 'fadeInMul': d.fadeIn *= op[1]; break;            // ★批4 661 clone 回声 `fadeIn *= 0.85f`
      case 'noLight': d.noLight = op[1]; break;              // ★批4 426/427 `noLight = true`（引擎光链 :551 消费）
      case 'posCircular': {                                  // ★批4 661:Utils.cs:1301-1303 unit(θ)×(w,h)×NextFloat（2 掷:角+幅;Game.ts:42040 同源判例）
        const a = Math.random() * Math.PI * 2, m = Math.random();
        d.x = e.cx + Math.cos(a) * e.w * m;                  // 由 pos 位移承载:直写活尘位（下一算子 velFromCenter 读新位）
        d.y = e.cy + Math.sin(a) * e.h * m;
        break;
      }
      case 'velFromCenter': {                                // ★批4 661:velocity = (position − Center)×k（0 掷;posCircular 后求值）
        d.vx = (d.x - e.cx) * op[1];
        d.vy = (d.y - e.cy) * op[1];
        break;
      }
      case 'colorSet': d.color = { ...op[1] }; break;        // ★批4 661 clone 回声 `color = White×0.5`（float 域 127.5×4）
      case 'alpha': d.alpha = op[1]; break;                  // ★BJ503 519:`dz.alpha = N` 后置直赋（NewDust alpha 入参同面——d.alpha=N 同值同相,无内建后读）
    }
  }
}

/** 循环计数：hitK=ceil(dmg/lifeMax×K)（hit 相 dmg 直传）;death 相固定 n */
function countOf(el: { n?: number; hitK?: number }, dmg: number, e: Enemy): number {
  if (el.hitK != null) return Math.ceil((dmg / e.maxHp) * el.hitK);
  return el.n ?? 1;
}

/** 单语句发射（盒/参解析 + 逐尘掷骰分支） */
function emitStmt(e: Enemy, game: GameHooks, hd: number, st: NpcDustStmt, dmg: number, ctx: DustCtx): void {
  const w0 = st.w ?? e.w;
  const h0 = st.h ?? e.h;
  let x: number, y: number;
  if (st.pos === 'oldPos') {                            // ★批4 402:盒顶左 = 轨迹环 hist[oldIdx] 绝对位（原版 NewDust(oldPos[i],…))
    x = e.histXAt(ctx.oldIdx);
    y = e.histYAt(ctx.oldIdx);
  } else if (st.anchor === 'center') {
    x = e.cx + (st.dx ?? 0);
    y = e.cy + (st.dy ?? 0);
  } else {
    x = e.x + (st.dx ?? 0);
    y = e.y + (st.dy ?? 0);
  }
  const n = countOf(st, dmg, e);
  if (n <= 0) return;
  const alpha = st.alpha === 'npc' ? e.spawnAlpha : (st.alpha ?? 0);
  // ★批4 661:colorHsl 彩虹色（hue=循环 index 环索,(float)idx/div%1f float32 链→hslToRgb×mul）
  const color = st.colorHsl
    ? (() => { const c = npcHslToRgb(Math.fround(Math.fround(ctx.idx / st.colorHsl!.div) % 1), st.colorHsl.sat, st.colorHsl.lum);
        return { r: c.r * st.colorHsl!.mul, g: c.g * st.colorHsl!.mul, b: c.b * st.colorHsl!.mul, a: c.a * st.colorHsl!.mul }; })()
    : (st.color === 'npc'
      ? (e.colorRGBA ? { r: e.colorRGBA[0], g: e.colorRGBA[1], b: e.colorRGBA[2], a: e.colorRGBA[3] ?? 255 } : null)
      : (st.color ?? null));
  const scale = st.scale === 'npc' ? (e.vanillaScale ?? 1) : (st.scale ?? 1);
  const sx = resolveSpeed(st.sx, hd, e);
  const sy = resolveSpeed(st.sy, hd, e);
  if (!prePass(st.gate, e)) return;                     // 区域门：判负整 stmt 跳过（life==0 拍原版不出尘）
  for (let k = 0; k < n; k++) {
    // ★批4:idPick 带权掷表（Utils.SelectRandom<int> = choices[Next(len)],重复项=权重,逐尘 1 掷）
    // ★批6 BJ479:idAi3 段位选尘（85/629 宝箱怪,HitEffect :89778-89784）——m=段位覆写域,
    //   缺省 dust=段 1（ai[3]==1 或未锁拍;0 掷）。Enemy.ai3 由 mimicAI 生成时锁（BJ464,
    //   AI_025 :25684-25697;341/629 每 tick 强制 1 :25699-25701→629 恒段 1 恒尘 7）
    const dustId = st.idPick != null
      ? st.idPick[Math.floor(Math.random() * st.idPick.length)]
      : (st.idRand != null ? st.dust + Math.floor(Math.random() * st.idRand)
        : (st.idAi3 != null ? (st.idAi3.m[e.ai3 ?? 0] ?? st.dust) : st.dust));
    const d = game.spawnDust?.(x, y, w0, h0, dustId, sx, sy, alpha, color, scale);
    if (!d) continue;
    const dust = d as unknown as LiveDust;
    applyOps(dust, st.posts, e);
    if (st.alt) {
      const roll = Math.floor(Math.random() * st.alt.k);
      const pass = st.alt.op === '==' ? roll === st.alt.v : roll !== st.alt.v;
      applyOps(dust, pass ? st.alt.ifOps : st.alt.elseOps, e);
    }
    if (st.clone) {                                     // ★批4 661:CloneDust 回声（Dust.cs :260-288）——
      const c = game.cloneDust?.(d);                    // 原版 `numX != 6000` 守卫=spawn null 短路同面;
      if (c) applyOps(c as unknown as LiveDust, st.clone.posts, e);   // 回声掷流=引擎侧（CloneDust 内部 NewDust）
    }
  }
}

/** oldPos[i]==Vector2.Zero 判据:越轨迹深度（SetDefaults 全零环,UpdateTrails 逐位移入——
 *  填充前缀单调,首零位 = 深度界）或字面零位（原版 ==Zero 哨兵同义） */
function oldPosZero(e: Enemy, i: number): boolean {
  return e.historyDepth() <= i || (e.histXAt(i) === 0 && e.histYAt(i) === 0);
}

/** 元素发射（stmt|branch|loop|brk 统一入口；掷序=源序） */
function emitEl(e: Enemy, game: GameHooks, hd: number, el: NpcDustEl, dmg: number, ctx: DustCtx): void {
  if ('brk' in el) {                                    // ★批4 402:零位 break（原版掷门后求值——调用侧已在掷后）
    if (oldPosZero(e, ctx.oldIdx)) ctx.brk = true;
    return;
  }
  if ('body' in el) {
    if (el.over === 'oldPos') {                         // ★批4 402:oldPos 轨迹环——len 拍逐 index 走 body
      const len = el.len ?? 10;                         // （原版 oldPos.Length=TrailCacheLength[型],NPCID.cs:4809）
      const stride = el.stride ?? 1;                    // ★BJ503 519:`num126 += 3` 步进（index 0,3,6,…）
      const prevOld = ctx.oldIdx;
      for (let i = 0; i < len; i += stride) {
        ctx.oldIdx = i;
        ctx.brk = false; ctx.skip = false;
        for (const child of el.body) {
          emitEl(e, game, hd, child, dmg, ctx);
          if (ctx.brk || ctx.skip) break;
        }
        const brk = ctx.brk;                            // 旗捕获（仅环界清——brk/skip 不外泄外层环）
        ctx.brk = false; ctx.skip = false;
        if (brk) break;                                 // 原版 break:余下 index 不迭代（掷门不再耗）
        // skip → 原版 continue:余下 body 跳过,续走下一 index
      }
      ctx.oldIdx = prevOld;
      return;
    }
    const n = countOf(el, dmg, e);
    const prevIdx = ctx.idx;
    for (let k = 0; k < n; k++) {
      ctx.idx = k;                                      // ★批4 661:色相环索（colorHsl 读 ctx.idx）
      ctx.brk = false; ctx.skip = false;
      for (const child of el.body) {
        emitEl(e, game, hd, child, dmg, ctx);
        if (ctx.brk || ctx.skip) break;
      }
      const brk = ctx.brk;
      ctx.brk = false; ctx.skip = false;
      if (brk) break;
    }
    ctx.idx = prevIdx;
    return;
  }
  if ('roll' in el) {
    if (!prePass(el.gate, e)) return;                   // 区域门：判负整支跳过,不耗掷
    const n = countOf(el, dmg, e);
    const prevIdx = ctx.idx;                            // ★批4 661:branch 自带 hitK/n 环——色相环索绑定本环 k
    for (let k = 0; k < n; k++) {
      ctx.idx = k;
      if (!prePass(el.pre, e)) {                        // 臂条件判负：走 else 臂,不耗掷（&& 短路同相）
        if (el.e) {
          for (const child of el.e) {
            emitEl(e, game, hd, child, dmg, ctx);
            if (ctx.brk || ctx.skip) break;
          }
        }
        if (ctx.brk || ctx.skip) break;                 // ★批4:旗外传（不清——由所在环捕获）
        continue;
      }
      const roll = Math.floor(Math.random() * el.roll.k);
      const pass = el.roll.op === '==' ? roll === el.roll.v : roll !== el.roll.v;
      const arm = pass ? el.t : el.e;
      if (arm) {
        for (const child of arm) {
          emitEl(e, game, hd, child, dmg, ctx);
          if (ctx.brk || ctx.skip) break;
        }
        if (ctx.brk || ctx.skip) break;                 // ★批4:旗外传（不清——由所在环捕获）
      } else if (pass && el.skip) {
        ctx.skip = true;                                // ★批4 402:continue 语义——roll 过无 t 臂 → 跳过本轮余下 body
        break;
      }
    }
    ctx.idx = prevIdx;                                  // 环索恢复（外层 for 的 idx 语义不受内支扰动）
    return;
  }
  emitStmt(e, game, hd, el, dmg, ctx);
}

function applyPhase(e: Enemy, game: GameHooks, hd: number, phase: 'hit' | 'death', dmg: number): void {
  const rec = e.vanillaId != null ? DUST_TABLE[String(e.vanillaId)] : undefined;
  if (!rec) return;                     // 表外型 = 原版本相不出尘（结构锁见 bj254 测试）
  const els = rec[phase];
  if (!els) return;
  const ctx: DustCtx = { idx: 0, oldIdx: 0, brk: false, skip: false };
  for (const el of els) emitEl(e, game, hd, el, dmg, ctx);
}

/** 受击相（hurt() 实扣存活支,hitDirection=StrikeNPC 入参蒸馏,kbx 符号 0 兜 1） */
export function spawnNpcHitDust(e: Enemy, game: GameHooks, hd: number, dmg: number): void {
  applyPhase(e, game, hd, 'hit', dmg);
}

/** 死亡相（hurt() 死亡管线,HitEffect life<=0 支） */
export function spawnNpcDeathDust(e: Enemy, game: GameHooks, hd: number): void {
  applyPhase(e, game, hd, 'death', 0);
}
