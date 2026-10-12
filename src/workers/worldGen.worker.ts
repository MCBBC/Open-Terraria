// 世界生成/存档解析 worker：generate（生成+沉降一条链）与 saveParse（读档解析+沉降）。
// 全程纯计算（generateWorld/settleWorldLiquids/loadSaveData 均无 DOM 依赖），
// 结果 packWorld 转移所有权回传。错误按请求 id 回传，绝不静默 pending。
/// <reference lib="webworker" />
import { assertWorkerBootGate } from './workerBootGate';   // ★boot 闸首导入（x-ray 定谳防线;先于 procShim,见该文件头注）
import './procShim';   // ★必须最先(见 procShim 文档;ESM import 提升使本文件体内语句晚于依赖求值)
import { ITEM_DEFS, ITEM_BY_KEY, applyModItemIds } from '../data/items';
import { applyModTileStableMap, applyModTileKeys } from '../data/tiles';
import { setCurrentAlloc } from '../mods/bridge';
import { generateWorld, requestWorldGenAbort, WorldGenAbortedError } from '../world/gen/WorldGen';
import { registerGenPass } from '../world/gen/WorldGen';   // ★IIIII229 ① Esc 中止链
import { settleWorldLiquids } from '../world/liquid/settle';
import { repairIndexFramesInStore } from '../world/repairIndexFrames';
import { genItemIconPixels } from '../assets/ItemIconGen';
import { packWorld } from './worldPacket';
import { renderPreviewBitmap } from './previewBitmap';
import { loadSaveData } from '../save/SaveFile';
import { kvGetIdbEx } from '../save/KvStore';   // ★BJ605：三态精细读（kvGetIdb 薄壳化后 value 投影等价）
import type { WorldWorkerRequest, WorldWorkerEvent } from './protocol';



// ★622:mod gen pass 注册(worker 侧——eval mod bundle+stub sw 只活 gen 三面)
let genSrcRegistered = false;
function registerModGenPassesInWorker(src: string): void {
  if (genSrcRegistered) return;   // 幂等(重 build 不重注册)
  genSrcRegistered = true;
  try {
    // 全局数据面(gen passes 消费;worker 自有表直写)
    const tilesMod = globalThis as Record<string, unknown>;
    import('../data/tiles').then((tiles) => {
      tilesMod.__calamityTileDefs = tiles.TILE_DEFS;
      tilesMod.__calamityTileIdByKey = tiles.TILE_BY_KEY;
    });
    // stub sw:registerGenPass 活+rollPrefixFor/log 兜底;其余 no-op
    const stubSw = new Proxy({}, {
      get: (target, prop: string) => {
        if (prop === 'registerGenPass') return (name: string, fn: (...a: unknown[]) => void) => {
          registerGenPass({ name, fn });
        };
        if (prop === 'rollPrefixFor') return () => 0;
        if (prop === 'log') return (...args: unknown[]) => console.log('[mod:gen]', ...args);
        if (prop === 'config') return { get: () => false, set: () => {} };
        return () => {};   // 其余全 no-op
      },
      has: () => true,
    });
    // eval mod bundle(★622c 两步:①IIFE 返回 entry fn ②entry(stubSw)=注册面执行)
    const tail = /export\s*\{\s*(\w+)\s+as\s+default\s*\}\s*;?\s*$/.exec(src);
    const cjs = src.replace(/export\s*\{[^}]*\}\s*;?\s*$/, '');
    const entryName = tail ? tail[1] : 'main';
    const modIIFE = new Function('sw', cjs + '\nreturn ' + entryName + ';');
    const entry = modIIFE(stubSw);
    entry(stubSw);   // ← 注册面执行(setupGen→registerGenPass 13 次)
    console.log('[worker] mod gen passes registered');
  } catch (err) {
    console.error('[worker] mod gen registration failed:', err);
  }
}

assertWorkerBootGate('worldGen.worker');   // 图求值后一拍扫 boot 残留（能力账见 workerBootGate 头注）

