# BTC Float

Windows 桌面上的轻量 BTC 行情浮窗，使用 Electron、Vue 3、TypeScript 和 Vite。

## 运行开发版

在 Windows 上安装 Node.js 22.12 或更高版本，在项目目录运行：

```powershell
npm ci
npm run dev
```

首次启动需要联网下载 Electron。浮窗会出现在主显示器工作区右下角，距离边缘 16 个逻辑像素，默认置顶并隐藏任务栏图标。简洁报价贴在透明窗口底部，方便拖入任务栏。

- 按住面板主体拖到 Windows 底部任务栏的空白处，浮窗会显示在任务栏前面。也可拖到另一台显示器。
- 单击浮窗展开 K 线详情，面板会留在当前显示器的可用桌面区域。滚轮缩放、拖动图表浏览。底部可切换 1 分钟、5 分钟、15 分钟或 1 小时。点击「收起」或按 Esc 返回原来的浮窗位置。
- 点击浮窗右上角的 × 或按 Alt+F4，会将浮窗隐藏到系统托盘。后台继续接收行情。
- 浮窗显示 Binance USDⓈ-M BTCUSDT 永续合约的最新成交价（USDT）与滚动 24 小时涨跌幅。价格变动、涨跌幅及蜡烛图均为红涨绿跌。详情中的高、低价属于所选周期的最新一根 K 线。可直接使用，无需账户或 API Key。

## 系统托盘和设置

- 左键点击托盘的 BTC Float 图标恢复浮窗。右键菜单提供显示、隐藏、开机启动、窗口不透明度、设置和退出入口。Windows 可能把图标收在任务栏的「显示隐藏的图标」菜单里。
- 在「设置」中可以开启 Windows 登录时启动、切换置顶、选择 60% 至 100% 的窗口不透明度，并设置启动时的 K 线周期和视图。置顶和不透明度立即生效，默认周期和视图在下次启动时生效。当前行情源为 Binance BTCUSDT 永续，计价货币为 USDT。
- 窗口偏好自动保存在 Electron 用户数据目录下的 `settings.json`。开机启动由 Windows 管理。使用开发版开启自启动时，需保留项目目录、Electron 可执行文件和 `out/` 构建产物。

## 行情连接

启动时通过 REST 获取首笔报价和所设周期最近 120 根 K 线。未保存周期设置时使用 15 分钟（15m）。报价通过 WebSocket 持续更新。展开后通过同一条连接订阅所选周期的实时蜡烛，切换周期时同步对应的历史数据，收起后取消蜡烛订阅。图表时间为 UTC，使用 [TradingView Lightweight Charts™](https://www.tradingview.com/lightweight-charts/) 绘制。

首次取得有效报价前显示横线。断线后保留最近报价并显示连接状态，重连间隔从 1 秒逐步增加至 30 秒。推送超过 10 秒未更新会显示「行情延迟」，连续 30 秒无有效推送会重建连接。网络恢复时自动同步。推送不可用期间，每 30 秒尝试刷新一次 REST 报价。

如果持续显示「重连中」，可用浏览器打开 [BTCUSDT 公开报价](https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=BTCUSDT) 检查 REST 连通性。实时更新还需要当前网络能够连接 `wss://fstream.binance.com`；桌面应用默认使用 Windows 系统网络设置。

## 构建与启动

```powershell
npm run build
npm start
```

构建命令先检查 TypeScript 和 Vue 类型，再生成 `out/` 目录。`npm start` 在本机运行构建结果。Windows 安装包安排在第六阶段。

## 代码入口

| 路径 | 用途 |
| --- | --- |
| `src/main/index.ts` | 窗口生命周期、置顶和多显示器定位 |
| `src/main/tray.ts` | 系统托盘、菜单和窗口操作入口 |
| `src/main/settings.ts` | 本地设置存储和 Windows 自启动 |
| `src/preload/index.ts` | 向界面提供窗口和设置的 IPC 方法 |
| `src/renderer/src/App.vue` | 简洁报价、K 线详情和周期切换 |
| `src/renderer/src/Settings.vue` | 设置面板 |
| `src/renderer/src/market/` | 行情源接口、Binance 适配器、连接状态与历史 K 线缓存 |
| `src/renderer/src/CandleChart.vue` | 实时蜡烛图、价格轴和时间轴 |
| `src/renderer/src/style.css` | 浮窗与详情面板外观及涨跌配色 |
