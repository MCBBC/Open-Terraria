// 提取器自审计测试(锁 2026-08-13 "铜剑丢出去"机制=extract-itemcombat targetId 错基底):
// ① 常跑层:直接查已提交 JSON——3507/3509 钉死断言(错基底时必翻)+基数护栏
// ② 审计层:C# 源存在时 spawn --audit——anomalies 为空+pinned 与已提交 JSON deep equal
//    (同时抓"提取器坏但数据没重生成"和"数据被重生成坏"两个方向)
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import itemCombatJson from '../src/data/vanilla-itemcombat.json';
import projStatusJson from '../src/data/vanilla-projstatus.json';
import { itemCombat } from '../src/data/vanillaItemCombat';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CS_PRESENT = existsSync(join(ROOT, '..', 'Terarria1457', 'Terraria', 'Item.cs'));
const TABLE = itemCombatJson as unknown as Record<string, Record<string, unknown>>;

describe('提取器自审计·常跑层(已提交 JSON,不依赖 C# 源)', () => {
  it('3507 铜短剑钉死(bug#2 一行式回归锁):直刺投射物语义', () => {
    // 错取 targetId=1(铁镐)时:autoReuse:true 且无 shoot → 两条断言必翻其一
    const r = TABLE['3507'];
    expect(r.shoot).toBe(938);
    expect(r.noMelee).toBe(true);
    expect(r.autoReuse).toBe(false);
    expect(r.shootSpeed).toBe(2.1);
  });

  it('3509 铜镐钉死:纯工具不得带 shoot("丢出去"的另一面)', () => {
    const r = TABLE['3509'];
    expect('shoot' in r).toBe(false);
    expect(r.melee).toBe(true);
    expect(r.useTime).toBe(15);
  });

  it('基数护栏:提取器结构漂移后数据量骤降必翻', () => {
    expect(Object.keys(TABLE).length).toBeGreaterThanOrEqual(2500);
    let melee = 0;
    for (const v of Object.values(TABLE)) if (v.melee) melee++;
    expect(melee).toBeGreaterThanOrEqual(250); // 实测 302;护栏取 80% 量级防骤降
  });

  it('projstatus 基数:88 型号/97 条基线(互斥组语义修正后)', () => {
    const entries = Object.values(projStatusJson as unknown as Record<string, unknown[]>)
      .reduce((n, v) => n + v.length, 0);
    expect(Object.keys(projStatusJson).length).toBeGreaterThanOrEqual(85);
    expect(entries).toBeGreaterThanOrEqual(95);
  });

  it('SetWeaponValues 14 件锚点(2026-09-18 盲区补:形参赋值不被直派正则收)', () => {
    // 原版锚 = Terarria1457/Terraria/Item.cs 各 case 首行 `SetWeaponValues(dmg, kb[, crit])`
    // （helper 定义 :48418-48423）。用户实报:5129 Flymeal 缺 damage → 近战 meleeDmg
    // 落 fallback 1 伤(原版 15,×2 vs 镇民 + 100% 穿甲 ≈ 27-29/击),wiki 推荐的
    // 商贩帽(2222,旅商 368 必掉)获取法被镇民回血抵消=事实杀不死。重生成器
    // (extract-itemcombat.mjs fieldsFromLines SetWeaponValues 形参解析)回放同值。
    // 6155/6171/6173 = 1457 新增档(1456 无),其余两版同值(recon-item CLASS A/B 背书)。
    const pin: Array<[string, number, number, number | undefined]> = [
      ['4058', 8, 5, undefined],
      ['4059', 8, 4, undefined],   // Fossil Pickaxe
      ['4060', 60, 5, undefined],  // Super Star Shooter
      ['4061', 14, 6, undefined],  // Storm Spear
      ['4062', 24, 3, undefined],  // Thunder Zapper
      ['4317', 30, 7, undefined],  // Haemorrhaxe
      ['4381', 14, 3, undefined],  // Blood Rain Bow
      ['4788', 60, 12, undefined], // Jousting Lance
      ['4789', 130, 14, undefined], // Shadow Jousting Lance
      ['4790', 90, 13, undefined], // Hallowed Jousting Lance
      ['5129', 15, 5, undefined],  // Flymeal——商贩帽获取链关键件
      ['6155', 150, 10, 10],
      ['6171', 27, 6, undefined],  // Bejeweled Staff
      ['6173', 180, 4, undefined], // Arc Surge
    ];
    for (const [id, dmg, kb, crit] of pin) {
      const r = TABLE[id];
      expect(r, `id ${id} 在表`).toBeTruthy();
      expect(r.damage, `id ${id} damage`).toBe(dmg);
      expect(r.knockBack, `id ${id} knockBack`).toBe(kb);
      if (crit !== undefined) expect(r.crit, `id ${id} crit`).toBe(crit);
    }
  });
});

