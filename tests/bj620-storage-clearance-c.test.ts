// ★BJ620 存储链清偿 C 批（BJ616 review LOW 尾批 + UNVERIFIED 实测）判别测试。
//  probe 物证 = tests/_bj616-redteam-probe.test.ts（F3/F7 已随本批转正为守护断言）。
//  A 组（件1 probe F3）：ensureLoaded 并发重入门——promise 记忆化（FsBackup.loadPromise
//   习语,失败不缓存可重试）,WorldStore 迁移支单走零重复 meta;CharacterStore 同构
//   （恢复链单咨询,双跑双 IDB 读面封）。
//  B 组（件2 probe F7）：CharacterStore.get 改 kvGetIdbEx cause 分诊——typeMismatch
//   亦咨询恢复链;keyMissing 面 FS 备份胜于 LS 双写时代陈旧副本（resolveLoadText 同构
//   择源序 IDB → FS → LS）;openFailed 面 LS 兜底（恢复链写回同库必败,不虚咨询）;
//   健康值直读零咨询。
//  C 组（件3 F11）：doSave 同链失败面上报去重——WorldStore.save 可选 failNotify
//   （链内通知优先于全局 onWriteFailData;缺省参=原语义）+ mainFlow failGate/告警认领
//   结构锚。BJ605 兜底语义不变：至少一次导出+至少一条告警。
//  D 组（件4 F13）：kvIdbStatus tx 失败改报 'unknown' 档（不再失真 keyExists:false——
//   键在不在无从判定≠键不存在,诊断物证面诚实化）。
//  E 组（件5 F12）：KvStore 键域注册表头注结构锁（四类值型/三套前缀系/通道/消费方;
//   只文档化不迁键=用户「谨慎」纪律）+ rp/mod zip 失败一次性 console.warn。
//  F 组（件6）：UNVERIFIED 三件真机探针结论锚（2026-10-10 Chrome 154.0.8037.99 实测,
//   私有实例 :5202;探针脚本在库可复现）。
//  垫：fake-IDB + LS 桩真实读写链（bj615/617/618 同垫;failTx=事务失败态注入为
//   fake-idb-util BJ620 增量）;模块级 nextId/openFailStreak/句柄态用 vi.resetModules 隔离。
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { installFakeIdb, type FakeIdbHandle } from './fake-idb-util';

// ---- 共享垫 ----
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
} as Storage;
const idb: FakeIdbHandle = installFakeIdb();

const QS = JSON.stringify({ header: { name: '旧世界', seed: 1, width: 100, height: 100, created: 1700000000000 } });
const wmeta = (id: number, name: string) => ({ id, name, seed: '', w: 1, h: 1, difficulty: 0, evil: -1, createdAt: 0, lastPlayed: 0, playTimeMs: 0, favorite: false });

beforeEach(() => {
  mem.clear();
  idb.map.clear();
  idb.state.failOpen = false;
  idb.state.failTx = false;
  idb.dropConnection();
  vi.resetModules();   // nextId/openFailStreak/退避窗全复位
});

// =====================================================================
// A 组 件1（probe F3 转正）：ensureLoaded 并发重入门
// =====================================================================
describe('BJ620 A组 件1：ensureLoaded 并发重入门（promise 记忆化）', () => {
  it('A1【probe F3 转正】WorldStore 三路并发 ensureLoaded → 迁移支单走（零重复 meta）+nextId 前移不变', async () => {
    mem.set('sandboxworld.quicksave', QS);
    const { WorldStore: WS } = await import('../src/save/WorldStore');
    const s = new WS();
    await Promise.all([s.ensureLoaded(), s.ensureLoaded(), s.ensureLoaded()]);
    expect(s.list().filter((m) => m.id === 1), '并发共享在途 promise——单条 id=1（旧实现双 push 列表重复项）').toHaveLength(1);
    const m = await s.register({ name: '新世界', seed: 'x', w: 10, h: 10, difficulty: 0, evil: -1 });
    expect(m.id, '成功链 nextId 前移语义不变（迁移成功 → register=id 2）').toBe(2);
  });

  it('A2 CharacterStore 同构：并发 ensureLoaded 恢复链单咨询（旧实现双跑双咨询=恢复面双 IO）', async () => {
    const { CharacterStore: CS } = await import('../src/save/CharacterStore');
    const s = new CS();
    let asked = 0;
    s.onRestoreMiss = async () => { asked++; return null; };
    await Promise.all([s.ensureLoaded(), s.ensureLoaded(), s.ensureLoaded()]);
    expect(asked, '在途 promise 共享——恢复链至多一次咨询').toBe(1);
  });

  it('A3 顺序双调用回归：loaded 短路面不重跑（恢复链零二次咨询）', async () => {
    idb.map.set('sandboxworld.worlds.index', JSON.stringify([wmeta(1, 'A')]));
    const { WorldStore: WS } = await import('../src/save/WorldStore');
    const s = new WS();
    let asked = 0;
    s.onRestoreMiss = async () => { asked++; return null; };
    await s.ensureLoaded();
    await s.ensureLoaded();
    expect(s.list()).toHaveLength(1);
    expect(asked, 'IDB 命中零咨询;二次调用 loaded 短路').toBe(0);
  });
});

