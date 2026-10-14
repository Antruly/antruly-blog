---
title: "用 C++ 写 Web 服务实战（五）：SSL/TLS、HTTP/2 与生产环境部署"
published: 2026-09-26
image: "/images/posts/covers/libuvcpp-web-guide-05.webp"
description: "本文实战C++ Web服务的生产部署，涵盖SSL/TLS加密（通过OpenSSL配置证书与验证模式）、HTTP/2多路复用（基于nghttp2实现ALPN自动协商）、以及内存池调优（Expand模块提升高并发性能）。强调HTTPS必开、自签名证书仅限开发，且明确不支持明文HTTP/2（h2c），确保安全与兼容性。零配置启用HTTP/2，内存池需显式开启，适用于高RPS场景，预编译包强制锁定分配器以避免隐性错误。"
tags: ["c++", "ssl", "web", "http", "uv"]
category: "libuvcpp"
lang: "zh_CN"
author: "Antruly"
sourceLink: "https://blog.csdn.net/qq_41697882/article/details/166647954"
series: "用 C++ 写 Web 服务实战"
seriesOrder: 5
comment: true
---

前四篇我们从零搭起了 Web 应用，走完了路由、中间件、文件上传、WebSocket 实时通信和服务端推送。到这为止，你的 C++ 服务在功能层面已经完整了。但**功能完整不等于可以上线** ——生产环境还差三件事：**HTTPS 加密、HTTP/2 协议升级、以及一套可靠的部署方案** 。

这篇进入实战系列的收官之战：**SSL/TLS 配置、HTTP/2 启用、内存池调优、以及生产环境部署的完整实践。**

### 一、SSL/TLS：从 HTTP 到 HTTPS

#### 1.1 构建时开启 OpenSSL

SSL 模块默认关闭，需要在 CMake 阶段显式开启：

```bash
cmake .. -DCMAKE_BUILD_TYPE=Release \
  -DUVCPP_BUILD_WEB=ON \
  -DUVCPP_BUILD_WEBAPP=ON \
  -DUVCPP_ENABLE_OPENSSL=ON
```

开启后，`uvcpp_ssl_context` 和 `uvcpp_ssl` 两个类可用。前者管理 SSL/TLS 上下文（证书加载、验证模式），后者是每连接的 SSL 封装（握手、读写、关闭）。

链接时需要额外带上 OpenSSL：

```bash
g++ -std=c++11 main.cpp \
  -luvcpp_webapp -luvcpp_web -luvcpp -luv \
  -lssl -lcrypto
```

#### 1.2 配置 SSL 上下文

`uvcpp_web_app` 通过 `enable_ssl()` 接收一个 `uvcpp_ssl_context*`，启用后所有 HTTP 和 WebSocket 连接自动走 TLS：

```cpp
#include <webapp/uvcpp_web_app.h>
#include <ssl/uvcpp_ssl_context.h>
using namespace uvcpp;

int main() {
    uvcpp_ssl_context ctx;

    // 加载证书和私钥
    if (ctx.load_certificate("cert.pem", "key.pem") != 0) {
        std::cerr << "证书加载失败" << std::endl;
        return 1;
    }

    uvcpp_web_app app;
    app.set_port(443);           // HTTPS 标准端口
    app.set_host("0.0.0.0");

    // 启用 SSL
    app.enable_ssl(&ctx);

    app.get("/", [](uvcpp_web_request&, uvcpp_web_response& resp,
                    uvcpp_web_next) {
        resp.json_str("{\"secure\":true}");
        resp.end();
    });

    app.start();
    app.join();
    return 0;
}
```

**几个关键点 ：**

**`enable_ssl()` 必须在 `start()` 之前调用。** 它在启动时配置监听 socket 和所有连接的 TLS 参数。

**证书和私钥路径支持 PEM 格式。** `load_certificate()` 的第一个参数是证书链文件，第二个是私钥文件。如果证书链包含中间 CA，把它们按顺序拼在同一个 PEM 文件里。

**WebSocket 自动升级为 WSS。** 启用 SSL 后，`app.websocket()` 注册的端点自动走 `wss://`，客户端只需要把连接 URL 从 `ws://` 改成 `wss://`，服务端代码零改动。

