# BTC Float

Windows 桌面上的轻量 BTC 行情浮窗，使用 Electron、Vue 3、TypeScript 和 Vite。

## 运行开发版

在 Windows 上安装 Node.js 22.12 或更高版本，在项目目录运行：

```powershell
npm ci
npm run dev
```

首次启动需要联网下载 Electron。浮窗会出现在主显示器工作区右下角，距离边缘 16 个逻辑像素，默认置顶并隐藏任务栏图标。可见面板为 180 × 36 个逻辑像素，贴在透明窗口底部，方便拖入任务栏。

- 按住面板主体拖到 Windows 底部任务栏的空白处，浮窗会显示在任务栏前面。也可拖到另一台显示器。
- 单击浮窗展开 K 线详情，滚轮缩放、拖动图表浏览。底部可切换 1 分钟、5 分钟、15 分钟或 1 小时。点击「收起」或按 Esc 返回原来的浮窗位置。
- 鼠标移到右上角，点击 × 即可退出。也可在浮窗获得焦点后按 Alt+F4。
- 浮窗显示 Binance USDⓈ-M BTCUSDT 永续合约的最新成交价（USDT）与滚动 24 小时涨跌幅。价格变动、涨跌幅及蜡烛图均为红涨绿跌。详情中的高、低价属于所选周期的最新一根 K 线。可直接使用，无需账户或 API Key。

## 行情连接

启动时通过 REST 获取首笔报价和最近 120 根 1 分钟 K 线，通过 WebSocket 持续更新报价。展开后通过同一条连接订阅所选周期的实时蜡烛，切换周期时同步对应的历史数据，收起后取消蜡烛订阅。图表时间为 UTC，使用 [TradingView Lightweight Charts™](https://www.tradingview.com/lightweight-charts/) 绘制。

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
| `src/preload/index.ts` | 向界面提供关闭当前窗口的方法 |
| `src/renderer/src/App.vue` | 浮窗内容和关闭按钮 |
| `src/renderer/src/market/` | 行情源接口、Binance 适配器、连接状态与历史 K 线缓存 |
| `src/renderer/src/CandleChart.vue` | 实时蜡烛图、价格轴和时间轴 |
| `src/renderer/src/style.css` | 浮窗与详情面板外观及涨跌配色 |
