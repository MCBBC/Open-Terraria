# 游戏内手机适配总方案(mobile-adaptation-plan)

> 定稿日期 2026-08-29 · 多代理脑暴评审产物 · **仅设计文档,尚未实施**
> 批准后动作:P0/P1/P2 分期开工单,本文档为唯一蓝本。
> 姊妹篇:菜单链路适配已落地(见 memory「菜单手机适配架构」,三断点/@media/`--cc-fit` 套路),本文只管**进入世界之后**的部分。

## 0. 背景与决策记录

- 项目现状:游戏内只有第一版触控层 `src/ui/MobileControls.ts`(344 行:固定摇杆+8 个玻璃拟态 emoji 按钮),世界触摸合成在 `core/Input.ts:99-154`(点击=左键/拖动=瞄准/长按≥400ms=右键脉冲)。"能玩",但离官方 Terraria 手机的操控水准差一层。
- 方法论:三个探索代理(输入链路 / UI 渲染体系 / 视口基建)+ 官方手游操控事实核查 + **三个流派独立脑暴**(A 官方手游复刻派 / B 输入架构统一派 / C UI 适配体验派)+ 交叉评审合并。
- 用户拍板(2026-08-28):
  1. **智能光标触屏默认开启**(Settings 可关);
  2. **按钮皮肤对齐原版官方手游风格**(去 emoji/去 backdrop-filter,原版像素素材+低透圆底);
  3. 本次仅交付本方案文档,实施另行分期启动。
- 铁律:**桌面 PC 逐像素不变**(`pointer:coarse` 判定为总闸);反编译源码标杆项目数据面零接触(atlas/item/npc 金标自然绿);l10n-audit 强制门照走。

## 1. 现状盘点结论

### 已有底座(可直接扩,质量合格)
| 资产 | 位置 | 说明 |
|---|---|---|
| 触控层 v1 | `ui/MobileControls.ts` | 固定摇杆(axis 死区映射 WASD)+跳跃/攻击⚔/智能光标/钩爪🪝/药水🧪/坐骑🐴/全屏⛶;玻璃拟态 CSS 零贴图;`isTouchDevice()` 会话缓存;`mobileUiScale()=0.7`(消费点 Renderer.ts:3619 资源条 / :13439 minimap / CaptureMode.ts:1091) |
| 世界触摸合成 | `core/Input.ts:99-154` | UI 白名单过滤、单指仲裁(worldTouchId)、touchstart→mouseDown/mouseHeld、拖动>12px 清长按窗、长按≥400ms∧位移<12px→rightDown |
| 注入协议 | Input.touchKeys / mouseDown/mouseHeld/rightDown/mouseX,Y | 虚拟控件层=第四个输入生产者,消费链全复用桌面语义 |
| 进世界汇聚点 | `mainFlow.ts:193-197` enterGame 建 MobileControls;quitToMenu 有 destroy 样板 | 新触屏功能挂这里 |
| 性能自救链 | RSCALE_RUNGS [1,.75,.66,.5]+gfxQuality+GPU/rAF 双熔断 | 手机端再加"移动默认档"策略即可 |
| 存储/settings | OptionsData 平铺(KvStore `sandboxworld.options`);Settings 有 slider()/modeRow() 工厂 | 加 'touch' 类目成本低 |
| 键位抽象 | `core/Keybinds.ts`:action 表+bindsOf/isBound/actionsForCode 反查(:101-117)+重绑 UI | action 是一等公民的基础设施已在 |
| 防误触基建 | canvas touch-action:none(index.html:36)、overscroll-behavior:none、user-scalable=no、viewport-fit=cover、.sw-root pointer-events:none 架构(UI.ts:276) | touch-action 故意不在 #game-root(祖先链交集会废菜单滚动,index.html:31-34 注释) |

