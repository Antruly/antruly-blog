---
title: "用 C++ 写 Web 服务实战（三）：WebSocket 实时通信——端点、连接生命周期与广播模型"
published: 2026-09-24
image: "/images/posts/covers/libuvcpp-web-guide-03.webp"
description: "本文详解在 libuvcpp 框架中实现 WebSocket 实时通信的实战方法，涵盖端点注册、连接生命周期管理（消息收发、关闭与错误处理）、异步发送机制及广播模型。通过 app.websocket() 注册路由，利用回调管理连接状态；结合路径参数实现房间分组广播，构建高效实时通信系统。强调框架层使用、所有权管理与线程安全实践，适用于聊天室、通知推送等场景。"
tags: ["开源", "web", "c++", "websocket"]
category: "libuvcpp"
lang: "zh_CN"
author: "Antruly"
sourceLink: "https://blog.csdn.net/qq_41697882/article/details/166490203"
series: "用 C++ 写 Web 服务实战"
seriesOrder: 3
comment: true
---

前两篇我们从零搭起了 Web 应用骨架，又深入了路由参数、中间件链和文件上传。到此为止，你的 C++ 服务已经能处理 HTTP 请求了。但现代 Web 应用越来越依赖**实时双向通信** ——聊天室、实时通知、在线协作、行情推送，这些都是 HTTP 请求-响应模型不擅长的。

libuvcpp 的 WebSocket 支持正是为此而生。这篇进入实时通信的世界：**`app.websocket()` 端点注册、连接生命周期管理、消息收发、房间广播模型，以及与 HTTP 路由共存的实践。**

### 一、WebSocket 在 libuvcpp 中的位置

先理清一个容易混淆的点：libuvcpp 有两层 WebSocket API。

**协议层** （`src/web/` 下的 `uvcpp_ws_server` / `uvcpp_ws_client` / `uvcpp_ws_connection`）是 RFC 6455 的完整实现——握手、帧解析、掩码、分片重组、压缩、关闭握手、会话表。它建在 `uvcpp_tcp_client` 之上，需要你自己管连接生命周期。

**框架层** （webapp 模块下的 `app.websocket()` 和 `uvcpp_web_ws_client`）在协议层之上再包了一层——路由挂载、自动升级、闲置超时、自动重连。

写业务应用优先用框架层。除非你要的就是裸的协议层，否则 `app.websocket()` 是更省心的入口。

### 二、注册第一个 WebSocket 端点

`uvcpp_web_app` 的 `websocket()` 方法接收一个路由模式和一个 handler，模式和 HTTP 路由完全相同——路径参数 `:id`、通配符 `*path` 都支持，但 **WS 路由和 HTTP 路由是两张独立的表** ，不会互相干扰。

```cpp
#include <webapp/uvcpp_web_app.h>
using namespace uvcpp;

int main() {
    uvcpp_web_app app;
    app.set_port(8080);

    // 注册 /echo 端点：收到什么就回什么
    app.websocket("/echo", [](uvcpp_web_ws_request& ws) {
        uvcpp_ws_connection* conn = ws.connection();

        conn->on_text([conn](const std::string& msg) {
            conn->send_text(msg.c_str(), msg.size());
        });
    });

    app.start();
    app.join();
    return 0;
}
```

`uvcpp_web_ws_request` 是升级请求对象，**只在本次 handler 调用期间有效** 。它提供：

| 方法 | 说明 |
| --- | --- |
| `connection()` | 返回 `uvcpp_ws_connection*`，归框架所有，不要 delete |
| `param(name)` | 路径参数（来自 WS 路由模式，如 `/chat/:room`） |
| `route()` | 命中的模式字符串，如 `"/chat/:room"` |
| `request()` | 底层的 `uvcpp_web_request&`，可访问 header / cookie 等 |

`connection()` 返回的 `uvcpp_ws_connection*` 是连接的生命周期句柄。**注意它的归属权在框架** ——连接断开时框架自动回收，你只持有指针做消息收发，不要手动 delete。

