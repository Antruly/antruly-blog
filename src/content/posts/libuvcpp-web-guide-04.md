---
title: "用 C++ 写 Web 服务实战（四）：服务端推送、连接管理与优雅关闭"
published: 2026-09-24
image: "/images/posts/covers/libuvcpp-web-guide-04.webp"
description: "本文实战讲解C++ Web服务的终极能力：通过定时器实现服务端周期推送，结合SSE与WebSocket完成轻量级和双向实时通信；利用事件循环管理连接状态，监控多线程下的连接分布与会话数；最后实现优雅关闭，确保所有连接安全释放。内容涵盖线程安全、生命周期管理与生产级部署关键实践。"
tags: ["开源", "web", "c++", "websocket"]
category: "libuvcpp"
lang: "zh_CN"
author: "Antruly"
sourceLink: "https://blog.csdn.net/qq_41697882/article/details/166490322"
series: "用 C++ 写 Web 服务实战"
seriesOrder: 4
comment: true
---

前三篇我们从零搭起了 Web 应用，深入了路由、中间件、文件上传和 WebSocket 实时通信。到此为止，你的 C++ 服务已经能处理大部分请求了。但这还不够——生产环境中的服务端程序还需要**主动推送数据** 、**监控连接状态** 、**保活长连接** ，以及在关闭时**优雅地告别** 。

这篇进入实战系列的收官部分：定时器驱动的推送、SSE 流式响应、连接数监控、WebSocket 心跳保活、以及优雅关闭的完整实践。

### 一、定时器驱动的服务端推送

WebSocket 是双向的，服务端可以随时 `send_text()`。但很多场景需要**周期性的主动推送** ——行情更新、状态轮询、定时通知。这需要定时器。

#### 1.1 在 WebApp 中使用底层定时器

`uvcpp_web_app` 暴露了底层事件循环 `app.loop()`，可以在其上创建 `uvcpp_timer`：

```cpp
#include <webapp/uvcpp_web_app.h>
#include <web/uvcpp_ws_connection.h>
#include <set>
#include <mutex>

using namespace uvcpp;

static std::set<uvcpp_ws_connection*> g_clients;
static std::mutex g_clients_mutex;

int main() {
    uvcpp_web_app app;
    app.set_port(8080);

    app.websocket("/push", [](uvcpp_web_ws_request& ws) {
        uvcpp_ws_connection* conn = ws.connection();

        {
            std::lock_guard<std::mutex> lock(g_clients_mutex);
            g_clients.insert(conn);
        }

        conn->on_close([conn](ws_close_code, const std::string&) {
            std::lock_guard<std::mutex> lock(g_clients_mutex);
            g_clients.erase(conn);
        });
    });

    // 在事件循环上创建一个 1 秒周期的推送定时器
    auto* timer = new uvcpp_timer();
    timer->init(app.loop());
    timer->start([](uvcpp_timer* t) {
        std::vector<uvcpp_ws_connection*> targets;
        {
            std::lock_guard<std::mutex> lock(g_clients_mutex);
            targets.assign(g_clients.begin(), g_clients.end());
        }

        const std::string msg = "{\"tick\":" +
            std::to_string(std::time(nullptr)) + "}";
        for (auto* c : targets) {
            c->send_text(msg.c_str(), msg.size());
        }
    }, 1000, 1000);   // 延时 1000ms，周期 1000ms

    app.start();
    app.join();

    delete timer;   // 在 app 停止后释放
    return 0;
}
```

**关键点 ：**

**定时器必须在`app.start()` 之前初始化到循环上。** `timer->init(app.loop())` 把定时器挂到应用的事件循环。如果在 `start()` 之后调用，事件循环已经在运行，行为未定义。

**定时器的回调在事件循环线程上执行。** 多事件循环模式下（`set_loops(n)` 且 `n > 1`），`app.loop()` 返回的是**接受者循环** 的指针。定时器回调在这个循环上运行，与工作循环上的连接处理是并发的。跨循环访问连接集合必须加锁。

**`timer->start()` 的签名是 `(callback, timeout_ms, repeat_ms)`。** 第三个参数传 0 或省略即单次触发；传正数则周期触发。

#### 1.2 推送数据的线程安全

上面的例子中，定时器回调在**接受者循环** 上，而 WebSocket 的 `on_text` / `on_close` 回调在**工作循环** 上。两者是不同线程，`g_clients` 的读写必须互斥。

