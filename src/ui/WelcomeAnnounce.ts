// 首次进世界公告(2026-08-25 用户要求):原版宣传介绍(纯文字版,表格已转文字)
// + 复刻版免责声明 + 购买原版新标签链接 + 「我已知晓」永久关闭(localStorage)。
// 挂点 = mainFlow onWorldReady(单人新建/读档/联机加入共用的进世界回调)。
const ACK_KEY = 'sw.welcome.announce.acked';

const BODY = `🎮 花一份盒饭钱,换来一辈子都挖不完的世界——为什么《泰拉瑞亚》值得每个人试试

🏆 一句话总结:如果你这辈子只打算玩一个"性价比之王"的游戏,那大概率就是它。Steam 97% 好评率、141 万条评论、全平台销量突破 7000 万份——这些数字背后,是一款 2D 像素游戏用 15 年免费更新堆出来的奇迹。

🎯 这游戏到底玩什么?简单说:你被丢进一个随机生成的广阔世界,手里只有一把铜镐和一把短剑,然后……一切随你。
· 想打怪变强?30 多种 Boss 等你挑战,从眼球怪到月亮领主,战斗难度层层递进,击败 Boss 会解锁新区域、新材料、新玩法。
· 想探索冒险?世界有森林、沙漠、丛林、地狱、空岛、腐化之地等十几种生态地貌,每个世界约 8400×2400 个方块等你挖掘,地下藏着无数宝藏和秘密。
· 想盖房子当设计师?300 多种家具、40 多种建筑材料,还能吸引 28 个不同 NPC 来你家住,每个人都有自己的房间偏好和商品出售。
· 想休闲养老?钓鱼、种田、驯养坐骑、研究电路机关、造自动化农场……甚至还能打高尔夫。
它不是《我的世界》那种纯创造,它更像"披着沙盒外衣的恶魔城"——有明确的目标感、成长线和战斗爽感,同时给你无限的自由度。

📊 内容量有多恐怖?给个直观的数字:物品总数超过 6000 件(1.4.5 版本),敌人种类 500 余种,Boss 数量 30 多个,NPC 角色 28 个以上;职业分近战、远程、魔法、召唤四大体系,难度有经典、专家、大师、旅行四种;单次通关约 100~500 小时,全收集可达 1000 小时以上。官方已经连续 15 年免费更新,最新的 1.4.5 版于 2026 年 1 月上线;社区模组平台 tModLoader 上有超过 10000 个模组,仅灾厄模组就新增 25 个以上 Boss。1.4.5"大石所趋"版本一口气新增了 600 多件物品、35 种世界种子,还和《死亡细胞》《幻兽帕鲁》做了联动内容——而这一切,全部免费。

💰 价格有多离谱?Steam 售价约 10 美元(人民币约 36~70 元,视区服而定),四联包约 26 美元,够四个朋友一起玩。对比一下:一杯奶茶可以喝 20 分钟,这个游戏你可以玩几千小时。有评测直接说它拥有"游戏界最佳每小时性价比之一"。

❤️ 为什么玩家愿意给 141 万条好评?Steam 97% 好评率,它是 Steam 历史上第一款突破百万好评的游戏。玩家们说:"玩了三天三夜都没察觉""每次打开都有新发现""1000 小时了还没玩完所有内容"。它没有强制剧情,没有氪金内购,没有通行证——只有纯粹的、越挖越上头的"再挖一个矿脉"的循环。

🎯 一句话安利:《泰拉瑞亚》就是一款"10 美元买断、15 年免费更新、6000 种物品、500 种敌人、30 个 Boss、1000 小时玩不完、还能打 Mod 和联机"的 2D 沙盒神作。如果你喜欢探索、喜欢变强、喜欢创造,或者只是想在游戏里"不知不觉就天亮了"——买它,绝对不亏。`;

const DISCLAIMER = `⚠️ 特别说明:当前复刻版本仅用于 AI 学习研究,严禁用于任何商业用途;如需体验完整内容,请通过官方渠道购买并支持原版——`;

const BUY_URL = 'https://store.steampowered.com/app/105600/Terraria';

export function maybeShowWelcomeAnnounce(): void {
  try {
    if (localStorage.getItem(ACK_KEY)) return;
  } catch { /* 隐私模式:每次进世界都显示 */ }

  const root = document.createElement('div');
  root.id = 'sw-welcome-announce';
  root.style.cssText = 'position:fixed; inset:0; z-index:60; background:rgba(0,0,0,0.72); display:flex; align-items:center; justify-content:center; padding:16px;';

  const panel = document.createElement('div');
  panel.style.cssText = 'max-width:680px; width:min(680px,94vw); max-height:86vh; display:flex; flex-direction:column; background:rgba(10,16,40,0.97); border:2px solid #4a5a9a; border-radius:8px; box-shadow:0 8px 40px rgba(0,0,0,0.7); font-family:"Fusion Pixel 12px","Microsoft YaHei",sans-serif;';

  const head = document.createElement('div');
  head.textContent = '📢 欢迎来到 SandboxWorld';
  head.style.cssText = 'padding:14px 18px 10px; font-size:18px; color:#ffd76b; border-bottom:1px solid rgba(90,120,220,0.35);';

  const body = document.createElement('div');
  body.style.cssText = 'overflow-y:auto; padding:14px 18px; color:#e8ecf8; font-size:14px; line-height:1.95; white-space:pre-wrap;';
  body.textContent = BODY;
  body.appendChild(document.createElement('hr')).style.cssText = 'border:none; border-top:1px solid rgba(90,120,220,0.35); margin:12px 0;';
  const disclaim = document.createElement('div');
  disclaim.style.cssText = 'color:#ffd76b; line-height:1.9;';
  disclaim.innerHTML = DISCLAIMER
    + `<a href="${BUY_URL}" target="_blank" rel="noopener" style="color:#4da3ff; text-decoration:underline;">购买原版</a>`
    + '(新标签页打开)';
  body.appendChild(disclaim);

  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex; gap:12px; padding:12px 18px 16px; border-top:1px solid rgba(90,120,220,0.35);';
  const buyLink = document.createElement('a');
  buyLink.href = BUY_URL;
  buyLink.target = '_blank';
  buyLink.rel = 'noopener';
  buyLink.textContent = '购买原版';
  buyLink.style.cssText = 'flex:1; text-align:center; padding:10px 0; border:1px solid #4a5a9a; border-radius:4px; color:#4da3ff; text-decoration:none; font-size:15px;';
  const ack = document.createElement('button');
  ack.textContent = '我已知晓';
  ack.style.cssText = 'flex:1; padding:10px 0; background:#3d4f9e; color:#fff; border:1px solid #6a7ad0; border-radius:4px; font-size:15px; cursor:pointer; font-family:inherit;';
  ack.onclick = () => {
    try { localStorage.setItem(ACK_KEY, '1'); } catch { /* 隐私模式:本次会话内关闭 */ }
    root.remove();
  };
  footer.appendChild(buyLink);
  footer.appendChild(ack);

  panel.appendChild(head);
  panel.appendChild(body);
  panel.appendChild(footer);
  root.appendChild(panel);
  document.body.appendChild(root);
}
