---
title: "用 C++ 写 Web 服务实战（一）：从零搭建你的第一个 libuvcpp Web 应用"
published: 2026-09-23
image: "/images/posts/covers/libuvcpp-web-guide-01.webp"
description: "本文介绍如何用 C++ 搭建首个 libuvcpp Web 应用，涵盖构建配置、路由定义、静态资源服务、多核性能优化及日志系统。通过 uvcpp_web_app 实现高并发 HTTP 服务，支持 set_loops() 启用多线程事件循环（最高64核），结合 serve_static() 提供 ETag、Range 等高级功能，并通过自定义中间件实现可控访问日志。适用于轻量级高性能场景，生产环境建议搭配 Nginx 处理静态资源。"
tags: ["c++", "uv", "web"]
category: "libuvcpp"
lang: "zh_CN"
author: "Antruly"
sourceLink: "https://blog.csdn.net/qq_41697882/article/details/166489940"
series: "用 C++ 写 Web 服务实战"
seriesOrder: 1
comment: true
---

在上一篇介绍中，我们聊了 libuvcpp 的设计理念——在 libuv 的高性能之上，提供符合 C++ 习惯的 RAII 封装和 `std::function` 回调，让 C++ 开发者也能像写 Express 或 Spring Boot 那样快速搭建 Web 服务。这篇是实战系列的第一篇，我们从最基础的开始：**创建一个可运行的 Web 应用 ，监听端口，绑定静态目录，做好性能规划，再配上日志系统。**

### 一、构建与依赖准备

WebApp 模块建在 Web 模块之上，使用之前需要在 CMake 阶段显式开启。完整的构建命令如下：

```bash
# Linux 先安装系统依赖
sudo apt-get install libssl-dev zlib1g-dev

mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release \
  -DUVCPP_BUILD_WEB=ON \
  -DUVCPP_BUILD_WEBAPP=ON \
  -DUVCPP_ENABLE_OPENSSL=ON \
  -DUVCPP_ENABLE_ZLIB=ON \
  -DUVCPP_BUILD_EXAMPLES=ON
cmake --build . --config Release --parallel
```

这里的关键选项：

| 选项 | 作用 | 默认值 |
| --- | --- | --- |
| `UVCPP_BUILD_WEB` | 启用 HTTP/WebSocket 模块 | OFF |
| `UVCPP_BUILD_WEBAPP` | 启用 Web 应用框架层 | OFF |
| `UVCPP_ENABLE_OPENSSL` | 启用 TLS 封装 | OFF |
| `UVCPP_ENABLE_ZLIB` | 启用压缩支持 | OFF |
| `UVCPP_BUILD_EXPAND` | 启用 TCMalloc 风格内存池 | OFF |

注意 **Expand 内存池模块自 v1.1.0 起默认关闭** 。预编译包是带池发布的，如果你用的是预编译包，`uvcpp/uvcpp_config.h` 里已经给定了实际值，自己再定义成别的值会直接 `#error`，不会静默产生分配器错配。源码构建时如果需要启用，加 `-DUVCPP_BUILD_EXPAND=ON`。

### 二、创建第一个 Web 应用

引入头文件，创建一个 `uvcpp_web_app` 实例，配置路由和端口，然后启动。以下是最小可运行骨架：

```cpp
#include <webapp/uvcpp_web_app.h>
using namespace uvcpp;

int main() {
    uvcpp_web_app app;

    // 配置监听地址和端口
    app.set_host("0.0.0.0").set_port(8080);

    // 注册一条最简单的 JSON 路由
    app.get("/hello", [](uvcpp_web_request& req,
                         uvcpp_web_response& resp,
                         uvcpp_web_next next) {
        resp.json_str("{\"message\":\"hello from libuvcpp\"}");
        resp.end();
    });

    // 启动：bind 之后在后台线程跑事件循环
    app.start();

    // 阻塞等待，直到收到退出信号
    app.join();
    return 0;
}
```

`uvcpp_web_app` 是整个应用的本体，承担配置、路由、中间件和生命周期管理的职责。它的生命周期 API 很直观：`start()` 在后台线程启动事件循环，`stop()` 停止，`join()` 阻塞等待。

默认监听 `0.0.0.0`，但建议显式调用 `set_host()` 和 `set_port()`，避免部署时出现“以为监听了却连不上”的问题。

编译时链接库：

```bash
g++ -std=c++11 main.cpp -luvcpp_webapp -luvcpp_web -luvcpp -luv -lssl -lcrypto
```

### 三、绑定静态目录

Web 应用几乎必然要提供静态资源。`uvcpp_web_static` 提供了完整的静态文件服务能力——ETag、Last-Modified、Range 请求（206/416）、LRU 缓存和 SPA 回落都内置了。

#### 3.1 基础用法

```cpp
// 将 URL 路径 /assets 映射到本地目录 ./public
app.serve_static("/assets", "./public");
```