### 十大缺口(方案正面处理)
1. **keydownHandlers 只吃真实 KeyboardEvent**(`Input.ts:52`;Game.ts:3358-3470 十七族动作+main.ts:263-311 Esc 态机)——虚拟键不可达切快捷栏/开背包/开地图等边沿动作;
2. **touchKeys 写死物理 code**,不跟用户重绑(`Input.ts:169-171` 自认债);
3. **tap 吞边沿竞态**:touch 的 mouseDown 起止可落在两个 fixedTick 之间被整个吞掉(Input.ts:122/:149;桌面 mousedown 有 OS 保序,触摸没有);
4. **单指模型丢弃次指**(Input.ts:117):无 pinch 缩放、无双击识别,无法并行移动+瞄准;
5. **UI 白名单两份漂移**:mousedown 门(:80)与 isUiTarget(:104-105)手工维护且内容不一致,漏登记=点击漏成挥剑(2026-08-28 商店案同族);
6. **游戏内零断点零缩放**:hotbar 52px×10+选中名 x=236 在 iPhone 竖屏(~390px)必溢出;options.uiScale 是死代码(UIScale 只服务 vui 菜单域);
7. **hotbar 双写坐标**:CSS 与 JS inline(refreshHotbar 每 ~40ms 重写,UI.ts:3950-3985)并存,改布局必踩错位;
8. **safe-area 只有 MobileControls 用了**:hotbar/buff/canvas HUD 全没接 env(),刘海直顶;
9. **hover 型信息全面失效**:tooltip(showTooltipFor 单出口)、InfoAccs 名、配方行 hover 预览节流门;
10. **皮肤与画风割裂**:emoji+backdrop-filter 玻璃拟态,低端机性能热点。
另发现两个现存 bug 顺根治:GPU 熔断重建后 `cm.input` 快照失灵(main.ts:235-237);resize 无 debounce(backbuffer 抖动风险)。

## 2. 方案主体(六模块)

### 模块① 输入地基 —— core/Input.ts 增强(B 主刀)【P0】

```ts
// core/Input.ts 新增(node 纯逻辑可单测):
setVirtualCode(code: string, level: boolean): void;    // 兼容旧路径物理 code 电平
setVirtualAction(a: KeybindAction, level: boolean): void;
// ★电平走 action(virtualActions:Set<KeybindAction>)——downAction(a)= bindsOf 任意 source.has || virtualActions.has(a),重绑即时跟随
pressVirtual(v: string /* code | action */, mods?: Partial<Pick<KeyEventLite,'shiftKey'|'altKey'|'ctrlKey'|'metaKey'>>): boolean;
// ★边沿,副作用序固定:1 写电平 → 2 keydownHandlers.forEach(KeyEventLite) → 3 onKeyEvent(code,true)(录制免费收录)
releaseVirtual(v): void;   tapVirtual(v, mods?): boolean;

export interface KeyEventLite {
  code: string; shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean;
  repeat: boolean;                       // virtual 恒 false
  origin: 'physical' | 'virtual';        // real-vs-synthetic 旗标
}
// keydownHandlers 回调签名 (code, e: KeyboardEvent)=>void 泛化为 KeyEventLite
// ——全仓 grep 仅 Game.ts:3427 一处直取 e.shiftKey(F1-F3 配装门),超集兼容,风险可控
blur(): void;   // 现 :63-68 抽公开函数:清 keys/touchKeys/vkeys/virtualActions/virtualOrigin
```

配套四件:
- **Esc 链提取**:main.ts:263-311 window 监听整体搬家为 `createEscapeChain(deps).handle(code, prevent)`(函数体一行不改地搬);物理路径照旧调它;Game 侧薄 handler 把 `pressVirtual('Escape')` 转调同链。NpcDialog 等 ~18 处面板 escHandler 本期不动(P2 EscResolver 收编,控制爆炸半径)。
- **白名单合一**:`core/input/domTargets.ts` 导出单一数组常量(取现有两份**并集**:`.sw-root,.sw-panel,.sw-slot,.sw-recipe,.sw-btn,.sw-chatbox,.sw-mobile,.sw-hotbar,.sw-tooltip,.sw-ach-panel,.sw-res-panel,.sw-drag-ghost`),Input.ts:80 与 :104 共读;新 DOM 触摸层一律挂 `.sw-mobile` 子树别起新根。`.sw-mobile` 桌面不可见,并集不影响 PC。
- **pendingUseEdge 记账**(修 tap 吞边沿):世界触摸 touchstart 记旗,下一 fixedTick 无条件兑现一次 use 边沿并清旗(mouseDown/mouseHeld 电平照旧供 hold);P1 pinch 上线时该窗口兼作仲裁期——判 pinch 则撤销未兑现 tap 再清旗。
- **防环三例**(写入注释+单测):只有 pressVirtual/releaseVirtual 产生边沿(setVirtual* 只产电平,幂等不派发);同一 code 真实事件抢占虚拟电平、真实 up 若 virtualOrigin.has(code) 忽略(摇杆还按着不被物理松键拔电平);行为录制回放恒 origin='virtual',永不触发未来可能出现的 isTrusted 式消费点(AudioGate.ts:45-49 先例已拒收合成事件——**禁止 window.dispatchEvent(new KeyboardEvent()) 合成方案**:isTrusted=false+window capture 18 处监听双冒烟+preventDefault 语义丢失)。
- **现 bug 顺手根治**:熔断重建迁移链(Game.ts:3270-3282)同步刷新 `cm.input`(main.ts:235-237 持久快照导致拍照模式输入半瘫)。

