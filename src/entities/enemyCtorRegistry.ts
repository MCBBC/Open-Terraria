// Enemy 构造注册表（叶模块,2026-08-26 审计根修）：原实现寄居 bossAI.ts
// （let enemyCtor + bindEnemyCtor 导出），而 Enemy.ts 尾部顶层 bindEnemyCtor(Enemy)
// 回填——Enemy↔bossAI↔Arrow↔TownNPC 活环中,部分导入序下该调用落在 bossAI
// 未初始化窗口,vitest SSR 变换的函数提升不跨环 → "bindEnemyCtor is not a
// function" 整文件无法收集。抽到本叶模块（零运行时依赖,type-only 引 Enemy）
// 后注册表先于环上任何模块完成求值,导入序无关。
type EnemyCtor = (typeof import('./Enemy'))['Enemy'];

let enemyCtor: EnemyCtor | null = null;

/** Enemy.ts / TownNPC.ts 模块尾回填各自构造器 */
export function bindEnemyCtor(c: EnemyCtor): void { enemyCtor = c; }

/** bossAI 侧生成代理消费口（spawnPart/spawnVanillaEnemy/spawnWormChainFor） */
export function getEnemyCtor(): EnemyCtor | null { return enemyCtor; }
