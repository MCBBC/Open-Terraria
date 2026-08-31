// TownNPC 工厂注册表（★环切补丁，2026-08-31 清零批二波）：
// Arrow.ts :126 曾静态依赖 ./TownNPC（唯一消费点=shimmerUnlock 的城镇史莱姆皇后
// 生成），而 TownNPC → TownShot → Arrow 构成三节循环 —— 该环的引爆与否取决于
// 入口模块先触到哪条腿（tests/minecart-track* 实爆：TownShot 于 TownNPC 求值中段
// 未定义）。依赖反转：TownNPC 模块尾自注册构造器，Arrow 经本注册表惰性取用。
// 生产链恒有注册（Game 装载双方）；孤立弹幕单测未拉入 TownNPC 时工厂为 null，
// 上游按「未装配」静默跳过——比原静态图更早暴露缺失而非运行中崩帧。

export type TownNpcShellCtor = (key: string, x: number, y: number) => unknown;

let CTOR: TownNpcShellCtor | null = null;

/** TownNPC.ts 模块求值尾调用（幂等，后写覆盖） */
export function registerTownNpcCtor(c: TownNpcShellCtor): void {
  CTOR = c;
}

export function unregisterTownNpcCtorForTest(): void {
  CTOR = null;
}

/** 按 shell key 构造城镇 NPC 实例；未注册返回 null */
export function createTownNpcByShellKey(key: string, x: number, y: number): unknown {
  return CTOR ? CTOR(key, x, y) : null;
}