### 三、连接生命周期：消息、关闭与错误

`uvcpp_ws_connection` 提供了完整的回调注册：

```cpp
app.websocket("/chat/:room", [](uvcpp_web_ws_request& ws) {
    const std::string* room = ws.param("room");
    uvcpp_ws_connection* conn = ws.connection();

    // 文本消息到达
    conn->on_text([](const std::string& msg) {
        // msg 是完整的 UTF-8 文本帧
    });

    // 二进制消息到达
    conn->on_binary([](const char* data, size_t len) {
        // 注意：data 只在回调期间有效，需要持久化就立刻拷贝
    });

    // 连接关闭（对端发 Close 帧，或异常断开）
    // 注意签名：(关闭码, 原因) 两个参数，不是"一个连接指针"
    conn->on_close([](ws_close_code code, const std::string& reason) {
        // code 常见值：NORMAL(1000), GOING_AWAY(1001),
        //              ABNORMAL(1006), POLICY_VIOLATION(1008)
    });

    // 连接错误
    conn->on_error([](int err) {
        // err 是 UV_* 或 WS 层错误码
    });
});
```

**几个关键点 ：**

**`on_close` 的签名是 `(code, reason)`，不是 `(connection*)`。** 这一点在 libuvcpp 的 README 中特别标注过——写错签名编译器不会报错，但回调永远不会被正确调用。

**连接的所有权归框架 ，回调的生命周期也由框架管理。** 你不需要（也不应该）在 `on_close` 中 delete 任何东西。框架会在连接断开后回收。

**`on_text` 收到的 `std::string` 是完整帧。** libuvcpp 的 WS 层已经处理了分片重组——你拿到的永远是完整的文本消息，不需要自己拼帧。

### 四、发送消息：文本、二进制、Ping 与 Close

`uvcpp_ws_connection` 的发送方法：

```cpp
conn->send_text("hello", 5);                  // 文本帧
conn->send_binary(data, len);                 // 二进制帧
conn->send_ping(payload, payload_len);        // 应用层心跳
conn->send_close(ws_close_code::NORMAL,
                 "bye");                       // 主动关闭
```

**发送是异步的。** `send_text` 不会阻塞当前线程——它将数据排入连接的发送队列，由事件循环在合适的时机写出。如果你在短时间内连续发送大量消息，数据会在发送队列中排队，不会丢失，但也意味着**发送端不会有背压** 。如果对端消费很慢而你的发送速度极快，内存会积压。在极端场景下需要自己实现应用层的发送窗口控制。

**主动关闭应该用`send_close` 而不是直接断开 socket。** WebSocket 协议要求关闭时发送 Close 帧并等待对端回应，`send_close` 会正确处理这个握手流程。

### 五、广播模型：从单连接回显到房间广播

WebSocket 最典型的应用场景是广播——一条消息发给多个连接。libuvcpp 的 `uvcpp_ws_connection` 是单个连接的句柄，广播需要你在应用层自己维护一个“房间 → 连接列表”的映射。

#### 5.1 最简广播：全局连接表

```cpp
#include <webapp/uvcpp_web_app.h>
#include <set>
#include <mutex>
#include <string>

using namespace uvcpp;

// 全局连接表（单事件循环下不需要锁；
// 多事件循环下需要 mutex，见下文）
static std::set<uvcpp_ws_connection*> g_connections;

int main() {
    uvcpp_web_app app;
    app.set_port(8080);

    app.websocket("/chat", [](uvcpp_web_ws_request& ws) {
        uvcpp_ws_connection* conn = ws.connection();

        g_connections.insert(conn);

        conn->on_text([](const std::string& msg) {
            // 广播给所有连接
            for (auto* c : g_connections) {
                c->send_text(msg.c_str(), msg.size());
            }
        });

        conn->on_close([](ws_close_code, const std::string&) {
            // 注意：这里拿不到 conn 指针，需要在 on_close 外部捕获
        });
    });

    app.start();
    app.join();
    return 0;
}
```