// =====================================================================
// B 组 件2（probe F7 转正）：CharacterStore.get kvGetIdbEx cause 分诊
// =====================================================================
describe('BJ620 B组 件2：get 门 cause 分诊（typeMismatch 恢复链可达+择源序同构）', () => {
  it('B1【probe F7 转正】typeMismatch + 恢复链有备份 → 返回恢复外观（旧实现 kvHas 真→链被短路恒 null）', async () => {
    idb.map.set('sandboxworld.player.5', { not: 'a string' });
    const { CharacterStore: CS } = await import('../src/save/CharacterStore');
    const s = new CS();
    let asked = 0;
    s.onRestoreMiss = async () => { asked++; return '{"name":"FS恢复"}'; };
    expect((await s.get(5))?.name, 'typeMismatch 键亦达恢复链').toBe('FS恢复');
    expect(asked).toBe(1);
  });

  it('B2 typeMismatch + 链 miss → LS 兜底副本（旧数据不因修复消失）', async () => {
    idb.map.set('sandboxworld.player.5', { not: 'a string' });
    mem.set('sandboxworld.player.5', '{"name":"LS兜底"}');
    const { CharacterStore: CS } = await import('../src/save/CharacterStore');
    const s = new CS();
    s.onRestoreMiss = async () => null;
    expect((await s.get(5))?.name).toBe('LS兜底');
  });

  it('B3 keyMissing + LS 陈旧副本在位 + 恢复链有备份 → FS 备份胜（resolveLoadText 同构;旧实现 kvHas LS-first 抢先短路恢复链）', async () => {
    mem.set('sandboxworld.player.9', '{"name":"LS陈旧副本"}');
    const { CharacterStore: CS } = await import('../src/save/CharacterStore');
    const s = new CS();
    s.onRestoreMiss = async () => '{"name":"FS恢复新档"}';
    expect((await s.get(9))?.name, '备份恒新于双写时代 LS 副本（IDB → FS → LS 择源序）').toBe('FS恢复新档');
  });

  it('B4 keyMissing + 链 miss + LS 副本 → LS 兜底（链不可达时不丢旧数据）', async () => {
    const { CharacterStore: CS } = await import('../src/save/CharacterStore');
    const s = new CS();
    s.onRestoreMiss = async () => null;
    mem.set('sandboxworld.player.9', '{"name":"LS兜底"}');
    expect((await s.get(9))?.name).toBe('LS兜底');
  });

  it('B5 openFailed → LS 兜底直读,恢复链零虚咨询（kvSet 同库写回必败面）', async () => {
    idb.state.failOpen = true;
    idb.dropConnection();
    const { CharacterStore: CS } = await import('../src/save/CharacterStore');
    const s = new CS();
    let asked = 0;
    s.onRestoreMiss = async () => { asked++; return '{"name":"不该被咨询"}'; };
    mem.set('sandboxworld.player.3', '{"name":"LS兜底"}');
    expect((await s.get(3))?.name).toBe('LS兜底');
    expect(asked, 'openFailed 不咨询恢复链').toBe(0);
  });

  it('B6 健康字符串直读：恢复链零咨询（现值权威,备份不得倒灌）', async () => {
    idb.map.set('sandboxworld.player.2', '{"name":"IDB现值"}');
    const { CharacterStore: CS } = await import('../src/save/CharacterStore');
    const s = new CS();
    let asked = 0;
    s.onRestoreMiss = async () => { asked++; return '{"name":"FS备份"}'; };
    expect((await s.get(2))?.name).toBe('IDB现值');
    expect(asked).toBe(0);
  });
});