// 审计层:C# 反编译源不存在(其他环境)时 warn 跳过,不阻塞
(CS_PRESENT ? describe : describe.skip)('提取器自审计·审计层(spawn --audit)', () => {
  const run = (tool: string): { stdout: string; status: number | null } => {
    const r = spawnSync('node', [join(ROOT, 'tools', tool), '--audit'], {
      cwd: ROOT, encoding: 'utf8', timeout: 120_000,
    });
    return { stdout: r.stdout ?? '', status: r.status };
  };

  it('extract-itemcombat:anomalies 为空 + pinned 3507/3509 与已提交 JSON deep equal', () => {
    const { stdout, status } = run('extract-itemcombat.mjs');
    const j = JSON.parse(stdout.trim().split('\n').pop()!);
    expect(j.anomalies).toEqual([]);
    expect(j.delegates).toBeGreaterThanOrEqual(20); // X-04 基数
    expect(j.pinned['3507']).toEqual(TABLE['3507']);
    expect(j.pinned['3509']).toEqual(TABLE['3509']);
    void status;
  });

  it('extract-projstatus:跳过数 ≤ 基线(语义修正后 16,护栏 25)', () => {
    const { stdout } = run('extract-projstatus.mjs');
    // 该脚本 console.log 混入 stdout——取最后一行 JSON
    const line = stdout.trim().split('\n').pop()!;
    const j = JSON.parse(line);
    expect(j.types).toBeGreaterThanOrEqual(85);
    expect(j.skipped).toBeLessThanOrEqual(25);
  });
});