请求 `GET /assets/style.css` 时，框架自动读取 `./public/style.css`，附带正确的 `Content-Type`、`Content-Length`、`ETag` 和 `Last-Modified` 响应头。如果客户端带 `If-None-Match`，命中 ETag 直接返回 304，省去传输开销。

#### 3.2 SPA 回落

单页应用（SPA）通常需要把未匹配的路径都回落到 `index.html`，由前端路由处理：

```cpp
app.serve_static("/", "./dist", /* spa_fallback = */ true);
```

访问 `/user/123` 时，如果 `./dist/user/123` 不存在，框架自动返回 `./dist/index.html`。

#### 3.3 性能注意

静态文件服务涉及磁盘 I/O 和 ETag 计算（需要读取文件内容做哈希）。在生产环境中，如果前置了 Nginx 或 CDN，libuvcpp 的静态服务主要服务于内网场景或轻量级部署。高并发静态资源场景下，把静态服务交给 Nginx 仍然是更稳妥的选择。

### 四、性能优化：让单进程跑满多核

这是 v1.3.0 最重要的能力增量。一条事件循环最多占满一个核，这是所有单线程异步框架的天花板。`set_loops(n)` 在同一个进程内启动 **1 条接受者循环 + n−1 条工作循环**，接受连接始终在一个线程上，连接的 I/O 摊到各条工作循环。

```cpp
uvcpp_web_app app;
app.set_host("0.0.0.0").set_port(8080);

// 1 条接受者 + 3 条工作循环
// 注意：返回 int，不能链式调用，必须在 start() 之前调用
const int rc = app.set_loops(4);
if (rc != 0) return 1;

app.get("/json", [](uvcpp_web_request&, uvcpp_web_response& resp,
                    uvcpp_web_next) {
    resp.json_str("{\"hello\":\"world\"}");
    resp.end();
});

app.start();   // n > 1 时只能用 start()/start_background()，run(md) 会被拒
app.join();
```

使用 `set_loops` 有几条必须知道的规则：

**必须在`start()` / `run()` 之前调用。** 路由注册同样要在 `start()` 之前——`n > 1` 时这条从建议变为必须。

**`set_loops` 返回 `int`，不能接在 `set_host(...).set_port(...)` 链上。** 成功返回 `0`；`n` 不在 `1..64` 范围返回 `UV_EINVAL`；运行时已经启动过返回 `UV_EBUSY`。

**`n== 1` 与从不调用逐字节相同**——不建额外格子、不装钩子、不多起线程。

**`n> 1` 时 `run(md)` 会被 `UV_EINVAL` 拒绝**，必须用 `start()` 或 `start_background()`，收尾用 `stop()` 与 `join()`。

**接受者循环不承载任何连接。** `loop_count()` 返回总循环数，`connection_count_at(i)` 返回每格连接数——下标 `0` 是接受者，恒为 0。

需要注意的是，socket 转手在 Windows 上走 `WSADuplicateSocketW` + `WSASocketW`，其余平台走 `dup()`。Windows 上这条路径压着一个已知的 libuv 缺陷，开多循环之前建议先读 `doc/net-guide.md` §4 和 `RELEASE.md`。

对于绝大多数场景，`set_loops(4)` 到 `set_loops(8)` 已经能充分利用现代多核 CPU。配合 Expand 内存池，单事件循环的实测数据是 **75k RPS** ，10 分钟 soak 跑 3840 万请求零错误。

### 五、日志系统与自定义日志中间件

#### 5.1 内置日志

libuvcpp 内置了 `uvcpp_log` / `uvcpp_log_console`，提供两级日志体系——**等级 + 模块**，sink 可插拔。等级涵盖 DEBUG / INFO / WARN / ERROR，模块标识用于区分不同组件的输出。默认的 console sink 输出到标准输出，也支持接入 syslog 等自定义 sink。

最简单的初始化：

```cpp
#include <uvcpp/uvcpp_log.h>
using namespace uvcpp;

uvcpp_log::init(uvcpp_log_level::INFO);
```

但内置日志主要服务于框架内部。**业务访问日志更适合用中间件自己实现** ，这样格式完全可控，且能按需求写入文件。

#### 5.2 写一个日志中间件

`uvcpp_web_app` 的 `.use()` 方法接收中间件。中间件的签名与路由 handler 类似，但多了一个 `uvcpp_web_next` 参数用于放行请求：

