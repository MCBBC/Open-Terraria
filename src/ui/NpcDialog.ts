// 原版 NPC 对话 UI(DOM 版):对话框(NPC 名 + 台词 + 选项按钮)+ 商店面板。
// 对照 1456:Player.SetTalkNPC(Player.cs:4180)→ Main.npcChatText/Main.DrawNPCChat;
// 按钮标签 = Lang.inter[](LegacyInterface):28 商店 / 52 关闭 / 54 治疗 / 50 诅咒。
// 台词与商店内容在 Game 侧生成(NPC.GetChat / Chest.SetupShop 1:1),本文件纯渲染。
import { Lang } from '../i18n/Lang';
import { UISfx } from '../vui/UISfx';
import { options } from '../core/Options';
import type { DialoguePortraitPayload } from '../data/npcPortraits';
import { townNpcProfileSheet } from '../data/townNpcProfiles';
import { VANILLA_NPCS } from '../data/vanillaNpcs';
import portraitOffsetsJson from '../data/vanilla-portrait-offsets.json';

/** NPCPortraitsCloseUpOffsets / FullBodyRetroOffsets（NPCID.cs:4517/:4681 全量 40+21） */
const PORTRAIT_OFFSETS = portraitOffsetsJson as unknown as {
  closeUp: Record<string, [number, number]>;
  fullBodyRetro: Record<string, [number, number]>;
};

/** 面板底图 TextureAssets.ChatBack（AssetInitializer.cs:864,Images\Chat_Back,500×500） */
const CHAT_BACK = 'sprites/vanilla/Chat_Back.png';
/** 头像底框 TextureAssets.NpcPortraitBackground（AssetInitializer.cs:949,112×112） */
const PORTRAIT_WINDOW = 'sprites/vanilla/Portraits_Portrait_Window.png';
/** 城镇宠物名单（NPCID.Sets.IsTownPet = CreateBoolSet(637,638,656,670,678..684),NPCID.cs:4446） */
const PORTRAIT_PETS = [637, 638, 656, 670, 678, 679, 680, 681, 682, 683, 684];

/** 开场 hop 动作集（Main.DoNPCPortraitHop 触发面全表）：SetTalkNPC（Player.cs:4386）
 *  + Main.cs 六站（TavernkeepAdvice:40691/PartyGirlSwapMusic:40743/DoNurseHeal:40870/
 *  DoTaxCollector:40918/DoAnglerQuest:40956/DryadText_WorldPurityOrStardewValleyBit:40961）
 *  + NPCInteractions.cs Interact 体五站（StardewValleyBit:99/DryadPurification:121/
 *  GuideTip:217/ReportHappiness:310/RequestHome:332）。present 层以「按钮 id → 台词
 *  刷新」等价映射；happiness 走独立浮层不重建面板故不列入。普通刷新（如 plant）不 hop。 */
const HOP_BUTTONS: ReadonlySet<string> = new Set([
  'heal', 'collect', 'quest', 'advice', 'music', 'status', 'stardew', 'help', 'home',
]);

/** hop 关键帧 = Utils.EaseOutBounce（Utils.cs:354-366,BounceEaseOut(t,4,2) =
 *  1-(1-t)²·|sin(4πt)|）；Main.cs:41049-41055 偏移 = -56·0.25·(1-bounce(clamp(num,0,80)/80))
 *  = -14·(1-t)²·|sin(4πt)|,80 帧 ≈ 1.333s,窗从原位弹起再落定。 */
const HOP_KEYFRAMES = `@keyframes sw-npc-hop{${Array.from({ length: 41 }, (_, i) => {
  const t = i / 40;
  const off = -14 * (1 - t) * (1 - t) * Math.abs(Math.sin(t * 4 * Math.PI));
  return `${(t * 100).toFixed(2)}%{transform:translateY(${off.toFixed(3)}px)}`;
}).join('')}}`;
// 2026-08-30 对齐 NPCInteractions.Initialize 全注册表（:489-531）：新增
// shopDecor(画家装饰店 25) / help+craft(向导 22 GuideTip·GuideReverseCrafting)
// / music(派对女孩 208) / advice(酒馆老板 550 TavernkeepAdvice) / stardew(树妖
// Joja 净化独立按钮,ShowExclamation) / home(无家 NPC RequestHome,ShowExclamation)
export type NpcButtonId = 'shop' | 'shopDecor' | 'heal' | 'curse' | 'collect' | 'reforge'
  | 'hair' | 'quest' | 'plant' | 'happiness' | 'status' | 'help' | 'craft' | 'music'
  | 'advice' | 'stardew' | 'home' | 'pet' | 'close';

/** 心情报告条目（Game 侧已做 l10n 渲染的成品文案 + 价格乘子） */
export type NpcButtonMeta = { id: NpcButtonId; label: string; excl?: boolean; coins?: number };

/** NPC 对话框右下角物品（Main.npcChatCornerItem 三态模型）：
 *  >0 = 渔夫任务鱼图标（32px 帽缩放,悬停 tooltip,点击把 [i:id] 插聊天——
 *  DrawNPCChatBottomRightItem Main.cs:40480-40543）；-1 = RequestHome 态
 *  （原版画 EquipPage[5] 快捷图标开装备页,本仓无该单图资产不画,登记）；0 = 无。 */

export interface HappinessInfo {
  name: string;
  /** 逐条心情文案（TownNPCMood_<NPC>.<键> 渲染后） */
  lines: string[];
  /** 价格乘子（LimitAndRoundMultiplier 后 [0.75,1.5]） */
  priceMul: number;
}

/** 快乐度表情档位（Main.cs:41235-41237 NPCHappiness 贴图 4 帧：≤0.82 / ≤1 / ≤1.1 / 其余） */
export function happinessFace(priceMul: number): { face: string; cls: string } {
  if (priceMul <= 0.82) return { face: '😄', cls: 'best' };
  if (priceMul <= 1) return { face: '🙂', cls: 'good' };
  if (priceMul <= 1.1) return { face: '😐', cls: 'ok' };
  return { face: '😡', cls: 'bad' };
}

/** 价格百分比文案（Main.cs:41240 priceAdjustment.ToString("P0")） */
export function happinessPct(priceMul: number): string {
  return `${Math.round(priceMul * 100)}%`;
}

