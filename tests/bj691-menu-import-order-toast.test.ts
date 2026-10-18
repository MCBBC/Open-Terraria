// ★BJ691（2026-10-17 用户实报「导入角色为啥跑到角色列表底部了？而且导入后不要
//  alert，应当直接通过消息提示显示」→ 当日复红「角色导入还是被放到了列表尾部」
// = BJ691b 勘误）判别锁。
//  ★BJ691a 误锚勘误：首刀锚了 UICharacterSelect.cs:178 的 list.Sort——那是
//  UpdateFavoritesCache 的【变更检测缓存比对】（收藏→Name→文件名）,不是显示序!
//  真显示序 = UpdatePlayersList :146-157:
//    `orderby IsFavorite descending, LastPlayed descending, Name, GetFileName()`
//  = 收藏 → 最后游玩降序（新导入/新建/最近游玩置顶）→ 名字 → 文件名。
//  名字序对用户实测场景（导入角色名恰排尾）= 无观感变化 → 复红。
//  BJ691b 正解=镜像 WorldStore.list() 既有架构（那边注释/锚一直是对的）:
//  CharacterMeta.lastPlayed（create 置 now/setState 每存档点拍/旧档回退 createdAt）
//  + store.list() 排序单源;面板侧 BJ691a 的再排序回退（WorldSelect 侧尤须回退
//  ——WorldStore.list() 本就正确,面板再排名字序=降级既有正确序）。
//  alert→menuToast 面（BJ691a 已落,本刀保持）:6 处 alert 改菜单 toast（body 级
//  z1000 逃逸面板层叠 z20/22——ui.toast 落 .sw-root z10 会被面板盖住）。
//  ★变异自证：M1 摘 store.list() 排序 → §1 恰红;M2 create 摘 lastPlayed 置位 →
//  §1 导入置顶恰红;M3 面板回退任一 alert → §3 恰红。
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installFakeIdb } from './fake-idb-util';

const GAME = join(__dirname, '..');
const VAN = join(GAME, '..', 'Terarria1457');

// ---- 夹具（character-store.test.ts 同款:node 需 stub localStorage + fake-IDB;
//      §1 各用例间清垫防跨用例泄漏（index 持久层模块级共享））----
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => void mem.clear(),
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
} as Storage;
const idb = installFakeIdb();

const { CharacterStore } = await import('../src/save/CharacterStore');
const { defaultAppearance } = await import('../src/player/Appearance');
const mkApp = (name: string) => ({ ...defaultAppearance(), name });
const freshStore = async (): Promise<InstanceType<typeof CharacterStore>> => {
  mem.clear();
  idb.map.clear();
  idb.dropConnection();
  const s = new CharacterStore();
  await s.ensureLoaded();
  return s;
};

// ============================================================
// §1 store.list() 排序行为（原版 UpdatePlayersList :146-157;M1/M2 位）
// ============================================================
describe('§1 CharacterStore.list() 显示序（收藏→lastPlayed→名→id）', () => {
  it('用户场景：已有两角色后导入 → 新角色置顶（非垫底;BJ691a 名字序恰复红处）', async () => {
    const s = await freshStore();
    const a = await s.create(mkApp('甲老角色'));
    await new Promise((r) => setTimeout(r, 3));
    const b = await s.create(mkApp('乙旧角色'));
    await new Promise((r) => setTimeout(r, 3));
    const c = await s.create(mkApp('导入角色'));   // 后建（=导入通道同走 create,时基分离防 lastPlayed 平手落名序）
    const order = s.list().map((m) => m.id);
    expect(order).toEqual([c.id, b.id, a.id]);    // lastPlayed 降序=最新置顶
  });

  it('游玩旧角色（setState=存档点）→ 该角色浮顶（原版 LastPlayed 语义）', async () => {
    const s = await freshStore();
    const a = await s.create(mkApp('A'));
    const b = await s.create(mkApp('B'));
    await new Promise((r) => setTimeout(r, 3));   // 时基分离
    await s.setState(a.id, { hp: 100 } as never); // A 存档 → lastPlayed 拍新
    expect(s.list().map((m) => m.id)).toEqual([a.id, b.id]);
  });

  it('收藏压倒 lastPlayed（点收藏即置顶=原版交互）', async () => {
    const s = await freshStore();
    const a = await s.create(mkApp('A'));
    const b = await s.create(mkApp('B'));
    await s.setFavorite(a.id, true);
    expect(s.list().map((m) => m.id)).toEqual([a.id, b.id]);
  });

  it('旧档（无 lastPlayed 字段）回退 createdAt;同级再落名/id 序', async () => {
    const s = await freshStore();
    // 直注旧形状 meta（无 lastPlayed/favorite——ensureLoaded 后 index 可及）
    const idx = (s as unknown as { index: Array<{ id: number; name: string; difficulty: number; createdAt: number; lastPlayed?: number }> }).index;
    idx.push({ id: 101, name: '老乙', difficulty: 0, createdAt: 100 });
    idx.push({ id: 102, name: '老甲', difficulty: 0, createdAt: 100 });   // 同 createdAt → 名序
    idx.push({ id: 103, name: '新丙', difficulty: 0, createdAt: 200 });   // 更晚创建 → 更前
    const names = s.list().map((m) => m.name);
    expect(names).toEqual(['新丙', '老甲', '老乙']);
  });
});

