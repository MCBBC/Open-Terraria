/**
 * ★确定性节拍对齐引擎(2026-09-28 调度面修复刃;同日热修刃:废除 60Hz 网格地板,
 * 目标周期=用户 frameCap——subtle 只对齐不钳速)——帧模式 subtle 档的渲染调度。
 *
 * vanilla 锚(1457 亲读,勿凭记忆改):
 *  - FrameSkipMode 三态:Main.cs:17129-17137——Off/Subtle=可变步+垂直同步;On=IsFixedTimeStep(60Hz)+垂直同步。
 *  - 累计器门+SuppressDraw:Main.cs:17182-17197——【仅】Off 或 Subtle&&!improvedSubtleFrameSkip
 *    (旧路径)走"累计器未满 1/60 → SuppressDraw+return";其后"落后跳帧"分支 num3=0 恒死代码。
 *  - improvedSubtleFrameSkip(1457 默认 true,Main.cs:67615-67616):EndDraw 忙等钳 60Hz present
 *    网格(Main.cs:62624-62644)——Update 每循环照跑、【无绘制抑制】,整个 Update+Draw+Present
 *    周期被钉在 60Hz 网格上(火焰时钟案已实证"原版绘制周期≡60Hz tick")。
 *  ★网格地板否决注(2026-09-28 热修刃,防未来"忠实原版"改回去):原版把 present 钉
 *    60Hz 网格的理由是其【逻辑与呈现同帧】——Update 就跑在同一循环里,不钳 60 游戏
 *    速度直接随刷新率漂移,钳 60 是保游戏速度的手段,非节拍美学。本仓逻辑 fixedUpdate
 *    恒 60Hz 与渲染帧率解耦,60 网格地板在本架构下没有任何速度语义,只剩两条实害:
 *    ①静默覆盖用户 frameCap(cap=120/不设限被压回 60=用户实报"设 120 依然 60");
 *    ②60 拍跳整拍放大(自由 120 下轻微迟到的帧,在 60 拍下变 33ms 整拍空档=掉帧
 *    更显眼)。故 TARGET【不取】max(1000/60,·):subtle 的价值=确定性对齐(帧序计数
 *    落拍,帧距恒定消摆动),不改变用户选择的速率——只对齐,不钳速。
 *
 * 本引擎 = improvedSubtle 语义的 rAF 移植:**帧序计数落拍,非忙等**。rAF 时代 present
 * 由浏览器合成器掌控,只能选 vsync 的整数倍——"每 k 个 vsync 渲一次"(k=拍)且 k 恒定
 * ⇒ 渲染帧距恒定 = 确定性节拍。取代旧被动门(`now-_lastCapTs<1000/cap-1 即跳`:
 * 阈值落在 vsync 整数倍 ±抖动带内 ⇒ 跳 1/2 个 vsync 随机翻转)与旧 SuppressDraw
 * (0 步进帧跳绘:累计器相位随 rAF 抖动随机游走 ⇒ 渲染落点不规律)——两者即用户实报
 * "高于 60fps 仍有卡一下感"的节拍摆动源。
 *
 * 拍选择(状态机全输入显式,内部不读墙钟——事件序列决定论,可单测):
 *  - 目标周期 TARGET = frameCap>0 ? 1000/frameCap : 1×vsync 间隔(热修刃语义):
 *    cap=120@120Hz 与 cap=0 均拍=1 vsync(全速确定拍);cap=60@120Hz 拍 2(60fps 拍);
 *    cap<60 由 cap 压拍。60Hz 网格地板已废(否决注见上)。
 *  - minK = ceil(TARGET/vsync):拍=vsync 整数倍(cap=0/cap≥屏率 1;cap60@120Hz 2;
 *    cap30@120Hz 4;cap30@60Hz 2)。
 *  - 容量预算 budget(k)=k×vsync(渲染帧成本落在预算内,滑一个 vsync 也保持均匀相位的
 *    一致性;成本贴/超预算=相位随机翻转=摆动)。降拍【v6 帧率优先制】:成本
 *    p50>budget(k+1)×1.1(中位超过【下一更低档】预算×1.1 才降)→ 逐级扫到首个能
 *    容纳的 k;政策/边界语义见头注 v6。★v4 的"单帧超预算立即降"已废除(见下 v4
 *    失效形态——单帧超支在 beat 对齐下=顺延一个 vsync=无感,不构成降档理由)。
 *  - 滞回升拍:k>minK 且 p50<budget(k−1)×0.9【升拍余量 10%】连续 2 半窗=60 渲染帧
 *    → k−1(一步);条件破即弃——降快升慢防档位震荡。
 *  ★升拍 p50 制(v3 语义注,2026-09-28 热修刃;三级演化最终形态=①进场简化 v4
 *    afterWorldLoad resetSampling ②出场看门狗=降拍三路立即(单帧超预算/p95 超预算/
 *    连续失拍)③升拍 p50 制本刀):判据史=「p95<0.8×budget(k−1) 持续 2s」(设计二,错——
 *    本仓稳态帧耗 8-12ms,顶格要求 p95<6.7ms 永不可达=降拍后钉 60,用户实报
 *    cap120+subtle 进世界回不到 120)→「p50<budget(k−1) 连续 2 半窗」(本刀)。理论根基:
 *    beat 对齐下超预算帧只是【顺延到下一 vsync】(present 恒落 vsync 网格=对齐 60Hz
 *    节拍)不是失稳——节拍摆动只来自未对齐自由漂移,已被帧序对齐机制消灭;故中位数
 *    帧耗装得下即升,偶发超预算帧=k=1 下跳一拍=对齐 60 无感;p95 超标【仅】驱动降拍
 *    (持续过载保护)。防抖:升拍需判据连续 2 半窗满足(轻于旧 2s 墙钟)+降拍立即,
 *    组合=准稳态——预算边缘震荡会话(边界①形态 p50 8.2/p95 12)在 k=1/2 间有界摆动,
 *    观感与 k=2 同但保留升回 120 的通路;匀称恒超载(render-bound,p50>budget)恒不升
 *    =正确(render-bound 本就该降拍,见上一刀备注)。
 *  - 失拍吸附:渲染帧距>(k+0.7)×vsync=失拍(渲染节拍滑了 ≥1 个 vsync)。序数计数天然
 *    【不追赶中途】——失拍后下一渲染仍落在下一拍(不插补.render,防连锁迟到);单次失拍
 *    只作余量警示(弃升拍保持),连续 2 次=容量不足 → 降拍。
 *
 * ★v5 判据自洽迭代(2026-09-29,"最后一次判据结构迭代"——此后判据只许参数调优,结构
 *   变更须新证据)。判据演化史+每版失效形态:
 *  - v1 网格地板(2026-09-28):TARGET=max(1000/60,·) 钳 60Hz 网格——失效=静默覆盖用户
 *    frameCap(cap120/0 被压回 60);已废(否决注见上)。
 *  - v2 p95 升拍制(2026-09-28):升拍判据 p95<0.8×budget(k−1) 持续 2s——失效=本仓稳态
 *    帧耗 p95 8-12ms,阈值 6.7ms 永不可达 → 降拍后单向钉死 k=2,回不到 120(用户实报)。
 *  - v3 升拍 p50 制(2026-09-28 热修):p50<budget(k−1) 连续 2 半窗即升,p95 只管降拍——
 *    修复了钉死,但【升/降判据未做联合自洽】(v4 遗留,见下)。
 *  - v4(=v3 代码原样,判据缺陷在此定谳):升拍判据 p50<budget(k−1)【无余量】+ 降拍①
 *    【单帧 cost>budget 立即 k+1】+ 降拍② p95>budget 扫拍。失效形态=边界震荡会话
 *    (帧耗 p50 贴预算,p95 超预算):升拍判据成立的同时降拍①/② 也成立 → k 1↔2 flap,
 *    帧距 8.3/16.7 混样=FPS 读数 80-90 反复。★wild 定谳(2026-09-29 trace
 *    Trace-20260929T164816/112019,x-ray+原始 rAF 序列回放):两份 trace 均【零 k 跳变】
 *    ——digest 的 render/skip 1:1 是第二條同名 'loop' 小 rAF 链的 FunctionCall 名碰撞
 *    伪影(工具债,见 trace-x-ray);会话实况=frameSkipMode 'off'+frameCap 0
 *    (localStorage 实证,localhost:4173)→ 节拍引擎根本不在渲染路径,自由渲染,帧距=
 *    主线程工作周期(rAF 迟交:delta≈前帧 cost+1.9ms,corr=0.952)→ 80-90=工作抖动
 *    本相;canvas 落 SHM 软栅路径(lpr 239/帧,健康 GPU 路径 ≈1.0)是帧耗 10ms 的真身。
 *    同流回放现行 v4 判据:846/1808 渲染+21 次 k 迁移(9-12ms 升→降 flap 循环)=上述
 *    失效形态实锤,只是被 off 档遮住未爆发。
 *  - v5(本刀)自洽三刀:①降拍 p50 制——废除单帧立即降(v4 降拍①),降拍唯一判据=
 *    costP50>budget 持续(60 样本窗)→ 逐级扫拍;单帧超支由 beat 对齐顺延吸收( doctrine:
 *    丢一拍对齐下一 vsync=无感,振荡才是病)。②升拍余量——p50<budget(k−1)×0.9,
 *    中位数贴预算(如 p50 8.2 vs 预算 8.33)不再触发升拍=消除"升拍资格成立同时降拍
 *    触发"的打架面。③驻留=既有确定性窗机制(升 2×30 连续帧+降 60 样本窗),无墙钟。
 *    边界震荡画像(p50 8.2/p95 12)在 v5 下=稳定驻留 k=2(恒 60,升拍余量拦住,失拍
 *    看门狗压住);render-bound(p50>预算)恒驻低档不顶格抖动;轻载(p50 6)稳定升 k=1
 *    恒 120。★新登记债(非本刀范围,须新证据再动):vsync 估计在饱和态被回声污染
 *    (估计读到的≈工作周期而非真实网格,corr=0.952 铁证)——修它=估计器结构变更,
 *    且牵"稳定 60 vs 顶格抖动 87"的产品取舍,单独立案。
 * ★v6 降档边界=帧率优先(2026-09-29 热修刃,判据【参数级】调整——v5 结构冻结令仍有效:
 *   扫拍/滞回升拍/余量/失拍看门狗结构原样,只动降档线一处参数)。用户实报:隐蔽档在
 *   帧耗 9-15ms 的场景锁 60/40,而用户偏好这些场景跑出不齐但更高的帧率(此前 free-run
 *   体验满意)。政策语义(用户明令):beat 的价值=对齐消抖动;帧耗落在两档预算之间时,
 *   【帧率优先】(不齐但高)>对齐但低。边界=帧耗在两档预算之间时两条路的 realized
 *   rate 几乎同值,选高的纯为读数/输入采样收益。落实:降档线从 costP50>budget(k)
 *   (v5:中位刚超当前拍预算即降)改为 costP50>budget(k+1)×DOWNGRADE_MARGIN(1.1)
 *   ——中位超过【下一更低档预算】×1.1 才降:k=1@120Hz 的线=budget(2)×1.1≈18.3ms,
 *   帧耗 p50 9-15 的会话留在 k=1 跑 ~90-110 的不齐帧率(仍高于 60 档对齐帧率),只有
 *   中位 18ms+(k=1 realized 跌到 ~55、逼近 60 档对齐)时对齐 60 才真的更快,才降。
 *   升拍判据(p50<budget(k−1)×0.9)不变——新参数下 k 档滞回带
 *   [budget(k−1)×0.9, budget(k+1)×1.1] 依旧无交叠,v5 的升降自洽性保持。
 * ★v7 判别器补丁双刀(2026-09-29,案①案②实测定谳后;v5 结构冻结令仍有效——本刀=判别器
 *   级两点+零结构变更,红/绿判别器与逐案证据见 tests/frame-beat.test.ts 案①案②块):
 *  - 案①失拍对齐豁免(isCapacityMiss 钩):帧距虽超 (k+MISS_SLACK)×vsync,但恰为
 *    (k+1)×vsync(±max(0.2×vsync,2ms))=单拍对齐顺延(present 恒落网格=零抖动),
 *    不计失拍。实测(ProMotion 有头,探针 _framebeat-entry-cascade2)锁相 regime 下
 *    帧距 100% 落网格(meanDev 0.18ms)——k=1+帧耗 9-15 的物理 2-vsync 节奏被旧判据
 *    判 miss-streak 降拍,而 k=1/k=2 realized 同为 60=纯噪声降档;豁免后 miss-streak
 *    只剩"离网格漂移/深滑"真失稳(30ms stall 帧距 46.7=n=k+2 仍判失拍;更深的持续
 *    滑移照旧降拍——全倍点豁免会让看门狗在网格量化 stall 下失明,故只豁 n=k+1)。
 *  - 案②入场结算护栏(settleGuard):capacityBreach 需 costWin 全窗(60 渲染帧)证据
 *    ——构造/resetSampling 各挂满一次。实测入世界首簇帧 ~150ms(块同步烘焙+首帧编译)
 *    在旧码下以 2-6 样本薄窗一拍扫到 k=6,滞回梯 60 渲染帧/级在突发 fps 下 ≈11s 才回
 *    k=1(用户可见=入场后 10s+ 的 16-60fps;resetSampling 挡生成期污染但挡不住入场簇
 *    ——簇在 reset 之后)。护栏=判据证据门槛,非新判据;floor/miss-streak 不受护栏
 *    (cap 强制与合成器 stall 各司其职)。★登记案②原文的"resetSampling 估计噪声→
 *    minK=2 起步"子机制经实测否定(两探针 reset 时估计=未喂默认 16.67 或生成期大空洞
 *    v≈100,minK(cap120) 恒 1;minK=2 需估计落 [4,8) 未复现),升拍余量豁免与 minK
 *    改档均不立项。
 *  - 案③交付 regime 运行时检测:归档(证据不足,不动)。两流统计:锁相流 meanDev
 *    0.18ms/100% 落网格 vs 饱和自由流 1.47ms/79.4%(8× 分离,可检测性初步实证),
 *    但检测器依赖诚实 vsync 估计,而饱和 regime 下估计器恰被回声污染(圆圈依赖);
 *    且 regime 自适应政策=结构级新增。两流样本不足以标定阈值(证据:探针
 *    _framebeat-entry-cascade2 + trace Trace-20260929T164816),另立新证据再动。
 *  - 回声债(估计器饱和读工作周期):归档(处方被金标流反证)。"gaps 恒 ≥vsync→
 *    vsync=gap 下确界"前提不实:金标流 5.2% 帧距 <8.33(min 7.2,迟帧解堵余数)→
 *    p10/min 统计使 minK 地板在 59/100 每 600 窗抬到 ≥2(案②族地板翻动),截尾均值
 *    0/600;交换代价=降拍线/失拍阈/minK 全面积移位+多个 v6 绿测试依赖回声豁免。
 *    估计器去回声须先有锁相+饱和双 regime 真流金标,另立新证据再动(案①豁免已是
 *    其前置安全网)。
 * ★v7.1 瞬态簇豁免(2026-09-29 用户实报"开背包/开地图必大降帧"定谳后;判别器级,
 *   零结构变更):失拍降档改【双门】(连续性×持续量)——missStreak≥4(原 2)且簇内
 *   滞时累计≥200ms 才降。机理:开图/开包=1-5 帧瞬态大帧簇(布局/烘焙/上传),
 *   120Hz 下每帧超阈 ~10-40ms、簇总滞时 ~50-150ms=【有界】瞬态,不构成容量失稳,
 *   不该触发需 60 渲染帧才能爬回的降档(旧码连续 2 失拍即降=用户实报的"联锁下降");
 *   真容量失稳的滞时【无界】,~0.2-0.4s 内必触双门——检测延迟代价可忽略;单帧大
 *   hitch(GC/IO ~200ms)滞时 ~186ms 仍不降=同语义(单 hitch 不定容量)。红判别器
 *   OldAlignedMissBeat 同步复刻旧降档门(missDowngradeDue 覆写),案①红→绿对照面
 *   保持完整。
 * ★v9 估计器去回声(2026-10-04,B2 结构债清偿刀——回声债自本刀起销案,上文 v5/v7
 *   「已立案/归档」注记就此结清):上面 v7 时代归档的理由是「处方被金标流反证」
 *   (p10/min 统计使地板翻动)且「须先有双 regime 真流金标」。本刀新证据=定谳级
 *   量化画像(Trace-20260929 回放 630 拍):rAF 迟交使 delta≈前帧 cost+1.69ms
 *   (sd 0.51,corr=0.964)——回声族 8.5-21.8ms 占 94.8%,显示周期证据只存于
 *   sub-8.33 低族(5.2%,min 7.2,与金标流"迟帧解堵余数"注记同构同占比)且饱和段
 *   (前 495 拍)零现形=信息论不可恢复段;旧截尾均值被拖到 11.54(+38.6% vs 名义
 *   8.33)。估计侧对 MISS_GRID_TOL 无对应物(全量样本入窗)——本刀补上:结构=
 *   「famLo 锚定显示族收集+三重门+向下有界校正」:①显示族收集器(族最小值 famLo
 *   锚定收录带 delta≤famLo×1.15;回声族在带外=间隙过滤,即任务候选①;对被
 *   p10/min 反证的处方,本式不用低分位统计直取真值,而以族形态学过滤+中位数抗污,
 *   即候选②;famLo/显示族分离即候选③双源假设的实现);②三重门=成熟度(≥12)/
 *   双峰间隙(工作窗最大内隙≤0.18×work,v1 杀手流+活机节流脉冲防线——「截尾均值
 *   对双峰恢复真值」的既有定谳不回退)/离散度(IQR≤0.35×中位);③候选=clamp
 *   (显示族中位,[work×0.65, work]) 只许向下拉。回退姿态:无证据/门拒绝 ⇒ 与
 *   B2 前逐位一致(busy 混合流 v5/v6 判据测试全绿即此保证)。
 *   判别器数字(tests trace 回放):饱和段新估计骑回声低沿 9.50(旧 11.72);
 *   证据段[560,630]收敛 7.80±0.3(旧 9.73;对名义 8.33 误差 −6.4% vs 旧 +16.8%);
 *   洁净流偏差 ≤3%、金标健康机器语义流(7.93+5.2%余数)新旧逐位一致、v1 杀手流
 *   双峰门拦截=与旧估计一致、并调流/锁定滑相流精确 8.33/16.67。收敛速度:洁净流
 *   12 样本即成熟(快于旧 31 窗),饱和段保持工作周期跟踪(旧行为),证据现形后
 *   ~65 回调收敛。红判别器 OldV4Beat 经 estimateVsync 钩钉旧估计式=红面完整性
 *   (旧判据组+旧估计器整链复刻)。
 * ★v9.1 famLo 护栏双刀(2026-10-05 同刀活机探针实锤后热修;活机=私有 vite 5218 +
 *   headed Chrome,scripts/_framebeat-b2-echo.mjs):首版用「探索子=裸 min(delta)」
 *   当收录带锚——活机 [beat] 记录仪实锤其被两类样本打穿:①busy 解堵余数(迟帧
 *   解堵后到下一网格点的剩余,可低至 ~0.25×p)② headed 遮挡窗 rAF 节流脉冲
 *   (5.2-6.0ms 与 8.0ms 混族)——估计塌到 5.5-7.1 ⇒ floor=minK 抬升级联
 *   (k 2→3→4→5 迁移风暴,恰是本引擎要消灭的"升 120 被拉回 60"族形态)。
 *   trace 流(min delta 7.2)暴露不了此形态=探针平台价值实证。修法:①锚从裸
 *   min 换成族最小值 famLo(族空时 work×0.9 播种),成熟期启用远低于族拒绝
 *   (d<famLo×0.85 不入族=余数/脉冲伪影面);②双峰间隙门 0.25→0.18(脉冲流
 *   两族隙 ≈25% 贴边放行过一次,收紧后候选整门弃用=est 恒回退 work,族状态
 *   任其 starve/reseed 冲洗,输出面永不塌)。重播种规则:work 跌破 famLo×0.8
 *   (流整体下移切快屏)或长饥饿 90 回调(流整体上移切慢屏)→ 清族重播种,
 *   切屏恢复 ≤~105 回调。回归锁:活机脉冲流 est p50 8.04/min 7.61(修前 5.5
 *   风暴);busy 判据流 E/F/G 与旧估计器逐位一致。
 * ★v9.2 回声签名 engagement key(2026-10-05 同日二轮活机实锤后终刀):遮挡节流
 *   flag 修正后活机仍有 14.1% sub-7ms 连续伪族——定谳其形态=迟帧解堵余数对
 *   (迟交付 delta+余数 delta 成对,和 ≈ k×p;与 8.0 主族交联成连续谱,族间隙
 *   ≈6% ⇒ 双峰间隙门结构性失效),famLo 经 ≤15%/步的合法阶梯下行塌到 5.4-7.0
 *   ⇒ floor↔upgrade 迁移风暴(in-world 33s 内 20 次拍迁移,恰是"升 120 被拉回
 *   60"族形态)。根治:去回声校正改为【opt-in】——engagement key=「delta 与最近
 *   渲染帧成本」的滚动 Pearson 相关(corr=回声的机制本体指纹:回声=渲染超支推迟
 *   回调交付 ⇒ delta≈前帧成本+余量;trace 实测 0.964/红队账 0.952)≥0.6 才启动;
 *   余数/节流流 delta 与成本不相关(corr≈0)⇒ 恒走旧截尾均值(该流上旧式本就稳,
 *   风暴系 B2 新引=自己引入自己根治)。真实回声场景(渲染超支会话)corr≈0.9+ 恒开,
 *   B2 目标不受损。成本零方差(轻载恒成本/冷启动无渲染)视为不可判=不启动。
 * ★v9.3 去回声回归三刀(2026-10-05 用户实报"cap=120 fps 飘 120-130+持续抖动,动画抖"
 *   定谳后;活机探针 scripts/_framebeat-b2-regress.mjs + trace 配对结构双源实证):
 *  - 定谳一(收录带的族不是显示周期证据):famLo 锚定收录带捕到的是「迟帧解堵余数/
 *    早交付追赶」族。trace 证据段 sub-8.33 低族(31.4%)与邻居的对和 17.2-19.6(非
 *    16.7 整数倍)=轻帧(cost 6.9-7.8)解堵后落网格点后 0.2-1.1ms 的余数 R=k×p−U∈
 *    (0,p);活机 cap=120 稳态低族(7.3-7.4,2.1%)为反相关对成员(对和 15.7-16.6≈
 *    2×8.30)=BeginFrame 早交付/调度追赶。两形态都【不】等 p;p 只存在于族上尾
 *    (sup→p:U 恰过网格点时 R→p)与配对和。B2 报告「min 7.2 与金标流迟帧解堵余数
 *    注记同构=显示周期证据」的推断错在把余数族当显示族——族中位 7.6-7.8 系统性
 *    低估 p(−6~-9%),即「估计收敛 7.7-7.8<真 vsync」回归的根。
 *  - 定谳二(corr 门会泄漏,泄漏面=混合会话):活机 cap=120 稳态 25s 实测 corr p50
 *    0.538(贴 0.6 线)、入场簇短块 ≥0.6(61 回调),corr 单门在混合会话挡不住;门开时
 *    候选=族中位→est  undershoot→est<7.08 时 minK=2 地板翻转→k 迁移风暴=动画抖+
 *    fps 读数飘(k=1 下 est 对 cadence 惰性,抖动全来自迁移与判据阈移位)。且 famLo
 *    可被单发 5.8ms 伪影锚死(活机实测),immature 垃圾族在旧饥饿豁免下永不清除。
 *  - 三刀:①engagement 加残差紧致门(VSYNC_ECHO_RESID=1.2:trace 31 窗残差 max
 *    1.07 全放行=B2 收益保住;轻载/混合流残差 1.5-2+ 恒拦);②候选统计量族中位→
 *    族上尾 q85(余数 sup→p 性质;trace 证据段 8.0-8.1 vs 真值 8.33=−2~-4%,中位
 *    制 7.6-7.8=−6~-9%);③饥饿清族不分级(陈旧垃圾族滞留面拆除,150 阈对 5% 稀疏
 *    证据 0.95^150≈0.05% 误清率,非原 90 阈「永不收敛」形态)。回退姿态不变:门闭/
 *    族空/任一门拒绝 ⇒ 与 B2 前逐位一致。
 *  - 边界声明:k=1@cap=120 下 est 对渲染 cadence 惰性(shouldRender 纯序数落拍)——
 *    cap=120 稳态的 fps 读数 120→125 瞬态漂移是 rAF 原始交付抖动窗均值效应(活机
 *    A/B 实测 legacy 模式同现,估计器无关),本刀修的是「est undershoot→地板翻转/
 *    判据阈移位→迁移风暴」链;读数漂移若需根除属 present 对齐机制,另立新证据。
 * ★v9.4 cap 硬顶门(2026-10-05 用户实报反馈环根治刀;活机探针 scripts/_framebeat-captop.mjs):
 *  - 反馈环机制(定谳,直接采信;用户 trace 实证 BeginFrame 125.18/s=7.988ms,邻帧对和
 *    p50=2×8.0;同机旧构建稳 120=对照实验钉死变量):k=1 下 shouldRender 纯序数落拍
 *    (每回调必渲,上引 v9.3 边界声明)⇒ 渲染 cadence ≡ 合成器 ticker cadence;轻载帧
 *    恒早提交 ⇒ 自适应合成器 ticker 跟随加速(8.33→~8.0ms)⇒ 观测 gap 缩短 ⇒ B2 估计
 *    下探(族上尾候选无 8.33 下界)⇒ 平衡 ~8.0-8.1ms=123-125fps;125 帧映 120Hz 面板
 *    =呈现错配=用户实报"fps 飘 120-130+抖动"。v9.3 边界声明"估计器无关"只对读数
 *    漂移成立,本刀定谳残端在渲染 cadence 失顶(对估计器无关=门同样估计器无关)。
 *  - 断点刀:k=1 序数落拍面上加 cap 硬顶门(纯渲染侧钳,序数/minK/升降判据全不动):
 *    cap>0 ∧ now−lastRenderAt < target−CAP_TOP_TOL_MS ⇒ 跳过该 tick。机理=概率调速器:
 *    咬合率 b=Č(gap<阈),渲染率=(1−b)×ticker 率——阈 6.33/σ0.9 下 p=8.0 → b 3.2% →
 *    渲染 ~121;p=7.5 → b 9.7% → ~120;p=7.2 → 过钳 ~116——即 ticker 越超速咬合越紧,
 *    渲染率自调节钉在 cap±1,同时跳帧空档打破"恒早提交"=合成器加速的驱动源 ⇒
 *    ticker 回落 ⇒ 咬合熄灭 ⇒ 稳 cap 零咬合(活机终态)。k>1 档渲染 gap ≥ ~1.7×target
 *    (minK 地板 0.85×target 与门天然互锁)恒不咬合;cap=0(desktop UNCAPPED 判例)
 *    门死——cap>0 守卫是承重件(1000/0=Infinity 会吞全部帧)。
 *  - 容差定谳 CAP_TOP_TOL_MS=2(活机 b2-regress corpus 实测健康 cadence 帧距分布
 *    p01=6.60/min=6.00/sd≈0.81-1.06):阈 6.83(容差 1.5)假跳 3.4%=门自造摆动(否决);
 *    阈 5.83(2.5)零假跳但钳带抬到 ~158fps=cap 失效;阈 6.33(2.0)假跳 0.067%
 *    (2/2998,均在分布极尾)且用户平衡点 7.99 咬合率 3.2%=断环压力充分。与
 *    TARGET_GUARD_MS(2)同值同源=同一 2ms rAF 时间戳抖动带的上下半区(门=上限钳,
 *    护栏=下限兜底,两者互补不相交)。判别器数字:trace 回放流 min delta 7.2 ⇒ 全容差
 *    候选零咬合(630/630 渲染,rendered>620 锁不破);活机 cap120 稳态 capSkips=0。
 * ★v9.5 终局裁决=B2 全系清退(2026-10-06,Trace-20261006T033001 定谳;v9.0-v9.4 五次
 *   迭代到本刀为止,上文 v9/v9.1/v9.2/v9.3/v9.4 各注自此全部退役为实验轨史档):
 *  - 定谳数字(用户机 trace,subtle+cap120,29.06s 在册稳态):主循环 3684 回调,
 *    3406 渲染+278 skip(7.55%,全部孤立单发);skip 归因 gBefore=now−lastRenderAt
 *    分布在 6.5ms 断崖(44→5),<6.33(=v9.4 门咬合带)198 个=71%——门为跳帧主源;
 *    fps 读数(60 渲染帧滚动均值,Game.frameDts 唯一源)p50 117.9/68.4% 时间 <119/
 *    120 穿越 7.3 次/s/min 106.5-max 128.2 大幅震荡(用户实报"低于或高于 120 跳"
 *    逐字实锤);每次 skip 造一个 ~14-16.5ms 渲染帧距(236 个 >13ms 长帧距)="画面
 *    抖动严重"的可感本体(逻辑与绘制同帧停摆一拍)。
 *  - 机制定谳(现行源回放同一流,逐回调对账):①门与估计器无关——B2 est+门 与
 *    旧截尾均值 est+门 逐位同数字(回声 corr=0.206≪0.6,B2 估计器本会话恒未
 *    engage)→"保留门只回估计器"数学上无效;②门未达自身设计点——设计画像
 *    σ0.9→咬合 3.2%→渲染率钉 cap±1,实测 ticker(mean 7.92ms=126.2/s 超速带,
 *    2s 窗游走 7.76-8.54)短尾 σ2.64→咬合 6.8/s→渲染率 117.2,低于 cap 3%
 *    ("钉 cap±1"证伪);③无门配置(任一估计器)回放同一流:零 skip、渲染率
 *    126.7 恒、读数 p05-p95 122.3-130.6 零震荡、120 穿越 0.52/s、>13ms 长帧距
 *    12(vs 231)——与用户记忆"B2 前很稳"逐项吻合。
 *  - 机理:轻载会话(帧耗 p50 3.78ms)恒早提交 → Chrome 自适应合成器 ticker 超速
 *    (126/s)。k=1 序数落拍架构下引擎对超速 ticker 只有两种可选态:跟满(读数稳在
 *    ~125-130,零跳帧)或概率咬合(读数震荡+跳帧)——钳到 8.33 整拍=k=2=62.5,
 *    惩罚性不选项。B2 系列前引擎无门=跟满=用户记忆稳态;v9.4 门为断 B2 反馈环而
 *    设,环随估计器清退而消失,门的存在意义同步消失,实测面证明它是纯害。
 *  - 清退面:估计器回旧截尾均值(VSYNC_DISP_* 与 VSYNC_ECHO_* 常数族/famLo/显示
 *    族/回声账本全拆)+ v9.4 cap 硬顶门拆除(CAP_TOP_TOL_MS/capSkips/shouldRender
 *    门块)。
 *    v5-v8 判据面(升拍余量/降档帧率优先线/失拍双门/结算护栏/FLOOR_TOL 0.15)全部
 *    保留原样。B2 实验轨=git 历史+本文件 v9.x 史档注+tests/frame-beat.test.ts
 *    历史,复活须新证据另立项。
 *  - 「B2 收益是否曾被体感兑现」的裁决回答:否。B2 唯一目标(饱和段估计偏差
 *    est 11.54 vs 名义 8.33,+38.6%)度量自 Trace-20260929——该会话 frameSkipMode
 *    'off',节拍引擎根本不在渲染路径,偏差无任何 k 决策消费面;用户侧五次迭代
 *    期间的实报只有两次回归(v9.3 fps 飘 120-130、v9.4 持续抖动),零次正向体感。
 * ★v9.7 暂停态节拍冻结+minK 翻转防抖(2026-10-07,Trace-20261007T143900 定谳后双刀;
 *   v5 结构冻结令仍有效——本刀=【迁移动作面】两点,估计器/降档线/升拍线/失拍门/
 *   结算护栏零触碰):
 *  - 定谳(用户实报:暂停态帧率不稳,跑高到 130 或瞬间跌 60 再瞬间爬升;主线程全程闲
 *    hotSeconds=0 非性能不足):暂停态 rAF 回调流 ≈132/s 超 vsync(间隔 4-9.4ms 宽分布,
 *    p5=3.97——合成器 ticker 超速+BeginFrame 合并/分裂形态);机制=云批切换 GPU 冲刷
 *    尖峰(sheetAllTransparent 判例族)改变回调流形态 → 旧截尾均值估计窗内短间隔占比
 *    抖动 → est 跨 minK 门槛(cap120@120Hz 的 7.08ms) → 地板 1↔2 翻转=瞬间 60↔爬升
 *    振荡;130 读数=超速回调跟满的显示面(v9.5「读数稳 126.7」同族机器层,非病)。
 *  - 刀一 hold(暂停态迁移冻结):Game 侧每个 rAF 传 hold(语义面=this.paused 单源——
 *    autoPause 开界面/失焦/暂停浮层/图鉴面板/保存退出全部置位点汇于该字段,宽覆盖;
 *    另并入入场冻结窗/传送幕帘两个同族 fixedUpdate 停态)。hold 期间【k/minK 恒冻结
 *    不迁移】:容量降拍/地板抬升/滞回升拍/失拍降档全不走,渲染照常走当前拍(报告场景
 *    k=1 即每 vsync);瞬态记账(失拍/升拍保持/滞回计数)逐帧清零——跨暂停的陈旧账不得
 *    在恢复拍爆伪迁移。成本/估计面照常采样:冻结的是【动作】不是【观测】,恢复时 est
 *    即时新鲜。k 冻结在进入时的值(不强制回 1——强推反而是迁移;暂停前已被真降档的
 *    拍位保持,恢复后由正常判据接管)。
 *  - 刀二 minK 抬升滞回(floorRaiseDue 钩,protected=红判别器复刻点):结算期满后,
 *    est 驱动的地板抬升须连续 UPGRADE_WIN_SAMPLES×FLOOR_HOLD_WINDOWS(60 渲染帧
 *    ≈0.5s@120Hz)高于当前拍才落刀;判据破单窗即清零(与 UPGRADE_HOLD_WINDOWS「判据
 *    破即弃」同构,回落无滞回)。两类【即时豁免】(既有语义/既有测试锁,不回改):
 *    ①结算期内(settleGuard>0)——冷启动 est 从 GRID 先验(16.67)向真实网格的成熟
 *    跃迁是一步大阶不是边界抖动(v8 时代「冷启动 minK 瞬时抬高经滞回自愈」的既有
 *    画像即此,自愈路径保留);②cap 变更——用户明令收紧即时跟上(v8「cap 收紧即时
 *    抬高拍」语义)。防的病=成熟估计在门槛带内的抖动翻转让 floor 自造跳帧(地板
 *    抬升瞬间造一个 ~k+1 拍长帧距,随后升拍梯爬回=用户实报振荡本体)。
 *  - 禁区遵令:估计器本身(v9.5 终局裁决=回退 B2 全系)、降档线/升拍线(v9.6 刚落)、
 *    cap 门(已拆)全部原样。
 *  - 诚实边界:①130 读数本体不动——超速 ticker 跟满=v9.5 终局裁决的唯一稳态,本刀
 *    只治「迁移振荡」不治「读数高于 vsync 名义值」;暂停态 hold 下读数仍随 ticker
 *    超速走高(显示面,非拍迁移)。②滞回给 est 驱动的地板抬升加 ~60 渲染帧确认延迟:
 *    深超速(恒 5.5ms ticker=182Hz,既有测试锚)等真实抬升需求同样吃延迟(60 渲染内
 *    落刀,稳态行为面不变);结算期豁免保住冷启动既有时序。③est 在暂停期仍会跌破
 *    门槛(观测面不冻)——hold 只是让它【不能动刀】,恢复后若门槛下状态为真,由刀二
 *    滞回按正常证据落刀。④hold 冻结面在【一切迁移动作之上】(含 cap 变更即时豁免):
 *    暂停浮层里改 frameCap 生效于恢复拍首个 endRender(暂停期渲染照走旧拍——设置
 *    面打开本身即 paused,恒在 hold 域内)。
 * ★v9.8 根治刀=渲染决策纯时间门+k 迁移机制整体退役(2026-10-07,用户明令):
 *  - 用户裁决原话:「最简条件(暂停零渲染负载)下帧率都不稳=算法本身有问题,需要根治」。
 *  - 定谳(承接 v9.7 Trace-20261007T143900 画像并升格为机制级根因):暂停态 rAF 回调流
 *    ≈132/s 超 vsync、间隔 4-9.4ms 宽分布(BeginFrame 合并/分裂+超速 ticker)、主线程
 *    全程闲(非性能不足)——「回调=vsync 网格」假设系统性失效。截尾均值估计(est)被
 *    流形态污染 → est 跨 minK 门槛(cap120@120Hz 的 7.08ms) → 地板 1↔2 翻转 → k 1↔2
 *    = 95-110 波动/120 穿越/暂停振荡等一切历史帧率不稳实报的公共根因。且 k 迁移机制
 *    (对齐语义:帧距恒定消摆动)与 v6 帧率优先政策(帧耗落两档预算之间时【不齐但高】
 *    优先——即政策层明确接受帧距不齐)自相矛盾:政策既然选了"不齐但高",对齐机制便
 *    没有存在理由,只剩 est 抖动驱动 k 翻转这一条实害输出。B2 前用户「稳」=超速流上
 *    每回调渲染+读数稳 126.7(无迁移面)——时间门在超速流上复刻的正是该稳态。
 *  - 根治面:shouldRender 改【纯时间门】now−lastRenderAt ≥ targetMs(cap)−GUARD;
 *    k 迁移决策面整体停用(k 恒 1):capacityBreach 扫拍/minK 地板抬升/失拍降档/滞回
 *    升拍/floorRaiseDue 滞回全部不再驱动 k。观察/记账面(成本窗/est/序数/失拍账)
 *    照常运转,降级为诊断(F5/snapshot)——退役=停用决策面非删代码,判据钩子与常数
 *    全数保留,红判别器复刻点=migrationEnabled 钩(tests 覆写为 true 即整链恢复 v9.7
 *    迁移面=「回退到旧 k 迁移」的机械变异)。v9.7 hold 保留:时间门下 paused 天然无
 *    迁移,hold 兼容保留防回归(瞬态记账清零面照旧)。targetMs 语义保留:cap>0 直接
 *    1000/cap 换算(cap 执法面与估计器解耦);cap≤0=UNCAPPED 判例恒渲(桌面跟满,est
 *    不进决策,「估计即节奏」反馈环不成立)。est(vsyncPeriod)保留为诊断面。
 *  - GUARD 取值定谳 TARGET_GUARD_MS=4.5(取值用测试/真实语料标定,初始处方 0.5-1ms
 *    被标定否决):①真实机 merge/split 回调流零咬合——v9.5 LIVE corpus 最短间隔
 *    3.9ms/v9.7 暂停流 p5=3.97ms ⇒ 阈=target−GUARD ≤ 3.9 ⇒ GUARD≥4.43;GUARD≤2 时
 *    阈 6.33 落在流间隔带 [3.9,13.5] 内部=每回调随机咬合 ~12%(v9.4 门 7.55% skip
 *    ="画面抖动严重"同病,阈值放置本身就违头注「取代旧被动门」的带外放置教义);
 *    ②多回调拍抖动鲁棒:cap60@120Hz 两回调拍合计 16.67、±10% 抖动最小合计 15.0,
 *    阈 12.17 带外⇒零延拍(cap30 四回调拍合计 [30,36.7] vs 阈 28.83 同理);③cap
 *    取值域 {60,120,0}(Settings.ts:522-525 三态)在 60/120Hz 屏全部正确量化。
 *    时间门四形态语义(替换原 k 对齐语义,tests/frame-beat.test.ts 退役态回归锁):
 *    ①干净流恒屏率(逐回调全渲,帧距=回调间隔);②超速流跟满稳定(读数=流原生率,
 *    不钳不咬);③render-bound 帧距被帧耗钉死(帧耗 25ms→40fps 恒定无 flap——容量
 *    语义由时间门天然承载:帧耗>阈=每回调必渲);④暂停+云尖峰零振荡(无 est 无 k
 *    无迁移,帧距=流本相有界)。
 *  - 诚实边界:①超速流读数 126-132>cap=显示面(v9.5 裁决语义),本刀承诺稳定不承诺
 *    ≤cap;②阈=target−4.5 落在常见屏率单回调间隔之下 ⇒ 屏率足够高时 cap120 全速
 *    交付(vsync<3.83ms 即 >261Hz 屏;240Hz 屏 cap120 会交付 240=cap 失守)——cap
 *    语义=意图天花板+GUARD 松弛,旧 FLOOR_TOL 0.15 体系自有松弛带(全速线 cap≥102),
 *    松弛带移位随本刀登记;③深超速 fiction(恒 5.5ms ticker=182Hz)不再被 minK 地板
 *    钳到 91,时间门跟满交付——真实合成器 ticker 观测带 126-132/s,sub-4ms 持续
 *    ticker 无实证机形;④BeginFrame 合并/分裂流上时间门不再自造跳帧(阈带外),
 *    帧距=流本相(合并本就=一帧)。
 */

