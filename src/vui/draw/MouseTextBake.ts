// ★FX57 2026-09-16 MouseText 家族文本「离屏 12px 烘焙 + 最近邻放大」管线
// (InfoAccsLayer 信息行 + Renderer.drawMouseTextLayer 悬停标签共用)。
//
// 【根因】(用户 Windows 实报:信息栏灰字在背景越亮处越模糊,Mac 同症较轻):
//   CANVAS_MOUSETEXT_FONT 是 12px 网格像素字体,凡按非整数倍字号(14px 拍板档/
//   16px 折中档/19px 等值档)canvas fillText,文本光栅化**必然抗锯齿**
//   (imageSmoothingEnabled 只管 drawImage,管不了 fillText)→ 字形边缘出软灰
//   过渡像素;Windows(DirectWrite 灰度 AA)与 macOS(CoreText)的亚像素策略相异
//   把软边差异放大;灰字 rgb(100,100,100)(grayed 行)/α0.34 压暗行低对比 +
//   四向黑描边贴着软边 → 亮背景上整行发糊。原版 = MouseText 像素字体原生分辨率
//   直出,描边被实心字形吃净 = 锐利。
// 【修法】(像素艺术正道,渲染管线内动刀;行距 22/锚点/215 钳制/claim 序零漂移):
//   ① 以字体原生 12px(整 1×,原生网格上光栅化无缩放 ⇒ 覆盖率 0/1,零抗锯齿)
//     把整行文本(四向描边+字形)烘到离屏小画布;
//   ② 主画布 drawImage 放大至目标字号(imageSmoothingEnabled=false 最近邻)
//     ——像素字体的干净缩放,硬边跨平台字节同源(两端都 NN,无 AA 策略差);
//   ③ 颜色运行时染色:烘焙只出「黑剪影(描边+字形)+白字形 mask」两张位图,
//     彩色版 = mask 经 scratch 'source-in' 染色后叠画——mouseTextColor 脉动灰
//     (190↔255 三角波,Renderer.ts:13283)不进缓存键,缓存不炸;
//   ④ 压暗行(悬停行下一行 ×0.34)与灰字走同管线:α 在主画布 globalAlpha 施
//     (与旧直绘逐像素同式,描边+本体一起暗);
//   ⑤ 行缓存:键 = 行文本(字体族/字号档/描边档都是模块常量),LRU 上限 512
//     溢出即清(信息行/标签全是短串,常驻个位数)。★任务处方原为「文本+色+α
//     键控」——色/α 不进键是本实现的有意改进:色每帧脉动(③)、α 只有 1/0.34
//     两档且作用在主画布合成面,进键只会让缓存逐帧重建(等于没缓存)。
// 【布局零漂移】测宽/墨盒仍由调用侧用目标字号 measureText 出数(215 钳制、
//   图标 iy、19px 行盒近似全照旧);本模块按同源墨盒(actualBoundingBox)把
//   墨顶反推回旧 fillText 的落点——'middle' 锚 = 墨顶 ty−asc×scaleY,
//   'top' 锚 = 墨顶 anchorY−ascTop(ascTop 为 'top' 对齐点下的带符号墨盒)。
// 【降级】无 DOM(vitest node 环境跑渲染层桩测试)/字体未就绪(webfont 加载窗
//   口,同 FX35「每帧重绘自愈」语义)→ 返回 false,调用侧回退旧直绘
//   (fillText 家族逐字节同旧)。模块顶层零 DOM 访问(node import 安全)。
//
// ★FX58 2026-09-18 HiDPI 档(用户 Mac Retina 实报:FX57 后信息栏「过于锐化」——
//   硬边感/描边锐利过度;Windows 同管线无恙)。机制定谳(scripts/_fx58-mac-sharpen.mjs
//   探针 2026-09-18 实测,dpr=2 + 主画布后备=逻辑分辨率 Renderer.resize:3299 +
//   index.html:47 canvas `image-rendering:pixelated`):FX57 文本要过【三连硬量化】
//   ——12px binarize(0/255 二值)→ 主画布 NN 12→14(非整倍率,1/2px 不规则游程)
//   → 元素 ×2 pixelated 硬拉伸;行带实测中间调像素=0(ramp=0)+硬边对=4345 ⇒
//   全链零灰度,×2 拉伸后=「过度锐化」。Windows dpr=1 无第三站故同管线无恙。
//   判别实测:A(NN) ramp=0/hard=4345/solid=3031;B(双线性 12→14)solid 塌至
//   34%(1 艺术像素笔画被 1.17× 双线性洗薄=FX57 Windows「糊」根因复演,否决);
//   C(旧直绘 fillText 14px AA,FX57 前参系)ramp=5985/solid=2384;
//   D(2× 超采样 28px 灰度烘焙 → 线性采样 ÷2 盒滤波 → 14px 逻辑 1:1 直出)
//   solid=2538(=A 的 84%,优于 C)/hard=492(=A 的 12%,软过渡落地)/ramp 有界。
// 【FX58 修法=平台档位化(单机制,按真实元素拉伸分档)】
//   · pixel 档(dpr<1.5,典型 Windows 100%/125%):FX57 管线逐字节不变——
//     12px 二值烘焙+NN。文字设备尺寸=逻辑尺寸时 AA 策略差(DirectWrite/CoreText)
//     才需要关在门外(二值化),此为 FX57 Windows 判定域,保持用户已拍板观感。
//   · hidpi 档(dpr≥1.5,Mac Retina/HiDPI):改走【原版采样语义】——vanilla
//     UI Begin null sampler=FNA 缺省 SamplerState.LinearClamp(Main.cs:41568
//     接口批/2870 DefaultSamplerState),spritefont 纹理=字体系统灰度 AA 光栅化,
//     线性采样绘制=平滑栅格。实现:2× 超采样(28px=TARGET×2)灰度烘焙(不
//     binarize),drawImage 线性采样 ÷2(2:1 双线性=精确 2×2 盒滤波,采样点落在
//     半纹素=亚像素 AA 噪声被盒平均滤净=比直绘 14px 更干净),14px 逻辑 1:1
//     落主画布(无再采样);元素 ×2 拉伸后=平滑 2×2 灰阶块=原版 HiDPI 观感,
//     不再是二值硬块。描边环=±2 逻辑 px(=旧直绘 ±2 字体像素/vanilla
//     DrawBorderStringFourWay Utils.cs:2633 同环;FX57 pixel 档 ±1 艺术格
//     配参不适用——那是原生格直出时代的环)。
//   · 跨平台一致性论证:同一管线同一公式,唯一自由度=烘焙档位,由【真实元素
//     拉伸率】(devicePixelRatio)驱动而非 OS 判定——同档位字节同源(pixel 档
//     二值确定性保留;hidpi 档 28px AA 经盒滤波后平台差只剩亚像素残余,与原版
//     spritefont 各平台各自光栅化同构)。字体族/字号档(14px 拍板)/布局/染色/
//     缓存结构零漂移;dpr 运行时变化(拖窗跨屏/浏览器缩放)由缓存键含档位自然
//     自愈(旧档条目 LRU 淘汰)。
// ★perf-textbake 2026-09-19 染色结果缓存(trace 实测头号热点:信息栏文字每帧重染色,
// drawBakedMouseText inclusive 8.37s/49.9s,其中 native blit 8.16s——贵在**每帧每行**:
// ①sil blit + ②tinted() 共享 scratch 重写(clearRect+drawImage+source-in fillRect)
// + ③tint blit,scratch 每帧被改写 ⇒ GPU 每帧每行重新上传纹理)。
// 【处方证伪→换机制锚】(铁律「先定谳,再动刀」;scripts/_ptc-composite-exact.mjs
//   2026-09-19 实机 Chrome 864 案例对拍矩阵):任务处方「sil+mask 预合成为单张最终图
//   → 命中单次 drawImage」**未过像素金标,不落刀**——两案机制性不等:
//   ① globalAlpha<1(压暗行 0.34)破缺 over 关联律:旧两 blit 对背景双重衰减
//     (1−gαS)(1−gαT),单图单 blit 只能 (1−g·α(T∘S));α=0.34/白底实测 maxD=57
//     (=255×(0.66−0.4356) 整),pixel 档二值域也破——任何单张预乘图都表达不出;
//   ② hidpi 档 alpha=1 仍不等:线性采样与 over 合成不可交换(先合成后采样 vs
//     先各自采样后合成,2×2 采样足迹内 mask/描边 α 协方差项),白底实测 maxD=64。
// 【本修=染色结果缓存】(两 blit 结构逐 op 保留 ⇒ 逐像素相等 by construction):
//   缓存「白 mask×color 染色结果」整张画布,键 = `regime|color|text`;命中 = 直接
//   drawImage(缓存染色图)——主画布 op 序与旧路径完全同形([sil blit, tint blit]),
//   仅 tint 源从「逐帧重写的共享 scratch」换成「稳定缓存画布」⇒ 消灭每帧重染色与
//   每帧纹理重上传,blit 数不变(2/行)。scratch 改为「移交制」:miss 时合成进
//   scratch,整张移交缓存(不拷贝);下轮 miss 从回收站(逐出画布再利用)或新分配
//   取 scratch——命中态零分配零 scratch 写。色进键:InfoAccs 三色恒定(#FFE745/
//   #646464/#e8e4f0)命中即定;悬停标签 mouseTextColor 脉动灰(190↔255 步进 1/帧,
//   TileShine.ts:120)逐帧 miss → 与旧路径同价合成(无回归),单文本 66 档灰循环
//   在 256 容量内收敛为全命中;LRU 逐出(逐帧重画的 InfoAccs 行恒 MRU 不逐)。
//   α/scaleX/scaleY 不进键(主画布 globalAlpha/drawImage 参数施,与旧同)。
// 【逃生门】?textbakecache=0 → tintSource 直通旧 tinted()(共享 scratch 逐帧重染,
//   与本修前逐字节同形)——回退通道保留至用户验收;亦是 A/B 对拍/像素金标开关。
// 【失效面】(全 grep 核对 2026-09-19):字形源 = "Fusion Pixel 12px"(UIFont.load
//   一次性注入,无换字体机制);资源包字体仅注册 SWRP:* 族(ResourcePackManager.ts:18
//   /:40-48),不覆盖本管线族名 ⇒ 换包不改字形;remaster(RemasterRuntime)换图集
//   贴图,本管线零贴图消费。仍按保守纪律挂 sw:remaster-applied 一并清两缓存
//   (BestiaryPanel.ts:64 同款先例;重烘/重染一帧内完成,无感)。字体就绪窗由
//   bake() fontReady() 门兜住(未就绪不产条目,无陈旧回退字形)。
// ★BJ276 2026-09-22 方案 B(用户拍板:信息栏文本=动态读数直绘,接受平滑质感换
//   取烘焙 churn 归零):InfoAccsLayer 信息行退役烘焙缓存——动态读数键每帧变→
//   逐帧 miss→逐帧烘焙+canvas 出生(实测行走态 ~88/s,LRU/willReadFrequently 只能
//   摊销不能根治),改走下方 drawDirectMouseText(fillText+四向描边直绘,原版逐帧
//   直绘 glyph 同思路)。本模块烘焙管线现役消费面=悬停标签(Renderer.drawMouseText
//   Layer:物品名/NPC 名/箱名/行标签——键在悬停目标间稳定=真静态面)保留全链;
//   直绘面与缓存零交互(零 canvas 出生/零缓存键/零 binarize)。
import { CANVAS_MOUSETEXT_FONT, PIXEL_FONT_FAMILY, PixelText } from './PixelText';