### 模块② MobileControls v2 —— 操控层(A 规格为主)【P0 核心 / P1 打磨】

**摇杆(浮动为默认)**
- 浮动热区:`x∈[0, 0.46W], y∈[0.42H, H]`(含 safe-area 底部内缩)任意触点即盘心;盘心钳制 `cx∈[safeL+66, 热区右缘-40], cy∈[热区顶+50, H-safeB-66]`。固定档含义=仅底盘外扩 40px 内受理,其余交回世界触摸层(Settings 二档,模块⑤字段)。
- **回滞数值**(修"碎步":现 apply 用单阈值 0.35 反复 add/delete,MobileControls.ts:189-194):横轴触发 |nx|≥0.38 / 释放 <0.26;纵轴上 -0.62→-0.50 / 下 +0.62→+0.50;斜向抑制(|ny|≤0.62 ∧ |nx|≥0.38 时 W/S 不置位);行程 R=44px、死区 12px、`n=clamp((r-12)/32,0,1)` 线性映射。
- 视觉底盘 118px 沿用,idle 2s 淡出至 18% alpha 幽灵环(方位记忆)。注入改 `setVirtualAction('Left'/'Right'/'Up'/'Down'/'Jump')`+智能光标 `setVirtualAction('SmartCursor')`——**touchKeys 写死 code 技术债就此了结**。

**右簇弓形几何**(iPhone13 横屏 844×390 基准,right/bottom+各自 safe inset,拇指支点=右下角):

| 按钮 | (right,bottom) | ⌀ | 备注 |
|---|---|---|---|
| 攻击/使用 | (16,30) | 78 | ::before 隐形扩边至 96px hitbox(视觉不扩) |
| 跳跃 | (110,76) | 66 | 与攻击中心距 ≥96 防并指 |
| 钩爪 | (128,170) | 50 | 现状 46 违规纠正 |
| 智能光标 | (216,136) | 50 | tap 切换,`.on` 态 |
| 药水(QuickHeal 统一口) | (18,238) | 46 | 显隐扫描逻辑保留(refresh :320-343),顺手记药水 id 供钮面 sprite |
| 坐骑/宠物聚合 | (74,238) | 44 | tap=坐骑;长按 600ms=宠物召唤收回 |

全部按钮 ≥44pt;**操控层不吃 mobileUiScale**(0.7 会把 46px 压到违规尺寸),改 CSS 变量 `--mbtn-scale`(0.8–1.3 默认 1)/`--mbtn-alpha`(0.35–1 默认 0.82)由 Settings 直灌。
左侧**不做跳钮**(官方 Jump 就在右簇,"左手只管走"是肌肉记忆基础;单手持机又走又跳承认无解,靠横竖提示引导)。

**顶部系统列**(右上 minimap 正下方纵排,间距 12px,⌀44):背包(Esc 态机)/全屏地图(M)/暂停 常驻;聊天(net.active&&!spectating 显示);旅程力量(world.isJourney 显示);配装胶囊 F1-F3(P1,tap 展开三格)。**动作全走 `tapVirtual(...)` 经 Keybinds 表**——跟随用户重绑、进 Esc 主链既有优先级分支,不绕道直调 Game 内部方法。

**瞄准手感**
- SC 初值:`smartCursor.wanted = isTouchDevice() ? options.data.touchSmartCursorDefault(默认 true) : false`;
- SC OFF 时指尖绘制 12px 半透明环形准星(改 vui/VUI.ts:250-318 触屏早退分支,补一条触屏专用绘制)——解决"看不见光标在哪"先天缺陷;长按交互命中 tile 补一圈扩散涟漪(挖掘粒子池,S);
- 工具差异不进输入层:输入层只产出 tap 边沿/hold 电平/拖动瞄准三种原子信号,镐/斧/锤/武器/放置差异全留给 updateUse 既有的 holdOk(:8794)/clickEdge(:8981)/autoReuse(:10298/:11195)分派。