```cpp
#include <webapp/uvcpp_web_app.h>
#include <fstream>
#include <sstream>
#include <ctime>
#include <mutex>

using namespace uvcpp;

// 全局日志文件和互斥锁
static std::ofstream g_access_log;
static std::mutex g_log_mutex;

std::string now_str() {
    std::time_t t = std::time(nullptr);
    char buf[64];
    std::strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S", std::localtime(&t));
    return buf;
}

int main() {
    // 打开本地日志文件（追加模式）
    g_access_log.open("access.log", std::ios::app);
    if (!g_access_log.is_open()) {
        std::cerr << "无法打开日志文件" << std::endl;
        return 1;
    }

    uvcpp_web_app app;
    app.set_host("0.0.0.0").set_port(8080);

    // 注册日志中间件
    app.use([](uvcpp_web_request& req, uvcpp_web_response& resp,
               uvcpp_web_next next) {
        // 请求进入时记录时间戳
        const std::string ts = now_str();

        // 放行到下一个中间件或路由 handler
        next();

        // 响应完成后记录日志（resp 中已有状态码等信息）
        std::lock_guard<std::mutex> lock(g_log_mutex);
        if (g_access_log.is_open()) {
            g_access_log << "[" << ts << "] "
                         << req.method_str() << " "
                         << req.path() << " "
                         << static_cast<int>(resp.status_code()) << "\n";
            g_access_log.flush();
        }
    });

    app.get("/hello", [](uvcpp_web_request&, uvcpp_web_response& resp,
                         uvcpp_web_next) {
        resp.json_str("{\"hello\":\"world\"}");
        resp.end();
    });

    app.serve_static("/assets", "./public");
    app.start();
    app.join();
    return 0;
}
```

**这段代码的关键点 ：**

**用`std::mutex` 保护文件写入。** 多事件循环模式下（`set_loops(n)` 且 `n > 1`），多个工作循环线程会并发调用中间件，不锁文件会导致日志交错甚至崩溃。

**每次写入后`flush()`。** 异步框架下崩溃可能发生在任何时刻，不 flush 意味着最后几条日志丢失——往往恰恰是排查问题最需要的那几条。

**`next()` 之前记录时间戳，之后记录状态码。** `next()` 调用后会执行后续的中间件和路由 handler，执行完毕后 `resp` 中已经有最终的状态码和响应体信息。这个“前后包裹”的模式是 Express/Koa 中间件模型的经典写法。

**挂载顺序影响执行顺序。** `.use()` 的注册顺序就是中间件的执行顺序。日志中间件通常注册在所有其他中间件之前，这样即使后续中间件拒绝了请求（比如 CORS 中间件返回 403），日志也能记录下来。

### 六、完整示例：把上面的一切串起来

```cpp
#include <webapp/uvcpp_web_app.h>
#include <fstream>
#include <mutex>
#include <ctime>
#include <iostream>

using namespace uvcpp;

static std::ofstream g_log;
static std::mutex g_log_mutex;

static std::string now_str() {
    std::time_t t = std::time(nullptr);
    char buf[64];
    std::strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S",
                  std::localtime(&t));
    return buf;
}

int main() {
    g_log.open("access.log", std::ios::app);

    uvcpp_web_app app;
    app.set_host("0.0.0.0").set_port(8080);

    // 性能：4 条工作循环
    const int rc = app.set_loops(4);
    if (rc != 0) {
        std::cerr << "set_loops 失败: " << rc << std::endl;
        return 1;
    }

    // 日志中间件（第一个注册）
    app.use([](uvcpp_web_request& req, uvcpp_web_response& resp,
               uvcpp_web_next next) {
        const std::string ts = now_str();
        next();
        std::lock_guard<std::mutex> lock(g_log_mutex);
        if (g_log.is_open()) {
            g_log << "[" << ts << "] "
                  << req.method_str() << " " << req.path()
                  << " -> " << static_cast<int>(resp.status_code()) << "\n";
            g_log.flush();
        }
    });

    // CORS 中间件
    app.use(web_middleware_cors());

    // 业务路由
    app.get("/hello", [](uvcpp_web_request&, uvcpp_web_response& resp,
                         uvcpp_web_next) {
        resp.json_str("{\"hello\":\"world\"}");
        resp.end();
    });

    // 静态资源
    app.serve_static("/assets", "./public", /* spa_fallback = */ true);

    app.start();
    std::cout << "Server running on :8080 with 4 loops" << std::endl;
    app.join();
    return 0;
}
```

### 七、本篇小结与下一步

这篇覆盖了 Web 应用搭建的五个核心步骤：

**构建配置** ——开启 `UVCPP_BUILD_WEBAPP` 和 `UVCPP_ENABLE_OPENSSL`，注意 Expand 内存池默认关闭。

**创建应用** ——`uvcpp_web_app` + `set_host/set_port` + `start/join`，加上路由注册。

**静态目录** ——`serve_static()` 支持 ETag、Range、SPA 回落，一条调用搞定。

**性能优化** ——`set_loops(n)` 突破单核天花板，注意返回 `int`、必须在 `start()` 前调用、`n > 1` 时不能用 `run(md)`。

**日志中间件** ——用 `.use()` 注册中间件，前后包裹模式记录请求/响应，用 `std::mutex` 保证多线程安全写入。

下一篇会在这个骨架之上继续扩展：**路由进阶、中间件链的深度使用、请求体流式处理和文件上传** 。如果你在搭建过程中遇到问题，欢迎在 [GitHub Issues](<https://github.com/Antruly/libuvcpp/issues>) 提出。