/** 字体原生网格(px)——Fusion Pixel 12px 的设计栅格 */
const BASE_PX = 12;
/** 目标字号档(自 CANVAS_MOUSETEXT_FONT 串首解析;14 拍板/16 折中/19 等值档均自适应) */
const TARGET_PX = (() => {
  const v = parseFloat(CANVAS_MOUSETEXT_FONT);
  return Number.isFinite(v) && v > 0 ? v : 14;
})();
/** 主画布最近邻放大倍率 = 目标字号 / 原生网格(pixel 档) */
const UPSCALE = TARGET_PX / BASE_PX;
/** ★FX58 HiDPI 档门限:devicePixelRatio ≥ 1.5 视为「元素将被非整倍硬拉伸」域
 *  (Mac Retina=2/Windows 150%=1.5;Windows 100%/125% 保持 pixel 档拍板观感) */
const HIDPI_MIN_DPR = 1.5;
/** ★FX58 hidpi 档超采样倍率:烘焙字号 = TARGET_PX×SS,绘制时线性采样 ÷SS */
const SS = 2;

type BakeRegime = 'pixel' | 'hidpi';
function currentRegime(): BakeRegime {
  const dpr = typeof devicePixelRatio !== 'undefined' && Number.isFinite(devicePixelRatio)
    ? devicePixelRatio : 1;
  return dpr >= HIDPI_MIN_DPR ? 'hidpi' : 'pixel';
}
/** 描边偏移(bake 像素,整数——原生网格上烘必须整格,否则烘焙本体就糊):
 *  ★pixel 档恒 1 艺术像素(=缩放后自动随档:14px 档 1.17px/19px 档 1.58px)。
 *  原版锚:Utils.DrawBorderStringFourWay(Utils.cs:2633)=四向 ±2 **字体像素**,
 *  而 FontAssets.MouseText scale 1 的笔画粗细 ≈2 字体像素(FX27:CJK 墨高 17-19)
 *  ⇒ 原版环:笔 = 1:1。本仓 12px 艺术格笔画=1 格 ⇒ 环=1 格同比。
 *  ★曾按旧直绘视觉粗细配 ±2 bake px(2×12/TARGET 四舍五入)——14px 档=2.33px 环
 *  压死 1.17px 笔画+1.17px 字距,邻字描边互吃(CJK 粘成墨团,_fx57 newblock 截图
 *  物证);像素管线须按艺术格配环,旧 ±2 是 AA 光栅时代的配参(FX35),偏离登记。
 *  ★FX58 hidpi 档环回到 ±2 逻辑 px(×SS=±4 subpx)——该档语义=原版线性采样
 *  (AA 光栅域),与 vanilla ±2 字体像素/旧直绘回退支(InfoAccsLayer/Renderer
 *  fillText ±2@14px)同环,不再是原生格直出时代的 ±1 艺术格配参。 */
