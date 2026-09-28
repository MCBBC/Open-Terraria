// ★BJ397（2026-09-28）死亡态相机/输入锁定测试。用户实报「角色死亡后还能左右移动画面」。
// 定谳锚（反编译 1457 直读,1458 同域对拍）：
//   输入面：Player.Update 死亡早退 Player.cs:24943-24947 `if (dead) { UpdateDead();
//     ResetProjectileCaches(); UpdateProjectileCaches(i); return; }` —— 全部 control*
//     移动消费链死置（UpdateDead :17037-17230 无移动积分;仅 UI/观战/release 沿）;
//     散飞只动 head/body/leg 动画位（:16878-16888）,尸位静止。
//   相机面：screenPosition = PlayerFocusedScreenPosition()（Main.cs:63541 调用/
//     :63521-63523 定义）死亡【不豁免】= 相机恒跟尸;尸位静止 ⇒ 视口锁定。
//     鼠标受控平移死门 = GetPlayerControlledCameraPan Main.cs:63711-63714
//     `if (localPlayer.dead) { return false; }`（1458 :63717-63720 两版同文）——
//     dead → targetPan 恒零 → CurrentPan（:554）以 36px/tick 滑回零（UpdateCameraPan
//     :63634-63669 MoveTowards）= 残余 pan 同速锁回尸位。门序：死门先于
//     noThrow/lastMouseInterface 门（:63711 < :63715）;JustBecameTrue 边沿状态量
//     在死门之前照走（:63707-63710）。
//   物体跟踪死门 = GetObjectTrackingCameraPan Main.cs:63688-63691（spectating 支
//     :63682-63687 在死门之前 = 死亡观战优先,本仓 spectateCamPos net-only 同序）。
//   重生解锁 = UpdateDead respawnTimer≤0 → Spawn(ReviveFromDeath)（:17170-17175,
//     dead=false :37898-37899）→ 死门随 dead 复位。
//   本仓病灶：pan 通道（Game.fixedUpdate 望远镜/镜配饰档）缺死门 —— 探针
//     scripts/_bj397-death-cam-probe.mjs 物证:死亡态持 1299 右缘鼠标 1.5s 镜头漂
//     +306.55px（素机死亡 dPlayer=0/dCam=0 全锁）;修后同面 dCam=0、重生后 pan 复活。
// 变异证红：M1 摘 `!player.dead && `（死门整删）→ 死门组红。已跑,sha256 字节还原对账。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Camera } from '../src/render/Camera';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');
const gameSrc = read('src/core/Game.ts');
const playerSrc = read('src/entities/Player.ts');

// ============================================================
// ① 相机 pan 死门（原版 Main.cs:63711-63714/1458 :63717-63720）
// ============================================================
describe('BJ397 死亡态 pan 整门（Main.cs:63711-63714 GetPlayerControlledCameraPan dead 门）', () => {
  it('Game.fixedUpdate pan 门首项 = !player.dead（死门先于 uiBlocking/mouseInterface 门,原版门序 :63711<:63715）', () => {
    const gate = gameSrc.indexOf('if (!player.dead && !this.input.uiBlocking && !this.inpOverDomUi() && !this.uiHeldItemRef?.()) {');
    expect(gate).toBeGreaterThan(-1);
    // 门序断言：该行必须落在 targetPan 声明与 panNum 档位面之间（=pan 通道唯一入口门）
    const decl = gameSrc.indexOf('let targetPanX = 0, targetPanY = 0;');
    const panNum = gameSrc.indexOf('if (scoped) panNum = 0.5;');
    expect(gate).toBeGreaterThan(decl);
    expect(gate).toBeLessThan(panNum);
    // 门序细化：player.dead 在 uiBlocking 之前（原版死门先于 noThrow/lastMouseInterface）
    const line = gameSrc.slice(gate, gameSrc.indexOf('\n', gate));
    expect(line.indexOf('!player.dead')).toBeLessThan(line.indexOf('!this.input.uiBlocking'));
  });

  it('死门锚注在位（63711-63714 双版行号 + 探针物证背书）', () => {
    expect(gameSrc).toContain('Main.cs:63711-63714');
    expect(gameSrc).toContain('1458 :63717-63720');
    expect(gameSrc).toContain('★BJ397');
  });

  it('高尔夫跟踪死门回归守卫（原版 GetObjectTrackingCameraPan Main.cs:63688-63691 等价面不回退）', () => {
    expect(gameSrc).toContain('const golfCam = !player.dead ? this.golfState.tryGetCameraTrackingPosition() : null;');
  });
});