**这里有一个坑 ：`on_close` 的回调签名中没有连接指针。** 你需要在注册 `on_close` 时捕获 `conn`：

```cpp
uvcpp_ws_connection* conn = ws.connection();
g_connections.insert(conn);

conn->on_close([conn](ws_close_code, const std::string&) {
    g_connections.erase(conn);
});
```

**但捕获`conn` 指针在连接关闭后可能悬空吗？** 不会——`on_close` 是框架在回收连接**之前** 调用的最后一个回调。回调执行期间连接仍然有效，执行完毕后框架才回收。所以在 `on_close` 中安全地 erase 是可行的。

#### 5.2 房间模型：路径参数驱动的分组

用路径参数 `:room` 实现房间隔离：

```cpp
#include <unordered_map>
#include <set>

static std::unordered_map<std::string,
    std::set<uvcpp_ws_connection*>> g_rooms;

app.websocket("/chat/:room", [](uvcpp_web_ws_request& ws) {
    const std::string* room_ptr = ws.param("room");
    if (room_ptr == nullptr) return;
    const std::string room = *room_ptr;

    uvcpp_ws_connection* conn = ws.connection();
    g_rooms[room].insert(conn);

    conn->on_text([room](const std::string& msg) {
        // 只广播给同房间的连接
        auto it = g_rooms.find(room);
        if (it == g_rooms.end()) return;
        for (auto* c : it->second) {
            c->send_text(msg.c_str(), msg.size());
        }
    });

    conn->on_close([conn, room](ws_close_code, const std::string&) {
        auto it = g_rooms.find(room);
        if (it != g_rooms.end()) {
            it->second.erase(conn);
            if (it->second.empty()) {
                g_rooms.erase(it);   // 房间空了就回收
            }
        }
    });
});
```

**`on_text` 按值捕获 `room`（字符串），而不是捕获指针。** `ws.param("room")` 返回的指针只在 handler 调用期间有效——handler 返回后升级请求对象就被框架回收了。必须把值拷贝出来。

**`on_close` 同时捕获 `conn` 和 `room`。** `conn` 用于从房间中移除，`room` 用于定位房间。

#### 5.3 多事件循环下的线程安全

如果你用了 `set_loops(n)` 且 `n > 1`，多个工作循环线程会**并发地** 调用 `on_text` 和 `on_close`。全局的 `g_rooms` 必须加锁：

```cpp
static std::mutex g_rooms_mutex;

conn->on_text([room](const std::string& msg) {
    std::lock_guard<std::mutex> lock(g_rooms_mutex);
    auto it = g_rooms.find(room);
    if (it == g_rooms.end()) return;
    for (auto* c : it->second) {
        c->send_text(msg.c_str(), msg.size());
    }
});
```

但要注意：**在持锁期间调用`send_text` 可能不是最佳选择**。`send_text` 本身很快（只是入队），但如果对端消费极慢导致发送队列积压，`send_text` 可能触发内存分配。更稳妥的做法是先在锁内拷贝出连接列表，释放锁后再逐个发送：

```cpp
conn->on_text([room](const std::string& msg) {
    std::vector<uvcpp_ws_connection*> targets;
    {
        std::lock_guard<std::mutex> lock(g_rooms_mutex);
        auto it = g_rooms.find(room);
        if (it == g_rooms.end()) return;
        targets.assign(it->second.begin(), it->second.end());
    }
    for (auto* c : targets) {
        c->send_text(msg.c_str(), msg.size());
    }
});
```

这样锁的持有时间极短，不会因为某个慢连接而阻塞其他连接的消息处理。

### 六、与 HTTP 路由共存

WS 端点和 HTTP 路由注册在同一个 `uvcpp_web_app` 上，互不干扰。**同一路径可以同时注册 HTTP 和 WS 路由** ——框架根据请求是否携带 `Upgrade: websocket` 头来决定走哪条路径。

