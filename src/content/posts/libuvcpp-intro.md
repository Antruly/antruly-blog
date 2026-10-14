---
title: "C++ 轻量Web服务框架库 libuvcpp 支持HTTP/1.1、HTTP/2、HTTP/3、QUIC、WSDL、SOAP、DB（SQLite / MySQL / PostgreSQL）"
published: 2026-09-19
image: "/images/posts/covers/libuvcpp-intro.webp"
updated: 2026-10-11
description: "libuvcpp 1.6.0 发布，填补 C++ Web 框架空白。基于 libuv 构建，提供 RAII 封装与 std::function 回调，支持全协议栈（HTTP/1.1、HTTP/2、HTTP/3/QUIC）、WebSocket、WSDL/SOAP、数据库及安全 SSL/TLS。模块化设计，易用性与高性能兼备，助力 C++ 开发者高效构建现代 Web 服务。"
tags: ["c++", "uv", "web app", "web", "http"]
category: "libuvcpp"
lang: "zh_CN"
author: "Antruly"
sourceLink: "https://blog.csdn.net/qq_41697882/article/details/166013789"
comment: true
---

## 用 C++ 写 Web 服务，凭什么不行？——libuvcpp 1.6.0 发布，数据库模块与全协议栈持续进化

> 项目地址：[libuvcpp](<https://github.com/Antruly/libuvcpp>)
>  项目Release：[Latest](<https://github.com/Antruly/libuvcpp/releases/latest>)
>  版本：1.6.0 ｜ 作者：zhuweiye ｜ 许可证：MIT

### 一、一个被忽视的事实：C++ 没有好用的 Web 框架

今天的 Web 服务世界，基本是微服务和插件式服务的天下。你随手打开一个后端项目，大概率是 Java 的 Spring Boot、Python 的 FastAPI/Django、Node.js 的 Express/NestJS，或者 Go 的 Gin。它们各有各的生态优势，但你会发现一个共同点——**上手成本低 ，开箱即用**。

那 C++ 呢？

C++ 在 Web 服务领域的处境一直很尴尬。业内普遍认为 C++ 只适合写嵌入式、客户端产品、游戏引擎、插件系统，"不适合开发 Web 应用"几乎成了一种默认认知。但事实是：**C ++ 不是不能写 Web 服务，而是一直没有一个轻量、好用、容易上手的 Web 服务框架。**

这才是问题的根源。

### 二、libuvcpp 是什么

#### 2.1 站在 libuv 的肩膀上

libuv 是 Node.js 的底层异步事件引擎——跨平台、高性能、经过大规模生产验证。它几乎是 C/C++ 世界最可靠的异步 I/O 基础设施。

但 libuv 是 C 风格的 API：回调是裸函数指针，handle 要手动管理生命周期，缓冲区要自己 malloc/free。让一个习惯了 C++ 的开发者去用它，体验并不好。

而让 C++ 程序员去适应 Node.js 那种"一切皆回调 + JS 语法"的开发范式，同样不是一个好的选择——语言割裂、调试困难、性能也不好控制。

**libuvcpp 就是这两者之间的中间地带。**

它在 libuv 的事件循环、句柄和请求之上，提供了一层薄而符合 C++ 习惯的封装：保持 libuv 的性能不变，同时引入 RAII 资源管理、`std::function` 回调，以及面向 TCP、UDP、HTTP、WebSocket 的高级客户端/服务端抽象。

#### 2.2 更大的目标：为 C++ Web 生态打地基

libuvcpp 的野心不止于此。

它的真正目标是：**填补 C ++ 在 Web 服务框架领域的空白**，为 C++ 生态提供一个轻量、好用、容易上手的 Web 服务框架基础。在这个基础之上，进一步构建面向应用层的 net / web / webapp 框架——让 C++ 开发者也能像写 Spring Boot 或 Express 那样，快速搭起一个符合现代 Web 应用标准的服务端程序。

而"符合现代 Web 应用标准"意味着三件事缺一不可：**安全、性能、易用** 。

### 三、架构分层

libuvcpp 按层次模块组织，从底层工具到应用框架，逐层向上。到 1.6.0，全协议栈（HTTP/1.1、HTTP/2、HTTP/3）以及数据库模块已经完整就位：

```
应用层
┌──────────────┐
│ web (HTTP/WS) │  ← uvcpp_http_client/server, uvcpp_ws_client/server
├──────────────┤
│ http3/quic    │  ← uvcpp_quic_client/server/connection (net 层), nghttp3 胶水 (web 层)
├──────────────┤
│ wsdl          │  ← SOAP 1.1/1.2 + WSDL 1.1（UVCPP_ENABLE_WSDL）
├──────────────┤
│ http2         │  ← h2 会话/连接层、nghttp2 胶水（UVCPP_ENABLE_NGHTTP2）
├──────────────┤
│ ssl (TLS)     │  ← uvcpp_ssl, uvcpp_ssl_context (OpenSSL 封装)
├──────────────┤
│ net           │  ← uvcpp_tcp_client/server, uvcpp_udp_client/server
├──────────────┤
│ db            │  ← uvcpp_db_client, uvcpp_db_async（UVCPP_ENABLE_DB）
├──────────────┤
│ handle + req  │  ← uvcpp_loop, uvcpp_tcp, uvcpp_timer, uvcpp_write, ...
├──────────────┤
│ uvcpp core    │  ← uvcpp_buf, uvcpp_thread, uvcpp_alloc, ...
└──────────────┘
```

再往上还有一层 **webapp** ——建在 web 模块之上的应用框架，写业务 handler 就行，不用拼报文。

### 四、核心设计：类封装 + `std::function` 回调

#### 4.1 把 handle 变成类

libuvcpp 将 libuv 的核心句柄和请求封装为对应的 C++ 类，命名统一为 `uvcpp_` 前缀的下划线风格：

| 类别 | 类 |
| --- | --- |
| 事件循环 | `uvcpp_loop` |
| 流式句柄 | `uvcpp_tcp`, `uvcpp_pipe`, `uvcpp_udp`, `uvcpp_tty` |
| 定时器与钩子 | `uvcpp_timer`, `uvcpp_idle`, `uvcpp_prepare`, `uvcpp_check` |
| 信号与进程 | `uvcpp_signal`, `uvcpp_process` |
| 文件系统 | `uvcpp_fs`, `uvcpp_fs_event`, `uvcpp_fs_poll` |
| 轮询 | `uvcpp_poll`, `uvcpp_async` |
| 请求 | `uvcpp_write`, `uvcpp_connect`, `uvcpp_shutdown`, `uvcpp_work`, `uvcpp_getaddrinfo`, `uvcpp_getnameinfo`, `uvcpp_udp_send`, `uvcpp_random` |

每个句柄类都遵循 RAII：析构时自动关闭，句柄的生命周期不再需要手动干预。

#### 4.2 `std::function` 风格的异步回调

libuv 的 C 回调需要通过 `req->data` 裸指针来传递上下文；libuvcpp 直接使用 `std::function` / lambda，可以自由捕获外部变量，类型安全，无需 `void*` 转换。

### 五、能力全景

#### Net 模块（`UVCPP_BUILD_NET=ON`，默认开启）

| 类 | 说明 |
| --- | --- |
| `uvcpp_tcp_client` | 高级 TCP 客户端，**双模式 API**（异步回调 / 同步 `wait()` 带超时） |
| `uvcpp_tcp_server` | TCP 服务端，`bind()` + `listen(连接回调, backlog)` |
| `uvcpp_udp_client` | UDP 客户端，双模式发送/接收 |
| `uvcpp_udp_server` | UDP 服务端，`bind()` / `recv_start()` |

#### Web 模块（`UVCPP_BUILD_WEB=ON`）

| 类 | 说明 |
| --- | --- |
| `uvcpp_http_client` / `uvcpp_http_server` | HTTP 客户端/服务端，支持 keep-alive、流式解析、`set_http2_enabled()` 开 h2 |
| `uvcpp_http_parser` | 流式 HTTP 解析器（封装 llhttp），PIMPL 模式 |
| `uvcpp_http_request` / `uvcpp_http_response` | 请求/响应对象，序列化与工厂方法 |
| `uvcpp_ws_client` / `uvcpp_ws_server` / `uvcpp_ws_connection` | WebSocket 客户端/服务端/连接（RFC 6455） |
| `uvcpp_ws_parser` | 流式 WebSocket 帧解析器，8 状态状态机 |
| `uvcpp_http_common` | HTTP 方法/状态码枚举、版本枚举（HVER_10/11/20） |

#### Web 应用框架（`UVCPP_BUILD_WEBAPP=ON`）

| 类 | 说明 |
| --- | --- |
| `uvcpp_web_app` | 应用本体：配置、路由、中间件、生命周期 |
| `uvcpp_web_router` | 模式路由——`/user/:id` 参数、`/files/*path` 通配 |
| `uvcpp_web_request` / `uvcpp_web_response` | 请求/响应封装：查询串、表单、Cookie、chunked、`send_file` |
| `uvcpp_web_static` | 静态文件服务：ETag、Last-Modified、Range/206/416、LRU 缓存、SPA 回落 |
| `uvcpp_web_upload` / `uvcpp_web_multipart` | multipart 流式落盘 |
| `uvcpp_web_ws` / `uvcpp_web_ws_client` | WebSocket 端点与客户端（可选自动重连） |
| `uvcpp_log` / `uvcpp_log_console` | 两级日志：等级 + 模块，sink 可插拔 |
| `uvcpp_web_json` | nlohmann/json 的收口层，支持字段表反射 |

#### QUIC / HTTP/3 模块（`UVCPP_ENABLE_QUIC` / `UVCPP_ENABLE_HTTP3`）

QUIC 传输位于 net 层（`uvcpp_quic_client` / `uvcpp_quic_server` / `uvcpp_quic_connection`），基于 ngtcp2；HTTP/3 位于 web 层，基于 nghttp3，运行在自己的 UDP socket 上，HTTP/1.1 和 HTTP/2 完全不受影响。要求 OpenSSL ≥ 3.2（带 QUIC API）。

#### WSDL/SOAP 模块（`UVCPP_ENABLE_WSDL`）

`src/wsdl/` 提供完整的 SOAP 1.1/1.2 + WSDL 1.1 支持：WSDL 文档模型与发布层、SOAP 信封解析/Fault/序列化、operation 派发层。依赖 pugixml，随包静态链接。

#### SSL 模块（`UVCPP_ENABLE_OPENSSL=ON`）

`uvcpp_ssl_context`（SSL/TLS 上下文，证书加载，自签名证书生成）、`uvcpp_ssl`（每连接封装，`handshake()` / `read()` / `write()` / `shutdown()`）。

#### Expand 模块（内存池）

TCMalloc 风格的内存池：页堆、span 分配器、线程缓存、enterprise 分配器。默认关闭（`UVCPP_BUILD_EXPAND=OFF`）。

### 六、v1.6.0 新增重头戏

#### 6.1 新增数据库模块（`UVCPP_ENABLE_DB=ON`）

**这是 1.6.0 最重量级的新增模块。** `src/db/` 提供统一的数据库访问接口：

  * **一个`uvcpp_db_client` 对应一个连接**，同一套接口同时覆盖 **SQLite / MySQL / PostgreSQL** 三个后端，结果行按表取（列名或列号）。
  * **占位符是方言差异 ，不换算。** 写 `$1` 是 PostgreSQL 的语法，写 `?` 是另外两家的；本库原样透传给你选的那个后端，不做 `?` → `$n` 的改写。
  * **事务里不重试。** 失败后的重试会把语句挪出那个事务本身，所以门面不替你重试。
  * **异步门面`uvcpp_db_async`**（回调 + future）基于 `uv_queue_work` 实现，把工作线程池的样板收掉了。
  * **连接池** 建在同一条连接类型上，把并发从 1 抬到 N；借出的 client 不许 free、池子被门面绑着时也不许 free，这两条都被变异测试钉住。

默认关，而且是本库唯一需要第三方客户端库的模块（libsqlite3 / libmysqlclient / libpq）。三个后端一个都没找到时整个模块被强制关掉并打一条说明怎么修的 warning。

#### 6.2 C ABI 第八片：db（402 个函数）

`uvcpp_c_db.h` 是 C ABI 的第八片，81 个入口（连接 / 同步查询与事务 / 参数 / 结果集与值 / 连接池 / 异步门面），到此合计 **402 个函数** 。C#、Rust、Python 的 ctypes 今天就能用数据库模块。

`UVCPP_C_ABI_VERSION` **仍是 1** 。加一片不 +1 的判据是：`git diff --stat` 在 `src/capi/` 上只有一行（伞头多一段 `#if UVCPP_DB_ENABLE` 的 include），既有的七份头与七份 .cpp 一个字节都没动。

C 的异步接口**不收循环参数** ——这是它与 C++ 那侧唯一一处形状差别。完成回调一律在门面自带的那条懒起循环线程上跑。

C# 绑定仍覆盖前七片（321 of 402）——db 那 81 条是它自己 README 里如实列出的缺口。

#### 6.3 QUIC：两处正确性、两处性能

1.5.1 → 1.5.3 这条开发线收进 1.6.0，QUIC 传输上落地的改动包括：

**正确性修复** ：

  * **大载荷下交付出去的字节是错的 （1.5.1）——这是本版最重要的一处修复。** `write_stream()` 把 `std::vector` 里的一个指针交给 ngtcp2，而那块缓冲会增长（把地址搬走），丢已确认前缀时又会把尾巴 memmove 上来（地址没变、字节变了）。症状是 2 MiB 回显 20 次里崩 3 次。正式修法是分块发送队列：每块出生时预留、此后只写到这里为止、只在整块被确认时才丢。
  * **数据报上限钉在 1200 ，把 ngtcp2 自带的 PMTUD 整条关死（1.5.1）。** 改成 1500（典型以太网 MTU）后，全尺寸扫描每一档都变快（+4.2% ～ +23.8%）。

**性能优化** ：

  * **ACK 阈值从 ngtcp2 默认的 2 提到 16 （1.5.1）。** 实测 2 MiB 单向总数据报 2445 → 1783（−27%）、中位耗时 19.25 → 13.81 ms。
  * **Windows 发送侧批量交数据报 （1.5.2）。** `UVCPP_ENABLE_UDP_GSO` 把一批等长数据报用一次 `WSASendTo` 交给协议栈。Windows only——Linux 上游已经把每批折成一次 `sendmmsg()`。

#### 6.4 发布包：两轮扩容

六条发布腿的预编译包在这一版里多带两个模块：

| 版本 | 多了什么 | 断言清单 |
| --- | --- | --- |
| 1.5.2 | WSDL / SOAP | 十个宏 → 十一个 |
| 1.5.3 | 数据库（只带 SQLite 一个后端） | 十一个 → 十三个 |

WSDL 那次值得单独说，因为它的失败方式很安静：包里照样装着 `include/wsdl/*.h`，但生成头里 `UVCPP_WSDL_ENABLE` 是 0，于是那些头的全部内容落在 `#if` 外面——头在、功能不在。

db 那次的两个 OFF（MySQL / PostgreSQL）是显式关的，不是"找不到"：发布 runner 上装着 libpq-dev，`find_package` 会静默成功，于是共享库悄悄多一条 `libpq.so.5` 的 `DT_NEEDED`。SQLite 那份也不链系统的：走配置期下的一份哈希钉死的 amalgamation，编成静态且强制 PIC 链进去。

### 七、快速上手

#### 7.1 构建（仅核心）

```bash
mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release -DUVCPP_BUILD_TESTS=ON
cmake --build . --config Release --parallel
ctest --output-on-failure -C Release
```

#### 7.2 完整构建（Web + WebApp + SSL + 压缩 + WSDL + QUIC/HTTP3 + DB）

```bash
# Linux: 先安装系统依赖
sudo apt-get install libssl-dev zlib1g-dev

cmake .. -DCMAKE_BUILD_TYPE=Release -DUVCPP_BUILD_TESTS=ON \
  -DUVCPP_BUILD_WEB=ON \
  -DUVCPP_BUILD_WEBAPP=ON \
  -DUVCPP_ENABLE_OPENSSL=ON \
  -DUVCPP_ENABLE_ZLIB=ON \
  -DUVCPP_ENABLE_WSDL=ON \
  -DUVCPP_ENABLE_QUIC=ON \
  -DUVCPP_ENABLE_HTTP3=ON \
  -DUVCPP_ENABLE_DB=ON \
  -DUVCPP_BUILD_EXAMPLES=ON
cmake --build . --config Release --parallel
./examples/Release/webapp_demo
```

> QUIC 需要 OpenSSL ≥ 3.2（带 QUIC API）。DB 模块需要至少一个第三方客户端库（libsqlite3 / libmysqlclient / libpq）。

#### 7.3 TCP Echo 服务端

```cpp
#include "uvcpp.h"
#include "net/uvcpp_tcp_server.h"
#include <iostream>

int main() {
    uvcpp::uvcpp_tcp_server server;
    server.bind("127.0.0.1", 8080);

    server.set_read_callback([](uvcpp::uvcpp_tcp_client& client,
                                const uvcpp::net_read_result& r) {
        if (r.is_data()) {
            std::cout << "收到: " << std::string(r.data, r.size) << std::endl;
            client.write(r.data, r.size, [](int) {});
        } else {
            std::cout << "客户端断开" << std::endl;
        }
    });

    server.listen([](uvcpp::uvcpp_tcp_client* client) {
        std::cout << "客户端已连接" << std::endl;
    });

    std::cout << "Echo 服务运行在 :8080" << std::endl;
    server.run();
    return 0;
}
```

#### 7.4 HTTP GET 请求

```cpp
#include "web/uvcpp_http_client.h"
#include <iostream>

int main() {
    uvcpp::uvcpp_http_client client;

    client.get("http://httpbin.org/get",
               [](const uvcpp::uvcpp_http_response& rsp, int err) {
        if (err) return;
        std::cout << "状态码: " << static_cast<int>(rsp.status_code) << std::endl;
        std::cout << "响应体: "
                  << std::string(rsp.body.get_const_data(), rsp.body.size())
                  << std::endl;
    });

    client.run();
    return 0;
}
```

#### 7.5 WebSocket 服务端

```cpp
#include "web/uvcpp_ws_server.h"
#include <iostream>

int main() {
    uvcpp::uvcpp_ws_server server;
    server.bind("127.0.0.1", 8080);

    server.on_connection([](uvcpp::uvcpp_ws_connection* conn) {
        std::cout << "WS 客户端已连接" << std::endl;

        conn->on_text([conn](const std::string& msg) {
            std::cout << "收到: " << msg << std::endl;
            const std::string reply = "回显: " + msg;
            conn->send_text(reply.c_str(), reply.size());
        });

        conn->on_close([](uvcpp::ws_close_code code, const std::string& reason) {
            std::cout << "WS 客户端断开: "
                      << static_cast<int>(code) << " " << reason << std::endl;
        });
    });

    server.listen();
    server.run();
    return 0;
}
```

#### 7.6 最激动人心的部分：WebApp

```cpp
#include <webapp/uvcpp_web_app.h>
using namespace uvcpp;

int main() {
  uvcpp_web_app app;
  app.set_port(8080)
     .use(web_middleware_access_log())
     .use(web_middleware_cors());

  app.get("/hello", [](uvcpp_web_request& req, uvcpp_web_response& resp,
                       uvcpp_web_next next) {
    resp.json_str("{\"hello\":\"world\"}");
    resp.end();
  });

  app.serve_static("/assets", "./public");
  app.websocket("/echo", [](uvcpp_web_ws_request& ws) {
    uvcpp_ws_connection* c = ws.connection();
    c->on_text([c](const std::string& m) { c->send_text(m.c_str(), m.size()); });
  });

  app.start();
  app.join();
  return 0;
}
```

### 八、v1.6.0 版本亮点

| 亮点 | 说明 |
| --- | --- |
| **新增数据库模块** | 一个 `uvcpp_db_client` 覆盖 SQLite / MySQL / PostgreSQL，带异步门面和连接池 |
| **C ABI 第八片：db** | 新增 81 个 `uvcpp_c_db_*` 入口，合计 402 个函数；ABI 版本仍为 1 |
| **QUIC 正确性与性能修复** | 大载荷字节错误修复（最重要）、PMTUD 关闭、ACK 阈值优化、Windows GSO |
| **发布包两轮扩容** | 六条腿全带 WSDL / SOAP + 数据库（SQLite） |
| **C++ API 无破坏性改动** | 没有删除或改名任何既有符号 |

#### 实测数据

见 `doc/benchmark.md`：

  * **每条空闲连接 4.62 KiB** （八档最小二乘拟合，R² = 0.9999869，外推 100 万连接约 4.42 GiB）；
  * **单事件循环 75k RPS** ；静态 44k RPS / 107 MB/s；
  * **10 分钟 soak 跑 3 840 万请求 ，0 错误**。

### 九、换二进制之前：v1.6.0 的变化

  * **C ++ API 没有破坏性改动**；C ABI 版本仍是 1，本版新增了 db 那一片（81 个 `uvcpp_c_db_*`），没有删除或改名任何既有符号。
  * **发布包的模块集合变了** ：换上 1.6.0 的包之后，`UVCPP_WSDL_ENABLE` 与 `UVCPP_DB_ENABLE` 由 0 变 1。从源码构建的人不受影响——两个开关的默认值仍是 OFF。
  * **包里`uvcpp_db_drivers()` 只打印 sqlite**；要 MySQL / PostgreSQL 就从源码编（默认三个后端都开）。

### 十、这条路走了三年

libuvcpp 不是一时兴起的产物。

三年前，我做了第一版尝试——VLibuv。那是一次不太成熟的探索，暴露了很多问题：接口设计不合理、内存管理混乱、抽象层次没找对。但正是这些踩坑，为后面 libuvcpp 的设计打下了基础。

这三年里，我不断尝试、不断重构，也在结合 AI 辅助编码的方式提高迭代效率。直到 **2026 年 2 月** ，libuvcpp 发布了第一个稳定的 C++ API 封装版本。从那一刻开始，我的工作重心转向了**高级框架功能的设计和开发** ——在 libuvcpp 之上构建真正的 Web 服务能力。

v1.2.0 的 HTTP/2 落地、v1.3.0 的多事件循环横向扩展、v1.4.0 的 SOAP/WSDL 模块、v1.5.0 的 HTTP/3 正式落地、**v1.6.0 的数据库模块与 C ABI 第八片** ，每一步都是这个方向上的重要里程碑。

也特别感谢本仓第一位外部贡献者 [@sercebr](<https://github.com/sercebr>)——仓库里有若干条修复来自他报的 issue。

### 十一、路线图

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| v1.1.0 | 核心封装 + Net + Web + WebApp + SSL，API 稳定 | ✅ 已发布 |
| v1.2.0 | HTTP/2（nghttp2 + ALPN），调试库，性能优化，六平台预编译 | ✅ 已发布 |
| v1.3.0 | 多事件循环横向扩展（`set_loops`），大量性能与语义修复 | ✅ 已发布 |
| v1.4.0 | SOAP/WSDL 模块，JSON 反射，日志模块完善，Linux 多循环内核分流 | ✅ 已发布 |
| v1.5.0 | HTTP/3 正式落地，C# 绑定，六条腿全功能发布包 | ✅ 已发布 |
| **v1.6.0** | **数据库模块（SQLite/MySQL/PostgreSQL），C ABI 第八片（402 函数），QUIC 性能与正确性修复** | ✅ **已发布** |
| 下一版本 | 持续打磨全协议栈、数据库模块易用性提升 | 🚧 开发中 |

### 十二、写在最后：这不是一个人的项目

libuvcpp 的目标很明确：**给 C ++ 一个真正可用、好用、容易上手的 Web 库。**

它不满足于做一个"能跑"的封装层，而是要长期维护、持续演进，逐步补齐现代 Web 应用所需的每一个关键能力——协议、安全、性能、易用性。从 HTTP/1.1 到 HTTP/2，再到 HTTP/3，再到数据库模块，这条路一直在往前走。

但一个人走得快，一群人走得远。

如果你也是那个相信"C++ 可以写 Web 服务"的开发者，如果你也厌倦了在 Java/Python/Node.js 之间做语言妥协，欢迎加入进来。不管是提 issue、写文档、贡献代码，还是仅仅提一个你希望看到的功能——每一点参与，都会让这个还很稚嫩的 C++ Web 库往成熟稳定靠近一步。

**项目地址 ：[Github for libuvcpp](<https://github.com/Antruly/libuvcpp>)**

如果这个项目对你有帮助，欢迎 star 支持。有任何问题或建议，也欢迎通过 GitHub issue 交流。让我们一起，把 C++ Web 这件事做出来。