**皮肤(用户定案:原版官方手游风格)**
- 低透明度圆形像素底盘:`UI_ButtonBacking.png`(22×22)`border-image-slice:5 fill` 九宫格+pixelated,外描边 1px #0b0e1a+内高光 rgba(255,255,255,.14),填充 α0.78;
- **删除全部 backdrop-filter 与大 box-shadow 发光**(低端安卓逐帧全量重绘热点,性能正收益);
- 图标全素材化禁 emoji:攻击钮面=当前 hotbar 物品 sprite 居中 64%(`iconUrl`/paintSlot 现成管线,武器一换钮面即换);跳跃=绿 tint 像素三角内联 SVG 数据 URI(零网络请求);抓钩/药水/宠物=对应物品 sprite;需要文字场景用项目字体+四向 1px text-shadow;
- 按压反馈 brightness(1.25)+translateY(1px)+边框提亮,70ms steps(2,end) 去/120ms linear 回——不用连续 scale(像素语言+半像素 shimmer 防)。
- 左撇子镜像(touchLeftHanded 类翻转,P1 设置项)。

### 模块③ HUD 缩放体系(HudScale.ts,C 主刀)【P0/P1】

- 新模块 `ui/HudScale.ts`:离散档 D0=!touch / T1=touch∧min(w,h)≥700(iPad) / T2=landscape / T3=portrait(short<700);写 `documentElement data-huds="t1|t2|t3"`+CSS 变量 `--huds`,乘 `hudScaleFactor`(0.85–1.15 微调档)。**分工铁则:JS 会重写的几何走 hs(px) 乘法(refreshHotbar/positionInvPanel 写点);纯静态定位块吃 var(--huds);同一元素禁止两处都管**(refreshHotbar 每 40ms 重写会打架)。
- 三途裁决:全局 wrapper transform 弃(锚点混杂会把 right/bottom 元素推出屏);JS 尺寸计算为主(与现状 inline 写法同构);根级 CSS var 为辅(elementFromPoint/getBoundingClientRect 对矩阵变换天然正确,敢用的前提)。
- **坐标四通道对策**:getBoundingClientRect 天然正确零改;elementFromPoint 零改(resolveDrop UI.ts:1675);**手工换算通道是真雷区**——craftWheelStep dy/LIST_H(UI.ts:3303-3330)须除 f,minimap lmX/lmY 逆变换(Renderer.ts:13447-13448)为唯一合法入口禁止复制公式;canvas HUD 对外上报 rect(minimapRect/iconRects)必须是换算后最终屏幕坐标。pickUp 阈值 d>4 物理尺度无关不动。键盘遮挡走 `--kb-shift`(vanillaKit.bindKeyboardShift 现成)。
- **hotbar `.sw-hb-wrap` 化**:十格散点绝对定位收进单 wrap(scale origin top-left),refreshHotbar 的 inline 改 wrap 相对值——T3 两行五列 40px(1-5 上行)、T2 平排 44px 取消选中收缩差、D0 byte 级不变;选中名 T3 独立第二行 11px ellipsis。数字标缩小微章。40/44 为整数逻辑 px(DPR 整除不 shimmer)。
- **safe-area 探针 div**:隐藏 div padding:env(safe-area-inset-*)→getComputedStyle 读 px→CSS 变量 --sw-sat/-sab/-sal/-sar(orientationchange 重测);DOM 消费=hotbar/buff/chatbox/NPC对话/成就/暂停面板;canvas 消费=minimap oy/Boss 条挪位/资源条锚(缓存值,不加每帧查询)。
- **T3 重排表**:背包 positionInvPanel→底部抽屉(bottom sheet ≤62dvh+把手下拉+关闭钮,打开时主 HUD 降透明度);Boss 条顶中 y=safeTop+6 ×0.65≈296(避右按钮簇);Buff 栏垂直右缘 6 个+"+N"折叠 popover(tap 展开全表);InfoAccs 移 minimap 正下竖列 ×0.65(w-160 起);NPC 对话 bottom=摇杆顶+8 通栏 max94vw;暂停/Settings maxHeight:dvh+内容 overflow-y:auto;成就弹窗避让按钮簇;ChatMonitor 原位 ×0.8。
- 层级序(冲突仲裁):动作簇>打开面板>hotbar>buff>minimap/InfoAccs>Boss 条>纯展示层(pointer-events:none);叠加期高层交互开启⇒低层禁 pointer,**禁止靠 z-index 抢**(现状 hud10<mobile150<cursor300<audioGate10001 已经是后患源)。
- 元素化命中:HudHitboxes.register({id,rectFn,onPress}) 替代散布矩形判断串(P1 引入,P2 全景清偿 minimapRect/lmX 进 hudLayout 单函数=画在哪与点到哪永不分家)。