**`send_text()` 本身是线程安全的吗？** libuvcpp 的 `send_text` 内部做了线程检查——如果调用线程不是该连接所属的循环线程，数据会被投递到正确的循环上异步发送。但**连接指针的有效性** 不是线程安全的——如果一个连接在另一个线程上被回收，你手里的指针就悬空了。`std::mutex` 保护连接集合是必须的。

### 二、SSE：轻量级的服务端推送

SSE（Server-Sent Events）是 HTTP 协议的原生推送方案。相比 WebSocket，它的优势是**纯 HTTP、无需握手升级、浏览器原生`EventSource` 支持、自动重连**。libuvcpp 通过 `chunked` 流式响应支持 SSE。

#### 2.1 基本 SSE 端点

```cpp
app.get("/events", [](uvcpp_web_request&, uvcpp_web_response& resp,
                      uvcpp_web_next) {
    resp.begin_chunked("text/event-stream");

    // 发送一条事件
    resp.write_chunk("data: connected\n\n");

    // 后续通过定时器或其他机制继续 write_chunk
    // 注意：resp 对象的生命周期在 handler 返回后仍然有效吗？
    // —— 不，handler 返回后 resp 不再可用。
    // SSE 的正确做法是在 handler 中保存长连接状态，
    // 通过定时器回调持有对响应的引用。
});
```

**这里有一个关键问题 ：`resp` 对象在 handler 返回后失效。** 要持续推送，必须把响应对象“持有”住。libuvcpp 的 `uvcpp_web_context` 提供了 `hold()` / `release()` 来延长请求的生命周期：

```cpp
app.get("/events", [](uvcpp_web_request& req, uvcpp_web_response& resp,
                      uvcpp_web_next) {
    resp.begin_chunked("text/event-stream");
    resp.write_chunk("data: connected\n\n");

    uvcpp_web_context* ctx = req.context();
    ctx->hold();   // 告诉框架：这个请求还没结束

    // 把 resp 的地址和 ctx 保存到全局，供定时器推送使用
    // ...
});
```

但直接保存 `resp` 指针仍然有风险。更稳妥的做法是**用 WebSocket 做推送** ，或者**把 SSE 连接封装成自己的会话对象** ，把响应指针的生命周期管理清楚。如果只是简单的推送场景，SSE 可以用，但需要谨慎处理生命周期。

#### 2.2 SSE vs WebSocket：选型对比

| 维度 | SSE | WebSocket |
| --- | --- | --- |
| 协议 | HTTP/1.1 chunked | 独立协议（Upgrade） |
| 方向 | 服务端 → 客户端（单向） | 双向 |
| 浏览器支持 | `EventSource` 原生支持 | 需要 JS `WebSocket` |
| 自动重连 | 浏览器内置 | 需要自己实现 |
| 代理/防火墙 | 标准 HTTP，穿透性好 | 部分代理可能拦截 |
| 二进制数据 | 不支持（只能文本） | 支持 |
| 实现复杂度 | 低 | 中 |
| libuvcpp 支持 | 通过 chunked 间接支持 | 原生支持 |

**选型建议 ：** 如果只需要服务端推送（如通知、行情），SSE 更简单；如果需要双向通信（如聊天），WebSocket 是唯一选择。libuvcpp 对 WebSocket 的支持更完善，SSE 需要自己管理生命周期。

### 三、连接数监控与管理

生产环境中，你需要知道当前有多少连接、每条循环承载了多少。

#### 3.1 多事件循环的连接分布

```cpp
app.set_loops(4);
app.start();

// 监控循环负载
for (int i = 0; i < app.loop_count(); ++i) {
    std::cout << "循环 " << i << " 连接数: "
              << app.connection_count_at(i) << std::endl;
}
```

`loop_count()` 返回总循环数（包括接受者循环），`connection_count_at(i)` 返回第 `i` 条循环上的连接数。**下标`0` 是接受者循环，它恒为 0**——接受者不承载任何连接，负载由工作循环分担。

#### 3.2 WebSocket 会话计数

```cpp
std::cout << "WS 实时会话数: " << app.ws_session_count() << std::endl;
std::cout << "WS 已回收会话数: " << app.ws_recycled_session_count() << std::endl;
```

`ws_session_count()` 是实时值，可能包含“已开始关闭但还没回收”的会话。要判断所有会话是否已彻底回收，需要配合 `ws_recycled_session_count()`：