// =====================================================================
// C 组 件3（F11）：doSave 同链失败面上报去重
// =====================================================================
describe('BJ620 C组 件3：同链失败面导出/告警去重（BJ605 兜底语义不变）', () => {
  it('C1 WorldStore.save failNotify 链内通知优先——全局 onWriteFailData 不双轨触发', async () => {
    idb.state.failOpen = true;
    idb.dropConnection();
    const { WorldStore: WS } = await import('../src/save/WorldStore');
    const s = new WS();
    const meta = await s.register({ name: 'A', seed: 's', w: 1, h: 1, difficulty: 0, evil: -1 });
    const notified: Array<{ name: string; key: string; json: string }> = [];
    let globalCalls = 0;
    s.onWriteFailData = () => { globalCalls++; };
    await expect(s.save(meta, '{"header":{"name":"A"}}', 0, (name, key, json) => notified.push({ name, key, json }),
      ), '槽面写败必须抛（调用方 catch 面感知不变）').rejects.toMatchObject({ name: 'WorldSaveWriteError' });
    expect(notified, '链内通知恰一次').toHaveLength(1);
    expect(notified[0]).toMatchObject({ name: 'A', key: `sandboxworld.world.${meta.id}` });
    expect(globalCalls, '全局 onWriteFailData 零触发（failNotify 替代——同链去重由调用方 failGate 记账）').toBe(0);
  });

  it('C2 缺省参回归：不传 failNotify → onWriteFailData 原语义（importSlot/duplicate/迁移面不受影响）', async () => {
    idb.state.failOpen = true;
    idb.dropConnection();
    const { WorldStore: WS } = await import('../src/save/WorldStore');
    const s = new WS();
    const meta = await s.register({ name: 'A', seed: 's', w: 1, h: 1, difficulty: 0, evil: -1 });
    const globalFail: Array<{ name: string; key: string }> = [];
    s.onWriteFailData = (name, key) => { globalFail.push({ name, key }); };
    await expect(s.save(meta, '{"header":{}}', 0)).rejects.toThrow();
    expect(globalFail, '缺省=全局回调原语义').toHaveLength(1);
    expect(globalFail[0]).toMatchObject({ key: `sandboxworld.world.${meta.id}` });
  });

  it('C3 mainFlow 接线锚：failGate 链内标记+chainFailNotify 槽面接线（结构锚;BJ605 导出面/告警面仍在）', () => {
    const s = readFileSync(resolve(__dirname, '../src/mainFlow.ts'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    expect(s).toContain('const failGate = { exported: false, toasted: false };');
    expect(s).toContain('noteChainSaveFail(true)');   // quickWrite 'fail' 面（导出+告警认领）
    expect(s).toContain('noteChainSaveFail(false)');   // 两处 .catch 面（仅告警认领）
    expect(s).toContain('worldStore.save(slotMeta, json, playTimeMs, chainFailNotify)');   // 槽面接同一标记
    // BJ605 兜底语义保持：链内仍有自动导出面+SaveFailedStorage 告警面
    expect(s).toContain('downloadSaveJson(worldNameNow, json)');
    expect(s).toContain("Lang.text('Mods.SandboxWorld.Toast.SaveFailedStorage')");
  });
});

// =====================================================================
// D 组 件4（F13）：kvIdbStatus tx 失败失真修复
// =====================================================================
describe('BJ620 D组 件4：kvIdbStatus tx 失败改报 unknown 档', () => {
  it('D1 tx 失败（open 健康键在不在无从判定）→ { open:true, keyExists:\'unknown\', reason }（旧实现失真 keyExists:false）', async () => {
    idb.map.set('sandboxworld.world.1', '{"header":{}}');
    idb.state.failTx = true;
    const { kvIdbStatus } = await import('../src/save/KvStore');
    const r = await kvIdbStatus('sandboxworld.world.1');
    expect(r.open, 'open 面健康').toBe(true);
    expect(r.keyExists, '键存在性不可判定=unknown（旧实现误报 false=「存档数据缺失」归因污染）').toBe('unknown');
    expect(r.reason, '失败原因留物证').toBeTruthy();
  });

  it('D2 健康面回归：tx 恢复后 boolean 精确档照旧（键在 true/键缺 false）', async () => {
    idb.map.set('sandboxworld.world.1', '{"header":{}}');
    const { kvIdbStatus } = await import('../src/save/KvStore');
    expect(await kvIdbStatus('sandboxworld.world.1')).toEqual({ open: true, keyExists: true });
    expect(await kvIdbStatus('sandboxworld.world.99')).toEqual({ open: true, keyExists: false });
  });

  it('D3 open 失败档回归：{ open:false, keyExists:\'unknown\' } 不受影响', async () => {
    idb.state.failOpen = true;
    idb.dropConnection();
    const { kvIdbStatus } = await import('../src/save/KvStore');
    const r = await kvIdbStatus('sandboxworld.world.1');
    expect(r.open).toBe(false);
    expect(r.keyExists).toBe('unknown');
  });
});

// =====================================================================
// E 组 件5（F12）：键域注册表头注（只文档化不迁键）+ zip 通道失败可观测化
// =====================================================================
describe('BJ620 E组 件5：键域注册表头注结构锁+zip 失败一次性 warn', () => {
  it('E1 头注键域注册表在位（四类值型/前缀系/通道/消费方;迁移禁令声明）', () => {
    const s = readFileSync(resolve(__dirname, '../src/save/KvStore.ts'), 'utf8');
    expect(s, '注册表头注（BJ616 F12 处置=文档化）').toContain('键域注册表');
    expect(s, '物理迁键禁令（丢数据风险,用户「谨慎」纪律）').toContain('只文档化不迁键');
    for (const marker of [
      'sandboxworld.worlds.index',   // ① string 档（WorldStore 索引）
      'sandboxworld.playerstate.',    // ① string 档（CharacterStore 随身态）
      'rp:zip:',                      // ② Blob 档（资源包）
      'mod:zip:',                     // ② Blob 档（mod 包）
      'sandboxworld.fsBackup',        // ③ 结构化克隆值档（目录句柄）
      "'remaster'",                   // ④ 独立 store（素材重制管线）
      'kvPutValue 写/kvGetUnknown 读',  // ③ 专用通道
      'typeMismatch',                 // ②③ 值的字符串通道误读归因
    ]) {
      expect(s).toContain(marker);
    }
  });

  it('E2 rp/mod zip 失败一次性 warn（首例告警留物证,同会话后续静默;openDb 自身告警不串账）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    idb.state.failOpen = true;
    idb.dropConnection();
    const kv = await import('../src/save/KvStore');
    const zipWarns = () => warn.mock.calls.filter((c) => String(c[0]).includes('rp/mod zip'));
    await expect(kv.rpPutZip('a', new Blob(['x']))).resolves.toBe(false);
    expect(zipWarns(), '首例失败告警（一次性物证）').toHaveLength(1);
    expect(String(zipWarns()[0]?.[0])).toContain('一次性');
    await expect(kv.modGetZip('b')).resolves.toBeNull();
    await expect(kv.rpDeleteZip('c')).resolves.toBeUndefined();
    expect(zipWarns(), '同会话后续失败静默（防驱逐态刷屏）').toHaveLength(1);
    warn.mockRestore();
  });
});

// =====================================================================
// F 组 件6：UNVERIFIED 三件真机探针结论锚（2026-10-10 实测 Chrome 154.0.8037.99;
// 私有实例 :5202 会话纪律;探针脚本=scripts/_bj620-*.mjs 在库可复现）
// ---------------------------------------------------------------------
// 【#1 同秒 createWritable 并发】销案——OPFS 通道（与磁盘同 Chromium
//  FileSystemWritableFileStream 实现）同文件第二 createWritable='ok'（零
//  NoModificationAllowedError）,终态 last-close-wins;全链同秒双 doSave 零
//  '[fsBackup]' 失败告警（noteWriteFailure→'broken' 闪断面不存在）→ 不落
//  队列化/flush。伴生观察（非债）：last-close-wins 使同秒双快照可能旧档后至——
//  两快照内容均为当刻合法态,轮转面 keep=3 容忍,不作序化刀。
// 【#2 Chrome 多重自动下载拦截】销案——behavior:'default'（策略不放宽,插桩
//  中立复核）连续 6 连发 downloadWillBegin 6/6+物理落盘 ~/Downloads 6/6 →
//  拦截未触发（Chrome 154）→ 不落「请在下载管理确认」提示改面。
// 【#3 F9 主线程 JSON.parse(json).player 量级】落刀——实测（scripts/_bj620-f9-parse-probe.mjs,
//  8400×2400 档两轮）：json 21.4MB,主线程整档 JSON.parse 12.4ms/9.8ms（max 12.4ms>10ms 阈）
//  → 落 save.worker player 切片回传（serialize.assembleSave 拆分;worker data.player=
//  json.player 全等,同步回退 buildSaveGameParts 同形;mainFlow charStore.setState 免整档
//  parse）。落刀后同探针复测（2026-10-10）：两轮 doSave 主线程 >2MB parse 零捕获（摘除
//  实锤）,全链 823/781ms 正常落盘——端到端收口。
// =====================================================================
describe('BJ620 F组 件6：真机探针结论锚', () => {
  it('F1 探针脚本在库且含决定性实测段（销案可复现锚;#1/#2+#3）', () => {
    const p = readFileSync(resolve(__dirname, '../scripts/_bj620-fs-dl-probe.mjs'), 'utf8');
    expect(p, '#1 同文件并发 createWritable 实测段').toContain("await fh.createWritable()");
    expect(p, '#1 全链同秒双 doSave 段').toContain('window.__swFlow.doSave(true), window.__swFlow.doSave(true)');
    expect(p, '#2 下载连发实测段').toContain('Browser.setDownloadBehavior');
    const pd = readFileSync(resolve(__dirname, '../scripts/_bj620-dl-default-probe.mjs'), 'utf8');
    expect(pd, '#2 插桩中立复核段（behavior:default 不放宽策略）').toContain("behavior: 'default'");
    const pf = readFileSync(resolve(__dirname, '../scripts/_bj620-f9-parse-probe.mjs'), 'utf8');
    expect(pf, '#3 F9 主线程 parse trace 段（JSON.parse 探针+8400×2400 档）').toContain('2_000_000');
    expect(pf).toContain('8400, h: 2400');
  });

  it('F3【#3 落刀锁】worker player 切片回传面在位+切片与整档 parse 全等（assembleSave 单源）', async () => {
    const w = readFileSync(resolve(__dirname, '../src/workers/save.worker.ts'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    expect(w, 'worker 回传 data.player（与 json.player 同源对象——主线程免整档 parse）').toContain('player: data.player');
    // 等价性：assembleSave 的 player 切片 ≡ serializeSave 产物内嵌 player（稳定 id 磁盘形同源;
    // worker 路径与同步回退 buildSaveGameParts 双路径共用该不变量）
    const { assembleSave, serializeSave } = await import('../src/save/serialize');
    const view = {
      type: new Uint16Array([0]), flags: new Uint8Array([0]), frameX: new Uint16Array([0]), frameY: new Uint16Array([0]),
      wall: new Uint16Array([0]), liquid: new Uint8Array([0]), liquidType: new Uint8Array([0]), wire: new Uint8Array([0]),
      half: new Uint8Array([0]), slope: new Uint8Array([0]), paint: new Uint8Array([0]), paintWall: new Uint8Array([0]),
    } as never;
    const meta = { name: 't', seed: '1', w: 1, h: 1, chests: [], signs: [] } as never;
    const player = { hp: 100, inventory: [{ id: 1, stack: 2 }] } as never;
    const data = assembleSave(view, meta, player, 0);
    const parsed = JSON.parse(serializeSave(view, meta, player, 0)) as { player: unknown };
    expect(parsed.player, '切片与整档 parse 全等（同一装配对象）').toEqual(data.player);
  });

  it('F2【#3 实测结论锚】主线程 JSON.parse(json).player 实测量级与处置（探针 A;阈值 10ms）', async () => {
    const s = readFileSync(resolve(__dirname, '../src/mainFlow.ts'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    // 实测值见本文件头注【#3】——按实测分档断言：
    if (PARSE_PLAYER_MS > 10) {
      // 超阈 → 落 save.worker player 切片回传：doSave 主线程不再整档 JSON.parse
      expect(s, 'doSave 主线程整档 parse 已摘除（worker player 切片回传替代）').not.toContain('JSON.parse(json).player');
      const sc = readFileSync(resolve(__dirname, '../src/workers/SaveClient.ts'), 'utf8');
      expect(sc, 'SaveClient 提供 player 切片回传面').toContain('saveWithPlayer');
    } else {
      // ≤10ms → 登记维持（doSave 原形态）
      expect(s).toContain('JSON.parse(json).player');
    }
  });
});

// 【#3 实测值】探针 A（2026-10-10,8400×2400 档两轮）：12.4ms / 9.8ms → max>10ms=落刀档
const PARSE_PLAYER_MS = 12.4;