/** 原版 present 网格常数(60Hz;improvedSubtle EndDraw 钳值 TARGET_FRAME_TIME×599/600)。
 *  ★热修刃(2026-09-28)起【不再作拍地板】(否决注见头注):仅作 vsync 估计先验初值
 *  与测试对照常数 */
export const GRID_MS = 1000 / 60;
/** 拍上限(vsync 整数倍的最深降级;60Hz 屏即 10fps——成本 p95>100ms 时渲染已死,兜底不再降) */
export const BEAT_K_MAX = 6;
/** 升拍判据窗粒度(成本样本数;半窗=30 渲染帧——判据连续满足以半窗为拍记程,
 *  轻于旧 p95 制的 2s 墙钟:k=2@120Hz 下 2 半窗=60 渲染帧≈1s) */
export const UPGRADE_WIN_SAMPLES = 30;
/** 升拍需【连续】满足判据的窗数(任务处方 N=2~3 取 2;判据破即清零重计——与降拍
 *  立即组合=准稳态,防升拍后立即降拍的震荡面失稳) */
export const UPGRADE_HOLD_WINDOWS = 2;
/** 升拍余量(v9.6 棘轮死锁刀,2026-10-07):p50 < budget(k)×此系数 即升一档——比较基准
 *  从 v5 的 budget(k−1) 改为【当前档预算】。旧式 p50<budget(k−1)×0.9 在 k=2 时线=
 *  7.5ms(120Hz),而用户机常态帧耗 9-15ms(头注 v6 实测)【数学上永不可达】→k≥2 后
 *  升拍判据恒 false=单向棘轮:任何一次降档(入场巨帧簇/黄昏负载簇把 p50 推过降档线)
 *  即永久锁死低档,重进世界(reset k=1)是唯一出口=用户实报「偶现死亡螺旋一直降帧,
 *  重进就好」。v6 帧率优先政策(降档线注释)本要求帧耗装进两档之间时留高档,升拍线
 *  同政策对称化:帧耗装进当前档预算即逐级回升——k=3→2→1 快速爬升,高档 realized
 *  (90-110 不齐)帧率优先于低档对齐(60)。
 *  振荡审(帧率优先政策自洽):帧耗 9-15 留 k=1(降档线 18.3 不咬)——k=1 是顶无升拍;
 *  帧耗 19 降 k=2 后 19>16.6×0.9 不升(稳 60 对齐);帧耗 15 在 k=2(曾降)→15<14.97
 *  边界内 → 升 k=1 → k=1 降档线 18.3 不咬=稳 1(帧率优先)——降档线 18.3 与升回线
 *  15 之间仍有滞回带,无 1↔2 抖动源。UPGRADE_HOLD_WINDOWS(连续 2 半窗)护栏不动。
 *  旧语义(比较 budget(k−1))的「防打架」价值由降档线×1.1 独立承载(两线间距=滞回)。 */