export interface ShopEntry {
  /** 本仓库 item key(vi_ 系) */
  key: string;
  /** 原版 item id(图标) */
  vanillaId: number;
  name: string;
  /** 铜币计价(item.value；勋章条目 = 勋章枚数) */
  price: number;
  /** 护卫勋章价（shopSpecialCurrency=DefenderMedals 条目；渲染走勋章文案，
   *  支付分流 Game.npcShopBuy 扣勋章——CustomCurrencyID.DefenderMedals 全链） */
  medal?: number;
  /** 卖回货架条目下标（Chest.AddItemToShop buyOnce 克隆；购买时回传 npcShopBuy
   *  区分常规货——同 vid 双行时 data-id 撞号，以此区分） */
  buyback?: number;
  /** 条目堆叠（SW-BJ22 2026-09-07：卖回克隆带 stack——Chest.AddItemToShop
   *  :658-663 克隆原 stack；常规货架条目原版恒 1（SetDefaults）缺省即可）。
   *  商品格位角标 + 悬停 tooltip 价格行 ×stack（Main.cs:20652 EstimateDisplayStack） */
  stack?: number;
  /** 条目词缀（卖回克隆带出——Item.Prefix :596-597 缩放后 value 随行；
   *  tooltip 词缀行 + 买回价 shopBuybackPriceOf 同源） */
  prefix?: number;
  iconUrl: string | null;
}

/** 商品格位悬停载荷（SW-BJ22 2026-09-07：vanilla 商品格悬停 = ItemSlot.MouseHover
 *  context 15（ItemSlot.cs:3170-3204，:3197-3201 置 Main.HoverItem.buy=true）→
 *  Main.MouseText 物品全文 tooltip + AddShopLines 买入价行；空格悬停无 tooltip
 *  （IsAir 早退）。null = 离开格位收起） */
export type ShopCellHover = {
  vid: number;
  stack: number;
  prefix?: number;
  buyback?: number;
} | null;

/** 勋章价格文案（CustomCurrencySingleCoin.GetPriceText :103-107：
 *  price + Language[Currency.DefenderMedals].ToLower()，色 (240,100,120)） */
export function medalPriceText(price: number): string {
  return `${price} ${Lang.text('Currency.DefenderMedals').toLowerCase()}`;
}

