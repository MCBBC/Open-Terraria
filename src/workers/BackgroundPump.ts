// ★后台 tick 泵 worker（2026-09-28 用户需求:后台挂机）——标签页切后台 rAF 停发=
// 主循环停转=世界冻结,无法后台挂机。本 worker 用 setInterval(250ms) 定时
// postMessage 泵消息,主线程 Game.onPumpMsg 消费（四门现场重判 → fixedUpdate 驱动,
// 见 src/core/Game.ts 泵域注）。
//
// · 零依赖纯泵:本文件【零 import 零导出】（源锚测试 tests/background-pump.test.ts
//   锁定）——worker chunk 极小;可见性/设置/暂停判定全在主线程 handler（worker 无
//   document,转发可见性=多余一跳,主线程现场自判最简且天然以处理时刻为准）。
// · 间隔 250ms 的两条理由（禁改大,源锚锁与 core/BackgroundPumpCore 常数同源）:
//   ①60Hz tick 粒度下 15 tick/泵,配合主线程单泵 ≤30 tick 高钳=单泵最多吸收 500ms
//   迟滞不爆发;②光照 worker 看门狗稳态线 2s——泵驱动 fixedUpdate 尾段 tickLighting
//   持续发请求/收结果,lastResultAt 节拍 ≪2s 永不误杀。
// · 专用 worker 定时器不被 rAF 绑架、不受后台标签页 intensive throttling（光照/
//   波场 worker 后台持续产出的 trace 实证同源）——后台照跑。
const PUMP_INTERVAL_MS = 250;   // = core/BackgroundPumpCore.BG_PUMP_INTERVAL_MS（单源由源锚测试钉）

setInterval(() => {
  (self as unknown as Worker).postMessage({ op: 'pump', t: Date.now() });
}, PUMP_INTERVAL_MS);
