# PControlW 协议 v1

默认使用 TCP 19780：HTTP 提供手机网页，WebSocket 提供控制连接。消息为 UTF-8 JSON，单条最大 16 KiB，输入前必须认证。当前最多一台手机同时控制。

## 连接

首次：`{"type":"auth","code":"123456","name":"我的手机"}`。

再次：`{"type":"auth","token":"已保存的设备 Token"}`。

App 进出控制页切换传输时使用 `{"type":"auth","token":"已保存的设备 Token","takeover":true}`。只有 Token 对应当前连接设备时才允许接替；配对码或其他设备 Token 不能抢占。接替时释放旧输入状态，旧连接以 4000 关闭，所有输入仍由同一条连接按顺序发送。同设备重连保留上次滑动检测结果，下一次移动重新统计。

成功：`{"type":"auth_ok","token":"...","deviceId":"...","name":"电脑名","protocol":1}`。

失败：`{"type":"auth_fail","message":"具体原因"}`。

二维码为 `http://IP:端口/#/?app=PControlW&version=1&host=IP&port=端口&code=配对码`。手机 App 同时兼容旧式 JSON 二维码 `{app,version,host,port,code}`。配对码为随机六位数，5 分钟有效，配对成功后刷新。Token 为 32 字节随机值，电脑可撤销。每个来源连续失败五次后限制一分钟。

## 输入消息

| type | 字段 | 说明 |
|---|---|---|
| mouse_move | dx, dy | 相对移动；仅使用电脑灵敏度，忽略旧客户端的 sensitivity 字段 |
| mouse_flush | 无 | 抬手时立即执行剩余位移；点击、键盘和文本操作前也会自动执行剩余位移 |
| mouse_button | button: left/right/middle, action: down/up/click | 点击和拖拽 |
| mouse_scroll | delta | Windows 120 单位约一格；仅使用电脑滚动方向，忽略旧客户端的 reverse 字段 |
| key | code, action: down/up/press | 使用 KeyA、Digit1、Control、Enter 等固定键名 |
| combo | keys: ["Control","KeyC"] | 顺序按下、逆序释放，最多八键 |
| text | text | Unicode 文本，最多 1000 个 UTF-16 单元 |
| release_all | 无 | 释放所有输入状态 |
| ping | sentAt（可选） | 返回 pong，回显时间戳及当前认证连接的鼠标收包间隔、输入调用耗时；手机每五秒发送 |

输入执行失败返回 `{"type":"error","message":"..."}`。断开、撤销授权、超时和退出会释放按键；超过十秒无输入也会释放按住的按键。未认证连接十五秒后关闭。单连接每秒最多 500 条消息。

第一版使用 HTTP/WS 明文传输，只适用于可信局域网；尚未提供 TLS、证书校验和安全桌面控制。Windows SendInput 受权限等级限制，不能通过普通进程控制更高权限窗口或发送安全注意序列 Ctrl+Alt+Delete。