```cpp
// 等待所有 WS 会话回收
while (app.ws_session_count() > 0 &&
       app.ws_recycled_session_count() < expected_count) {
    std::this_thread::sleep_for(std::chrono::milliseconds(10));
}
```

#### 3.3 连接数限制

libuvcpp 本身不强制连接数上限。如果需要限制（防止资源耗尽），在 `on_connection` 或 WebSocket 的 `on_open` 中手动检查并拒绝：

```cpp
app.websocket("/push", [](uvcpp_web_ws_request& ws) {
    static std::atomic<int> g_conn_count{0};

    if (g_conn_count.load() >= 10000) {   // 上限 10000
        ws.connection()->send_close(
            ws_close_code::POLICY_VIOLATION, "too many connections");
        return;
    }

    g_conn_count.fetch_add(1);
    uvcpp_ws_connection* conn = ws.connection();

    conn->on_close([conn](ws_close_code, const std::string&) {
        g_conn_count.fetch_sub(1);
    });
});
```

### 四、心跳保活：让长连接“活着”

WebSocket 连接一旦升级成功，就**不再受`set_idle_timeout_ms` 约束**——框架不会因为连接闲置而关闭它。但这也意味着，如果客户端悄无声息地掉线（拔网线、进程崩溃），服务端可能永远不知道，连接会一直挂着。

**必须自己在会话上发 ping/pong 来保活。**

#### 4.1 服务端心跳实现

```cpp
app.websocket("/chat", [](uvcpp_web_ws_request& ws) {
    uvcpp_ws_connection* conn = ws.connection();

    // 记录最后活跃时间
    auto last_active = std::make_shared<std::chrono::steady_clock::time_point>(
        std::chrono::steady_clock::now());

    // 收到任何消息都更新活跃时间
    conn->on_text([last_active](const std::string& msg) {
        *last_active = std::chrono::steady_clock::now();
        // ... 处理消息 ...
    });

    conn->on_pong([last_active](const char*, size_t) {
        *last_active = std::chrono::steady_clock::now();
    });

    // 心跳定时器：每 30 秒检查一次
    auto* hb_timer = new uvcpp_timer();
    hb_timer->init(conn->loop());   // 注意：定时器挂在连接所属的循环上
    hb_timer->start([conn, last_active, hb_timer](uvcpp_timer*) {
        const auto now = std::chrono::steady_clock::now();
        const auto elapsed =
            std::chrono::duration_cast<std::chrono::seconds>(
                now - *last_active).count();

        if (elapsed > 60) {
            // 超过 60 秒没动静，认为对端已死
            conn->close(ws_close_code::GOING_AWAY, "heartbeat timeout");
            hb_timer->stop();
        } else {
            // 发送 ping
            conn->send_ping();
        }
    }, 30000, 30000);   // 30 秒周期

    conn->on_close([hb_timer](ws_close_code, const std::string&) {
        hb_timer->stop();
        // 定时器对象由框架或后续清理负责释放
    });
});
```

**关键点 ：**

**定时器必须挂在连接所属的循环上。** 多事件循环下，每个连接可能在不同的工作循环上。`conn->loop()` 返回该连接所属的循环。如果定时器挂在错误的循环上，`send_ping` 的跨线程投递会引入不必要的开销。

**`on_pong` 回调用于确认对端还活着。** 如果对端实现了 pong 回应（浏览器 WebSocket API 自动回应 ping），`on_pong` 会被触发，更新活跃时间。

**超时后主动`close()`。** 不要等框架回收——框架不知道连接已经死了。主动关闭会触发正常的关闭流程，释放资源。

#### 4.2 客户端心跳（浏览器端）

浏览器端的 `WebSocket` API **不暴露 ping/pong** ——这是协议层自动处理的。服务端发 ping，浏览器自动回 pong，但 JS 代码看不到。所以服务端的心跳机制是可靠的。

如果对端是非浏览器客户端（比如另一个 libuvcpp 进程），需要自己实现 pong 回应——`uvcpp_ws_connection` 的 `on_ping` 回调中可以调用 `send_pong()` 回应。

### 五、优雅关闭：让服务“体面地退场”

生产环境中的服务不能粗暴地 `kill -9`。需要让正在处理的请求完成、让已建立的连接正常关闭、让客户端知道服务正在下线。