#### 1.3 自签名证书（开发环境）

开发阶段不需要买 CA 证书，用 OpenSSL 命令行生成自签名证书即可：

```bash
# 生成私钥
openssl genrsa -out key.pem 2048

# 生成自签名证书（有效期 365 天）
openssl req -new -x509 -key key.pem -out cert.pem -days 365 \
  -subj "/CN=localhost"
```

用这个证书启动服务后，浏览器会提示“不安全”——因为自签名证书不在系统信任链中。开发时忽略即可，生产环境必须使用 CA 签发的证书（Let’s Encrypt 免费申请）。

#### 1.4 客户端证书验证模式

`uvcpp_ssl_context` 支持三种验证模式：

| 模式 | 行为 |
| --- | --- |
| `tls_verify_mode::NONE` | 不验证对端证书 |
| `tls_verify_mode::PEER` | 验证对端证书是否由受信任 CA 签发 |
| `tls_verify_mode::PEER_STRICT` | 验证证书 + **校验主机名** |

**`PEER_STRICT` 在客户端侧真的会校验主机名。** 连接时收到的名字（`connect()` 传入的域名或 IP）被钉给证书——数字 IP 字面量走 `X509_VERIFY_PARAM_set1_ip_asc()`，其余走 `set1_host()`。名字对不上的对端**建立不起来** 。

这一点在 libuvcpp 1.3.0 中是一个重要的安全修复：在此之前，`PEER_STRICT` 与 `PEER` 完全等价，主机名校验实际上是缺失的。如果你在用旧版本做客户端 HTTPS 调用，升级到 1.3.0 后能真正防御中间人攻击。

**服务端侧`PEER_STRICT` 至今仍与 `PEER` 等价**——libuvcpp 的服务端不发 SNI、也不要求客户端证书，没有可校验的名字。服务端配置 `PEER_STRICT` 不会报错，但实际行为等同于 `PEER`。

### 二、HTTP/2：多路复用与头部压缩

#### 2.1 构建时开启 nghttp2

HTTP/2 基于 nghttp2 静态链入，需要显式开启：

```bash
cmake .. -DCMAKE_BUILD_TYPE=Release \
  -DUVCPP_BUILD_WEB=ON \
  -DUVCPP_BUILD_WEBAPP=ON \
  -DUVCPP_ENABLE_OPENSSL=ON \
  -DUVCPP_ENABLE_NGHTTP2=ON
```

**`UVCPP_ENABLE_NGHTTP2` 在 `UVCPP_ENABLE_OPENSSL=OFF` 时会强制关闭**——给一条 warning，而不是留一个根本跑不起来的配置。因为 libuvcpp 的 HTTP/2 **只走 TLS + ALPN**，没有明文形态。

#### 2.2 设计取舍：为什么不做 h2c

libuvcpp 的 HTTP/2 在协议支持上做了一个明确的选择：**只走 TLS + ALPN**。

不做的事情包括：

  * **不做 h2c** （明文 HTTP/2）——没有 ALPN 就没有可协商的东西
  * **不做 prior-knowledge** ——客户端无法在连接前声明“我只说 h2”
  * **不做 RFC 8441** ——WebSocket 的 HTTP/2 扩展
  * **不做`:protocol`**——Extended CONNECT 方法

这是一个经过深思熟虑的取舍。h2c 在实际部署中很少使用（主流浏览器只通过 ALPN 协商 HTTP/2），维护两套握手路径的复杂度远大于收益。如果你的场景确实需要 h2c，要么用 HTTP/1.1，要么在前面挡一个 Nginx 做协议转换。

#### 2.3 WebApp 零配置自动协商

在 `uvcpp_web_app` 层面，**HTTP/2 是零配置自动协商的** ——只要构建时开启了 nghttp2，框架自动在 ALPN 中同时声明 h2 和 http/1.1：