const CSS = `
/* ===== 对话面板（NPCChatPanel.cs:52-86 1:1：屏空间 top-center,500 宽,y=100）===== */
.sw-npc-dialog {
  position: fixed; left: calc(50% - 250px); top: 100px; width: 500px;
  z-index: 22; cursor: auto; user-select: none;
  font-family: "Fusion Pixel 12px", "Microsoft YaHei", sans-serif; color: #e8e8f4;
  /* ★sw-root 是 pointer-events:none(防挡画布);原版面板矩形含鼠标即置 mouseInterface
     (NPCChatPanel.cs:81-84)→ 必须 auto:按钮可点 + 世界点击被吞 */
  pointer-events: auto;
}
/* Chat_Back 两段绘制（:71-72,反编译原文核读）：主体 = Draw(tex, TopLeft,
   source(0,0,500,rect.H-30))——★源高=目标高,1:1 原尺寸切【顶部 H-30 行】,
   零拉伸（曾误按「源(0,0,500,470)→H-30 纵向压缩」实现=整幅压扁:顶角 8 源 px
   弧被压成 ~1px 观感归方,侧壁纹路全部纵向压密,2026-09-14 用户报"顶角方"定谳）;
   底帽 = 源(0,470,500,30) 原尺寸 @ 底缘。乘色 (200,200,200,200)（:62）
   → opacity+brightness 各 200/255（XNA tint RGB×A 近似,预乘暗晕判例） */
.sw-npc-bg { position: absolute; inset: 0; overflow: hidden; pointer-events: none;
  /* 圆角兜底=贴图自带顶角弧半径 8 源 px（Chat_Back.png 实测:行 0-1 左缘 x=8,
     行 2-3 x=4,行 4-7 x=2,行 8 x=0;底帽行 499 同弧）——1:1 绘制下顶角/底帽
     圆角由贴图自带,border-radius 仅作裁切兜底,与底帽观感统一取 8px */
  border-radius: 8px; }
.sw-npc-bg img { position: absolute; left: 0; width: 500px; image-rendering: pixelated;
  opacity: 0.784; filter: brightness(0.784); }
.sw-npc-bg-body { position: absolute; left: 0; top: 0; width: 100%; height: 60px; overflow: hidden; }
.sw-npc-bg-body img { top: 0; height: 500px; }   /* 自然 500 高,主体盒(H-30)裁切=源顶 H-30 行 1:1 */
.sw-npc-bg-cap { position: absolute; left: 0; bottom: 0; width: 100%; height: 30px; overflow: hidden; }
.sw-npc-bg-cap img { top: -470px; height: 500px; }
/* 台词区（DrawText :217-237）：TopLeft+(20,20) 起,行距 30,换行宽 460,≤10 行
   （TextDisplayCache.cs:23 WordwrapString(...,460,10)）；色 = (mouseTextColor*2+255)/3
   灰呼吸（:63-64,190..255 脉冲 → 211..255,±1/帧 ≈ 2.167s 三角波）
   ★字号定谳（2026-09-15,Mouse_Text.xnb 逐字形实测,源=用户本机 Steam 1.4.5.7
   Terraria.app/Content/Fonts/Mouse_Text.xnb,LZX 解包后按 DynamicSpriteFont
   二进制布局解析,Combat_Text/Item_Stack 已知 JSON 交叉校验）：MouseText 1.0
   lineSpacing=29（行盒）,中文全块字形 17-19px('你'19/'好'17/'的'18/'泰'18,
   推进入 17-19)——任务预判 15-16px 系按拉丁大写(15-16px)折算,而 Fusion
   Pixel 的 cap/em 比(0.75)远小于 MouseText 的(~0.93),中文台词应以 CJK 墨高
   对齐:Fusion Pixel 12px 在 19px 档墨高实测 17.4px(∈17-19,典型 18)、推进
   19px vs 原版 18.5 → 460px 换行 24 字/行 ≙ 原版 ~25,行数同相;18px 档墨高
   16.5 偏小 7%、20px 档推进 20 换行密度漂 2 字/行,均弃。13px 旧钉值中文仅
   12px 墨高=明显偏小（用户实报"文字偏小"）,且 460px 换行 35 字/行 → 行数
   塌缩 → 面板 90 vs 原版 120（过扁根因,头像"偏上"观感同源） */
.sw-npc-chat { position: absolute; left: 20px; top: 20px; width: 460px; line-height: 30px;
  font-size: 19px; max-height: 300px; overflow: hidden; white-space: pre-wrap;
  animation: sw-chat-pulse 2.1667s linear infinite alternate; }
@keyframes sw-chat-pulse { from { color: rgb(211,211,211); } to { color: rgb(255,255,255); } }
/* 头像窗（Main.DrawNPCPortrait :41031）：窗中心 P = 面板左上角 + (-62,+62)，悬在面板
   左外侧。★定谳（2026-09-15 逐字复核 1457:41031 与 1458:41037,两版字节同式）：
   int num2 = 56; Vector2 vector = npcChatTopLeft + new Vector2(-num2 - 6, num2 + 6);
   ——调用点 NPCChatPanel.cs:79 传 rectangle.TopLeft(),公式中【没有面板高项】,
   窗心恒钉 面板顶+62（仅 num6 首帧 hop 有 -56·0.25·(1-bounce) 纵向瞬时偏移）。
   用户报"头像偏上"根因=台词字号过小致行数塌缩(面板 90 vs 原版 120)——窗卡
   112 高在扁面板上顶缘贴 panel+6 观感似"挂高";字号修后 H=120,窗心 162 ≈
   面板中心 160(±4),与原版同相。本容器 = P-(100,100) 起 200×200（Detailed
   200×200 原尺寸直绘域）；Portrait_Window 112×112 底框 @ P-(56,56)
   （:41069,chatBack 染色）；名字 = ItemStack 字体白字 @ P+(0,57) 中心锚
   （:41145-41149；Item_Stack.xnb 实测 lineSpacing=24,中文全块 14-16px('人'15/
   '你'16) → Fusion 16px 档墨高 14.7 ≙ 15px 钉值）。
   hop = 首帧 EaseOutBounce 80 帧（:41049-41055,HOP_KEYFRAMES）；容器不接指针
   （原版 mouseInterface 只按面板矩形 :81-84,头像域点击透传世界） */
.sw-npc-portrait-wrap { position: absolute; left: -162px; top: -38px; width: 200px; height: 200px;
  pointer-events: none; }
.sw-npc-portrait-wrap.sw-portrait-hop { animation: sw-npc-hop 1.3333s linear; }
.sw-npc-window { position: absolute; left: 44px; top: 44px; width: 112px; height: 112px;
  image-rendering: pixelated; opacity: 0.784; filter: brightness(0.784); }
.sw-npc-portrait { position: absolute; left: 0; top: 0; image-rendering: pixelated; }
.sw-npc-pname { position: absolute; left: 100px; top: 157px; transform: translate(-50%, -50%);
  color: #fff; font-size: 16px; white-space: nowrap; text-shadow: 1px 1px 0 #000; }
/* 按钮行（DrawButtons :93-135）：锚 = 面板底左角 + (30, -22n+max(0,2(n-1))-4)；
   行高 22 / 列距 30 / 4 列换行（:97/:103-107/:135）；文字基准缩放 0.9（:96,
   MouseText 0.9 ≙ 19px 台词档×0.9=17.1 → 17px 钉值）悬停 1.2 + 影 Black→Brown
   （:119-121）；正文色 = (b,b/1.1,b/2,b) b=mouseTextColor 琥珀棕脉冲（:102）。
   命中盒 = 压缩后文本宽（:118） */
.sw-npc-btns { position: absolute; left: 30px; }
.sw-npc-btn { position: absolute; height: 22px; line-height: 22px; padding: 0; margin: 0;
  background: none; border: none; outline: none; cursor: pointer; font-family: inherit;
  font-size: 17px; white-space: nowrap;
  text-shadow: 1px 1px 0 #000;
  animation: sw-btn-pulse 2.1667s linear infinite alternate; }
/* ★RB28-F3(2026-09-14) 绘制/命中解耦:悬停缩放只作用文字绘制,承载于内层
   .sw-npc-btn-t(pointer-events:none);外层 button 本体【零 transform】=命中盒恒为
   压缩文本矩形(:117-118 flag=rectangle.Contains,原版命中面不随悬停放大)。旧实现
   :hover transform 直接在 button 上=命中盒 24→32px 扩张,右缘外/行向邻钮域被劫走。
   悬停绘制几何不变:translateX(-15%)+scale(1.3333) = :120-125(1.2/0.9 基准换算
   +左扩补偿 0.15×压缩宽),仅载体从 button 移至 span */
.sw-npc-btn:hover { text-shadow: 1px 1px 0 rgb(139,69,19); }   /* Color.Brown :119-121 */
@keyframes sw-btn-pulse { from { color: rgb(190,172,95); } to { color: rgb(255,231,127); } }
/* 内层 span 载体:--cx=压缩系数(>260 时 TS 置 260/自然宽,≙ num5 :113-115;未压缩=1)、
   --hx=悬停左扩补偿(:124-125 =压缩宽×15%,span 版面宽=未压缩自然宽,TS 按
   15%×压缩宽/自然宽换算成百分比;未压缩=15%)。transform 先绕 left center 缩放再
   左移 = 原版 vector3.X-=0.15×宽 + origin(0,h/2) × scale(1.2·num5)(:120-125) */
.sw-npc-btn-t { display: inline-block; transform-origin: left center; pointer-events: none;
  transform: scaleX(var(--cx, 1)); }
.sw-npc-btn:hover .sw-npc-btn-t {
  transform: translateX(calc(-1 * var(--hx, 15%))) scale(calc(var(--cx, 1) * 1.3333)); }
/* 金币条（TryAddCoins → ItemSlot.DrawMoney @ (rect.X-45,rect.Y-44) 后 rect.X+=106
   :140-144 → 按钮相对 (-151,-44)；原版计数文本 = ItemStack 0.75 缩放
   （ItemSlot.cs:3679-3680,数字字形 10-15px×0.75 ≈ 7.5-11.25px）→ 11px 钉值保持） */
.sw-npc-coins { position: absolute; left: -151px; top: -44px; color: #ffd76e;
  font-size: 11px; white-space: nowrap; text-shadow: 1px 1px 0 #000; pointer-events: none; }
/* 感叹号（:136-139 文字右 +8px,锚行中,不入命中盒；亮度脉冲 Utils.cs:448）
   ★RB28-F3:原版命中矩形=:117-118 文字宽,图标悬在盒外——pointer-events:none
   使其不入命中面（旧实现可点=命中盒右缘恒 +14px,与悬停扩张同族) */
.sw-npc-excl { position: absolute; left: 100%; margin-left: 8px; top: 50%;
  transform: translateY(-50%); width: 6px; height: 16px; image-rendering: pixelated;
  pointer-events: none;
  animation: sw-excl-pulse 1s linear infinite; }
@keyframes sw-excl-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
/* 右下角物品（DrawNPCChatBottomRightItem Main.cs:40480-40543：>0=bottomRight-8、
   -1=bottomRight-12,origin=帧右下,最长边≤32） */
.sw-corner-item { position: absolute; width: 30px; height: 30px; right: 8px; bottom: 8px;
  image-rendering: pixelated; cursor: pointer; filter: drop-shadow(0 0 3px rgba(0,0,0,.7)); }
.sw-corner-equip { width: 26px; height: 26px; right: 12px; bottom: 12px; }
/* 窄屏/触屏：整体等比缩（内部几何不变；旧 max-width:94vw 压宽会撕 460 换行宽,登记适配） */
@media (max-width: 620px), (pointer: coarse) {
  .sw-npc-dialog { transform: scale(0.68); transform-origin: 50% 0; }
}
@media (max-width: 420px) {
  .sw-npc-dialog { transform: scale(0.52); transform-origin: 50% 0; } }
.sw-npc-shop {
  position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: 520px; max-width: 94vw; z-index: 23; cursor: auto;
  pointer-events: auto; /* 同上:sw-root 穿透关闭,子面板须显式开启 */
  background: linear-gradient(160deg, #2b3664, #1c2444);
  border: 2px solid #7d92d6; border-radius: 6px; padding: 12px 14px; color: #e8e8f4;
  font-family: "Fusion Pixel 12px", "Microsoft YaHei", sans-serif;
  box-shadow: 0 8px 40px rgba(0,0,0,.6);
}
.sw-shop-title { text-align: center; color: #ffe8a0; font-size: 15px; margin-bottom: 8px; }
.sw-shop-coins { text-align: right; color: #ffd76e; font-size: 13px; margin-bottom: 6px; }
.sw-shop-medals { color: #f06478; margin-left: 8px; }   /* 勋章持有（CurrencyTextColor 240,100,120） */
/* SW-BJ22 2026-09-07 货架网格（Main.cs:42522-42532 10×4=40 格 0.755 缩放观感；
   空格 = 售卖放置区,光标持非币物左键整叠卖出 ItemSlot.cs:1435-1438/:1195-1212） */
.sw-shop-grid { display: grid; grid-template-columns: repeat(10, 42px); gap: 5px;
  justify-content: center; margin: 2px 0 6px; }
.sw-shop-item {
  position: relative; width: 42px; height: 42px; padding: 0;
  display: flex; align-items: center; justify-content: center;
  background: #232c52; border: 1px solid #3a4680; border-radius: 4px;
  cursor: pointer;
}
.sw-shop-item:hover { background: #3d4c8f; border-color: #6a80d0; }
.sw-shop-item.poor { opacity: 0.45; cursor: default; }
.sw-shop-item img { width: 30px; height: 30px; image-rendering: pixelated; }
.sw-shop-ph { width: 30px; height: 30px; display: inline-block; }
.sw-shop-stack { position: absolute; right: 2px; bottom: 0; font-size: 11px; color: #fff;
  text-shadow: 1px 1px 0 #000; pointer-events: none; }
.sw-shop-empty { width: 42px; height: 42px; background: #1a2140;
  border: 1px solid #2c3768; border-radius: 4px; }
.sw-shop-empty:hover { border-color: #4a5aa0; background: #20294e; }
.sw-shop-happy { display: flex; align-items: center; gap: 6px; margin-left: 10px;
  font-size: 13px; color: #e8e8f4; }
.sw-shop-happy.best { color: #7dff8a; }
.sw-shop-happy.good { color: #d7ffe0; }
.sw-shop-happy.ok { color: #ffe8a0; }
.sw-shop-happy.bad { color: #ff8a7d; }
.sw-happy-panel {
  position: fixed; left: 50%; bottom: 200px; transform: translateX(-50%);
  width: 520px; max-width: 94vw; z-index: 23; cursor: auto;
  pointer-events: auto; /* 同 sw-npc-dialog：sw-root 穿透关闭，子面板须显式开启 */
  background: linear-gradient(160deg, #2b3664, #1c2444);
  border: 2px solid #7d92d6; border-radius: 6px; padding: 12px 14px; color: #e8e8f4;
  font-family: "Fusion Pixel 12px", "Microsoft YaHei", sans-serif;
  box-shadow: 0 8px 40px rgba(0,0,0,.6);
}
.sw-happy-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.sw-happy-title { color: #ffe8a0; font-size: 15px; flex: 1;
  text-shadow: 1px 1px 0 #000, -1px -1px 0 #000; }
.sw-happy-price { font-size: 15px; }
.sw-happy-price.best { color: #7dff8a; }
.sw-happy-price.good { color: #d7ffe0; }
.sw-happy-price.ok { color: #ffe8a0; }
.sw-happy-price.bad { color: #ff8a7d; }
.sw-happy-list { display: flex; flex-direction: column; gap: 6px; max-height: 40vh; overflow-y: auto;
  background: #1a2140; border: 1px solid #3a4680; border-radius: 4px; padding: 8px 10px; }
.sw-happy-line { font-size: 13px; line-height: 1.6; }
.sw-happy-line::before { content: "• "; color: #7d92d6; }
.sw-happy-foot { display: flex; justify-content: flex-end; margin-top: 10px; }
`;