const OUTLINE = 1;
/** hidpi 档描边偏移(bake subpx)= 2 逻辑 px × SS */
const OUTLINE_HIDPI = 2 * SS;
/** 烘焙字体串 = CANVAS_MOUSETEXT_FONT 的字号位换成档位烘焙字号(pixel=原生
 *  12px;hidpi=28px 超采样。家族表——含 monospace 兜底尾——单源照抄,缺字回退
 *  行为与旧直绘一致) */
const bakeFont = (px: number) => CANVAS_MOUSETEXT_FONT.replace(/^\s*\d+(?:\.\d+)?px/, `${px}px`);
const BAKE_FONT = bakeFont(BASE_PX);
const BAKE_FONT_HIDPI = bakeFont(TARGET_PX * SS);

interface BakedLine {
  /** 黑剪影(四向描边+字形,全 #000)——描边无色相,免染色直出 */
  sil: HTMLCanvasElement;
  /** 白字形(无描边)——运行时染色源(source-in scratch) */
  mask: HTMLCanvasElement;
  /** 画布尺寸(bake px;hidpi 档=28px subpx 格,绘制时 ÷SS 盒滤波到逻辑格) */
  w: number; h: number;
  /** 字形 pen 原点 x(bake px;四周留描边位) */
  padL: number;
  /** alphabetic 基线 y(bake px,整数——★非整数基线=烘焙本体半格 AA,前功尽弃) */
  baseY: number;
  /** 烘焙字号档墨盒(alphabetic 相对,measureText 同源):墨顶 = baseY−ascA */
  ascA: number;
  /** 烘焙字号档推进宽(kx 反推用) */
  w12: number;
  /** 本位图烘焙字号(px)——ky = TARGET_PX/px ×scaleY(pixel=12→×1.167,hidpi=28→×0.5) */
  px: number;
  /** 烘焙档位——主画布 smoothing 旗由此定(pixel=false NN/hidpi=true 线性采样) */
  regime: BakeRegime;
}

