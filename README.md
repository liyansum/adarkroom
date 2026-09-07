# 从暗室到领邦 · A Dark Room

保留点火、采集、荒野探索和飞船故事，增加从营地发展到领邦的建设路线。纯文字界面，默认简体中文，无需准备新美术素材。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fliyansum%2Fadarkroom)

## 从 GitHub 一键部署

1. 点击上面的 **Deploy to Cloudflare**，登录 Cloudflare 并连接 GitHub。
2. 按页面提示选择账号、仓库与 Worker 名称。数据库 `DB` 用于账号和存档，保留自动创建即可；本项目不需要邮件服务或额外密钥。
3. 保留构建命令 **`npm run build`**，部署命令务必为 **`npm run deploy`**。部署脚本会上传 Worker 与静态文件，并自动执行 D1 建表迁移。
4. 等待整个部署任务成功，打开页面给出的 `https://…workers.dev` 地址。点击游戏右上角「游客 · 本地保存」，即可注册和登录。

**注册时请保存恢复码。** 账号只需用户名与密码，不绑定邮箱；忘记密码后需要恢复码才能找回。

按钮使用 Cloudflare 官方的 [Deploy to Cloudflare 流程](https://developers.cloudflare.com/workers/platform/deploy-buttons/)，会按页面选择创建仓库副本并配置 Workers Builds。如果希望直接持续部署现有的 `liyansum/adarkroom` 仓库，也可以在 Cloudflare 的 Workers & Pages 中连接现有仓库，使用同样的构建、部署命令，根目录为 `/`。后续更新应推送到 **Cloudflare 实际连接的仓库与分支**。

首次部署初始化完成前，账号服务可能短暂显示「数据库正在初始化」。如果部署失败，请查看构建日志；确认部署命令包含 `npm run deploy` 后重新部署，迁移可重复执行。访问 `/api/health` 返回 `{"ok":true,"version":"2.0.0"}` 表示账号表已就绪。只使用 GitHub Pages 或上传静态文件不会提供账号云存档功能。

## 这一版可以玩什么

- **逐步扩张**：营地 → 村落 → 城镇 → 要塞城市 → 领邦，人口上限依次为 20 / 80 / 200 / 500 / 1000。
- **18 类三级建筑**：伐木场、采石场、农田、水井、粮仓、民居街区、市场、驿站、医馆、瞭望塔、城墙、兵营、议事厅、学院、精炼工坊、道路工坊、使馆、边境烽火台。
- **领地经营**：重建已清理的地点，设置农庄、矿区、附属村落或贸易站；修路、升级、驻军，调整经营方向和全局政策。
- **长期目标**：6 项研究、3 项公共工程、5 类聚落纪事；完成领邦目标后可以留下继续建设，原版飞船结局仍然保留。
- **舒适探索**：默认背包容量翻倍、增加携水量，失败保留已探索地图并回收装备与部分物资；可在家园切换经典难度。
- **更清楚的文字地图**：地形汉字、地点说明、坐标、辖地边框、已发现地点列表；提供一键整备、已知道路自动行进及触屏方向按钮。
- **进度延续**：游客本机存档、账号云存档、最多 8 小时离线生产、远征检查点、导入导出、最近 5 次云端历史与多设备冲突选择。

建造第一间小屋后开放「家园建设」。人口、原材料、建筑与辖地共同决定晋级进度，建设人员和驻军会实际占用居民，不能同时从事原版工作。完整玩法与数值见 [建设与探索指南](docs/GAMEPLAY.md)。

## 存档、汉化与手机

游客和每个账号的本机进度分别保存。注册新账号会承接当前游客进度；登录已有账号时使用该账号自己的进度。云端每 30 秒尝试同步，切换设备前可以点击「立即同步」。若另一台设备已更新存档，自动同步会暂停，直到你明确选择保留哪份进度。

「账号与存档」支持原版 Base64 导出码、JSON 文件与本版备份；替换进度前额外保留一份本机备份。不同网站之间无法直接读取彼此的浏览器存储：请先在旧站导出，再到新站导入。同一域名下的旧 `gameState` 会在首次打开时迁入游客存档。

沿用项目已有的简体、繁体汉化，并补充新增资源与部分缺译文本。默认简体中文；页脚可以切换原版支持的其他语言，**新增建设内容目前使用简体中文**。

手机支持纵向布局、建造、存档、战斗按钮和方向操作。建议使用较新的 Safari / Chrome；飞船阶段仍保留原版实时躲避玩法。页面与账号服务需要网络访问，已打开页面断网后可继续本地游玩；这不是可完全离线安装的 PWA。

## 本地开发与验证

使用 Node.js 22 或更新版本及 npm：

```sh
npm ci
npm run dev
```

打开 `http://localhost:8787`。本地 D1 数据保存在 `.wrangler/`，与线上数据库隔离。手机通过局域网 IP 访问普通 HTTP 时，浏览器可能不提供密码派生所需的 Web Crypto；账号功能请使用部署后的 HTTPS 地址或本机 localhost。

```sh
npx playwright install chromium
npm run verify
npm run preview:deploy
```

`verify` 自动创建临时 D1、启动本地 Worker，运行模拟、API 与 Chromium 浏览器检查，结束后清理临时数据库。`preview:deploy` 仅检查部署打包，不上传资源。GitHub Actions 会执行这些检查。

有 Cloudflare CLI 登录或相应 API Token 时，也可以运行：

```sh
npm run deploy
```

部署依赖 [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/) 与 D1。实际可用额度由 Cloudflare 账号套餐决定；无需购买其他存档服务。结构与存档设计见 [开发说明](docs/ARCHITECTURE.md)。

## 来源与许可

基于 [doublespeakgames/adarkroom](https://github.com/doublespeakgames/adarkroom)，保留原作者、翻译贡献者及原有资源的署名与许可。原版游戏：[A Dark Room](https://adarkroom.doublespeakgames.com/)。本仓库扩展代码同样使用 [Mozilla Public License 2.0](LICENSE.md)。
