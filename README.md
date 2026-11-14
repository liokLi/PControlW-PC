# 手机控制电脑 · Windows 端

Electron + Vue 3 + WebSocket + Windows SendInput。与 `PControlW-Phone` 独立维护。

## 直接体验

本机已构建时，双击 `启动电脑端.cmd`，或运行 `release/win-unpacked/手机控制电脑.exe`。安装版在 `release` 目录。

1. 电脑与手机接入同一私人局域网，打开电脑端。
2. 在电脑端选择实际 Wi-Fi/以太网 IP，避免选择 VPN 或虚拟网卡地址。
3. 手机相机扫码可打开手机网页并配对；也可在手机浏览器打开 `http://电脑IP:19780`，手动输入 IP、端口和六位配对码。
4. 或使用 HBuilderX 运行 `PControlW-Phone` Android App，扫码/手动连接。
5. 连接后主窗口保持显示。主动关闭窗口会收起到托盘；双击托盘图标重新打开，右键可打开设置或退出。

首次出现 Windows 防火墙询问时允许私人网络访问。若没有出现询问且连接失败，可在防火墙入站规则中放行程序或 TCP 19780；修改端口后使用新端口。路由器开启访客网络/设备隔离也会阻止连接。无需路由器端口转发。

## 开发

要求 Node.js >=22.12、Windows x64。系统原有 Node 14 不适合本项目，建议使用独立的新版 Node 环境，不影响旧项目。

```sh
npm install
npm run dev
npm test
npm run build
npm start
npm run dist
```

也可使用 pnpm，仓库包含锁文件及必要构建脚本许可。`build` 会自动复制相邻手机仓库已经编译的 H5 资源；没有手机资源时，App 连接功能依然可用。更新手机代码后先重新构建手机 H5，再构建电脑端。

`启动电脑端.cmd` 优先运行已打包程序；未打包时可使用本机 Codex 附带的 Node 启动已安装的 Electron，不会修改系统 Node。

## 已实现

- 本机 IPv4、多网卡选择、二维码、六位限时配对码。
- Token 记忆、已配对设备撤销、单手机控制、失败次数限制、心跳。
- 相对鼠标移动、三键点击、拖拽、滚轮。
- 按键按下/释放、组合键、Unicode 文本、媒体键。
- 托盘隐藏、退出、断开通知、端口和输入速度设置。
- 同端口提供手机网页，无需安装 App 即可体验。

设置与设备凭证保存在 Electron 用户数据目录的 `config.json` 中，Token 不会发送给界面。端口更改会重启监听并断开当前手机；端口占用时尝试恢复原端口。

## 边界

本版未包含 UDP 自动发现、TLS 和电脑开机自启动。当前仅 Windows x64；标准键盘布局为 QWERTY，手机支持多种布局与自定义。系统输入受 Windows 权限限制，不支持 UAC 安全桌面。第一版安装包未做代码签名。

协议与安全边界见 [PROTOCOL.md](PROTOCOL.md)。