/** 铜币计价格式化(原版 = Main.ValueToCoins,货币名走 Currency.* 官译;
 *  旧硬编码"金/银/铜"他语言不可译) */
export function formatCopper(v: number): string {
  return Lang.valueToCoins(v);
}

export class NpcDialog {
  private panel: HTMLElement | null = null;
  private escHandler: ((e: KeyboardEvent) => void) | null = null;
  /** hop 闩：九个 hop 动作按钮点击置位（HOP_BUTTONS），下一次 open() 消费重播
   *  EaseOutBounce（原版 hop 面 = SetTalkNPC + Interact 体,普通刷新不 hop） */
  private hopPending = false;

  constructor(private parent: HTMLElement, private onButton: (id: NpcButtonId) => void,
    private onCornerItem?: (vid: number) => void) {
    if (!document.getElementById('sw-npc-style')) {
      const style = document.createElement('style');
      style.id = 'sw-npc-style';
      style.textContent = `${CSS}\n${HOP_KEYFRAMES}`;
      document.head.appendChild(style);
    }
  }

  /** 打开对话框:name=NPC 名(GivenOrTypeName),chat=台词,buttons=选项(原版 Lang.inter 标签);
   *  cornerItem: >0=渔夫任务鱼角标(url/name 由 UI 注入) / -1=RequestHome 态 →
   *  DisplaySlots_5 快捷图标点击开背包(Main.cs:40516-40543) / 缺省不画 */
  open(name: string, chat: string, buttons: NpcButtonMeta[], portrait?: DialoguePortraitPayload | null,
    vanillaId?: number, corner?: { vid: number; url: string; name: string }) {
    const wasOpen = this.panel !== null;
    this.close();
    // hop 门（D5 修）：原版 hop 只在 SetTalkNPC（open-from-closed 等价）与九个
    // Interact 动作（HOP_BUTTONS 置 pending）；普通台词刷新（help 之外的 plant 等
    // 非 hop 动作）重建面板不重播
    const hop = !wasOpen || this.hopPending;
    this.hopPending = false;
    const panel = document.createElement('div');
    panel.className = 'sw-npc-dialog';
    // 头像（Main.DrawNPCPortrait Main.cs:41012-41150 四模式消费 + Portrait_Window 底框
    // :41069）：无 provider(url=null) 或 Disabled = 单点早退（:41015/:41020）——
    // 连底框也不画。名字行从面板标题迁入窗内（:41145-41149）。
    const mode = options.data.dialoguePortraitMode;
    const portraitOn = !!portrait && !!portrait.url && mode !== 'disabled';
    const portraitHtml = portraitOn
      ? `<div class="sw-npc-portrait-wrap${hop ? ' sw-portrait-hop' : ''}">`
        + `<img class="sw-npc-window" src="${PORTRAIT_WINDOW}" alt="" draggable="false">`
        + `<canvas class="sw-npc-portrait" width="200" height="200"></canvas>`
        + `<div class="sw-npc-pname">${name}</div></div>`
      : '';
    // 角落：>0=渔夫任务鱼(32 帽缩放 :40486-40492,悬停 tooltip :40514)；-1=RequestHome
    // 态 EquipPage[5] 快捷图标(bottomRight-12 :40518，悬停叠[7]金染 OurFavoriteColor
    // :40530-40539；点击=关对话+OpenInventory+EquipPageSelected=1)
    const cornerHtml = corner
      ? (corner.vid > 0
        ? `<img class="sw-corner-item" data-corner="${corner.vid}" src="${corner.url}" title="${corner.name}" alt="" draggable="false">`
        : `<img class="sw-corner-item sw-corner-equip" data-corner="-1" src="sprites/vanilla-ui/UI_DisplaySlots_5.png" alt="" draggable="false">`)
      : '';
    panel.innerHTML = `<div class="sw-npc-bg" aria-hidden="true">`
      + `<div class="sw-npc-bg-body"><img src="${CHAT_BACK}" alt="" draggable="false"></div>`
      + `<div class="sw-npc-bg-cap"><img src="${CHAT_BACK}" alt="" draggable="false"></div></div>`
      + `${portraitHtml}<div class="sw-npc-chat">${chat}</div><div class="sw-npc-btns"></div>${cornerHtml}`;
    // —— 按钮行（DrawButtons :93-135）：先建节点入层；几何/测量在入 DOM 后做
    // （面板未挂载时 scrollHeight/offsetWidth 全 0——首版在此测出 1 行假行数）——
    const layer = panel.querySelector<HTMLElement>('.sw-npc-btns')!;
    const created: Array<{ btn: HTMLButtonElement; meta: NpcButtonMeta; w: number }> = [];
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sw-npc-btn';
      btn.dataset.b = b.id;
      btn.innerHTML = `<span class="sw-npc-btn-t">${b.label}</span>`
        + (b.excl ? '<img class="sw-npc-excl" src="sprites/vanilla-ui/UI_quickicon1.png" alt="!" draggable="false">' : '');
      if ((b.coins ?? 0) > 0) {
        // 金币条挂按钮自身（审查 P1 回归锚——曾插容器顶层落最左）：原版
        // DrawMoney @ (rect.X-45,rect.Y-44) 后 rect.X+=106（:140-144）→ 按钮相对 (-151,-44)
        const tag = document.createElement('span');
        tag.className = 'sw-npc-coins';
        tag.textContent = formatCopper(b.coins!);
        btn.appendChild(tag);
      }
      layer.appendChild(btn);
      created.push({ btn, meta: b, w: 0 });
    }
    // 渔夫任务鱼角标：点击把 [i:vid] 物品标签送进聊天输入框（AddChatText 等价；
    // 悬停改名已在 title 注入，:40498-40513 光标形变略）。-1 态=装备页快捷图标：
    // 悬停叠 DisplaySlots_7 金染、点击走 onCornerItem(-1)（UI 侧关对话+开背包）
    const cornerImg = panel.querySelector<HTMLImageElement>('img.sw-corner-item');
    if (cornerImg) {
      if (Number(cornerImg.dataset.corner) === -1) {
        cornerImg.title = Lang.text('UI.NPCHousing');
        cornerImg.addEventListener('mouseenter', () => { cornerImg.src = 'sprites/vanilla-ui/UI_DisplaySlots_7.png'; });
        cornerImg.addEventListener('mouseleave', () => { cornerImg.src = 'sprites/vanilla-ui/UI_DisplaySlots_5.png'; });
      }
      cornerImg.addEventListener('click', () => {
        UISfx.click();
        this.onCornerItem?.(Number(cornerImg.dataset.corner));
      });
    }
    created.forEach(({ btn, meta }) => {
      btn.addEventListener('mouseenter', () => UISfx.hover());   // :157-161 悬停音效
      btn.addEventListener('mouseleave', () => UISfx.hover());   //   = 进/出双边沿(_lastHovered)
      // 激活接线（与旧实现等价单发）：历史锚 = click（npc-dialog-integration §一）;
      // 兼容探针直驱 dispatchEvent(mousedown)（_fx19c 全 DOM 链）——armed 闩保证
      // 同一次按压 mousedown+click 只发一次。Game 层无双触：Input.ts window mousedown
      // 对 isDomUiTarget(.sw-root 子树)直 return（不会置 mouseDown）。
      let armed = false;
      const fire = () => {
        UISfx.click(); // 原版对话按钮 MenuTick(id 12)
        if (HOP_BUTTONS.has(meta.id)) this.hopPending = true;    // Interact 体 DoNPCPortraitHop
        this.onButton(meta.id);
      };
      btn.addEventListener('mousedown', (e) => {
        if ((e as MouseEvent).button !== 0) return;
        armed = true;
        fire();
      });
      btn.addEventListener('click', () => {
        if (armed) { armed = false; return; }   // 本次按压已在 mousedown 沿发过
        fire();
      });
    });
    this.parent.appendChild(panel);
    this.panel = panel;
    // —— 面板几何（NPCChatPanel.cs:62-72）：H = 30 + 30·行数 + 30·按钮行数 +
    // max(0,2·(按钮行数-1))；行数按本仓字体实测（pre-wrap 460px 换行,≤10 行封顶 =
    // WordwrapString(...,460,10) 等价；超行以 max-height 整行截断）。
    // ★必须在入 DOM 后测量（未挂载元素无布局）——
    const chatEl = panel.querySelector<HTMLElement>('.sw-npc-chat')!;
    const lines = Math.max(1, Math.min(10, Math.round(chatEl.scrollHeight / 30)));
    chatEl.style.maxHeight = `${lines * 30}px`;
    const btnRows = Math.ceil(buttons.length / 4);   // AllowedInteractionsPerLine=4(:30/:175)
    const panelH = 30 + 30 * lines
      + (btnRows > 0 ? 30 * btnRows + Math.max(0, 2 * (btnRows - 1)) : 0);
    panel.style.height = `${panelH}px`;
    const bodyDiv = panel.querySelector<HTMLElement>('.sw-npc-bg-body');
    if (bodyDiv) bodyDiv.style.height = `${panelH - 30}px`;   // 主体盒 = H-30,贴图 1:1 顶部裁切(CSS 定高 500,零拉伸)
    // —— 按钮行定位：锚 = 底左角 + (30,-22n+max(0,2(n-1))-4)；文本行按钮逐个
    // 绝对定位：X 累进 压缩宽+30,:103-107 num%4 换行 ——
    layer.style.top = `${panelH - 22 * btnRows + Math.max(0, 2 * (btnRows - 1)) - 4}px`;
    for (const c of created) {
      // 超 260 横向压缩（:113-115 num5=260/stringSize.X）——命中盒=压缩后宽(:117)
      // ★RB28-F3:压缩/悬停缩放一律走内层 span 的 CSS 变量,button 本体零 transform
      // =命中盒恒宽。--hx 把原版「压缩宽×15%」悬停左扩补偿(:124-125)换算成 span
      // 版面宽(=未压缩 w0)百分比:15%×c.w/w0——span 的 translateX 百分比按自身
      // 未压缩宽解析,直接写 -15% 在压缩钮上会过量左移
      const w0 = c.btn.offsetWidth;
      c.w = w0;
      if (w0 > 260) { c.w = 260; c.btn.style.width = '260px'; }
      const t = c.btn.querySelector<HTMLElement>('.sw-npc-btn-t');
      if (t && w0 > 0) {
        t.style.setProperty('--cx', (c.w / w0).toFixed(4));
        t.style.setProperty('--hx', `${((15 * c.w) / w0).toFixed(3)}%`);
      }
    }
    let cursorX = 0;
    created.forEach(({ btn, meta, w }, i) => {
      if (i % 4 === 0) cursorX = 0;                       // :103-107 换行复位
      if ((meta.coins ?? 0) > 0) cursorX += 106;          // :144 金币占位推进
      btn.style.left = `${cursorX}px`;
      btn.style.top = `${Math.floor(i / 4) * 22}px`;      // 行高 22（:97）
      cursorX += w + 30;                                  // :135 列距 30
    });
    if (portraitOn) this.drawPortrait(panel.querySelector('canvas.sw-npc-portrait') as HTMLCanvasElement | null, portrait!);
    // Esc 优先序对齐 Player.cs:4960-5025 ToggleInv：talkNPC≥0 时 Esc 只关对话、
    // 不落背包/暂停链——捕获阶段拦截截胡其余 window 监听（main.ts Inventory 链）
    this.escHandler = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        // ★聊天框开着时原版语义 = Esc 先收聊天（Player.cs chatMode 前置消费）——
        // 不让位则「点任务鱼插签→按 Esc」会关对话留聊天（审查 P1）
        if ((window as unknown as { __swGame?: { chatInput?: { isOpen?: boolean } } }).__swGame?.chatInput?.isOpen) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        this.onButton('close');
      }
    };
    window.addEventListener('keydown', this.escHandler, true);
  }

  /** 头像绘制（Main.DrawNPCPortrait Main.cs:41012-41150 四模式；画布 200×200，
   *  canvas-local 坐标以窗中心 P=(100,100)）：
   *  Detailed = 200×200 原尺寸直绘中心=P（:41073；贴图自带 alpha 留白成圆框设计——
   *             旧 alpha 包围盒 cover 画法随矩形框退役,D1 已修）;
   *  CloseUp  = 帧行 0 ×3（:41084）,帧底=碰撞盒底+4（DrawNPCDirect 尾锚）,
   *             position=P+(-bw/2,48+num14)（:41085-41098）→ 帧中心 =
   *             P+(0,52+num14+bh)-fh·1.5;剪裁窗 96×146 @ P+(-48,-98)..P+(+48,+48)
   *             （:41109-41112,上越窗顶 42px）;宠物 num14=-20/num15=-36+((96-fw)/2/6)·6
   *             特支（:41086-41095）;偏移表 = dummy.position += value（UI px,不随缩放）;
   *  FullBodyRetro = ×2（:41127）,position=P+(-bw/2,48-bh)（:41126-41130）→ 帧底 =
   *             P.y+52,无剪裁（:41140,可越窗顶——本仓以 200×200 画布界近似）。 */
  private drawPortrait(canvas: HTMLCanvasElement | null, payload: DialoguePortraitPayload): void {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const mode = options.data.dialoguePortraitMode;
    // ---- CloseUp / FullBodyRetro：NPC 变体贴图行 0 直绘 ----
    if (mode === 'closeUp' || mode === 'fullBodyRetro') {
      const sheet = townNpcProfileSheet(payload.vanillaId, payload.shimmered ? 1 : 0,
        payload.altTexture ?? 0, payload.variationIndex ?? 0)
        ?? `vanilla/NPC_${payload.vanillaId}.png`;                    // 无 Profile 兜底(NPC_XX.png)
      const off = PORTRAIT_OFFSETS[mode][String(payload.vanillaId)] ?? [0, 0];
      const img = new Image();
      // 兜底：Profile 档缺失（解包缺口/未来新类型）→ NPC_<id> 竖条（行 0 全展，
        // 视觉近似 Retro 档）。★IMG-SELF-HEAL（2026-09-02 image-retry-audit 清偿）：
        // 面板一次性建绘，一次失败=整段对话缺头像（首访冷缓存窗口高危）——两段
        // URL 耗尽后按 1s/2s/4s 退避重试整链，TTL 10s 封顶（负缓存错误语义参照
        // ensureVImage TTL；超时后留空=与原版无资产不画同义）
      const urls = [sheet, `vanilla/NPC_${payload.vanillaId}.png`];
      const bornAt = Date.now();
      let seg = 0;
      let round = 0;
      const tryLoad = () => {
        img.onload = () => { paintSheet(); };
        img.onerror = () => {
          seg++;
          if (seg < urls.length) { img.src = `sprites/${urls[seg]}`; return; }
          const delay = 1000 * 2 ** round;
          round++;
          if (Date.now() - bornAt + delay <= 10_000) {
            setTimeout(() => { seg = 0; tryLoad(); }, delay);
          }
        };
        img.src = `sprites/${urls[seg]}`;
      };
      tryLoad();
      /** 行 0 直绘主体（onload 与兜底共用）：fh = 整条高/帧数
       *  （vanilla-npcs.json frames=Main.npcFrameCount;width/height=SetDefaults 碰撞盒） */
      const paintSheet = () => {
        const info = VANILLA_NPCS[String(payload.vanillaId)];
        const frames = info?.frames ?? 14;
        const fh = Math.max(1, Math.floor(img.naturalHeight / frames));
        const fw = img.naturalWidth;
        const bw = info?.width ?? 18;
        const bh = info?.height ?? 40;
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (mode === 'closeUp') {
          const s = 3;
          const isPet = PORTRAIT_PETS.includes(payload.vanillaId);
          const num14 = isPet ? -20 : 16;                             // :41083/:41088
          // :41090-41095（96−帧宽 ÷2 ÷6 ×6 整数序;帧宽单列=naturalWidth）
          const num15 = isPet
            ? -36 + Math.floor(Math.floor((96 - fw) / 2) / 6) * 6
            : -bw / 2;
          const cx = 100 + num15 + bw / 2 + off[0];                   // 帧水平中心=碰撞盒中心
          const cy = 100 + 52 + num14 + bh - (fh / 2) * s + off[1];   // 帧底=盒底+4
          ctx.save();
          ctx.beginPath();                                            // 剪裁窗 96×146（:41109-41112）
          ctx.rect(100 - 48, 100 - 98, 96, 146);
          ctx.clip();
          ctx.drawImage(img, 0, 0, fw, fh, cx - (fw * s) / 2, cy - (fh * s) / 2, fw * s, fh * s);
          ctx.restore();
        } else {
          const s = 2;
          const cx = 100 + off[0];
          const bottom = 100 + 52 + off[1];                           // 帧底 = P.y+52（盒底锚）
          ctx.drawImage(img, 0, 0, fw, fh, cx - (fw * s) / 2, bottom - fh * s, fw * s, fh * s);
        }
      };
      img.src = `sprites/${sheet}`;
      return;
    }
    // ---- Detailed：200×200 原尺寸直绘（中心=P,无剪裁 :41073）----
    const src = payload.url;
    if (!src) return;
    const img = new Image();
    img.onload = () => {
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = src;
  }

  close() {
    // ★capture 位必须对称（监听器身份含 capture——曾漏传=摘不掉=全局 Esc 被永久截胡：
    // 暂停/设置/聊天全哑到刷新页。审查 P0）
    if (this.escHandler) window.removeEventListener('keydown', this.escHandler, true);
    this.escHandler = null;
    this.panel?.remove();
    this.panel = null;
  }

  get isOpen(): boolean { return this.panel !== null; }
}