const cache = new Map<string, BakedLine>();
const CACHE_CAP = 512;

// ★BJ270 2026-09-22(Windows 丛林卡顿 trace 定谳;Trace-20260922T124932.json):
//   getImageData 全 trace self-time 头号热点 5.39s/16.1%,链 = Pse(binarize)←Pst(bake)
//   ←jge(drawBakedMouseText)←InfoAccsLayer.draw——信息栏/悬停行的**文本 churn**
//   (秒表 mph 整数读数/雷达敌怪计数随帧变)逐帧造新键 → 逐帧 miss → 每次烘焙
//   2 次 binarize=getImageData+putImageData。sil/mask 是 GPU 后备画布时
//   getImageData 强制 GPU→CPU 同步回读(实测单次 1-5ms 级)=风暴主体;
//   且满容量 `cache.clear()` 全清 = 静态行条目陪葬 → 下一帧全部行级联重烘
//   (150-400ms 级帧爆发物证,trace 前 9s rAF 间隙 >100ms×33 次)。
// 【刀1】pixel 档(hidpi 恒不走 binarize,不动)烘焙画布挂 willReadFrequently:
//   后备_store 转软件位图,getImageData=本域 memcpy,零 GPU 同步;fillText 光栅化
//   不经后备_store 类型改变(同 Skia 光栅器)⇒ binarize 输出逐位同=烘焙位图字节
//   同源。烘焙产物 bake 后内容不变,Chrome 按 canvas 内容版本缓存已上传 GPU 纹理
//   ⇒ 每帧 sil blit 不重传。先例:UI.ts:61烘焙画布 willReadFrequently。
// 【刀2】满容量从「全清」改「单条 LRU 逐出」+命中刷 recency(delete+set)——
//   静态行每帧命中恒 MRU 不被逐;churn 一次性键(读数值)落 LRU 头部被逐,
//   静态行不再级联重烘。tintCache 同款先例(本文件下方)。
/** ★刀1:烘焙位图 2D context 属性(pixel 档才走 binarize 读回;hidpi 档不传,
 *  字节面零变化)。显式注解 CanvasRenderingContext2DSettings——as const 字面量
 *  会使 getContext 的 '2d' 重载失配而落 string 回退重载(返回联合类型,TS2339) */