export const UPGRADE_HEADROOM = 0.9;

/** 降档余量(v6 帧率优先刀):p50 > budget(k+1)×此系数 才降档——降档线从"中位刚超
 *  当前拍预算"(v5)上移到"中位超过【下一更低档】预算×1.1"。政策(用户明令,见头注
 *  v6):帧耗落在两档预算之间时帧率优先(不齐但高)>对齐但低——k 档实际能跑出高于
 *  (k+1) 档对齐帧率的 realized rate 时留在高档,realized 跌破下一档对齐帧率 ~91%
 *  (÷1.1)才降。k=1@120Hz 线=18.3ms:p50 9-15 的会话留 k=1 跑 ~90-110,18ms+ 才降
 *  60 档(那时 k=1 只剩 ~55 不齐,对齐 60 确实更快) */
export const DOWNGRADE_MARGIN = 1.1;
/** minK 抬升滞回窗数(v9.7 minK 翻转防抖刀):est 驱动的地板抬升须连续此数×
 *  UPGRADE_WIN_SAMPLES(决策窗粒度=30 渲染帧,同构 UPGRADE_HOLD_WINDOWS 的
 *  「连续窗+判据破即清零」结构)高于当前拍才落刀——防成熟估计在 FLOOR 门槛带
 *  (如 cap120@120Hz 的 8.33×0.85=7.08ms)内抖动翻转时 floor 自造跳帧(Trace-
 *  20261007T143900 定谳:暂停态云尖峰形态 → est 跨 7.08 → 地板 1↔2 翻转=瞬间
 *  60↔爬升振荡)。回落单窗即回(判据破即清零,无回落滞回);结算期(settleGuard>0,
 *  估计未熟)与 cap 变更两类即时豁免见 floorRaiseDue 注/头注 v9.7 */