export class NpcShop {
  private panel: HTMLElement | null = null;
  private escHandler: ((e: KeyboardEvent) => void) | null = null;

  /** onBuy(vanillaId, buybackIndex?, bulk?)：buybackIndex = 卖回货架条目（buyOnce）
   *  下标（ItemSlot.HandleShopSlot :1925-1928 减库存），缺省 = 常规货；bulk = Shift
   *  批量买 10（CanBulkBuy ItemSlot.cs:2874-2881 ShiftInUse + GetBulkBuyAmount :2861-2870） */
  constructor(private parent: HTMLElement,
    private onBuy: (vanillaId: number, buybackIndex?: number, bulk?: boolean) => void,
    private onClose: () => void,
    private onCellHover?: (hover: ShopCellHover, anchor: HTMLElement | null) => void) {}

  open(title: string, items: ShopEntry[], copper: number, happinessPct?: number | null, medals?: number, medalsTotal?: number) {
    this.close();
    const panel = document.createElement('div');
    panel.className = 'sw-npc-shop';
    // 支付能力判定按条目币种分流：勋章条目比勋章持有全量（medalsTotal = BuyItem
    // 门口计数五仓 CustomCurrencyManager.cs:76-87,背包+随身银行;缺省回落 medals
    // 兼容旧调用形），铜币条目比铜币。头部数值 medals = 储蓄面（DrawSavings
    // bank-only :28-40）——SW-FX17 两域分立
    const afford = (it: ShopEntry): boolean =>
      it.medal !== undefined ? (medalsTotal ?? medals ?? 0) >= it.medal : copper >= it.price;
    // ★SW-BJ22 2026-09-07 原版形制货架网格（Main.cs:42522-42532：10×4=40 格，
    //  空格同样以 InventoryBack 底框绘制并可命中——空格即「售卖放置区」，光标
    //  持非币物左键 = 整叠卖出 PickItemMovementAction case 15 ItemSlot.cs:1435-1438
    //  → LeftClick case 4 :1195-1212）。有货格按货架序占位（常规货 + 卖回架尾接，
    //  Chest.AddItemToShop :658-663 落首空位语义同序）；余格全画空格。
    //  旧「名称+价格」行列表 = 自创呈现且无售卖区（用户实报），整格替换。
    const cells: string[] = [];
    for (let i = 0; i < 40; i++) {
      const it = items[i];
      if (!it) {
        cells.push(`<div class="sw-shop-empty" data-slot="${i}"></div>`);
        continue;
      }
      const ok = afford(it);
      cells.push(`
      <div class="sw-shop-item${ok ? '' : ' poor'}" data-id="${it.vanillaId}"${it.buyback !== undefined ? ` data-bb="${it.buyback}"` : ''} data-ok="${ok ? 1 : 0}"${it.prefix ? ` data-prefix="${it.prefix}"` : ''}>
        ${it.iconUrl ? `<img src="${it.iconUrl}">` : '<span class="sw-shop-ph"></span>'}
        ${it.stack && it.stack > 1 ? `<span class="sw-shop-stack">${it.stack}</span>` : ''}
      </div>`);
    }
    // 快乐度头部指示已摘（2026-08-27 用户要求：商店标题旁不再显示快乐度系数——
    // 快乐度详情仍走底部「快乐度」页签；原版 Main.cs:41231-41243 参考备案）
    // 勋章储蓄并列显示（CustomCurrencyManager.DrawSavings :28-63：双货币店在
    //  钱币行旁画勋章图标+数量，【只】合计 bank..bank4 储蓄——背包勋章不进此行；
    //  仅本店有勋章条目时传值。★SW-FX17 值域修正：旧版传持有全量=背包+四仓混淆）
    const medalLine = medals !== undefined
      ? ` <span class="sw-shop-medals">🏅 ×${medals}</span>` : '';
    panel.innerHTML = `
      <div class="sw-shop-title">${title}</div>
      <div class="sw-shop-coins">${formatCopper(copper)}${medalLine}</div>
      <div class="sw-shop-grid">${cells.join('')}</div>`;
    // ★SW-FX32 刀①（2026-09-11）Set-Back 钮退役：原版 Main.cs:42500-42532 商店段
    //  全文无关闭钮——关店 = Esc / 对话「关闭」钮 / 走远（closeNpcDialog →
    //  npcShopClose 等价面；UpdateOldNPCShop 1457:18387-18393/1458 同位/1456:18054
    //  ——★SW-RB14b 行号订正,旧注 18056-18064 系 1456 锚）。旧「Set-Back」钮=自创,撤。
    panel.querySelectorAll('.sw-shop-item').forEach((el) => {
      const cell = el as HTMLElement;
      cell.addEventListener('click', (ev) => {
        if (cell.dataset.ok !== '1') return;
        const bb = cell.dataset.bb;
        this.onBuy(Number(cell.dataset.id),
          bb !== undefined ? Number(bb) : undefined,
          (ev as MouseEvent).shiftKey || undefined);   // Shift+点 = 批量买 10
      });
      // 格位悬停 tooltip（MouseHover context 15 ItemSlot.cs:3170-3204 → Main.HoverItem
      //  → MouseText 全文 + AddShopLines 买入价行；价格取数走 Game 现值——重开刷新后
      //  闭包 entries 会陈旧，UI 侧回调现查 shopEntryPriceOf/shopBuybackPriceOf）
      if (this.onCellHover) {
        const bb = cell.dataset.bb;
        const prefix = cell.dataset.prefix;
        cell.addEventListener('mouseenter', () => this.onCellHover?.({
          vid: Number(cell.dataset.id),
          stack: 1,   // buyOnce 条目 EstimateDisplayStack=1（ItemSlot.cs:3155）、常规货架条目 stack 恒 1
          prefix: prefix !== undefined ? Number(prefix) : undefined,
          buyback: bb !== undefined ? Number(bb) : undefined,
        }, cell));
        cell.addEventListener('mouseleave', () => this.onCellHover?.(null, null));
      }
    });
    // Esc 关店（Player.cs:4960-5025 Esc 优先序——talkNPC 活跃时 Esc 只收对话链,
    //  对话关闭连带关店 closeNpcDialog → npcShopClose;此处 onClose 为浮面板直挂底）
    this.parent.appendChild(panel);
    this.panel = panel;
    this.escHandler = (e: KeyboardEvent) => { if (e.code === 'Escape') this.onClose(); };
    window.addEventListener('keydown', this.escHandler);
  }