// ============================================================
// §2 接线源锚（面板侧单源消费 store.list();menuToast 层级逃逸）
// ============================================================
describe('§2 面板/助手接线', () => {
  it('CharSelect.reload() 消费 store.list()（排序单源在 store,BJ691a 面板侧排序已回退）', () => {
    const src = readFileSync(join(GAME, 'src', 'ui', 'CharSelect.ts'), 'utf8');
    expect(src).toContain('for (const meta of this.store.list()) {');
    expect(src).not.toContain('charListCompare');
  });
  it('WorldSelect.reload() 消费 store.list()（WorldStore.list() 既有正确序,面板不再降级;★BJ694 起经 sortWorldsForChar 透传,单源不变）', () => {
    const src = readFileSync(join(GAME, 'src', 'ui', 'WorldSelect.ts'), 'utf8');
    expect(src).toContain('sortWorldsForChar(this.store.list(), ac)');
    expect(src).not.toContain('worldListCompare');
  });
  it('CharacterStore.list() 排序在位（M1 位）+ create 置 lastPlayed（M2 位）', () => {
    const src = readFileSync(join(GAME, 'src', 'save', 'CharacterStore.ts'), 'utf8');
    expect(src).toContain('(b.lastPlayed ?? b.createdAt ?? 0) - (a.lastPlayed ?? a.createdAt ?? 0)');
    expect(src).toContain('lastPlayed: Date.now()');   // create 置位
  });
  it('menuToast：body 直挂 + z1000 逃逸面板层叠（.sw-root z10 会被 z22 盖）', () => {
    const src = readFileSync(join(GAME, 'src', 'ui', 'menuToast.ts'), 'utf8');
    expect(src).toContain("t.style.zIndex = '1000'");
    expect(src).toContain('document.body.appendChild(t)');
  });
});

// ============================================================
// §3 alert 退役 + 正确反编译锚（M3 位）
// ============================================================
describe('§3 alert 退役（用户明令:消息提示非弹窗）+ 原版真显示序锚', () => {
  it('CharSelect / WorldSelect 零 alert( 调用', () => {
    const cs = readFileSync(join(GAME, 'src', 'ui', 'CharSelect.ts'), 'utf8');
    const ws = readFileSync(join(GAME, 'src', 'ui', 'WorldSelect.ts'), 'utf8');
    expect(cs).not.toMatch(/\balert\(/);
    expect(ws).not.toMatch(/\balert\(/);
  });
  it('反编译锚：UpdatePlayersList 真显示序（IsFavorite→LastPlayed→Name→FileName;:178 缓存分支勿再锚）', () => {
    const cs = readFileSync(join(VAN, 'Terraria.GameContent.UI.States', 'UICharacterSelect.cs'), 'utf8');
    const i = cs.indexOf('private void UpdatePlayersList()');
    expect(i).toBeGreaterThan(-1);
    const block = cs.slice(i, cs.indexOf('public override void Draw', i));
    expect(block).toContain('orderby x.IsFavorite descending, x.LastPlayed descending, x.Name, x.GetFileName()');
  });
});