export const FLOOR_HOLD_WINDOWS = 2;
/** 失拍判定:帧距 >(k+MISS_SLACK)×vsync(0.7=滑过 1 拍尚容 ±0.3 拍 rAF 抖动) */
export const MISS_SLACK = 0.7;
/** 失拍对齐豁免带(v7 案①,相对):帧距与 (k+1)×vsync 偏差 ≤max(此系数×vsync,2ms)
 *  =单拍对齐顺延(present 恒落网格),不计失拍。0.2 实测定线:锁相真流对齐 gap 偏差
 *  ≤1.5ms,而 stall 帧距(46.7)距 (k+1) 倍点 ≥3.3ms——两态分离清晰 */
export const MISS_GRID_TOL_REL = 0.2;
/** 失拍对齐豁免带(绝对下限 ms;vsync 估计偏小时保持豁免带不塌缩) */
export const MISS_GRID_TOL_MS = 2;
/** 失拍降档连续门(v7.1 瞬态簇豁免):连续失拍达此次数才有降档资格——原 2 在
 *  120Hz 下只等于 ~17ms 的持续失稳,开图/开包瞬态大帧簇(1-5 帧)即误触;4 仍只
 *  是 ~33ms@120Hz 的检测延迟,真容量失稳(无界滞时)照样覆盖 */