  close() {
    // SW-BJ22：面板移除前收起格位 tooltip（Esc 关店时格上悬停态的气泡不残留）
    if (this.panel) this.onCellHover?.(null, null);
    if (this.escHandler) window.removeEventListener('keydown', this.escHandler);
    this.escHandler = null;
    this.panel?.remove();
    this.panel = null;
  }

  get isOpen(): boolean { return this.panel !== null; }

  /** 原地升级某商品行图标(开店时 iconUrl 一次成型的 miss 冻结问题,2026-08-13
   *  枚举 review):懒加载晚到由 UI 侧轮询驱动补图。无该行/已关店静默 */
  setRowIcon(vanillaId: number, url: string): void {
    const row = this.panel?.querySelector(`.sw-shop-item[data-id="${vanillaId}"]`);
    if (!row) return;
    const img = row.querySelector('img');
    if (img) { if (img.getAttribute('src') !== url) img.src = url; return; }
    const ph = row.querySelector('span');
    const el = document.createElement('img');
    el.src = url;
    if (ph && ph.tagName === 'SPAN') ph.replaceWith(el); else row.insertBefore(el, row.firstChild);
  }
}

/** NPC 快乐度详情浮层（ReportHappiness.Interact：NPCInteractions.cs:303-313）。
 *  原版点「快乐度」按钮后把 HappinessReport 整段写进 npcChatText + 头像弹跳；
 *  DOM 对话框台词区定高，此处等价为独立浮层逐条列出，并附价格倍率
 *  （Main.cs:41240 priceAdjustment.ToString("P0") 同口径）。 */