```cpp
uvcpp_web_app app;
app.set_port(443);
app.enable_ssl(&ctx);      // 启用 TLS

// 不需要手动 set_http2_enabled()
// app 内部自动进行 ALPN 协商：
//   客户端支持 h2 → 走 HTTP/2
//   客户端只支持 h1.1 → 降级到 HTTP/1.1

app.get("/", handler);
app.start();
```

前端和后端都不需要任何改动。浏览器发起 HTTPS 连接时，TLS 握手的 ALPN 扩展中会携带客户端支持的协议列表，服务端选择 h2 或 http/1.1。**如果客户端是 HTTP/1.1-only 的 （比如某些老旧 API 客户端），自动降级，不会断连。**

#### 2.4 底层 HTTP 客户端的显式开启

如果你直接使用 `uvcpp_http_client` / `uvcpp_http_server`（不走 webapp），HTTP/2 默认是关闭的，需要显式调用：

```cpp
uvcpp_http_client client;
client.set_http2_enabled(true);
client.get("https://example.com/api", callback);
```

`uvcpp_http_server` 同理，`set_http2_enabled(true)` 后才能接受 h2 连接。

#### 2.5 已知待办：流级背压

HTTP/2 在协议层已经实现了流级背压（`pause_stream()` / `resume_stream()`、`peer_window_size()`），但**框架侧暂无应用层调用方** ——也就是说，h2 上“边收边给”的流式请求体目前还不可达。这是下一阶段的重点之一。

对于大多数 REST API 场景（请求体较小、一次性接收），这不构成问题。只有大文件流式上传或服务端推送场景需要关注这个限制。

### 三、内存池：Expand 模块

#### 3.1 启用方式

Expand 是 TCMalloc 风格的内存池——页堆、span 分配器、线程缓存、enterprise 分配器。用于降低高频异步场景下的分配开销。

**自 v1.1.0 起默认关闭** ，需要显式开启：

```bash
cmake .. -DUVCPP_BUILD_EXPAND=ON
```

#### 3.2 预编译包的分配器锁定

预编译产物是**带池发布** 的。如果你用的是预编译包，包里 `uvcpp/uvcpp_config.h` 已经给定了实际使用的分配器配置。**自己再定义成别的值会直接`#error`**，而不是静默的分配器错配。这个设计是为了防止“编译时以为用池、实际没用”的隐性 bug。

源码构建时，开启 Expand 后 `uvcpp_config.h` 中的 `UVCPP_USE_EXPAND` 会被自动设置为 1，所有 `uvcpp_*` 容器的默认分配器切换到池。

#### 3.3 使用建议

| 场景 | 建议 |
| --- | --- |
| 高并发 API 服务（RPS > 50k） | 开启 Expand |
| 低并发内部工具 | 保持关闭，简化调试 |
| 长时间运行的服务 | 开启，减少内存碎片 |
| 调试内存问题 | 关闭，用系统 malloc 配合 ASan |

开启 Expand 后，内存分配走池的快速路径，但**调试难度增加** ——ASan、Valgrind 等工具可能无法正确追踪池内分配。建议在开发阶段用系统分配器，生产环境再切到 Expand。

### 四、生产环境部署

#### 4.1 systemd 服务单元

C++ 服务以守护进程方式运行，用 systemd 管理：

```ini
# /etc/systemd/system/myapp.service
[Unit]
Description=libuvcpp Web Service
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/myapp
ExecStart=/opt/myapp/bin/myapp
Restart=on-failure
RestartSec=5

# 优雅关闭：SIGTERM 触发 app.stop()
KillSignal=SIGTERM
TimeoutStopSec=10

# 资源限制
LimitNOFILE=65536
LimitNPROC=4096

# 安全加固
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

**关键配置 ：**

**`KillSignal=SIGTERM`**——systemd 默认发 SIGTERM，这正是 `app.stop()` 期望的信号。配合 `set_shutdown_grace_ms()` 设置的宽限期，正在处理的请求会完成后再退出。

**`LimitNOFILE=65536`**——C++ 服务通常要承载大量连接，默认的 1024 文件描述符上限远远不够。100 万空闲连接约消耗 4.42 GiB 内存，文件描述符是比内存更早遇到的瓶颈。

**`Restart=on-failure`**——崩溃后自动重启，配合 `RestartSec=5` 避免频繁重启风暴。

#### 4.2 反向代理：Nginx 前置

生产环境**强烈建议在 libuvcpp 前面挡一个 Nginx** 。原因：

| 职责 | 交给 Nginx | 交给 libuvcpp |
| --- | --- | --- |
| TLS 终止 | ✅ | 可选 |
| 静态文件 | ✅（sendfile/缓存） | 内网场景可用 |
| 限流/防 DDoS | ✅ | 自己实现 |
| 访问日志 | ✅ | 自己实现中间件 |
| 业务逻辑 | ❌ | ✅ |

**TLS 终止放在 Nginx** ，libuvcpp 只处理明文 HTTP/1.1：

```nginx
upstream myapp {
    server 127.0.0.1:8080;
    keepalive 64;
}