export const MISS_STREAK_DOWNGRADE = 4;
/** 失拍降档持续门(v7.1):簇内滞时累计(Σ(gap−失拍阈),逐失拍帧累加、断拍即清)
 *  达此毫秒才降——有界瞬态簇(开图/开包 ~50-150ms 总滞时)被此门吸收;标定:
 *  120Hz 开包最坏簇 5×(38−14.2)≈119ms<200 不降;30fps 持续负载 excess ~19ms/拍
 *  → ~11 拍(~0.37s)触门,检测代价可忽略 */
export const MISS_STALL_BUDGET_MS = 200;
/** vsync 周期样本窗(截尾均值估计;rAF 回调间隔) */
const VSYNC_WIN = 31;
/** 渲染帧成本样本窗(p95) */
const COST_WIN = 60;
/** vsync 周期钳(防未锁 vsync 的无头/离屏 rAF 与暂停恢复大空洞) */
const VSYNC_MIN_MS = 2;
const VSYNC_MAX_MS = 100;
/** >此间隔的 vsync 样本视为断流(tab 隐藏/调试暂停),清窗不采样 */
const VSYNC_GAP_RESET_MS = 250;
// ★B2 去回声估计器常数族(VSYNC_DISP_*/VSYNC_ECHO_*/VSYNC_ADMIT_*/VSYNC_IQR_*/
//  VSYNC_BIMODAL_*/VSYNC_SANITY_*/VSYNC_FAM_*/VSYNC_RESEED/VSYNC_STARVE_FLUSH)已于
//  v9.5 终局裁决(2026-10-06)整族清退,机制定谳与清退理由见头注 v9.5;实验轨史档
//  =git 历史+tests/frame-beat.test.ts 历史。回声债(v5/v7 立案)随清退一并销案:
//  其唯一度量来源会话(Trace-20260929)frameSkipMode='off',引擎不在渲染路径,
//  偏差无 k 决策消费面,从未被体感兑现(头注 v9.5 有裁决原文)。