```cpp
uvcpp_web_app app;
app.set_port(8080);

// HTTP 路由：返回聊天室页面
app.get("/chat", [](uvcpp_web_request&, uvcpp_web_response& resp,
                    uvcpp_web_next) {
    resp.html("<html><body>...聊天室 UI...</body></html>");
    resp.end();
});

// WS 路由：同一路径上的 WebSocket 端点
app.websocket("/chat", [](uvcpp_web_ws_request& ws) {
    // ...
});

app.start();
app.join();
```

浏览器访问 `/chat` 时拿到 HTML 页面；前端 JS 用 `new WebSocket("ws://host:8080/chat")` 连接时，框架识别 Upgrade 请求，自动走 WS 路径。**不需要额外的端口或路径** 。

**中间件对 WS 连接也生效吗 ？** 不生效。`.use()` 注册的中间件只作用于 HTTP 请求，WS 升级请求不走中间件链。如果你需要鉴权 WS 连接，在 `app.websocket()` 的 handler 中通过 `ws.request()` 访问 header 来检查：

```cpp
app.websocket("/chat", [](uvcpp_web_ws_request& ws) {
    const std::string* token =
        ws.request().header("Authorization");
    if (token == nullptr) {
        ws.connection()->send_close(
            ws_close_code::POLICY_VIOLATION, "unauthorized");
        return;
    }
    // ...正常处理...
});
```

### 七、WSS：TLS 上的 WebSocket

如果你的应用启用了 SSL（`app.enable_ssl(...)`），WebSocket 自动就是 WSS——**TLS 在传输层 ，WS 在应用层，两者是正交的**。

```cpp
uvcpp_ssl_context ctx;
ctx.load_certificate("cert.pem", "key.pem");

app.enable_ssl(&ctx);
app.websocket("/chat", handler);   // 自动就是 wss://
app.start();
```

前端只需要把连接 URL 从 `ws://` 改成 `wss://`，服务端零改动。如果 SSL 配置有误，`start()` 返回 `UV_EINVAL`，不会静默降级成明文——错误原因可以通过 `ssl_error()` 获取。

### 八、完整示例：一个带房间和日志的实时聊天服务

把这篇的内容和前两篇的日志中间件串起来：