### 模块④ 交互补偿(hover/拖放/输入框,C 主刀)【P0 最小闭环 / P1 完整】

- **bindHint(el, fn)** 助手:coarse 时挂 touchstart(380ms 计时;move>8px 取消;未达时长转交原 click 语义;第二指/他处 tap 即关),fine 保持 mouseenter——机械替换散点(mouseenter:UI.ts:1189/:2308 等),showTooltipFor 出口(:1812)零改。
- **拖放状态机**(提炼现有私有方法不造平行轮子,鼠标路径卫语句隔离 `pointerType!=='mouse'`):
  - tap(<200ms,<6px)=槽内切选中/面板内预览+tooltip 泡 1.2s(提炼 mouseup 分支 UI.ts:1453-1473 为 slotClick(i,where));
  - 长按 380ms=pickUp(:1480 直接调),ghost Y 偏移 -28 防指尖遮挡;
  - 松手=resolveDrop(:1675,elementFromPoint 触摸坐标天然有效零改);
  - 拖出面板→**红带「丢弃」确认槽**(.sw-dropzone,resolveDrop 特判→throwHeldToWorld :1707)替换"一出面板就飞走"(防触屏第一事故源;桌面仍一出面板即抛,铁律);
  - flick(速度>0.6px/ms 且离开面板)=直接 throwHeldToWorld(老手肌肉记忆通道);
  - 拾起后再长按同槽=takeHalf(现右键拆半提炼 halfStack());
  - 另一指 tap 任意空白=取消拖拽(鼠标有 Esc,触屏必须有等价物)。
  - 所有槽 touchstart preventDefault 断浏览器合成双触发(不影响 Input 世界合成——那是 canvas 自监听);右键/Shift/Alt 桌面语义原样保留。
- **配方行**:轻触预览驻留(预览随最后 tap 行迁移不自动消失;150ms/350ms hover 门降级为防连抖时间戳,L4264-4277);双 tap <400ms=执行合成;craftWheelStep 手势 dy 除 f(T3=×0.9)接现有阻尼惯性(L3296-3348)。合成列表/材料 chip touch 换算同理。
- **聊天框 `.sw-chatbox`**(挂 document.body 特例,z60):width min(340,100vw-24)+**font-size:16px(iOS 聚焦自动放大禁令)**+bottom:0+--kb-shift 顶起;IME isComposing 守卫(ChatInput.ts:64)原样;input 元素显式 user-select:text(继承封锁会伤编辑,预防性列出)。
- InfoAccs 区 tap=精简/详尽翻转;Boss 条 tap 无操作防误触;成就 toast 触屏延长 6s。

### 模块⑤ 设置与持久化【P0 字段 / P1 全接线】

Options 平铺新增(默认值表+load 卫门归一化照 Options.ts:218-296 惯例;Settings cats 数组加 `'touch'`(Settings.ts:112-135),slider()/modeRow() 工厂现成;**l10n-audit 强制门:新键先进 tools/l10n-custom/{zh-Hans,en-US}.json 再 node scripts/build-l10n.mjs,否则 vitest/build 双红**):

| 字段(Options 命名惯例) | 类型/默认 | 期 |
|---|---|---|
| touchJoystickFloat | toggle 开 | P0 |
| touchButtonAlpha / touchButtonSize | 0.82 / 1.0 | P0 |
| touchLongPressMs | 380(tooltip/拿起/交互共用一根) | P0(先常量,P0 末接参) |
| touchSmartCursorDefault | **true**(用户定案) | P0 |
| hudScaleMode(auto/t1/t2/t3)/hudScaleFactor | auto / 1.0 | P0 字段,P1 滑杆 |
| touchHotbarLayout | auto(=2×5 竖屏;官方式 5+抽屉为可选档) | P1 |
| touchJoystickSize | 1.0(0.8–1.3) | P1 |
| touchLeftHanded | 关 | P1 |
| touchDropPolicy(丢弃带/快速甩出/二次确认) | 丢弃带 | P1 |
| touchPinchZoom | 开 | P2(依赖镜头通道) |
| mobileDoubleTap(off/smartCursor/hotbarCycle) | off | P2(依赖双击识别器) |