/** 旧估计器(截尾均值;B2 前唯一估计式)——模块级纯函数:红判别器旧侧复刻点+
 *  去回声估计器的回退基(无显示族证据/任一门拒绝时用)。
 *  ★截尾均值(非中位数):渲染超支时回调流呈【双峰】(超支时长/剩余节拍交替——
 *  真实 Chrome 形态,busy 解堵即跑 rAF),中位数按窗奇偶在双峰间翻转=估计跳变
 *  (首版实测 60Hz 假失拍级联/地板翻转);截尾均值对双峰恢复真值、对单峰抖动
 *  ≈中位数、对罕见迟回调稳健 */
export function trimmedMeanVsync(win: number[]): number {
  if (win.length === 0) return GRID_MS;
  const s = [...win].sort((a, b) => a - b);
  // 截尾数须留 ≥1 样本(小窗 n=1/2 时 ceil(n×0.1) 会吃光窗口→除零/负分母)
  const trim = Math.min(Math.ceil(s.length * 0.1), (s.length - 1) >> 1);
  let sum = 0;
  for (let i = trim; i < s.length - trim; i++) sum += s[i];
  return Math.min(VSYNC_MAX_MS, Math.max(VSYNC_MIN_MS, sum / (s.length - 2 * trim)));
}
/** shouldRender 时间门余量(★v9.8 根治刀起=渲染主决策面常数;取值用测试/真实语料
 *  标定,初始处方 0.5-1ms 被标定否决——标定算术与理由见头注 v9.8):真实机 merge/
 *  split 流零咬合跟满(最短间隔 3.9 ⇒ GUARD≥4.43)+多回调拍 ±10% 抖动带外(cap60@
 *  120Hz 两回调拍最小合计 15.0 ⇒ 阈 12.17 带外)+cap 值域 {60,120,0}@60/120Hz 屏
 *  全正确量化。取 4.5=三面包络 */
export const TARGET_GUARD_MS = 4.5;
/** ★v9.9 相位锚定调度：累计器过门余量——只防 rAF 时间戳抖动（0.75ms 带）。 */
export const DUE_GUARD_MS = 0.75;
// ★v9.4 cap 硬顶门(CAP_TOP_TOL_MS/capSkips/shouldRender 门块)已于 v9.5 终局裁决
//  (2026-10-06)拆除:用户机 Trace-20261006T033001 定谳门=278 skip 中 198(71%)的
//  咬合源、渲染率被压 117.2<cap 120(设计点 cap±1 证伪)、fps 读数 120 穿越 7.3 次/s
//  =用户实报"低于或高于 120 跳"的直接机制;无门回放零 skip+读数稳 126.7。定谳/机
//  理见头注 v9.5,门语义史档=本文件 v9.4 注+tests 历史。
/** 拍地板容差(相对):minK 折算容许 vsync 估计低于目标 15%——★v8 放宽(2026-09-30
 *  "升 120 被拉回 60"定谳:拍迁移记录仪实锤 floor=2 反复触发,用户的 rAF 间隔估计
 *  =7.93-8.00ms(比理论 8.33 系统性低 ~4.2%,Chrome/Metal 时间戳语义)——旧 0.04
 *  容差(阈值=目标×0.96=8.0ms)被 0.25% 的越界反复击穿=120↔60 打摆 79 翻转/43s。
 *  0.15 下 7.98 ≥ 8.33×0.85=7.08 → floor=1 ✓;真 60Hz 屏判别(估计 16.7≫目标)
 *  与 cap30/cap60 折算不受影响。容差须【相对】于目标周期:绝对 ε 会被估计噪声
 *  击穿(60Hz 拍 ratio 1.02 处地板 1↔2 翻转=恒久 30fps,首版实测炸点) */
const FLOOR_TOL = 0.15;

/** 拍变更原因(诊断/探针)。★v5:'overbudget'(v4 单帧立即降)已退役——成本驱动
 *  降拍统一 'capacity';类型保留该字面量仅为旧探针快照兼容,引擎不再发出 */
export type BeatReason = 'init' | 'capacity' | 'overbudget' | 'miss-streak' | 'upgrade' | 'floor';

export class FrameBeat {
  /** 当前拍:每 k 个 vsync 渲染一次。★v9.8:k 迁移退役后恒 1(渲染决策=纯时间门,
   *  见 shouldRender/头注 v9.8);字段与 snapshot 面保留=诊断/兼容 */
  k = 1;
  /** 自上次渲染起累计的 vsync 回调数(帧序计数;渲染后归零) */
  ordinal = 0;
  /** 用户帧率上限(0=不设限;仅作天花板,经 observeVsync 注入——引擎不读 options) */
  protected cap = 0;
  /** vsync 周期估计(ms;rAF 回调间隔中位数) */
  vsyncPeriod = GRID_MS;
  /** 最近一次拍变更原因(诊断/探针) */
  lastReason: BeatReason = 'init';

  private vsyncDeltas: number[] = [];
  private lastVsyncTs = -1;
  private costWin: number[] = [];
  protected lastRenderAt = -1;
  /** ★v9.9 相位锚定调度：下次预定渲染时刻（n×target 序列）——-1=未锚定。正常流锁相
   *  vsync；超速流预定不提前=限速 120 稳定；慢流累计补拍；掉帧重锚防追赶风暴。 */
  private _nextDue = -1;
  /** 上次渲染帧距(beginRender 时记;endRender 作失拍判定) */
  private lastGap = 0;
  /** 升拍判据连续满足计数(渲染帧数;达 UPGRADE_WIN_SAMPLES×UPGRADE_HOLD_WINDOWS 即升一级;
   *  判据破/失拍/任何拍变更即清零——v3 p50 制的防抖面,替代旧 holdSince 墙钟) */
  private upHoldN = 0;
  private missStreak = 0;
  /** 簇内滞时累计(v7.1 持续门):Σ(gap−失拍阈) 逐失拍帧累加,断拍/拍变更/降档即清
   *  ——与 missStreak 同生命周期(有界瞬态簇吸收面,见 MISS_STALL_BUDGET_MS 注) */
  private missStallMs = 0;
  /** 入场结算护栏(v7 案②):>0 期间 capacityBreach 恒 false——降拍判据须 costWin
   *  全窗(60 渲染帧)证据才允许动作。构造/resetSampling 各挂满一次(入世界首簇重帧
   *  是 reset 之后的过期证据,不得以薄窗驱动扫拍;floor/miss-streak 不受此护栏) */
  private settleGuard = COST_WIN;
  /** 暂停态 hold(v9.7 刀一):true 期间拍状态机迁移全冻结(k/minK 恒定,渲染照常走
   *  当前拍)——语义面=Game.paused 单源(autoPause/失焦/暂停浮层/图鉴/保存退出)+入场
   *  冻结窗+传送幕帘;见头注 v9.7。hold(on) 每 rAF 由 Game 侧喂 */
  private holdOn = false;
  /** minK 抬升滞回计数(v9.7 刀二):连续「floor>k」的渲染帧数,达
   *  UPGRADE_WIN_SAMPLES×FLOOR_HOLD_WINDOWS 落刀;判据破(回落单窗)/落刀/hold 期
   *  即清零 */
  private floorHoldN = 0;
  /** 上次地板决策所见 cap(v9.7):与当前 cap 不同=用户明令收紧,地板抬升豁免滞回
   *  即时跟上(v8 既有语义);每 endRender 刷新 */
  private floorCapSeen = -1;

  /** 暂停态 hold 开关(v9.7 刀一;每 rAF 由 Game 侧喂——语义面见 holdOn 字段注):
   *  只冻结【迁移动作】不冻结【观测面】——vsync/成本采样照常,恢复时估计即时新鲜 */
  hold(on: boolean): void {
    this.holdOn = on;
  }

  /** 目标周期:用户 frameCap 天花板;cap=0(不设限)=1×vsync(拍=每 vsync 渲一次)。
   *  ★热修刃(2026-09-28):废除首版 60Hz 网格地板 max(GRID_MS,·)——原版网格地板是
   *  "逻辑=呈现同帧"架构下的速度保全手段,本仓逻辑 60Hz 解耦后只剩"静默覆盖用户
   *  设置"一条实害(cap=120/0 被压回 60=用户实报);subtle 只对齐不钳速(否决注见头注) */
  targetMs(cap = this.cap): number {
    return cap > 0 ? 1000 / cap : this.vsyncPeriod;
  }

  /** 拍地板:最小 k 使 k×vsync ≥ (1−容差)×目标周期(整数倍折算+估计噪声容差;
   *  cap=0/cap≥屏率 → 拍 1(全速);cap60@120Hz 拍 2;cap30@120Hz 拍 4;cap30@60Hz 拍 2) */
  minK(vsyncPeriod = this.vsyncPeriod, cap = this.cap): number {
    return Math.max(1, Math.ceil((this.targetMs(cap) * (1 - FLOOR_TOL)) / vsyncPeriod));
  }

  /** 拍容量预算(渲染帧成本预算=拍周期本身) */
  budget(k = this.k, vsyncPeriod = this.vsyncPeriod): number {
    return k * vsyncPeriod;
  }

  /** 渲染帧成本滚动 p50(中位数,空窗=0)——【升/降拍判据基】(v5 自洽:升降共用中位数,
   *  余量分隔——p50<budget(k−1)×0.9 升,p50>budget(k+1)×1.1 降(v6 帧率优先线,见头注
   *  v6);单帧尖峰只进 p95 诊断面,不驱动任何档位迁移,见头注 v5) */
  costP50(): number {
    if (this.costWin.length === 0) return 0;
    const s = [...this.costWin].sort((a, b) => a - b);
    return s[Math.floor(0.5 * (s.length - 1))];
  }

  /** 渲染帧成本滚动 p95(空窗=0)——【诊断面】(v5 起不驱动档位迁移:v4 失效形态=
   *  p95 降拍与 p50 升拍在边界会话同时成立 → flap;尖峰超支由失拍看门狗兜底) */
  costP95(): number {
    if (this.costWin.length === 0) return 0;
    const s = [...this.costWin].sort((a, b) => a - b);
    return s[Math.floor(0.95 * (s.length - 1))];
  }