```cpp
#include <webapp/uvcpp_web_app.h>
#include <unordered_map>
#include <set>
#include <vector>
#include <mutex>
#include <fstream>
#include <ctime>
#include <iostream>

using namespace uvcpp;

// ---- 全局状态 ----
static std::unordered_map<std::string,
    std::set<uvcpp_ws_connection*>> g_rooms;
static std::mutex g_rooms_mutex;

static std::ofstream g_log;
static std::mutex g_log_mutex;

static std::string now_str() {
    std::time_t t = std::time(nullptr);
    char buf[64];
    std::strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S",
                  std::localtime(&t));
    return buf;
}

// ---- 向指定房间广播 ----
static void broadcast(const std::string& room,
                      const std::string& msg) {
    std::vector<uvcpp_ws_connection*> targets;
    {
        std::lock_guard<std::mutex> lock(g_rooms_mutex);
        auto it = g_rooms.find(room);
        if (it == g_rooms.end()) return;
        targets.assign(it->second.begin(), it->second.end());
    }
    for (auto* c : targets) {
        c->send_text(msg.c_str(), msg.size());
    }
}

int main() {
    g_log.open("ws_access.log", std::ios::app);

    uvcpp_web_app app;
    app.set_host("0.0.0.0").set_port(8080);

    // 多事件循环
    const int rc = app.set_loops(4);
    if (rc != 0) { std::cerr << "set_loops: " << rc << std::endl; return 1; }

    // HTTP 路由：聊天室页面
    app.get("/", [](uvcpp_web_request&, uvcpp_web_response& resp,
                    uvcpp_web_next) {
        resp.html("<html><body>"
                  "<div id='chat'></div>"
                  "<script>"
                  "const ws = new WebSocket('ws://'+location.host+'/chat/lobby');"
                  "ws.onmessage = e => {"
                  "  document.getElementById('chat').innerHTML += "
                  "    '<p>'+e.data+'</p>';"
                  "};"
                  "</script></body></html>");
        resp.end();
    });

    // WebSocket 端点
    app.websocket("/chat/:room", [](uvcpp_web_ws_request& ws) {
        const std::string* room_ptr = ws.param("room");
        if (room_ptr == nullptr) return;
        const std::string room = *room_ptr;

        uvcpp_ws_connection* conn = ws.connection();

        // 加入房间
        {
            std::lock_guard<std::mutex> lock(g_rooms_mutex);
            g_rooms[room].insert(conn);
        }

        // 日志：连接建立
        {
            std::lock_guard<std::mutex> lock(g_log_mutex);
            g_log << "[" << now_str() << "] JOIN " << room << "\n";
            g_log.flush();
        }

        // 广播欢迎消息
        broadcast(room, "[系统] 有用户加入 " + room);

        // 消息到达：广播给同房间
        conn->on_text([room](const std::string& msg) {
            {
                std::lock_guard<std::mutex> lock(g_log_mutex);
                g_log << "[" << now_str() << "] MSG "
                      << room << ": " << msg << "\n";
                g_log.flush();
            }
            broadcast(room, msg);
        });

        // 连接关闭：离开房间
        conn->on_close([conn, room](ws_close_code code,
                                    const std::string& reason) {
            {
                std::lock_guard<std::mutex> lock(g_rooms_mutex);
                auto it = g_rooms.find(room);
                if (it != g_rooms.end()) {
                    it->second.erase(conn);
                    if (it->second.empty()) {
                        g_rooms.erase(it);
                    }
                }
            }
            {
                std::lock_guard<std::mutex> lock(g_log_mutex);
                g_log << "[" << now_str() << "] LEAVE " << room
                      << " code=" << static_cast<int>(code) << "\n";
                g_log.flush();
            }
            broadcast(room, "[系统] 有用户离开 " + room);
        });
    });

    app.start();
    std::cout << "Chat server on :8080, 4 loops" << std::endl;
    app.join();
    return 0;
}
```

**几个设计要点 ：**

**广播时先拷贝连接列表再发送** ，锁的持有时间极短，避免慢连接拖住整个房间。

**`on_text` 和 `on_close` 中按值捕获字符串 `room`**，不捕获指针——升级请求对象只在 handler 期间有效。

**日志和房间状态分别用独立的 mutex** ，减少锁竞争。

**`on_close` 中捕获 `conn` 用于从房间移除**，这是安全的——回调执行期间连接仍然有效。

**前端用`ws://` 连接**（如果没开 TLS）。启用 SSL 后改成 `wss://` 即可，服务端代码不变。

### 九、本篇小结与下一步

这篇覆盖了 WebSocket 实时通信的核心实践：

**端点注册** ——`app.websocket("/chat/:room", handler)`，路由语法与 HTTP 完全相同，但两张表独立。

**升级请求对象** ——`uvcpp_web_ws_request` 的 `connection()` / `param()` / `route()` / `request()`，只在 handler 期间有效。

**连接生命周期** ——`on_text` / `on_binary` / `on_close` / `on_error`，注意 `on_close` 的 `(code, reason)` 签名。

**消息发送** ——`send_text` / `send_binary` / `send_ping` / `send_close`，异步入队，注意背压。

**广播模型** ——应用层维护“房间 → 连接”映射，注意多事件循环下的线程安全，锁内只做拷贝不做发送。

**与 HTTP 共存** ——同一路径可同时注册 HTTP 和 WS 路由，中间件不作用于 WS，鉴权需在 handler 中手动处理。

**WSS** ——启用 SSL 后 WS 自动升级为 WSS，服务端零改动。

下一篇会进入 **服务端推送与性能调优** ：定时器驱动的主动推送、SSE（Server-Sent Events）与 WebSocket 的选型对比、以及生产环境下的连接数管理、心跳保活和优雅关闭。如果你在实践过程中遇到问题，欢迎在 [GitHub Issues](<https://github.com/Antruly/libuvcpp/issues>) 提出。