uiScale 保持喂菜单域语义分域不动;keybinds 重绑联动由 action 化注入自动达成(注释了结 Input.ts:169-171 技术债)。

### 模块⑥ PointerHub / FingerRoles / pinch(多指高级件,B 主刀)【P1】

- **PointerHub 半统一**:PE 统一**仅限 canvas 世界采集**(P1 第一步只接 touch 轨=迁移①,window mousedown/mouseup/mousemove/wheel 原样),DOM 面板**永久保留原生 mouse/click**——preventDefault on pointerdown 掐死兼容鼠标事件链(spec 行为,cancel pointerdown ⇒ 不派发合成 mousedown/click),dblclick 从未可靠合成,gesturestart/iOS 兜底永远得摸 touch 层。统一目标是**消除歧义判决层**(surface 裁决单一函数),不是消灭事件类型。分界=event target 是否落在 canvas 内;白名单读 domTargets 单一常量。
- **FingerRoles 状态机**(替代 worldTouchId 单值):down 定角色 joystick/button/world/pinchA/pinchB/free(hitbox 由 MobileControls 登记自报),up 必退役;MobileControls 四处复制的 stopPropagation+preventDefault 相应消灭。升级条件(与 A"第二指永远是世界触点"的调和):已存活 world 指+新世界区自由指→次指接管为光标(pendingUseEdge 兑现窗);间距变化 >18px 或双落间隔 <220ms 则升 pinch 并撤销未兑现 tap。free 指通道预留接口不留功能(第二指蹦跳/滚轮评估均为否:与摇杆误触重或与 pinch 起手冲突)。
- **Pinch 数学**:起点快照 z₀/d₀/m₀(midpoint);`z'=clamp(z₀·(d/d₀)^0.85)` 走 Game.setZoom(Camera.setZoomTarget 钳 [.5,2.5] 自动生效,zoom 档位复用避免 chunk 重建抖动);锚点补偿 `cam.x'=A.x-(mx-viewW/2)/z'; cam.y'=A.y-(my-viewH/2)/z'`(A=screenToWorld(m₀),screenToWorld 不含 punch 故数学自洽);Camera.holdUntilTick 让 follow(0.15 lerp)让路(pinch 期间+结束 150ms,带 tick 硬过期防忘恢复=相机锁死),clamp 照跑,punch 栈不动。
- **ViewportKit 单基线**:ScreenSpace=canvas client CSS px(**不许引 DPR**——主画布恒 CSS px 是显式契约 Renderer.ts:2536-2543,ZOOM_MIN .5≡retina 决策连动,Camera.ts:9);rect() 缓存+五失效钩子(resize/orientationchange/vv resize/fullscreenchange/recreate);Hub 只存 latest[pointerId] 帧头快照(rq 逐帧清空不可采样的教训),coalescedEvents 仅瞄准轨迹消费;移动指针每秒数百次 getBoundingClientRect 的现状(Input.ts:70/111、MobileControls.ts:196)一并收编消除。
- **鲁棒性**:pointercancel watchdog(300ms 无 move/up 强制退役,stuck-finger 从玄学变机制);Hub/Gestures 定时器随 surface 替换强制作废(幽灵挥剑防范);Input instance-permanent `replaceSurface(canvas)`(P2)配迁移检查表六项制度。
- **iOS 怪癖落地清单**:`-webkit-tap-highlight-color:transparent` 全局;双击自制识别器(≤350ms/≤28px,默认 off 不替玩家选);user-scalable=no 被 iOS≥10 忽略→gesturestart 全局 non-passive preventDefault 兜底;resize debounce 200ms 连续相同值短路(照抄 applyRenderScale Renderer.ts:2529-2531);resumeNow 只认 physical origin(音频解锁语义延续 AudioGate 修复)。