const BAKE_READBACK_ATTRS: CanvasRenderingContext2DSettings = { willReadFrequently: true };

let sharedCtxCache: CanvasRenderingContext2D | null = null;
function sharedCtx(): CanvasRenderingContext2D {
  if (!sharedCtxCache) {
    const c = document.createElement('canvas');
    c.width = 8; c.height = 8;
    sharedCtxCache = c.getContext('2d')!;
  }
  return sharedCtxCache;
}

/** 像素字体就绪态(UIFont.load 启动已 await;ready 旗未挂上时兜底同步查一次) */
function fontReady(): boolean {
  if (typeof document === 'undefined') return false;
  if (PixelText.ready) return true;
  try {
    return !!document.fonts && document.fonts.check(`${BASE_PX}px ${PIXEL_FONT_FAMILY}`);
  } catch {
    return false;
  }
}

function mkCanvas(w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  return cv;
}

/** 覆盖二值化(★FX57 实测锚定):12px 原生档 fillText 的真字形像素恒 α=255,亚像素
 *  误格微晕恒 α≤63(2026-09-16 headless Chrome 直方图实证:midMax=63,直方图
 *  bucket 0-3;14px 非整数档则 AA 铺满 2..242 全域=本修根因)。按 ≥128 多数覆盖
 *  阈值切齐 0/1——把光栅器的灰度 AA 策略差(Windows DirectWrite/macOS CoreText)
 *  关在门外 ⇒ 烘焙位图跨平台字节同源,NN 放大后仍二值(软边=0) */
function binarize(cv: HTMLCanvasElement): void {
  const c = cv.getContext('2d')!;
  const img = c.getImageData(0, 0, cv.width, cv.height);
  const d = img.data;
  for (let p = 3; p < d.length; p += 4) d[p] = d[p] >= 128 ? 255 : 0;
  c.putImageData(img, 0, 0);
}