  /**
   * 每个 rAF 回调必经(先于任何跳帧判定)——喂 vsync 序列估计周期。
   * cap:当前用户帧率上限(0=不设限),变更即时生效。
   */
  observeVsync(now: number, cap: number): void {
    if (this.cap !== cap) this._nextDue = -1;   // ★v9.9:cap 变更=相位按新 target 重排
    this.cap = cap;
    let d: number | undefined;
    if (this.lastVsyncTs >= 0) {
      d = now - this.lastVsyncTs;
      if (d > VSYNC_GAP_RESET_MS) {
        this.vsyncDeltas.length = 0;            // 断流(tab 隐藏恢复):清窗防大空洞污染估计
      } else {
        this.vsyncDeltas.push(d);
        if (this.vsyncDeltas.length > VSYNC_WIN) this.vsyncDeltas.shift();
        this.vsyncPeriod = this.estimateVsync();
      }
    }
    this.lastVsyncTs = now;
    // 帧序计数=【估计 vsync 数】而非回调数:Chrome 忙合成器会合并回调(一次回调跨
    // 多个网格点),裸回调计数会欠数 → 拍滑一个 vsync(实机 120Hz cap30 实测 13 跳);
    // 按本回调间隔折算 vsync 数对合并鲁棒,对正常流(间隔≈估计值)恒 +1 同构
    if (d === undefined) this.ordinal++;
    else this.ordinal += Math.min(8, Math.max(1, Math.round(d / this.vsyncPeriod)));
  }

  /** vsync 估计式(protected hook=红判别器复刻点):截尾均值。
   *  ★v9.5 终局裁决(2026-10-06):B2 去回声估计器(v9-v9.3 的显示族/回声账本/
   *  corr-resid 双门/q85 候选)整族清退,估计器回到 B2 前唯一估计式。裁决依据见
   *  头注 v9.5:用户机 Trace-20261006T033001 实测回声 corr=0.206≪0.6,B2 估计器
   *  在实报会话恒未 engage(零贡献),其迭代期的两次用户体感回归均来自同系的
   *  v9.4 cap 门(已一并拆除)。回声债(v5/v7 立案)就此销案:度量自 off 档会话,
   *  无 k 决策消费面,从未被体感兑现。实验轨史档=git 历史+tests 历史。 */
  protected estimateVsync(): number {
    return this.legacyEstimate();
  }

  /** 旧估计式(截尾均值;B2 前唯一估计式,现役)——红判别器复刻点。
   *  ★截尾均值(非中位数):渲染超支时回调流呈【双峰】(超支时长/剩余节拍交替——
   *  真实 Chrome 形态,busy 解堵即跑 rAF),中位数按窗奇偶在双峰间翻转=估计跳变
   *  (首版实测 60Hz 假失拍级联/地板翻转);截尾均值对双峰恢复真值、对单峰抖动
   *  ≈中位数、对罕见迟回调稳健 */
  protected legacyEstimate(): number {
    return trimmedMeanVsync(this.vsyncDeltas);
  }

  /** 本回调是否落拍(渲染)。★v9.8 根治刀=【纯时间门】:now−lastRenderAt ≥
   *  targetMs(cap)−TARGET_GUARD_MS 即渲;序数/k/est 全部退出决策面(退役理由/定谳
   *  链见头注 v9.8)。四形态语义:①干净流=逐回调全渲恒屏率(阈带外零咬合);②超速
   *  流=跟满稳定(读数=流原生率,v9.5「无门配置读数稳 126.7」同相);③render-bound
   *  =帧耗>阈每回调必渲,帧距被帧耗钉死(容量语义天然承载);④暂停+云尖峰宽分布流
   *  =帧距=流本相零振荡(无 est 无 k 无迁移)。
   *  cap≤0=UNCAPPED 判例恒渲(桌面跟满;est 不进决策,「估计即节奏」反馈环不成立)。
   *  阈值放置教义:阈=target−4.5 严格落在真实流间隔带 [3.9,13.5] 与多回调拍合计带
   *  之外(头注 v9.8 标定)——阈值不落抖动带内 ⇒ 零随机翻转=「取代旧被动门」条
   *  的带外放置教义在时间门上的落实。
   *  历史:v9.4 cap 硬顶门(同构时间门但以概率咬合断环为目的,阈 6.33)已被 v9.5
   *  定谳拆除(7.55% skip=纯害);本门与之的语义差在 GUARD 处方与目的——门不追求
   *  咬合(阈压在流间隔带下沿之外),只承载 cap 执法与 render-bound 容量语义 */
  shouldRender(now: number): boolean {
    if (this.cap <= 0) return true;
    if (this._nextDue < 0) return true;   // 首帧/resetSampling 后立即渲(-1 哨兵不得当 1ms elapsed 吞首帧)
    return now >= this._nextDue - DUE_GUARD_MS;   // ★v9.9:相位锚定（n×target 序列,非渲完重置）;cap<=0/未锚定支见上
  }

  /** 降拍判据(v6 帧率优先制+ v7 案②结算护栏;protected hook=红判别器旧侧复刻点):
   *  持续中位超支超过【下一更低档】预算×DOWNGRADE_MARGIN,且 costWin 全窗成熟
   *  (settleGuard=0——入世界首簇重帧不得以薄窗驱动扫拍,见头注 v7)。v5 旧线=
   *  costP50>budget(k)(中位刚超当前拍预算即降)已废——用户实报帧耗 9-15ms 场景被锁
   *  60/40,而该区间 k=1 realized(~90-110 不齐)仍高于 60 档对齐帧率,帧率优先留高档
   *  (政策/边界语义见头注 v6)。单帧尖峰【不】在此——beat 对齐下顺延一个 vsync 无感,
   *  持续中位超支才是真降档理由 */
  protected capacityBreach(): boolean {
    if (this.settleGuard > 0) return false;
    return this.costP50() > this.budget(this.k + 1) * DOWNGRADE_MARGIN;
  }

  /** 地板抬升放行判定(v9.7 minK 翻转防抖刀;protected hook=红判别器旧侧复刻点——
   *  旧侧=恒 true 即时落刀,由 OldImmediateFloorBeat 复刻)。滞回面:est 驱动的抬升
   *  须连续 UPGRADE_WIN_SAMPLES×FLOOR_HOLD_WINDOWS(60 渲染帧)floor>k 才放行;两类
   *  即时豁免:①结算期内(settleGuard>0)——冷启动 est 从 GRID 先验向真实网格的成熟
   *  跃迁是一步大阶非边界抖动,且既有测试锁(cap60@120Hz 冷启动 slice(40) 内完成)
   *  钉此时序;②cap 变更(floorCapSeen≠cap)——用户明令收紧即时跟上(v8 语义)。
   *  调用侧已保证 k<floor;floorHoldN 的清零面在 endRender(落刀/回落/hold) */
  protected floorRaiseDue(): boolean {
    if (this.settleGuard > 0) return true;
    if (this.cap !== this.floorCapSeen) return true;
    return ++this.floorHoldN >= UPGRADE_WIN_SAMPLES * FLOOR_HOLD_WINDOWS;
  }

  /** 失拍判据(v7 案①对齐豁免;protected hook=红判别器旧侧复刻点):帧距超
   *  (k+MISS_SLACK)×vsync 且【不】恰为 (k+1)×vsync(±豁免带)=真失稳(离网格漂移);
   *  恰滑一拍落回网格(n=k+1)=对齐顺延(present 恒落网格=零抖动;k=1+帧耗 9-15 的
   *  物理 2-vsync 锁相节奏属此)——不是容量失稳,不计失拍。★只豁免单拍顺延:更深
   *  滑移(n≥k+2)照旧计失拍——持续深滑=真容量不足,且网格走查驱动器下持续 stall 的
   *  帧距恰量化到网格倍点上,全倍点豁免会失明(连续失拍看门狗测试即此形态)。实测锚
   *  见头注 v7 */
  protected isCapacityMiss(gap: number, vsync: number): boolean {
    if (gap <= (this.k + MISS_SLACK) * vsync) return false;
    const n = Math.round(gap / vsync);
    if (n === this.k + 1 && Math.abs(gap - n * vsync) <= Math.max(MISS_GRID_TOL_REL * vsync, MISS_GRID_TOL_MS)) return false;
    return true;
  }

  /** 升拍判据(v9.6 棘轮死锁刀;protected hook=红判别器旧侧复刻点):中位数装进
   *  【当前档】预算且留 UPGRADE_HEADROOM 余量即升——旧式比较 budget(k−1) 在
   *  k≥2 时线低于用户机常态帧耗=数学上永不可达(单向棘轮,详见 UPGRADE_HEADROOM
   *  注)。旧侧(比较上一档)由 OldRatchetBeat 红判别器复刻=红面完整性。 */
  protected upgradeCleared(): boolean {
    return this.costP50() < this.budget(this.k) * UPGRADE_HEADROOM;
  }

  /** 渲染开始(shouldRender 为真后调用):重置序数、记帧距锚 */
  beginRender(now: number): void {
    this.lastGap = this.lastRenderAt >= 0 ? now - this.lastRenderAt : 0;
    this.lastRenderAt = now;
    this.ordinal = 0;
    // ★v9.9 相位推进：+target 步进；慢流重锚到 now（落后不追讨）；快流恒 +target=限速。
    this._nextDue = this._nextDue < 0 ? now + this.targetMs() : Math.max(this._nextDue + this.targetMs(), now);
  }

  /** 失拍降档双门(v7.1 瞬态簇豁免;protected hook=红判别器旧侧复刻点):连续性
   *  (missStreak≥MISS_STREAK_DOWNGRADE)×持续量(滞时累计≥MISS_STALL_BUDGET_MS)
   *  同时成立才降。旧语义(连续 2 即降)由 OldAlignedMissBeat 覆写复刻=案①红面。 */
  protected missDowngradeDue(): boolean {
    return this.missStreak >= MISS_STREAK_DOWNGRADE && this.missStallMs >= MISS_STALL_BUDGET_MS;
  }