export class NpcHappinessPanel {
  private panel: HTMLElement | null = null;
  private escHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(private parent: HTMLElement, private onClose: () => void) {}

  open(info: HappinessInfo) {
    this.close();
    const face = happinessFace(info.priceMul);
    const panel = document.createElement('div');
    panel.className = 'sw-happy-panel';
    const rows = (info.lines.length ? info.lines : ['—'])
      .map((t) => `<div class="sw-happy-line">${t}</div>`).join('');
    panel.innerHTML = `
      <div class="sw-happy-head">
        <div class="sw-happy-title">${info.name}</div>
        <span class="sw-happy-price ${face.cls}">${face.face} ${happinessPct(info.priceMul)}</span>
      </div>
      <div class="sw-happy-list">${rows}</div>
      <div class="sw-happy-foot"><button class="sw-happy-close" style="background:#3a4680;color:#e8e8f4;border:1px solid #7d92d6;border-radius:4px;padding:5px 16px;cursor:pointer;font-family:inherit;">${Lang.inter(52)}</button></div>`;
    (panel.querySelector('.sw-happy-close') as HTMLElement).addEventListener('click', () => this.close());
    this.parent.appendChild(panel);
    this.panel = panel;
    // ★RB28-F2(2026-09-14) 定谳:下方 window 捕获 Esc 监听对本注释原称语义
    // （「只关浮层,不连带关背后对话框」）是【死码】——NpcDialog 自身 Esc 闩
    // （:423-435,同为 window capture）注册在先(浮层只能从对话按钮点开,对话
    // 闩必然先挂),同节点同相位按注册序派发,闩的 stopImmediatePropagation
    // 先行吞事件,本监听永不可达。Esc 实际语义 = 对话闩 → onButton('close')
    // → closeNpcDialog → ui.closeNpcDialog 对话+本浮层双收——与原版同相:
    // ReportHappiness(NPCInteractions.cs:303-313)把快乐度报告整段写进
    // npcChatText,原版无独立浮层,Esc 即整段关。故按原版同相原则【不改行为
    // 面】,仅更正本注释并登记脆弱点:若日后 NpcDialog Esc 闩被摘除/改序
    // （如物理 Esc 整体移交 main.ts 链）,本监听将原地复活并静默把 Esc 语义
    // 翻成「只关浮层」——届时须二选一:删除本监听或显式接正语义
    this.escHandler = (e: KeyboardEvent) => {
      if (e.code === 'Escape') { e.stopImmediatePropagation(); this.close(); }
    };
    window.addEventListener('keydown', this.escHandler, true);
  }

  close() {
    const had = this.panel !== null;   // 重开（open 首行 close）不触发回调
    if (this.escHandler) window.removeEventListener('keydown', this.escHandler, true);
    this.escHandler = null;
    this.panel?.remove();
    this.panel = null;
    if (had) this.onClose();
  }

  get isOpen(): boolean { return this.panel !== null; }
}