/** 烘一行(键=档位+text;不可用(无 DOM/字体未就绪/零宽)→ null=调用侧回退直绘) */
function bake(text: string): BakedLine | null {
  if (!fontReady()) return null;
  const regime = currentRegime();
  const key = `${regime}:${text}`;
  const hit = cache.get(key);
  if (hit) {
    // ★BJ270 刀2:命中刷 recency(信息栏静态行每帧重画,恒 MRU;churn 一次性键
    //  落头部被逐,见 LRU 逐出注)——Map.get 不改迭代序,须 delete+set
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  // hidpi 档 = 2× 超采样:烘焙字号 28px、描边环 ±2 逻辑 px(=±4 subpx)、保灰度;
  // pixel 档 = FX57 原生 12px、环 ±1 艺术格、binarize 二值(跨平台确定性)。
  const hidpi = regime === 'hidpi';
  const bakePx = hidpi ? TARGET_PX * SS : BASE_PX;
  const outline = hidpi ? OUTLINE_HIDPI : OUTLINE;
  const bakeFontStr = hidpi ? BAKE_FONT_HIDPI : BAKE_FONT;
  const c = sharedCtx();
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';   // 整数基线直烘(★middle/top 对齐点可能落半格)
  c.font = bakeFontStr;
  const m = c.measureText(text);
  const w12 = m.width;
  if (!(w12 > 0) || !Number.isFinite(w12)) return null;
  const ascA = m.actualBoundingBoxAscent, descA = m.actualBoundingBoxDescent;
  const ascI = Number.isFinite(ascA) && ascA > 0 ? Math.ceil(ascA) : Math.ceil(bakePx * 0.85);
  const descI = Number.isFinite(descA) && descA > 0 ? Math.ceil(descA) : Math.ceil(bakePx * 0.25);
  const padL = outline + 1;
  const w = padL + Math.ceil(w12) + outline + 1;
  const baseY = outline + 1 + ascI;
  const h = baseY + descI + outline + 1;
  const sil = mkCanvas(w, h);
  // ★BJ270 刀1:pixel 档挂 willReadFrequently(binarize 读回走软件后备_store,
  //  消灭逐烘焙 GPU→CPU 同步回读;hidpi 档零读回,不传保持字节面零变化)
  const sc = sil.getContext('2d', hidpi ? undefined : BAKE_READBACK_ATTRS);
  if (!sc) return null;
  sc.textAlign = 'left';
  sc.textBaseline = 'alphabetic';
  sc.font = bakeFontStr;
  sc.fillStyle = '#000';
  for (const [ox, oy] of [[outline, 0], [-outline, 0], [0, outline], [0, -outline]]) {
    sc.fillText(text, padL + ox, baseY + oy);
  }
  sc.fillText(text, padL, baseY);   // 本体同入剪影(描边被实心字形吃净的原版观感)
  const mask = mkCanvas(w, h);
  const mc = mask.getContext('2d', hidpi ? undefined : BAKE_READBACK_ATTRS);
  if (!mc) return null;
  mc.textAlign = 'left';
  mc.textBaseline = 'alphabetic';
  mc.font = bakeFontStr;
  mc.fillStyle = '#fff';
  mc.fillText(text, padL, baseY);
  if (hidpi) {
    // ★FX58:保灰度(原版 spritefont=字体系统灰度 AA 光栅化,绘制线性采样)。
    // 平台 AA 策略差(DirectWrite/CoreText)在 28px 超采样+绘制期 ÷2 盒滤波后
    // 只剩亚像素残余——与原版 spritefont 各平台各自光栅化同构,不再是 1× 域的
    // 可见策略差(pixel 档二值化的存在理由,见 FX57 头注)。
  } else {
    binarize(sil);
    binarize(mask);
  }
  // ★BJ270 刀2:满容量单条 LRU 逐出(原 `cache.clear()` 全清=静态行陪葬级联重烘,
  //  trace 前 9s 帧爆发物证;churn 键为一次性读数串,恒居 Map 头部=最旧位)
  if (cache.size >= CACHE_CAP) {
    const oldestKey = cache.keys().next().value as string;
    cache.delete(oldestKey);
  }
  const line: BakedLine = { sil, mask, w, h, padL, baseY, ascA, w12, px: bakePx, regime };
  cache.set(key, line);
  return line;
}

/** 运行时染色 scratch(白 mask → source-in 单色;逃生门 ?textbakecache=0 直通本路径
 *  =本修前逐帧重染同形;缓存路径下 scratch 移交给缓存,见 tintSource) */
let tintScratch: HTMLCanvasElement | null = null;
function tinted(mask: HTMLCanvasElement, color: string): HTMLCanvasElement {
  if (!tintScratch) tintScratch = mkCanvas(mask.width, mask.height);
  if (tintScratch.width !== mask.width || tintScratch.height !== mask.height) {
    tintScratch.width = mask.width;   // 尺寸位赋值即清屏
    tintScratch.height = mask.height;
  }
  const c = tintScratch.getContext('2d')!;
  c.globalCompositeOperation = 'source-over';
  c.clearRect(0, 0, tintScratch.width, tintScratch.height);
  c.drawImage(mask, 0, 0);
  c.globalCompositeOperation = 'source-in';
  c.fillStyle = color;
  c.fillRect(0, 0, tintScratch.width, tintScratch.height);
  c.globalCompositeOperation = 'source-over';
  return tintScratch;
}

// ---------- ★perf-textbake 染色结果缓存(LRU 有界 + scratch 移交 + 回收站) ----------

/** 键 = `regime|color|text`(color 为 fillStyle 串,恒不含 '|';text 尾位可含任意字符)。
 *  mask 尺寸由 (regime,text) 唯一决定 ⇒ 键覆盖染色结果全部自由度 */
const tintCache = new Map<string, HTMLCanvasElement>();
/** 保守起步容量(协调纪律);信息行全亮+压暗行共享条目(α 走主画布不进键) */
const TINT_CACHE_CAP = 256;
/** 逐出画布回收站(防脉动灰悬停路径逐帧 alloc churn;同尺寸复用,异尺寸赋值重置) */
const tintPool: HTMLCanvasElement[] = [];
const TINT_POOL_CAP = 8;

/** 逃生门(?textbakecache=0 → 旧路径逐帧重染;惰性读一次,会话内稳定) */
let tintCacheOn: boolean | null = null;
function tintCacheEnabled(): boolean {
  if (tintCacheOn === null) {
    try {
      tintCacheOn = !(typeof location !== 'undefined'
        && new URLSearchParams(location.search).get('textbakecache') === '0');
    } catch {
      tintCacheOn = true;
    }
  }
  return tintCacheOn;
}

/** 取染色结果(★两 blit 结构保留:主画布 op 序与旧路径逐 op 同形 ⇒ 逐像素相等)。
 *  命中 = 直接返回缓存画布(零合成零分配);miss = 合成进 scratch 并整张移交缓存。 */
function tintSource(baked: BakedLine, text: string, color: string): HTMLCanvasElement {
  if (!tintCacheEnabled()) return tinted(baked.mask, color);
  const key = `${baked.regime}|${color}|${text}`;
  const hit = tintCache.get(key);
  if (hit && hit.width === baked.w && hit.height === baked.h) {
    // LRU recency 刷新(delete+set 移到 Map 尾 = 最近使用)。尺寸守卫=防御性
    // (同键 mask 尺寸由字体度量唯一决定,当前无变字体机制,见头注【失效面】)
    tintCache.delete(key);
    tintCache.set(key, hit);
    return hit;
  }
  // miss:scratch(上轮移交后为空 → 回收站复用或新分配;尺寸不合则赋值重置=清屏)
  const cv = tintScratch ?? tintPool.pop() ?? mkCanvas(baked.w, baked.h);
  tintScratch = null;
  if (cv.width !== baked.w || cv.height !== baked.h) {
    cv.width = baked.w;
    cv.height = baked.h;
  }
  const c = cv.getContext('2d')!;
  // op 序与旧 tinted() 逐 op 同形(source-in 染色)——产物字节同源
  c.globalCompositeOperation = 'source-over';
  c.clearRect(0, 0, baked.w, baked.h);
  c.drawImage(baked.mask, 0, 0);
  c.globalCompositeOperation = 'source-in';
  c.fillStyle = color;
  c.fillRect(0, 0, baked.w, baked.h);
  c.globalCompositeOperation = 'source-over';
  // 容量满:单条 LRU 逐出(逐帧重画的 InfoAccs 行恒 recency 刷新,不被逐)
  if (tintCache.size >= TINT_CACHE_CAP) {
    const oldestKey = tintCache.keys().next().value as string;
    const oldest = tintCache.get(oldestKey);
    tintCache.delete(oldestKey);
    if (oldest && tintPool.length < TINT_POOL_CAP) tintPool.push(oldest);
  }
  tintCache.set(key, cv);   // scratch 移交缓存
  return cv;
}

/** 失效钩子:remaster/资源包应用面(RemasterRuntime 'sw:remaster-applied')清全部
 *  文本烘焙缓存;测试同用。见头注【失效面】grep 核对。 */
export function clearMouseTextCaches(): void {
  cache.clear();
  tintCache.clear();
  tintPool.length = 0;
}
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('sw:remaster-applied', clearMouseTextCaches);
}