#### 5.1 `set_shutdown_grace_ms`

```cpp
app.set_shutdown_grace_ms(5000);   // 优雅关闭宽限期 5 秒
```

这个配置控制服务在收到停止信号后，等待多久让正在处理的请求完成。默认值是 **3000 毫秒** 。设为 `0` 表示立刻强关（不等待）。

#### 5.2 信号处理与优雅关闭

```cpp
#include <csignal>
#include <atomic>

static std::atomic<uvcpp_web_app*> g_app{nullptr};
static std::atomic<bool> g_shutting_down{false};

void signal_handler(int) {
    if (g_shutting_down.exchange(true)) return;   // 防止重复处理
    uvcpp_web_app* app = g_app.load();
    if (app) {
        std::cout << "收到停止信号，正在优雅关闭..." << std::endl;
        app->stop();   // 触发优雅关闭流程
    }
}

int main() {
    uvcpp_web_app app;
    app.set_port(8080);
    app.set_shutdown_grace_ms(5000);

    // ... 注册路由和中间件 ...

    app.start();
    g_app.store(&app);

    std::signal(SIGINT, signal_handler);
    std::signal(SIGTERM, signal_handler);

    app.join();   // 等待所有循环停止
    std::cout << "服务已完全关闭" << std::endl;
    return 0;
}
```

**`stop()` 的行为：**

  * 停止接受新连接；
  * 等待 `set_shutdown_grace_ms` 指定的时间，让正在处理的请求完成；
  * 超时后强制关闭剩余连接；
  * 事件循环退出，`join()` 返回。

**`join()` 阻塞直到所有循环线程退出。** 在信号处理函数中调用 `stop()` 后，主线程的 `join()` 会自然返回。

#### 5.3 WebSocket 连接的优雅关闭

WebSocket 连接需要额外处理——`stop()` 会强制关闭它们，但不会发送 Close 帧。如果需要通知客户端“服务正在下线”，在 `stop()` 之前主动关闭 WS 连接：

```cpp
// 在 app.stop() 之前
for (auto* conn : all_ws_connections) {
    conn->send_close(ws_close_code::GOING_AWAY, "server shutdown");
}
```

`GOING_AWAY`（1001）是 WebSocket 协议中表示“服务端正在关闭”的标准关闭码。浏览器收到后不会自动重连，前端可以据此显示“服务已下线”的提示。

### 六、性能调优速查

这篇的最后，汇总生产环境中最值得关注的性能开关：

| 调优项 | 方法 | 效果 |
| --- | --- | --- |
| 多核利用 | `app.set_loops(n)` | 1 接受者 + n−1 工作循环，突破单核天花板 |
| 内存池 | 构建时 `-DUVCPP_BUILD_EXPAND=ON` | 降低高频分配开销 |
| 背压控制 | `resp.on_drain()` + `set_max_stream_buffer_bytes()` | 防止慢消费者拖垮内存 |
| 请求体上限 | `app.set_max_body_size(n)` | 防止大请求打满内存 |
| 流水线上限 | `app.set_max_pipelined_requests(n)` | 防止单连接过多在途请求 |
| 闲置超时 | `app.set_idle_timeout_ms(n)` | slowloris 防御 |
| 优雅关闭 | `app.set_shutdown_grace_ms(n)` | 平滑下线，不丢请求 |

**背压的典型用法 ：**

```cpp
resp.begin_chunked("text/event-stream");
resp.set_max_stream_buffer_bytes(512 * 1024);   // 512 KiB 水位

// 推送时检查水位
if (!resp.write_chunk(data)) {
    // 缓冲已到高水位，等 on_drain 再继续
    resp.on_drain([&resp]() {
        // 水位降下来了，可以继续写
    });
}
```

### 七、完整示例：一个带心跳、优雅关闭和连接监控的推送服务