  /** ★v9.8 k 迁移退役闸(protected hook=变异证红复刻点;退役=停用决策面非删代码):
   *  false(现役)=endRender 内整段 k 迁移决策面(容量扫拍/minK 地板抬升/滞回升拍/
   *  失拍降档)停用,k 恒 1,est/序数/成本判据降级为诊断面(F5/snapshot)。红判别器
   *  OldMigrationBeat(tests)覆写为 true=整链恢复 v9.7 迁移面——变异证红:暂停+
   *  云尖峰流上 est 跨 minK 门槛 → 地板 1↔2 翻转+升拍梯爬回的振荡形态复现(头注
   *  v9.8 定谳链),退役态同流零迁移。退役理由(用户裁决原话/定谳数字/政策矛盾
   *  论证)见头注 v9.8 */
  protected migrationEnabled(): boolean {
    return false;
  }

  /** 渲染结束:now=渲染帧完成时刻(performance.now,与 rAF 时间戳同源)。★v9.8:
   *  采样/记账面照常(成本窗/失拍账=诊断),k 迁移决策面经 migrationEnabled 闸停用 */
  endRender(now: number): void {
    const cost = this.lastRenderAt >= 0 ? now - this.lastRenderAt : 0;
    this.costWin.push(cost);
    if (this.costWin.length > COST_WIN) this.costWin.shift();
    if (this.settleGuard > 0) this.settleGuard--;   // v7 案②:全窗证据计数(costWin 满=护栏释放)
    // ★v9.7 刀一 暂停态 hold:画面静止(fixedUpdate 停)期间降/升拍/地板迁移无观感
    //  意义——k/minK 恒冻结不迁移(渲染照常走当前拍),瞬态记账逐帧清零(跨暂停的
    //  陈旧失拍/升拍保持/滞回账不得在恢复拍爆伪迁移);成本/估计采样已照常完成
    //  (上方),冻结的是【动作】不是【观测】。头注 v9.7
    if (this.holdOn) {
      this.missStreak = 0;
      this.missStallMs = 0;
      this.upHoldN = 0;
      this.floorHoldN = 0;
      return;
    }
    const vsync = this.vsyncPeriod;
    const floor = this.minK();   // ★v9.8:诊断面(minK 不再驱动地板抬升,k 恒 1)
    const prevK = this.k;
    const prevReason = this.lastReason;
    const preState = { cost, gap: this.lastGap, vsync, p50: this.costP50(), p95: this.costP95(),
      breach: this.capacityBreach(), miss: this.missStreak, stallMs: this.missStallMs,
      floor, settle: this.settleGuard };

    // 失拍记账(帧距在 beginRender 记)——★v9.8 降级为纯诊断面(snapshot.miss/F5
    //  观察),不驱动任何降档。对齐顺延豁免见 isCapacityMiss(v7 案①);
    // 滞时累计=双门之持续量(v7.1,见 missDowngradeDue/MISS_STALL_BUDGET_MS 注)
    if (this.isCapacityMiss(this.lastGap, vsync)) {
      this.missStreak++;
      this.missStallMs += Math.max(0, this.lastGap - (this.k + MISS_SLACK) * vsync);
    } else {
      this.missStreak = 0;
      this.missStallMs = 0;
    }

    // ★v9.8 k 迁移决策面(整体退役,migrationEnabled()=false 闸停用)——判据组原样
    //  保留在分支内(退役=停用决策面非删代码);红判别器覆写钩子=true 即整链恢复
    //  v9.7 迁移面=「回退到旧 k 迁移」的机械变异(振荡形态复现=证红,见头注 v9.8)
    if (this.migrationEnabled()) {
      // 降拍(v6 帧率优先制,唯一成本判据):持续中位超支超过【下一更低档】预算×1.1 →
      // 逐级扫到首个能容纳的拍。帧率优先政策(用户明令,见头注 v6):v5 旧线"中位刚超
      // 当前拍预算即降"把帧耗 9-15ms 会话锁 60/40,已废——两档预算之间的不齐高帧率
      // 优于对齐低帧率。★v4 的"单帧超预算立即降"仍废除——beat 对齐下单帧超支=顺延
      // 一个 vsync(对齐节拍,无感),不是降档理由;尖峰超支由下方失拍看门狗兜底
      while (this.k < BEAT_K_MAX && this.capacityBreach()) {
        this.k++;
        this.lastReason = 'capacity';
      }
      // 拍地板(vsync 重估/cap 收紧可抬高 minK)——★v9.7 刀二 minK 翻转防抖:est 驱动
      //  的抬升走 floorRaiseDue 滞回(结算期满后须连续 60 渲染帧高于当前拍;回落单窗即
      //  清),结算期/cap 变更两类即时豁免(v8 既有语义+既有测试锁,见 floorRaiseDue 注)
      if (this.k < floor) {
        if (this.floorRaiseDue()) {
          this.k = floor;
          this.lastReason = 'floor';
          this.floorHoldN = 0;
        }
      } else {
        this.floorHoldN = 0;   // 回落单窗即回(判据破即清零,UPGRADE_HOLD_WINDOWS 同构)
      }
      this.floorCapSeen = this.cap;

      if (this.k !== prevK) {
        // 任何拍变更:相位重锚+记账复位(旧拍成本样本对新拍预算失义;不追赶中途)
        this.ordinal = 0;
        this.missStreak = 0;
        this.missStallMs = 0;
        this.upHoldN = 0;
      } else {
        // 单次失拍=余量警示:升拍保持即弃(拍可信度存疑,重计连续窗)
        if (this.missStreak > 0) this.upHoldN = 0;
        // 滞回升拍(一步):k>地板 且 p50<budget(k−1)×0.9(余量) 连续 2 半窗(60 渲染帧);
        // 条件破即弃(v5 余量制见头注:中位数贴预算的边界会话驻留低档,消除升/降打架面;
        // 防抖=连续窗计数,轻于旧 2s)
        if (this.k > floor && this.upgradeCleared()) {
          if (++this.upHoldN >= UPGRADE_WIN_SAMPLES * UPGRADE_HOLD_WINDOWS) {
            this.k--;
            this.lastReason = 'upgrade';
            this.ordinal = 0;          // 相位重锚:升拍后不追赶中途
            this.upHoldN = 0;          // 下一级重新计窗
            this.missStreak = 0;
          }
        } else {
          this.upHoldN = 0;
        }
        // 连续失拍+滞时双门=容量不足 → 降拍(单次失拍只弃升拍保持,不降档;v7.1
        // 瞬态簇豁免——有界大帧簇不降,真持续失稳 ~0.2-0.4s 内必触,见头注)
        if (this.missDowngradeDue() && this.k < BEAT_K_MAX) {
          this.k++;
          this.lastReason = 'miss-streak';
          this.ordinal = 0;
          this.missStreak = 0;
          this.missStallMs = 0;
          this.upHoldN = 0;
        }
      }
    }
    // ★拍迁移记录仪（2026-09-30 "升 120 被拉回 60"定谳仪）:任何拍变更即打印
    //  完整降/升拍瞬间状态（work=帧 span/vsync 估计/p50/ breach 判定/失拍账/
    //  地板/护栏）——三降档臂与观测数据对不上账的 Blackbox 一发定谳。
    if (this.k !== prevK || this.lastReason !== prevReason) {
      console.warn(`[beat] k:${prevK}→${this.k} reason=${this.lastReason} ` +
        `work=${preState.cost.toFixed(1)} gap=${preState.gap.toFixed(1)} vsync=${preState.vsync.toFixed(2)} ` +
        `p50=${preState.p50.toFixed(1)} p95=${preState.p95.toFixed(1)} breach=${preState.breach} ` +
        `miss=${preState.miss} stall=${preState.stallMs.toFixed(0)} floor=${preState.floor} guard=${preState.settle}`);
    }
  }

  /**
   * 采样面复位(★v9.8:k 恒 1 不再归地板——渲染拍位由纯时间门承载;清成本/失拍/
   * 相位记账;vsync 估计保留——它由 observeVsync 连续维护,与负载无关,现役仅作
   * 诊断面)。
   * 调用点=进世界(afterWorldLoad)——世界生成/读档期的重载帧成本账均为过期证据,
   * 不得带进图后(实测污染面:生成页把成本窗填满重帧样本;模式切换经同一路径受益)
   */
  resetSampling(): void {
    this.costWin.length = 0;
    this.missStreak = 0;
    this.missStallMs = 0;
    this.upHoldN = 0;
    this.lastGap = 0;
    this.lastRenderAt = -1;
    this._nextDue = -1;   // ★v9.9:相位重锚
    this.ordinal = 0;
    this.settleGuard = COST_WIN;   // v7 案②:进世界首簇重帧是 reset 之后的证据,重挂全窗门槛
    this.floorHoldN = 0;           // v9.7:滞回账随采样面一并复位
    this.floorCapSeen = this.cap;  // v9.7:cap 基准重锚(reset 本身按当前 cap 定拍)
    this.k = 1;                    // ★v9.8:k 迁移退役,k 恒 1(拍位由纯时间门承载)
    this.lastReason = 'init';
  }

  /** 诊断快照(探针/调试面板) */
  snapshot(): { k: number; vsync: number; p50: number; p95: number; target: number; reason: BeatReason; miss: number; hold: boolean } {
    return {
      k: this.k,
      vsync: Math.round(this.vsyncPeriod * 100) / 100,
      p50: Math.round(this.costP50() * 100) / 100,
      p95: Math.round(this.costP95() * 100) / 100,
      target: Math.round(this.targetMs() * 100) / 100,
      reason: this.lastReason,
      miss: this.missStreak,
      hold: this.holdOn,   // ★v9.7:暂停态迁移冻结诊断面
    };
  }
}
