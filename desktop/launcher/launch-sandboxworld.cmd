@echo off
rem ============================================================
rem SandboxWorld 零壳启动器（Windows）—— 方案 C 兜底件。
rem 用本机 Edge(优先)/Chrome 以独立 profile + 性能旗集打开现网站点：
rem   · --app= 独立窗口（无地址栏）
rem   · 独立 user-data-dir：专属进程树/GPU 进程，无扩展注入、无
rem     Memory Saver、不受用户清浏览数据影响（CacheStorage 持久）
rem   · 解除帧率上限/后台节流全套 flag
rem 若已安装正式桌面版(SandboxWorld.exe)，直接用它即可——本脚本仅供无安装场景。
rem ============================================================
setlocal
set APPURL=https://sandbox.vinlic.com/
set PROFILE=%LOCALAPPDATA%\SandboxWorld\Profile

rem ★2026-08-29 判例：不加 --disable-frame-rate-limit/--disable-gpu-vsync！
rem   游戏菜单背景循环无自身节流门,解锁后 rAF 近千帧空转会整机卡顿。
set FLAGS=--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --disable-features=CalculateNativeWinOcclusion,MemorySaver

for %%E in (
  "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
  "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
  "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
) do (
  if exist %%~E (
    start "" /HIGH %%~E --app=%APPURL% --user-data-dir="%PROFILE%" %FLAGS%
    exit /b 0
  )
)
echo 未找到 Edge 或 Chrome，请先安装其中之一。
exit /b 1