server {
    listen 443 ssl http2;
    server_name example.com;

    ssl_certificate /etc/ssl/certs/example.com.pem;
    ssl_certificate_key /etc/ssl/private/example.com.key;
    ssl_protocols TLSv1.2 TLSv1.3;

    location / {
        proxy_pass http://myapp;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

这样 libuvcpp 不需要启用 OpenSSL，构建更简单，也不会因为 TLS 握手消耗工作循环的 CPU。**Nginx 的`keepalive 64`** 保持到后端的持久连接，减少 TCP 握手开销。

如果确实需要 libuvcpp 直接处理 TLS（比如内网服务间 mTLS），再启用 SSL 模块。

#### 4.3 日志轮转

生产环境的日志文件不能无限增长。用 logrotate 管理：

```
# /etc/logrotate.d/myapp
/var/log/myapp/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 0640 www-data www-data
    postrotate
        systemctl reload myapp 2>/dev/null || true
    endscript
}
```

**注意 ：** 如果服务用 `std::ofstream` 打开日志文件并持有句柄，logrotate 的 `create` 操作后，服务仍然写入已被重命名的旧文件。需要 **`copytruncate`** 模式：

```
/var/log/myapp/access.log {
    daily
    rotate 30
    copytruncate
    ...
}
```

`copytruncate` 复制文件内容后截断原文件，服务持有的文件句柄不受影响。代价是在复制和截断之间可能有极少量日志丢失，对访问日志来说可以接受。

更优雅的方案是**用 syslog 或 journald** 替代直接写文件——服务只写 stdout/stderr，由 systemd 接管日志收集和轮转：

```ini
[Service]
StandardOutput=journal
StandardError=journal
```

#### 4.4 进程数策略

`set_loops(n)` 在一个进程内利用多核。**不需要也不建议用多个进程 + SO_REUSEPORT**——libuvcpp 的多循环已经覆盖了多核利用，多个进程反而增加管理复杂度（端口冲突、日志交错、信号处理）。

推荐的循环数：

| CPU 核心数 | `set_loops(n)` |
| --- | --- |
| 2 核 | 2 |
| 4 核 | 4 |
| 8 核 | 8 |
| 16 核 | 8–12 |

**不要设到 CPU 核心数以上** ——多余的循环只会增加上下文切换开销。`n` 的上限是 64（`set_loops` 在 `n > 64` 时返回 `UV_EINVAL`）。

#### 4.5 优雅关闭的信号处理

结合 systemd 的 `KillSignal=SIGTERM`，应用侧的信号处理：

```cpp
#include <csignal>
#include <atomic>

static std::atomic<uvcpp_web_app*> g_app{nullptr};
static std::atomic<bool> g_shutting_down{false};

static void signal_handler(int) {
    if (g_shutting_down.exchange(true)) return;
    auto* app = g_app.load();
    if (app) {
        app->stop();   // 触发优雅关闭
    }
}

int main() {
    uvcpp_web_app app;
    app.set_port(8080);
    app.set_shutdown_grace_ms(5000);   // 5 秒宽限期

    // ... 路由和中间件 ...

    app.start();
    g_app.store(&app);

    std::signal(SIGTERM, signal_handler);
    std::signal(SIGINT, signal_handler);

    app.join();
    return 0;
}
```

`systemctl stop myapp` → systemd 发 SIGTERM → 应用调 `stop()` → 等待宽限期 → 退出。整个链路是干净的。

### 五、完整示例：生产级配置

```cpp
#include <webapp/uvcpp_web_app.h>
#include <fstream>
#include <mutex>
#include <ctime>
#include <csignal>
#include <atomic>
#include <iostream>

using namespace uvcpp;

static std::atomic<uvcpp_web_app*> g_app{nullptr};
static std::atomic<bool> g_shutting_down{false};

static void signal_handler(int) {
    if (g_shutting_down.exchange(true)) return;
    auto* app = g_app.load();
    if (app) {
        std::cout << "Shutting down..." << std::endl;
        app->stop();
    }
}

int main() {
    uvcpp_web_app app;
    app.set_host("0.0.0.0").set_port(8080);
    app.set_shutdown_grace_ms(5000);
    app.set_idle_timeout_ms(60000);      // 闲置 60 秒断开
    app.set_max_body_size(10 * 1024 * 1024);  // 请求体上限 10 MB

    // 多核利用：4 条工作循环
    const int rc = app.set_loops(4);
    if (rc != 0) {
        std::cerr << "set_loops failed: " << rc << std::endl;
        return 1;
    }

    // 业务路由
    app.get("/health", [](uvcpp_web_request&, uvcpp_web_response& resp,
                          uvcpp_web_next) {
        resp.json_str("{\"status\":\"ok\"}");
        resp.end();
    });

    app.get("/api/data", [](uvcpp_web_request&, uvcpp_web_response& resp,
                            uvcpp_web_next) {
        resp.json_str("{\"data\":[1,2,3]}");
        resp.end();
    });

    // 静态资源（如果 Nginx 已经处理，可以省略）
    // app.serve_static("/assets", "./public", true);

    app.start();
    g_app.store(&app);

    std::signal(SIGTERM, signal_handler);
    std::signal(SIGINT, signal_handler);

    std::cout << "Server on :8080, 4 loops" << std::endl;
    app.join();
    std::cout << "Server stopped." << std::endl;
    return 0;
}
```

### 六、本篇小结与系列总结

这篇覆盖了从“能跑”到“能上线”的关键跨越：

**SSL/TLS** ——`enable_ssl()` 接收 `uvcpp_ssl_context*`，加载 PEM 证书，WebSocket 自动升级为 WSS。`PEER_STRICT` 在客户端侧真正校验主机名。

**HTTP/2** ——`UVCPP_ENABLE_NGHTTP2=ON` 构建时开启，webapp 零配置自动 ALPN 协商，底层客户端需手动 `set_http2_enabled(true)`。只走 TLS + ALPN，不做 h2c。

**内存池** ——`UVCPP_BUILD_EXPAND=ON` 启用，预编译包的分配器配置锁定在 `uvcpp_config.h`，不建议覆盖。

**生产部署** ——systemd 管理进程、Nginx 前置代理、logrotate 或 journald 管理日志、`set_loops(n)` 匹配 CPU 核心数、信号处理配合优雅关闭。

**系列总结 ：** 五篇文章走完了 libuvcpp Web 开发的完整路径——

| 篇目 | 核心内容 |
| --- | --- |
| 第一篇 | 应用创建、监听端口、静态目录、性能规划、日志中间件 |
| 第二篇 | 路由参数、中间件链、流式请求体、文件上传 |
| 第三篇 | WebSocket 端点、连接生命周期、广播模型 |
| 第四篇 | 定时器推送、SSE、连接监控、心跳保活、优雅关闭 |
| 第五篇 | SSL/TLS、HTTP/2、内存池、生产部署 |

如果你跟着走完了这五篇，现在应该能独立用 C++ 写出一个可上生产环境的 Web 服务了。从功能到性能，从开发到部署，这条路径已经完整。

后续如果还想深入，可以关注 HTTP/2 流级背压的应用层打通、HTTP/3（QUIC）的进展、以及 Expand 内存池的内部实现原理。欢迎在 [GitHub Issues](<https://github.com/Antruly/libuvcpp/issues>) 提出你感兴趣的下一站。
