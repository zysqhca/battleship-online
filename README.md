# 海战棋 · 远程双人对战

基于自建 WebSocket 服务器的远程双人海战棋，加入「商店系统」与「国家能力」。
完整规则见 `海战棋完整规则.md`。

## 一、本地运行（用于测试）

1. 安装 Node.js：https://nodejs.org （选 LTS 版本，一路下一步）
2. 在本目录打开终端，执行：

   ```bash
   npm install
   node server.js
   ```

3. 浏览器打开 http://localhost:3000

## 二、部署到 Render（免费，生成公网网址）

1. 把整个项目推送到你的 GitHub 仓库（文件：`server.js`、`package.json`、`public/`、`README.md`、`.gitignore`）
2. 注册/登录 https://render.com （可用 GitHub 账号直接登录）
3. 点 **New +** → **Web Service** → 连接你的 GitHub 仓库
4. 配置两项：
   - **Build Command**（构建命令）：`npm install`
   - **Start Command**（启动命令）：`node server.js`
5. 点 **Deploy**，等待 1~2 分钟
6. 得到你的网址，例如 `https://你的应用.onrender.com`，把网址发给朋友即可对战

> **免费版注意**：15 分钟无访问会休眠，下次打开需等约 50 秒冷启动（先刷一下等它起来）。

## 三、怎么玩

- 一人打开网址点「创建房间」，得到 5 位房间号（如 `K7Q2M`）
- 把房间号发给朋友，朋友点「加入房间」输入房间号
- 双方选国家 → 各自布阵 → 轮流攻击，先击沉对方全部战舰者获胜

## 文件结构

- `server.js` —— 服务器（静态文件 + WebSocket 房间中继）
- `public/index.html` —— 游戏客户端（全部规则逻辑与界面）
- `package.json` —— 依赖声明（ws）