// ==================== BJ205 LAG 残余盘点定谳（2026-09-20） ====================
// dry-run 对拍事实基座：extract-itemcombat.mjs --dump(SW_ITEM_VER=1457) 与盘上
// vanilla-itemcombat.json 逐字节零差（4369=4369,值差 0）。EXTRACT_PATCH 45 件构成
// =29 全字段反哺复现 + 8 部分复现（炸弹族 shoot 六件/5594-5595 noUseGraphic）+
// 7 纯 LAG + 1 末值覆盖（1319）。本块四面钉值（机制锚=Terarria1457/Terraria/Item.cs,
// 1458 已抽核 1319/天顶剑/useTime 除法同行号）：
//  ① 仍 LAG 15 件 33 字段：提取器盲区（helper 体字段面未建/除法算式/末值语义）,
//    EXTRACT_PATCH 为唯一数据源——误删补丁或重产洗面必翻;
//  ② 1319 useAmmo 末值语义：源序 Bullet(:16335)→Snowball(:16343,1458:16343) 终值 949,
//    提取器首匹配取 97——钉运行时 949 + json 97 在案（提取器反哺后须同步改本块）;
//  ③ 反哺复现 canary：运行时值=提取器原生值 deep-equal——金标闸门管 json↔1457,
//    本 canary 管补丁↔json 同相,提取器改值即强制重定谳;
//  ④ 刻意偏差七件 noMelee 派发门：原版 SetDefaults 无此字面
//    (:37462-37474/:39505-39514/:39805-39816),运行时补它只走 combatWeapon
//    consumable&&noMelee 爆炸物门——禁反哺,重产时勿误判漂移。
describe('BJ205 itemcombat LAG 残余定谳(EXTRACT_PATCH 手补面)', () => {
  it('① helper 体族 4049/5392-5394/5594-5595 运行时钉值(LAG 唯一数据源)', () => {
    // DefaultToLawnMower 体 :48532-48541（useAnimation 30/useTime 10/autoReuse true）
    const mower = itemCombat(4049)!;
    expect(mower.useTime).toBe(10);
    expect(mower.useAnimation).toBe(30);
    expect(mower.autoReuse).toBe(true);
    // DefaultToSolution 体 :47800-47808（shoot=projectileId-145 → 870/871/872;
    //   ammo=AmmoID.Solution 780;consumable true）+ 调用点 :42774/:42777/:42780
    for (const [id, shoot] of [[5392, 870], [5393, 871], [5394, 872]] as const) {
      const c = itemCombat(id)!;
      expect(c.shoot, `solution ${id} shoot`).toBe(shoot);
      expect(c.ammo, `solution ${id} ammo`).toBe(780);
      expect(c.consumable, `solution ${id} consumable`).toBe(true);
    }
    // DefaultToBomb 体 :47771-47783 + 形参算式 :44027 shoot=1086+(type-5594),speed 6
    for (const [id, shoot] of [[5594, 1086], [5595, 1087]] as const) {
      const c = itemCombat(id)!;
      expect(c.shoot, `powerbomb ${id} shoot`).toBe(shoot);
      expect(c.shootSpeed, `powerbomb ${id} shootSpeed`).toBe(6);
      expect(c.useTime, `powerbomb ${id} useTime`).toBe(40);
      expect(c.useAnimation, `powerbomb ${id} useAnimation`).toBe(40);
      expect(c.consumable, `powerbomb ${id} consumable`).toBe(true);
      expect(c.noMelee, `powerbomb ${id} noMelee`).toBe(true);
      // noUseGraphic 是提取器原生位(默认 40×28/UseSound Item1 不入 combat 域,不钉)
      expect(c.noUseGraphic, `powerbomb ${id} noUseGraphic`).toBe(true);
    }
  });

  it('① 天顶剑算式 4956/5669 useTime=useAnimation/3=10(:40011/:44557,1458 同)', () => {
    for (const id of [4956, 5669]) {
      const c = itemCombat(id)!;
      expect(c.useAnimation, `zenith ${id} useAnimation(提取器原生)`).toBe(30);
      expect(c.useTime, `zenith ${id} useTime(=30/3,EXTRACT_PATCH 唯一源)`).toBe(10);
      expect(c.crit, `zenith ${id} crit(提取器原生)`).toBe(10);
    }
  });

  it('② 1319 雪球炮 useAmmo 末值=Snowball 949(提取器首匹配 97 在案)', () => {
    expect((itemCombatJson as unknown as Record<string, { useAmmo?: number }>)['1319']?.useAmmo).toBe(97);
    expect(itemCombat(1319)!.useAmmo).toBe(949);
  });

  it('③ 反哺复现 canary:运行时值=提取器原生值(回摆即翻,强制重定谳)', () => {
    // 抽核全家族:crit+ 四件/七短剑/SetWeaponValues/DefaultTo* 形参位/主流程手补被
    // 原生复现件(5065/5129/4703)。全等=补丁与 json 同相;提取器改值时本块红=先定谳再动刀。
    for (const id of [1782, 1784, 1835, 3291, 3507, 4058, 4059, 4060, 4061, 4062,
      4317, 4347, 4348, 4381, 4703, 4788, 4789, 4790, 5065, 5129, 5629,
      6152, 6153, 6154, 6155, 6171, 6173]) {
      expect(itemCombat(id) as unknown, `id ${id} 补丁↔json 同相`).toEqual(
        (itemCombatJson as unknown as Record<string, unknown>)[String(id)] ?? {});
    }
  });

  it('④ 刻意偏差七件 noMelee 派发门:原版无此字面,禁反哺(重产勿误判漂移)', () => {
    for (const id of [4423, 4824, 4825, 4826, 4827, 4908, 4909]) {
      expect('noMelee' in (itemCombatJson as unknown as Record<string, Record<string, unknown>>)[String(id)],
        `id ${id} 原版/提取器应无 noMelee 字面`).toBe(false);
      expect(itemCombat(id)!.noMelee, `id ${id} 运行时派发门 noMelee`).toBe(true);
    }
  });
});