// ============================================================
// ② 角色输入冻结面（原版 Player.cs:24943-24947 死亡早退）
// ============================================================
describe('BJ397 死亡态角色锁定（Player.cs:24943-24947 早退 + UpdateDead 无移动积分）', () => {
  it('死亡早退块先于水平积分消费点（hp<=0 段 return 早于 const ix = this.inputX）', () => {
    const deathBlock = playerSrc.indexOf('if (this.hp <= 0) {');
    const moveIx = playerSrc.indexOf('const ix = this.inputX;');
    expect(deathBlock).toBeGreaterThan(-1);
    expect(moveIx).toBeGreaterThan(deathBlock);   // 死亡段整段跳过移动积分（:24943 语义）
  });

  it('死亡段只跑动画/衰减,早退闭合先于首个输入清零位（不跑移动）', () => {
    const deathBlock = playerSrc.indexOf('if (this.hp <= 0) {');
    const frozenClear = playerSrc.indexOf('this.inputJump = false;');   // 冻/石化清输入位（首个输入消费邻点）
    expect(frozenClear).toBeGreaterThan(deathBlock);
    const seg = playerSrc.slice(deathBlock, frozenClear);
    expect(seg).toContain('this.updateDeathParts(game);');    // :16878-16888 三段翻滚（动画位）
    expect(seg).toContain('return;');                          // 早退闭合（:24943 语义）
    expect(seg).not.toContain('const ix = this.inputX;');      // 移动积分在早退之后（;缀防注释误配）
  });
});

// ============================================================
// ③ 残余 pan 死亡锁回（dead → targetPan 恒零 → CurrentPan 36px/tick 滑回零）
// ============================================================
describe('BJ397 死亡态残余 CurrentPan 滑回零（Main.cs:63634-63669 MoveTowards, 死门后 targetPan=Zero）', () => {
  const mk = (): Camera => Object.create(Camera.prototype) as unknown as Camera;

  it('pan 残余 424.67（1299 右缘档）→ 死亡 targetPan=0 → 逐拍 ≤36 收敛回零（镜头锁回尸位）', () => {
    const cam = mk();
    cam.panX = 424.67; cam.panY = 0;
    let maxStep = 0;
    for (let i = 0; i < 40; i++) {
      const prev = cam.panX;
      cam.advancePan(0, 0);                     // 死门 ⇒ targetPan 恒零（非黑幕距离域）
      maxStep = Math.max(maxStep, Math.abs(prev - cam.panX));
    }
    expect(cam.panX).toBeCloseTo(0, 6);         // 滑回零=视口锁回尸位
    expect(maxStep).toBeLessThanOrEqual(36.0001); // 恒速 36px/tick（:63652）,不瞬移
    expect(cam.panY).toBeCloseTo(0, 6);
  });

  it('对角残余同步回零（单位向量×步长,方向保持）', () => {
    const cam = mk();
    cam.panX = 300; cam.panY = 400;             // 距 500
    cam.advancePan(0, 0);
    expect(Math.hypot(cam.panX, cam.panY)).toBeCloseTo(464, 6);   // 500−36
    for (let i = 0; i < 20; i++) cam.advancePan(0, 0);
    expect(cam.panX).toBeCloseTo(0, 6);
    expect(cam.panY).toBeCloseTo(0, 6);
  });
});

// ============================================================
// ④ 重生解锁面（UpdateDead :17170-17175 Spawn(ReviveFromDeath) → dead=false → 死门复位）
// ============================================================
describe('BJ397 重生解锁（respawnTimer≤0 → respawnPlayer → pan/跟随复活）', () => {
  it('Game 死亡 tick 链:计时归零重生 + 死亡门控面在位', () => {
    expect(gameSrc).toContain('if (player.respawnTimer <= 0) this.respawnPlayer();   // :16908');
    expect(gameSrc).toContain('if (player.dead) {');           // 死亡 tick 总门
  });

  it('respawnPlayer 复位 dead + 走 Spawn 传送过渡（重生后相机恢复跟随 = 探针 C 面 dCam=400 跟移）', () => {
    const rp = gameSrc.indexOf('respawnPlayer() {');
    expect(rp).toBeGreaterThan(-1);
    const seg = gameSrc.slice(rp, rp + 3000);
    expect(seg).toContain('p.dead = false;');                  // :37898-37899 dead=false → 死门复位
    expect(seg).toContain('this.startCameraTransitionForPlayerTeleport(spawnOldX, spawnOldY);');
    // 过渡面远支硬吸合（PlayerFocusedScreenPosition :63541 等价）
    const tp = gameSrc.indexOf('startCameraTransitionForPlayerTeleport(oldX: number, oldY: number');
    expect(gameSrc.slice(tp, tp + 2500)).toContain('cam.x = p.cx;');
  });
});