const ctx = self as unknown as {
  postMessage(msg: WorldWorkerEvent, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<WorldWorkerRequest>) => void) | null;
};

// 兜底回传：unhandled rejection / 运行时错误（栈溢出等 catch 块自身可能再溢出，
// 2026-08-18 排查实践：onerror 在主线程侧拿不到 worker 栈，必须在 worker 内自报）
self.addEventListener('unhandledrejection', (ev: PromiseRejectionEvent) => {
  const r = ev.reason as Error | undefined;
  ctx.postMessage({ id: -1, type: 'error', message: 'unhandled: ' + (r?.message ?? String(ev.reason)),
    stack: r?.stack });
});
self.addEventListener('error', (ev: ErrorEvent) => {
  ctx.postMessage({ id: -1, type: 'error', message: 'runtime: ' + ev.message,
    stack: (ev.error as Error | undefined)?.stack ?? `${ev.filename}:${ev.lineno}:${ev.colno}` });
});

ctx.onmessage = async (e) => {
  const req = e.data;
  try {
    if (req.type === 'ping') {
      ctx.postMessage({ id: req.id, type: 'ready' });
      return;
    }
    if (req.type === 'genIcons') {
      // 程序化图标图集(#三开压测批 worker 化):纯像素生成平铺进单张图集,
      // rgba transfer 回传——主线程只做一次 putImageData,消灭 ~6059 次逐图标
      // createCanvas/putImageData(~0.7-1.2s 主线程 task)
      const ids: number[] = [];
      const COLS = 64;
      const n = ITEM_DEFS.length;
      const rows = Math.ceil(n / COLS);
      const rgba = new Uint8ClampedArray(COLS * 16 * rows * 16 * 4);
      for (let i = 0; i < n; i++) {
        // ★方案 A（BJ264）：重排后 ITEM_DEFS 稀疏（洞=undefined）——洞格留透明像素、
        //   ids 压 -1（不可撞内部 id 域）保持格位对齐（AssetGen.prepareIconAtlas
        //   按 ids[i]=内部 id 建 slotById 槽位映射）
        const d = ITEM_DEFS[i];
        const cx = (i % COLS) * 16, cy = Math.floor(i / COLS) * 16;
        if (!d) { ids.push(-1); continue; }
        const px = genItemIconPixels(d.key);
        for (let y = 0; y < 16; y++) {
          const src = y * 64, dst = ((cy + y) * COLS * 16 + cx) * 4;
          rgba.set(px.data.subarray(src, src + 64), dst);
        }
        ids.push(ITEM_BY_KEY[d.key]);
      }
      const buf = rgba.buffer as ArrayBuffer;
      ctx.postMessage({ id: req.id, type: 'icons',
        icons: { rgba: buf, width: COLS * 16, height: rows * 16, cols: COLS, ids } },
        [buf]);
      return;
    }
    // ★IIIII229 ①：Esc 中止请求——置位生成中止位（generateWorld pass 环边界消费）。
    //   fire-and-forget:无作业在跑时置位无害(下次 generateWorld 头部清零)。
    if (req.type === 'abortGen') {
      requestWorldGenAbort();
      return;
    }
    // ★mod 桥(2026-10-04)：mod 物品/tile 稳定 id 增量——读档路径(saveParse→loadSaveData)
    //   的 stable→internal 翻译在本线程表上完成,不接桥=mod 内容解档静默归 0。
    //   fire-and-forget 幂等(重复推送 skip;applyMod* 内自守卫)。
    if (req.type === 'applyModIds') {
      applyModItemIds(req.payload.itemStableIds);
      applyModTileStableMap(req.payload.tilePairs);
      applyModTileKeys(req.payload.tileKeys);   // ★622:TILE_BY_KEY 补 mod 条目(gen passes 消费)
      // ★P5 id 平移解:当前分配映射入 worker 域(loadSaveData 重映射消费)
      setCurrentAlloc({
        itemKeys: new Map(req.payload.itemKeys),
        tileKeys: new Map(req.payload.tileKeys),
      });
      return;
    }
    // ★622:mod gen pass 源码(worker 侧注册——eval mod bundle+stub sw=gen 注册闭环)
    if (req.type === 'applyGenSrc') {
      const gp = req.payload as { src: string; globals?: { schematics?: Record<string, unknown>; modData?: Record<string, unknown> } };
      if (gp.globals) {
        const w = globalThis as Record<string, unknown>;
        if (gp.globals.schematics) w.__calamitySchematics = gp.globals.schematics;
        if (gp.globals.modData) w.__calamityModData = gp.globals.modData;
      }
      registerModGenPassesInWorker(gp.src);
      return;
    }
    if (req.type === 'generate') {
      // ★预览抓帧与进度锚点同步（2026-08-31）：共享一个 400ms 冷却钟——
      //   槽边界帧（onWorldPartial）与进度里程碑帧（换窗 / Δp≥1% / 完成）都过同一
      //   闸门 ⇒ 总量≤2.5fps。相对旧实现（每槽必出一帧、长 pass 冻结数秒）：
      //   总帧数持平略降，长 pass 内补 5-10 帧（Jungle/Desert/Underworld 逐段啃出）。
      //   世界引用在首个 partial 即捕获——生成期全程同一实例，中途变更引用只会更晚出现。
      //   进度驱动的里程碑帧无已完成槽可归属 → 标 passIndex=lastSlot+1/沿用最后槽名
      //   （消费端 GenWorldPreview 不读这两个字段，仅存档语义）。
      let latestWorld: import('../world/World').World | null = null;
      let lastSlot = -1;
      let lastName = '';
      let lastProgLabel: string | undefined = undefined;
      let lastShotP = -1;                       // 最近一次里程碑帧的总进度基线
      let nextShotAt = 0;                       // 共享冷却钟（Date.now() 域）
      const PREVIEW_MIN_MS = 400;
      const PREVIEW_MIN_DP = 0.01;
      const shootIfDue = (): boolean => {
        if (!latestWorld) return false;
        const now = Date.now();
        if (now < nextShotAt) return false;
        nextShotAt = now + PREVIEW_MIN_MS;
        // 背景分层上下文（对齐游戏内小地图；生成早期世界面未定 → 兜底浅蓝）。
        // ★IIIII218：补地狱顶（lavaLine→地狱底单色支）与 remix 上表旗（mapType100）
        const bg = latestWorld.groundLevel > 0
          ? { groundLevel: latestWorld.groundLevel, rockLevel: latestWorld.rockLevel,
              underworld: latestWorld.lavaLine > 0 ? latestWorld.lavaLine : undefined,
              remix: !!latestWorld.seedFlags?.remix }
          : undefined;
        const f = renderPreviewBitmap(latestWorld.store, 1024, bg);
        ctx.postMessage(
          { id: req.id, type: 'preview', passIndex: Math.max(0, lastSlot), passName: lastName, width: f.width, height: f.height, rgba: f.rgba.buffer as ArrayBuffer },
          [f.rgba.buffer],
        );
        return true;
      };
      let world: import('../world/World').World;
      try {
        world = await generateWorld(
        {
          width: req.cfg.width, height: req.cfg.height, size: req.cfg.size, seedText: req.cfg.seedText,
          name: req.cfg.name, evil: req.cfg.evil, seedFlags: req.cfg.seedFlags,
          // 槽边界帧：捕获世界引用 + 过共享冷却闸（不再是"每槽必出"，被闸削掉的
          // 突发由同节拍的里程碑帧就近补位）
          onWorldPartial: req.cfg.preview
            ? (w, passIndex, passName) => {
              latestWorld = w;
              lastSlot = passIndex;
              lastName = passName;
              shootIfDue();
            }
            : undefined,
        },
        (label, p, local) => {
          ctx.postMessage(
            { id: req.id, type: 'progress', phase: 'generate', ...(label !== undefined ? { label } : {}), p, local });
          if (!req.cfg.preview) return;
          // 里程碑判定（与限流后的进度流同源节奏）：
          //  - 换窗（label 变化=beginVan 有词条跨边界）
          //  - Δp≥1%（加权总进度实质推进的粘滞段快照）
          //  - p≥1（'完成' force 终帧保证成图一定出片）
          const boundary = label !== undefined && label !== lastProgLabel;
          if (lastProgLabel === undefined && label === undefined) return; // 首条粘滞前不判定
          lastProgLabel = label !== undefined ? label : lastProgLabel;
          const now = Date.now();
          // p≥1 终帧越权：冷却钟只削过程帧，成图帧必达（此前"保底"会被
          // 恰好落窗内的 '完成' 事件削掉——评审 2026-09-01 修正）
          if (now < nextShotAt && p < 1) return;
          if (boundary || p >= 1 || Math.abs(p - lastShotP) >= PREVIEW_MIN_DP) {
            if (shootIfDue()) lastShotP = p;
          }
        },
        );
      } catch (err) {
        // ★IIIII229 ①：Esc 中止收场——中止不走 error 通道(那是真实生成错误的告警面),
        //   专用 'aborted' 事件回传,客户端按 WorldGenAbortedError 判别,世界不打包不落库。
        if (err instanceof WorldGenAbortedError) {
          ctx.postMessage({ id: req.id, type: 'aborted' });
          return;
        }
        throw err;
      }
      // 二次沉降(cs:21051)自 2026-08-17 起归位 generateWorld 管线内（蜂巢幼虫之后、
      // 仙人掌珊瑚之前）——此处不再生成后补跑（曾晚 8 个 pass：#98 液体门读到未沉水体）
      world.indexFramesRepaired = true;   // 生成端写像素帧终态，免主线程修复扫描
      // ★幽灵净化(2026-09-07 方案B,生成边界):worldgen 挖洞遗留的幽灵格
      //  (active=false+type≠0)在打包回传前清零——对齐原版「存档→读档后无幽灵」
      //  的世界形态;净化点在 generateWorld 返回之后,生成会话内对拍金标(x86 rig
      //  比较器豁免 act=0 的 typ)不受影响。运行时「裸读 type」路径的地雷就此终结
      //  (g#98 液体判定/替换掉落/矿石闪光等历史修复随之成为防御性死代码,无害保留)
      const purged = world.store.purgeGhostTiles();
      if (purged > 0) console.log(`[gen] 幽灵格净化 ${purged} 格(对齐原版)`);
      const { packet, transfer } = packWorld(world); // 转移所有权（本分支最后一步）
      ctx.postMessage({ id: req.id, type: 'result', world: packet }, transfer);
      return;
    }
    const __wkLog: string[] = [];
    if (req.type === 'saveParse') {
      // 三源：key=worker 内直读 IDB（主路径，免大字符串 clone）；json=小档/调试；
      // save=.wld 导入（主线程已解析 SaveData 直传）。★BJ223（2026-09-20）恢复
      // json/save 两源——BJ90 债④「零消费方」定谳勘误：grep 漏计 mainFlow.loadFromJson
      // （client.loadSave({json})，探针 __swLoadJson/世界导入/主线程 fallback 的镜像
      // 消费方）→ 两源被连坐删除后该路径必抛「存档数据缺失」（catch 的 alert 同步
      // 阻塞主线程=探针 protocolTimeout 挂死）。BJ90 退役面仅 v6 二进制分支，
      // json/save 语义按 protocol 三源形状恢复（守卫：tests/bj223-saveparse-three-sources.test.ts）
      const __t0 = performance.now();
      let data: import('../save/SaveFile').SaveData | null;
      let dataSrc = '';
      // ★BJ605（2026-10-10 线上事故）：数据缺失分类——idbUnavailable/keyMissing/
      //  typeMismatch/jsonParseFailed/noSource 五态,进 message 供主线程
      //  isSaveDataMissingError 判别 fallback 资格与文案映射（形状契约见
      //  src/save/LoadErrors.ts BJ605 段;判别测试 tests/bj605-load-fallback-chain.test.ts）
      let missingReason: import('../save/LoadErrors').SaveMissingReason = 'noSource';
      {
        // ★BJ90（2026-09-15）债④死路径移除（BJ71 登记②）：v6 二进制分支退役——
        //  kvSetCompat 写的二进制副本恒被同 key JSON 后写覆盖（IDB 同 store 串行,
        //  评估定谳=快路径零活跃消费方）;崩溃窗口的二进制残留是 meta={} 元数据全丢
        //  损毁态（unpack 后 loadSaveData 读 data.header.width 即抛,无法救）。存档
        //  权威格式=JSON 字符串（kvGetIdb 直读）。★BJ223 勘误：退役范围仅此二进制
        //  分支，json 源非死路径（mainFlow.loadFromJson 的 client.loadSave({json}) 活跃
        //  消费）。★BJ283 注勘误（S3 定谳）：save 源零生产消费方——importWld 实走主线程
        //  parseWldToSave→loadSaveData 直调（mainFlow.ts:926-932，不经 worker saveParse）；
        //  client.loadSave({save}) 唯一消费=tests/bj223-saveparse-three-sources.test.ts
        //  round-trip 守卫（协议三源形状保留，分支留作契约面）。
        if (req.key) {
          // ★BJ605：kvGetIdbEx 精细读——「打不开库/键不存在/值非 string」三态
          //  可操作面完全不同（存储不可用可自救 vs 数据真缺失不可恢复）；分类后
          //  主线程对缺失族走 kvGet fallback（LS 兜底读救援：双写时代历史副本；
          //  ★BJ615 单写后新档只在 IDB）。
          dataSrc = 'idb';
          const r = await kvGetIdbEx(req.key);
          if (r.cause === 'ok') {
            try {
              data = JSON.parse(r.value as string) as import('../save/SaveFile').SaveData;
            } catch (err) {
              // IDB 值损坏（非合法 JSON）——同属缺失族（localStorage 副本可能完好）
              throw new Error(`存档数据缺失 (jsonParseFailed, src=${dataSrc}, key=${req.key}, detail=${err instanceof Error ? err.message : String(err)})`);
            }
          } else {
            missingReason = r.cause === 'keyMissing' ? 'keyMissing'
              : r.cause === 'typeMismatch' ? 'typeMismatch' : 'idbUnavailable';
            data = null;
          }
        } else if ('json' in req && typeof req.json === 'string') {
          // 小档/调试/探针/导入镜像路径（mainFlow.loadFromJson）：JSON 文本 worker 内解析
          dataSrc = 'json';
          try {
            data = JSON.parse(req.json) as import('../save/SaveFile').SaveData;
          } catch (err) {
            // ★BJ605：裸 SyntaxError 收编进缺失族分类（主线程 loadFromJson 原语义
            //  re-throw 不变——同 text 的主线程 fallback 必然同败,re-throw 即最优）
            throw new Error(`存档数据缺失 (jsonParseFailed, src=${dataSrc}, key=-, detail=${err instanceof Error ? err.message : String(err)})`);
          }
        } else if ('save' in req && req.save) {
          // ★BJ283 注勘误：save 源零生产消费方——.wld 导入实走主线程 loadSaveData 直调
          //  （mainFlow.ts:926-932），不经此源；仅 BJ223 守卫 round-trip 消费（契约面保留）
          dataSrc = 'save';
          data = req.save;
        } else {
          dataSrc = '';
          missingReason = 'noSource';
          data = null;
        }
      }
      // ★BJ605：分类 message（WorldGenClient 包装后主线程实际收到
      //  `[worldGen worker] 存档数据缺失 (...)`——判别正则非锚定）。
      //  原「存档数据缺失」裸文案兼容 bj223 结构锁（toContain）。
      if (!data) throw new Error(`存档数据缺失 (${missingReason}, src=${dataSrc}, key=${req.key ?? '-'})`);
      __wkLog.push(`parse(${dataSrc}) ${Math.round(performance.now() - __t0)}ms`);
      // ★大世界内存峰值削减(2026-09-06)：SaveData 对象在 loadSaveData 后不再需要,
      //   立即提取尾部需要的字段并释放引用——6400×1800 世界 SaveData+TypedArrays
      //   同时存活 ~500MB→峰值过剩。req.json 大字符串同步释放。
      const savedDifficulty = data.header?.difficulty;
      const savedPlayMs = data.header?.playTimeMs;   // SW-BJ5 2026-09-07：主线程读档吸合基线用（副本/导入/quickLoad 槽位落后于存档头）
      const savedEvents = data.events;
      if ('json' in req) (req as { json?: string }).json = undefined;
      if ('save' in req) (req as { save?: unknown }).save = undefined;
      ctx.postMessage({ id: req.id, type: 'progress', phase: 'parse', p: 0.3 });
      // 原版 loadWorld 进度序列(WorldFile.cs):LoadWorldTiles gen[51] 按列(:2514)→
      // 沉降 gen[27] 收敛比例 50-100%(:762)。p 现为收敛比例 0..1(settle.ts),
      // 百分比区间在 mainFlow 端拼(:762 同款 50+p*50)
      const __t1 = performance.now();
      const { world, player } = loadSaveData(data,
        (p) => ctx.postMessage({ id: req.id, type: 'progress', phase: 'tiles', p }));
      __wkLog.push(`loadSaveData ${Math.round(performance.now() - __t1)}ms`);
      // ★loadSaveData 完成后立即释放 SaveData 引用(GC 可回收 ~100-200MB 的
      //   base64 字符串+解析对象——6400×1800 世界峰值削减关键)
      data = null as unknown as typeof data;
      // ★历史索引帧修复（#perf2026-08-28 前移到 worker）：旧档多格家具的格内偏移
      // 曾写成格索引(0/1)而非像素(0/18)。★必须在沉降【前】——LiquidSim.diesIn 按
      // frameX/frameY 解析对象死亡档位（TILE_OBJECT_DEATH style/alt），索引态帧会
      // 让档位错位（主路径旧序=afterWorldLoad 里修复在 waterCheck 之后，历史倒置
      // 顺带在此归位）。谓词幂等（修过即 maxFx≥18 跳过）绝不二次 ×18。置位后主线程
      // afterWorldLoad 跳过重复全图扫描（关键路径曾 ~133ms）。
      const repaired = repairIndexFramesInStore(world.store);
      world.indexFramesRepaired = true;
      if (repaired) console.log(`[worker] 索引帧修复 ${repaired} 格（索引→像素 ×18）`);
      await settleWorldLiquids(world, 'load',
        (p) => ctx.postMessage({ id: req.id, type: 'progress', phase: 'settle', label: '水体沉降', p }));
      const __t2 = performance.now();
      const { packet, transfer } = packWorld(world);
      __wkLog.push(`settle+pack ${Math.round(performance.now() - __t2)}ms chests=${packet.chests?.length ?? 0}`);
      // ★收窄:主线程只消费 difficulty/playTimeMs/events(mainFlow.ts 读档吸合),整档 SaveData
      // 回传=4.7MB 结构化克隆白费(2026-08-13 读档优化;SW-BJ5 2026-09-07 增 playTimeMs 单字段)
      ctx.postMessage({
        id: req.id, type: 'result', world: packet, player, wkLog: __wkLog,
        save: { header: { difficulty: savedDifficulty, playTimeMs: savedPlayMs }, events: savedEvents } as typeof data,
      }, transfer);
      return;
    }
  } catch (err) {
    const e = err as Error & { cause?: unknown };
    // ★cause 透传(2026-09-02):generateWorld 的槽包装 Error 把原始栈藏在 cause,
    //   只回传 wrapped.stack 会永远指到包装点(本次 pass4 'process is not defined'
    //   定位即靠此拿到真栈)
    ctx.postMessage({
      id: req.id, type: 'error',
      message: err instanceof Error ? `${err.message}` : String(err),
      stack: (err instanceof Error ? err.stack : undefined)
        + (e.cause instanceof Error ? `\n--cause--\n${e.cause.stack ?? ''}` : ''),
    });
  }
};