export interface BakedTextDrawOpts {
  /** 锚语义:'middle'=行盒中点(InfoAccs 行 ty,textBaseline='middle' 直绘同位)
   *  /'top'=em 顶(drawMouseTextLayer anchor,textBaseline='top' 直绘同位) */
  anchor: 'middle' | 'top';
  /** 正文色(fillStyle 串;描边恒黑) */
  color: string;
  /** 压暗行 α(主画布 globalAlpha,描边+正文一起暗;缺省 1) */
  alpha?: number;
  /** 行宽钳制缩放(InfoAccs 215px 钳制;缺省 1) */
  scaleX?: number;
  scaleY?: number;
}

/**
 * 画一行烘焙文本。返回 false = 烘焙不可用(无 DOM/字体未就绪),调用侧回退旧直绘。
 * 不触碰主画布文本状态(font/textAlign/textBaseline);变换只动
 * imageSmoothingEnabled(=false,最近邻)与 globalAlpha(alpha<1 时),save/restore 包裹。
 */
export function drawBakedMouseText(
  ctx: CanvasRenderingContext2D,
  text: string, anchorX: number, anchorY: number,
  opts: BakedTextDrawOpts,
): boolean {
  const baked = bake(text);
  if (!baked) return false;
  // 目标字号盒测(自有量测 ctx,不碰主画布状态;actualBoundingBox 相对
  // textBaseline 对齐点、正=向上,与调用侧直绘同源同式)
  const c = sharedCtx();
  c.font = CANVAS_MOUSETEXT_FONT;
  c.textAlign = 'left';
  c.textBaseline = opts.anchor;
  const mt = c.measureText(text);
  const wT = mt.width;
  if (!(wT > 0) || !Number.isFinite(wT)) return false;
  const inkUp = Number.isFinite(mt.actualBoundingBoxAscent) && mt.actualBoundingBoxAscent !== 0
    ? mt.actualBoundingBoxAscent
    : (opts.anchor === 'top' ? -2 : TARGET_PX * 0.55);
  const scaleX = opts.scaleX ?? 1, scaleY = opts.scaleY ?? 1;
  const alpha = opts.alpha ?? 1;
  // 横向:目标推进宽(钳制后)↔ bake 推进宽(测宽域微差吸收,总宽与旧直绘逐像素同)
  const kx = (wT * scaleX) / baked.w12;
  // 纵向:bake 字号档 → 目标字号(×压扁系数)——pixel 档 14/12=UPSCALE,hidpi 档
  // 14/28=÷SS(2× 超采样位图线性采样盒滤波到逻辑格,FX58)
  const ky = (TARGET_PX / baked.px) * scaleY;
  const inkTopMain = anchorY - inkUp * scaleY;       // 墨顶 = 旧 fillText 落点(头注【布局零漂移】)
  const dx = anchorX - baked.padL * kx;
  const dy = inkTopMain - (baked.baseY - baked.ascA) * ky;
  const dw = baked.w * kx, dh = baked.h * ky;
  ctx.save();
  // ★采样档:pixel=NN 二值放大(FX57);hidpi=线性采样(hidpi 位图 ÷SS 盒滤波
  // 到逻辑格 + 1:1 落主画布,FX58)——档位随 baked.regime(位图所烘档)非实时 dpr
  ctx.imageSmoothingEnabled = baked.regime === 'hidpi';
  if (alpha < 1) ctx.globalAlpha = alpha;
  ctx.drawImage(baked.sil, dx, dy, dw, dh);
  // ★perf-textbake:tint 源 = 染色结果缓存(命中零重染;逃生门 ?textbakecache=0 →
  //  旧共享 scratch 逐帧重染)。主画布 op 序 = [sil blit, tint blit] 与旧逐 op 同形。
  ctx.drawImage(tintSource(baked, text, opts.color), dx, dy, dw, dh);
  ctx.restore();
  return true;
}

