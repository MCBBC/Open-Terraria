// IIIII20 StarterNPC 换人支收齐 探针：各秘种子路径生成 → starter 记录字段全列断言。
// 名字终名预言 = pass 头重播种子（WorldGenerator.cs:497 Main.rand=new UnifiedRandom(_seed)）
//   之后的第 1/2 掷（else 链各臂 NewNPC 是本 pass 首个掷骰消费点）——用本仓 UnifiedRandom
//   复算第二掷并与 en-US 名池对拍。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199'), { waitUntil: 'networkidle0' });
// 应用启动链可能自带一次延迟 reload（菜单引导期）——等它完成后稳定 2s 再进 evaluate；
// evaluate 若仍遇 context destroyed（reload 撕掉执行环境）则等导航落定后整段重试。
await new Promise((r) => setTimeout(r, 2500));

// en-US 池序表（独立副本——与 src/world/gen/vanilla/StarterNPCsPass.ts 的 NAME_POOLS
// 对拍,不一致会体现在 predicted 与 starters.givenName 不等上）
const POOLS = {
  20: ['Alalia','Alura','Ariella','Caelia','Calista','Chryseis','Emerenta','Elysia','Evvie','Faye','Felicitae','Lunette','Nata','Nissa','Tatiana','Rosalva','Shea','Tania','Isis','Celestia','Xylia'],
  17: ['Alfred','Barney','Calvin','Edmund','Edwin','Eugene','Frank','Frederick','Gilbert','Gus','Wilbur','Seymour','Louis','Humphrey','Harold','Milton','Mortimer','Howard','Walter','Isaac','Joseph','Kristian','Ralph'],
  38: ['Dolbere','Bazdin','Durim','Tordak','Garval','Morthal','Oten','Dolgen','Gimli','Gimut','Duerthen','Beldin','Jarut','Ovbere','Norkas','Dolgrim','Boften','Norsun','Dias','Fikod','Urist','Darur'],
  441: ['McKinly','Millard','Fillmore','Rutherford','Chester','Grover','Cleveland','Theodore','Herbert','Warren','Lyndon','Ronald','Harrison','Woodrow','Tweed','Blanton','Dwyer','Carroll','Agnew'],
  633: ['Maria','MacKenzie','Azaria','Juanita','Astra','Hayley','Becca','Veronica','Tia','Robyn','Arien','Jane','Bindi','Dian','Lori','Mardy','Mollie','Lizzy','Daphne','Ellen','Lilith'],
};
const WIDTHS = { 20: POOLS[20].length, 17: POOLS[17].length, 38: POOLS[38].length, 441: POOLS[441].length, 633: POOLS[633].length };

const CASES = [
  { name: 'vampire', seedText: '1999040633', flags: { vampireSeed: true }, type: 633 },
  { name: 'remix', seedText: 'dontdigup', flags: { remix: true }, type: 441 },
  { name: 'notbees', seedText: 'notthebees', flags: { notTheBees: true }, type: 17 },
  { name: 'ftw', seedText: 'fortheworthy', flags: { getGoodWorld: true }, type: 38 },
  { name: 'infected', seedText: 'purifythis', flags: { infectedSeed: true }, type: 20 },
];

const evalBody = async (CASES, POOLS, WIDTHS) => {
  const mod = await import('/src/world/gen/WorldGen.ts');
  const rngMod = await import('/src/core/rng.ts');
  const results = [];
  for (const c of CASES) {
    const t0 = Date.now();
    const world = await mod.generateWorld({
      width: 4200, height: 1200,
      seedText: c.seedText, seedFlags: c.flags, evil: 0,
    });
    const ms = Date.now() - t0;
    // 终名预言：pass 头重播后第 2 掷落池（第 1 掷被 GetNameForVariant 覆写）
    const ur = new rngMod.UnifiedRandom(world.seed);
    ur.nextInt(WIDTHS[c.type]);
    const second = ur.nextInt(WIDTHS[c.type]);
    results.push({
      case: c.name, ms, spawn: [world.spawnX, world.spawnY], seed: world.seed,
      starters: world.starterTownNpcs,
      predicted: { secondRollIndex: second, expectedName: POOLS[c.type][second] },
      negFlags: {
        unlockedPartyGirlSpawn: !!world.flags.unlockedPartyGirlSpawn,
        savedMech: !!world.flags.savedMech,
        boughtBunny: !!world.flags.boughtBunny,
        unlockedDemolitionistSpawn: !!world.flags.unlockedDemolitionistSpawn,
        unlockedMerchantSpawn: !!world.flags.unlockedMerchantSpawn,
        savedTaxCollector: !!world.flags.savedTaxCollector,
      },
    });
  }
  // 组合臂：十周年×remix（税务员 Andrew——zenith 主线面）与 十周年×infected（德鲁伊 Lilith）
  const comboR = await mod.generateWorld({ width: 4200, height: 1200, seedText: '1999040562', seedFlags: { tenthAnniversary: true, remix: true }, evil: 0 });
  const comboI = await mod.generateWorld({ width: 4200, height: 1200, seedText: '1999040562', seedFlags: { tenthAnniversary: true, infectedSeed: true }, evil: 0 });
  return {
    arms: results,
    comboRemix: { starters: comboR.starterTownNpcs, savedTaxCollector: !!comboR.flags.savedTaxCollector },
    comboInf: { starters: comboI.starterTownNpcs },
  };
};
let out = null;
for (let i = 0; i < 3 && !out; i++) {
  try {
    out = await page.evaluate(evalBody, CASES, POOLS, WIDTHS);
  } catch (e) {
    console.log(`[probe] evaluate retry#${i}: ${e.message}`);
    await new Promise((r) => setTimeout(r, 2500));
  }
}
if (!out) throw new Error('evaluate 三次重试仍失败');

fs.writeFileSync('/tmp/iii20-out/probe.json', JSON.stringify(out, null, 1));
for (const r of out.arms) console.log(`\n== ${r.case} (${r.ms}ms) spawn=${JSON.stringify(r.spawn)} ==`);
console.log(JSON.stringify(out.arms.map((r) => ({ case: r.case, starters: r.starters, predicted: r.predicted })), null, 1));
console.log('comboRemix:', JSON.stringify(out.comboRemix));
console.log('comboInf:', JSON.stringify(out.comboInf));
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 8));
await browser.close();
process.exit(0);