```cpp
#include <webapp/uvcpp_web_app.h>
#include <web/uvcpp_ws_connection.h>
#include <atomic>
#include <csignal>
#include <chrono>
#include <mutex>
#include <set>
#include <iostream>

using namespace uvcpp;

static std::set<uvcpp_ws_connection*> g_clients;
static std::mutex g_clients_mutex;
static std::atomic<uvcpp_web_app*> g_app{nullptr};
static std::atomic<bool> g_shutting_down{false};

void signal_handler(int) {
    if (g_shutting_down.exchange(true)) return;
    auto* app = g_app.load();
    if (app) {
        std::cout << "Shutting down gracefully..." << std::endl;
        app->stop();
    }
}

int main() {
    uvcpp_web_app app;
    app.set_port(8080);
    app.set_shutdown_grace_ms(5000);
    app.set_loops(4);

    // 连接监控：每 10 秒打印一次
    auto* stat_timer = new uvcpp_timer();
    stat_timer->init(app.loop());
    stat_timer->start([](uvcpp_timer*) {
        std::cout << "Loops: " << g_app.load()->loop_count()
                  << ", WS sessions: " << g_app.load()->ws_session_count()
                  << std::endl;
    }, 10000, 10000);

    // WebSocket 端点（带心跳）
    app.websocket("/push", [](uvcpp_web_ws_request& ws) {
        uvcpp_ws_connection* conn = ws.connection();
        {
            std::lock_guard<std::mutex> lock(g_clients_mutex);
            g_clients.insert(conn);
        }

        auto last_active = std::make_shared<
            std::chrono::steady_clock::time_point>(
                std::chrono::steady_clock::now());

        conn->on_pong([last_active](const char*, size_t) {
            *last_active = std::chrono::steady_clock::now();
        });

        auto* hb = new uvcpp_timer();
        hb->init(conn->loop());
        hb->start([conn, last_active, hb](uvcpp_timer*) {
            auto now = std::chrono::steady_clock::now();
            auto elapsed = std::chrono::duration_cast<
                std::chrono::seconds>(now - *last_active).count();
            if (elapsed > 60) {
                conn->close(ws_close_code::GOING_AWAY,
                            "heartbeat timeout");
                hb->stop();
            } else {
                conn->send_ping();
            }
        }, 30000, 30000);

        conn->on_close([conn, hb](ws_close_code, const std::string&) {
            hb->stop();
            std::lock_guard<std::mutex> lock(g_clients_mutex);
            g_clients.erase(conn);
        });
    });

    // 推送定时器
    auto* push_timer = new uvcpp_timer();
    push_timer->init(app.loop());
    push_timer->start([](uvcpp_timer*) {
        std::vector<uvcpp_ws_connection*> targets;
        {
            std::lock_guard<std::mutex> lock(g_clients_mutex);
            targets.assign(g_clients.begin(), g_clients.end());
        }
        std::string msg = "{\"tick\":" +
            std::to_string(std::time(nullptr)) + "}";
        for (auto* c : targets) {
            c->send_text(msg.c_str(), msg.size());
        }
    }, 1000, 1000);

    app.start();
    g_app.store(&app);

    std::signal(SIGINT, signal_handler);
    std::signal(SIGTERM, signal_handler);

    app.join();
    std::cout << "Server stopped." << std::endl;
    return 0;
}
```

### 八、本篇小结与系列回顾

这篇覆盖了生产级 C++ Web 服务的最后一块拼图：

**定时器推送** ——`uvcpp_timer` 挂在 `app.loop()` 上，周期回调中广播消息，注意跨循环的线程安全。

**SSE** ——通过 `begin_chunked("text/event-stream")` 实现，适合单向推送场景，生命周期需要谨慎管理。

**连接监控** ——`loop_count()` / `connection_count_at(i)` 看循环负载，`ws_session_count()` 看会话数。

**心跳保活** ——WS 连接不受闲置超时约束，必须自己在会话上发 ping/pong，超时主动关闭。

**优雅关闭** ——`set_shutdown_grace_ms()` 设置宽限期，信号处理中调 `stop()`，`join()` 等待退出。

**性能速查** ——多循环、内存池、背压、大小上限、闲置超时、优雅关闭，七个开关覆盖主要场景。

**系列回顾 ：** 四篇文章从零到一，覆盖了 libuvcpp Web 开发的完整路径——应用创建与静态目录（第一篇）、路由与中间件与上传（第二篇）、WebSocket 实时通信（第三篇）、服务端推送与生产级调优（第四篇）。如果你跟着走完了这四篇，现在应该能独立用 C++ 写出一个可上生产环境的 Web 服务了。

后续如果还想继续，可以深入 HTTP/2 的流级背压、SSL/TLS 的生产配置、或者 Expand 内存池的内部原理。欢迎在 [GitHub Issues](<https://github.com/Antruly/libuvcpp/issues>) 提出你感兴趣的下一站。