### PWA 面(低优先 P2)
theme-color/apple-mobile-web-app-capable/status-bar-style/title;/manifest.webmanifest(display:fullscreen;background #0b1020;icons 192/512 maskable 走 public/icons/*,不进 vanilla-atlas/atlas-lint 白名单门——那是 sprites/vanilla(-ui) 索引资产专用通道);_headers no-cache 与 SW precache 按既有惯例,新增 URL 记入 splash completeFast 免检名单(loadBitmapOnly 失败 TTL 教训:缺图标不许掀 60req/s 风暴)。收益边界如实:iOS A2HS 去浏览器壳+存储放宽但无 orientation.lock(Android 有 WebAPK+真 lock)——PWA 是加分不是承诺,竖屏永远认真适配。

## 3. 分期路线图

| 期 | 内容 | 工量 |
|---|---|---|
| **P0「能玩且像样」** | 模块①全部(pressVirtual 家族/Esc 链/domTargets 合一/pendingUseEdge/cm.input 热修)+ 模块②核心(浮动摇杆+回滞/右簇几何/系统三键/SC 默认开/皮肤第一步去 emoji)+ 模块③管道(HudScale 档位/.sw-hb-wrap hotbar/safe-area 变量/minimap+Boss 条缩放/chatbox 键盘补偿)+ 模块④最小闭环(slot tap/长按拿起/放下+bindHint tooltip) | ≈M(约 1 周) |
| **P1「对齐官方手感」** | PointerHub+FingerRoles+pinch+ViewportKit;拖放完整态机(丢弃带/flick/takeHalf/取消)+配方行双击合成;皮肤全量(九宫格替渐变+tint 物品图标钮+steps 动效);Buff 折叠 popover/NPC 对话避让/InfoAccs 竖列/Boss 顶中完整重排;Settings 'touch' 全接线;配装胶囊;情境交互手(findChestNear/talkToNearbyNpc 判据 Game.ts:8641-8648);双击识别器 | L |
| **P2「锦上添花」** | EscResolver 收编 18 escHandler+桌面 mousemove/up 收 Hub(迁移②③)+instance-permanent;HudHitboxes 全景清偿;PWA 面;iPad 双栏利用;按钮位置编辑器(呼声再议) | L(唯一动 PC 路径的一期,单独分支单独合入) |

明确砍掉:navigator.vibrate(iOS 不支持);摇杆上滑跳/画圈冲刺(发明手势,违反零学习成本原则);锁敌式自动瞄准(动共享战斗代码面,PC 回归风险最高);自定义摆位编辑器(P2 呼声再议);RadialHotbar(触屏用滚动条/2×5 直选学习成本更低)。

## 4. 验收与护栏(硬标准)

1. **桌面零回归金标**:vitest coarse=false 时 refreshHotbar 产出几何与现存快照 byte 级相等(matchMedia mock);keyboard golden(recLog IS diffs=空);atlas-append-golden/item-stats-golden-1457/npc 双金标不碰数据面自然绿。
2. **node 纯逻辑单测**(vitest 无 jsdom,内核必须框架自由):input-virtual.test.ts(pressVirtual 派发序列/防环三例/blur 清全集/重绑回归锁 options.keybinds={Jump:['KeyZ']} 时 setVirtualAction('Jump') 生效);finger-roles.test.ts(按下序列状态机表驱);pinch-math.test.ts(**锚点不变量**:任意 z∈[.5,2.5] 与 mid 组合下 screenToWorld(mid) 恒等于初始 A,误差<1e-6;γ 曲线单调性/clamp 边界);拖放状态机六路径表驱。
3. **移动探针**(遵守 CLAUDE.md 并行会话约定:自起 SW_PORT=520x SW_NO_HMR=1 SW_CACHE=/tmp/sw-vite-520x 私有静默实例探针带自己 origin,**禁 kill 5199**;CDP 派发受信 touch 序列):
   - `_mobile-input-edge`:Esc 键关背包不开暂停(优先级正确)/长按 400ms rightDown/拖 12px 取消/**pendingTap 不吞(连续两次 60ms 轻点两次 use 边沿)**/pressVirtual('Digit3') 后 inv.selected===2/退出世界 vkeys 空;
   - `_m-hud-fit`:三视口 390×844 / 844×390 / 768×1024 进入世界——hotbar 外接盒⊆[0,vw]、每个可交互元素 effectiveRect≥44×44(负 margin 扩边计)、无元素压手机钮 rect、D0 视口截图与改造前 diff=空;
   - `_mobile-multitouch`:双指 pinch 截图 hash 变化且玩家居中恢复;单指挖矿中途双指介入撤销 pendingTap(IOU)。
4. 工程守卫:l10n 门(每颗新按钮文案两份译键先行);样式注入一律 id 守卫+textContent 每次刷新模式(Settings.ts:79-81 旧"只建不更"模式借机修正);高危改动护栏表——keydownHandlers 签名泛化(TS 编译期暴露全部 e.* 取点)、Esc 链整体搬家用探针断言四个状态出口分支、mouseup 类分支**禁止读 surface**(铁律进注释)、destroy 必经 input.releaseAllVirtual()(重进世界虚拟键残留防范,现行 destroy 里 tk.clear() 不够)。

## 5. 有意偏离登记(vs 官方手游)

| 偏离 | 理由 |
|---|---|
| 允许竖屏认真适配(官方锁横屏) | iOS Safari 无 orientation.lock;玩家大量时间处于浏览/背包/看地图相位,竖屏是一级姿态非兜底 |
| SC 默认开+Settings 可关 | 用户定案(2026-08-28);官方手游同为默认开 |
| 无按键拖拽位置编辑器(官方 1.4 支持) | 编辑器级工程量,收益集中重度玩家;预设浮动/固定+镜像先行,P2 呼声再议 |
| 拖出面板=丢弃带确认而非直抛世界 | 触屏误抛第一事故源;flick 直抛保老手通道;桌面原义不变 |
| hotbar 默认 2×5 全显而非官方 5 格+抽屉 | 完整 10 槽语义与桌面一致;官方式作为可选档提供 |
| 不做 contextual 使用图标手势(A 设想二期) | 长按 400ms 已覆盖交互入口,邻近检测跨实体扫描单独批;P1 再议 |
| 数字快捷栏 dial 不做 | 触屏滚动条/2×5 直选学习成本更低 |
| 无震动反馈 | iOS Safari 不支持,平台碎片化收益不对称 |

## 附:关键文件索引

`core/Input.ts`(52/69-97/99-154/165-175)· `core/Game.ts`(3270-3285 熔断迁移/3330-3487 keydownHandlers/5333-5346 输入写入/updateUse≈8794-9730/8565-8694 右键分派/22792-22812 InfoAccs 点击)· `core/main.ts`(228-249 相机接线/263-311 Esc 链)· `core/Keybinds.ts`(53-94 DEFAULT_KEYBINDS/101-117 bindsOf/isBound/actionsForCode)· `ui/MobileControls.ts`(15-28 判定缩放/30-95 CSS/107-115 全屏/163-178 bindButton/180-343 构件)· `ui/UI.ts`(276 sw-root/1112-1191 slot 监听/1426-1478 拖拽链/1675-1718 resolveDrop/1812-1974 tooltip/2094-2118 背包贴位/3296-3348 合成滚动/3950-3985 refreshHotbar)· `render/Renderer.ts`(13421-13543 minimap/13447 lmX/lmY/13459 ox/13500-13506 minimapRect/3602-3632 Boss 条资源条)· `render/Camera.ts`(7-40 zoom/follow/clamp/60-62 screenToWorld)· `render/BossBars.rs`(558-565 固定几何)· `vui/VUI.ts`(49-67 UISpace/250-318 触屏早退)· `ui/AudioGate.ts`(45-49 isTrusted 先例)· `ui/ChatInput.ts`(41-112/64 IME)· `index.html`(5 viewport/31-36 touch-action 契约)· `mainFlow.ts`(130 uiScale/193-197 enterWorld/1007-1024 bestiary)· `ui/Settings.ts`(112-135 类目/300+ 行工厂/79-81 旧样式注入)· 素材实测尺寸:`UI_ButtonBacking` 22×22、`Inventory_Back*` 52×52、`UI_ChestStack_0..3` 32×30、`UI_Bestiary_Button_Back` 28×28(vanilla-ui 1031 张非 Armor/Item)。

参考资料:官方手游操控事实([The making of Terraria mobile Part 2 — Touch controls](https://medium.com/@watsonwelch/the-making-of-terraria-mobile-part-2-touch-controls-706cbdc61d64)、[Terraria Mobile 1.3 Controls 论坛帖](https://forums.terraria.org/index.php?threads/terraria-mobile-1-3-controls-an-introduction.82198/)、[terraria.wiki.gg — Game controls](https://terraria.wiki.gg/wiki/Game_controls)、[Mobile version history](https://terraria.wiki.gg/wiki/Mobile_version_history))。Apple HIG 最小触达 44pt。