// ---------- ★BJ276 2026-09-22 方案 B:动态读数直绘 ----------

export interface DirectTextDrawOpts {
  /** 锚语义与 BakedTextDrawOpts 同表:'middle'=行盒中点(InfoAccs 行 ty)/
   *  'top'=em 顶(drawMouseTextLayer 锚)——textBaseline 直绘同位 */
  anchor: 'middle' | 'top';
  /** 正文色(fillStyle 串;描边恒黑) */
  color: string;
  /** 压暗行 α(globalAlpha,描边+正文一起暗;缺省 1) */
  alpha?: number;
  /** 行宽钳制缩放(InfoAccs 215px 钳制;缺省 1) */
  scaleX?: number;
  scaleY?: number;
}

/**
 * 画一行【直绘】MouseText——方案 B 动态读数路径(信息栏读数行等逐帧变键的面)。
 * 与烘焙路径的分工见头注 ★BJ276:直绘与缓存零交互(零 canvas 出生/零缓存键),
 * 每帧 5 次 fillText(四向 ±2 黑描边 + 本体)= 原版 Utils.DrawBorderStringFourWay
 * (Utils.cs:2633 四向 ±2 字体像素)+ 逐帧直绘 glyph 同思路;观感 = 目标字号
 * fillText 的字体系统灰度 AA(平滑,用户已拍板接受——FX57 二值锐利仅在静态烘焙面
 * 保持)。op 序与 FX57 前/烘焙不可用回退支逐字节同形(InfoAccsLayer/Renderer
 * 两处旧直绘:translate+scale+globalAlpha → 4×'#000'±2 → 本体色)。
 * 不触碰主画布变换外状态;save/restore 包裹(font/textAlign/textBaseline/
 * globalAlpha 全部自钉,不依赖调用侧预置——旧回退支依赖外层 font/baseline,本
 * 函数显式设同值,净状态相同)。
 */
export function drawDirectMouseText(
  ctx: CanvasRenderingContext2D,
  text: string, anchorX: number, anchorY: number,
  opts: DirectTextDrawOpts,
): void {
  const scaleX = opts.scaleX ?? 1, scaleY = opts.scaleY ?? 1;
  const alpha = opts.alpha ?? 1;
  ctx.save();
  ctx.font = CANVAS_MOUSETEXT_FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = opts.anchor;
  ctx.translate(anchorX, anchorY);
  if (scaleX !== 1 || scaleY !== 1) ctx.scale(scaleX, scaleY);
  if (alpha < 1) ctx.globalAlpha = alpha;
  for (const [ox, oy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
    ctx.fillStyle = '#000';
    ctx.fillText(text, ox, oy);
  }
  ctx.fillStyle = opts.color;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/** 诊断面(探针 scripts/_fx57-text-bake.mjs、scripts/_fx58-mac-sharpen.mjs 用):
 *  缓存行数+管线常量+当前档位(★perf-textbake 增 tintCount/tintPool/逃生门态) */
export function bakeStats(): {
  count: number; outline: number; targetPx: number; upscale: number; regime: BakeRegime;
  tintCount: number; tintPool: number; tintCacheOn: boolean;
} {
  return {
    count: cache.size, outline: OUTLINE, targetPx: TARGET_PX, upscale: UPSCALE, regime: currentRegime(),
    tintCount: tintCache.size, tintPool: tintPool.length, tintCacheOn: tintCacheEnabled(),
  };
}
