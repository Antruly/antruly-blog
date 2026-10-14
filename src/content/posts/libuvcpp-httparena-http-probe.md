---
title: "libuvcpp 入围 HttpArena 与 HttpProbe：轻量级架构，跑出高性能与低内存的双重优势"
published: 2026-10-12
image: "/images/posts/covers/libuvcpp-httparena-http-probe.webp"
updated: 2026-10-13
description: "libuvcpp 作为基于 libuv 的轻量级 C++ Web 框架，在 HttpArena 性能测试中表现卓越，综合得分 3373，位列 C++ 框架第 3。其核心优势在于极低内存占用——如 Baseline 场景仅 113 MiB，Short-lived 场景低至 65 MiB，远低于 drogon、cutelyst 等同类框架。在高并发异步场景下，以 478 MiB 内存实现 72.5 万 RPS 吞吐，资源效率领先。凭借“薄封装”设计，专注 HTTP 协议处理，libuvcpp 在保持高性能的同时"
tags: ["开源", "web", "c++", "websocket", "ssl"]
category: "libuvcpp"
lang: "zh_CN"
author: "Antruly"
sourceLink: "https://blog.csdn.net/qq_41697882/article/details/167704122"
comment: true
---

> 一个基于 libuv 的轻量级 C++ Web 框架，在 HTTP 性能审计平台和 HTTP/1.1 合规性测试中同时交出亮眼成绩——更难得的是，它以**极低的内存占用** 做到了这一切。目前 HTTP/2 部分测试也已展现优异成绩，HTTP/3 测试进展值得持续关注。

### 一、背景：HttpArena 是什么？

2026 年 3 月，运行了 13 年的 TechEmpower Framework Benchmarks 正式停止更新，330 个框架的排名成为历史。接棒者中，**HttpArena** 迅速成为社区认可度最高的 HTTP 框架性能测评平台。

HttpArena 的定位非常明确—— **“不要只说快 ，证明它”** 。它在一个 64 核专用硬件上运行 30 个测试配置，对所有框架施加完全相同的测试条件。与 TechEmpower 相比，HttpArena 最大的不同在于**对作弊行为的零容忍** 。平台内置了代码审计机制，已经处理了多个框架“假实现”的案例，例如：

  * Fletch 框架在 `/upload` 端点直接返回 `Content-Length` 头而不读取请求体，被审计发现并标记
  * Fastify 的 HTTP/2 端点在实现中绕过了框架自身，直接使用 Node 原生 `http2` 模块
  * Blitz 框架在 `/json` 端点中预计算并缓存响应，被判定为不符合基准测试规则

正因为这种严格的审计机制，HttpArena 的成绩被社区视为**真正有公信力的性能数据** 。**libuvcpp 能够入围 HttpArena 的测试名单 ，本身就意味着它的实现通过了平台的代码审计，成绩是真实可信的。**

### 二、HttpArena 实测数据：libuvcpp 的完整成绩单

在 HttpArena 的 HTTP/1.1 综合排行榜上（Emerging / Flagship 类别），libuvcpp 的综合得分为 **3373** ，在全部框架中排名第 **24** 位，在 C++ 框架中排名第 **3** 。

#### 各测试配置详细数据

| 测试配置 | 连接数 | 吞吐量 (Req/sec) | 平均延迟 | p99 延迟 | CPU 占用 | 内存占用 |
| --- | --- | --- | --- | --- | --- | --- |
| Baseline（基准） | 4,096 | **1,141,979** | 3.59ms | 7.69ms | 6099.8% | **113 MiB** |
| Pipelined（流水线） | 4,096 | **3,612,234** | 18.18ms | 36.40ms | 5953.6% | **135 MiB** |
| Short-lived（短连接） | 4,096 | **907,798** | 4.39ms | 84.90ms | 5545.2% | **65 MiB** |
| Async Delay（异步延迟） | 32,000 | **725,202** | 43.77ms | 69.90ms | 5367.4% | **478 MiB** |
| Latency-10K（延迟） | 1,024 | **9,983** | 79.9μs | 125.0μs | 40.5% | **59 MiB** |

> 数据来源：HttpArena libuvcpp 详情页（<https://www.http-arena.com/frameworks/libuvcpp/>），Alpha Round，26 runs。吞吐量取三次测试的最优值，延迟、CPU 和内存来自该次运行。

#### C++ 框架横向对比

在 HttpArena 的 C++ 框架专页中，各 C++ 框架的 HTTP/1.1 综合得分与资源占用对比如下：

| 框架 | 类型 | 综合得分 | 总排名 | C++ 内排名 |
| --- | --- | --- | --- | --- |
| hical | Experimental | 6266 | 3 of 6 | — |
| agensio | Infrastructure | 4949 | 1 of 6 | — |
| drogon | Flagship | 4345 | 15 of 76 | 1 of 4 |
| cutelyst | Flagship | 4322 | 16 of 76 | 2 of 4 |
| **libuvcpp** | **Emerging** | **3373** | **24 of 76** | **3 of 4** |
| userver | Flagship | 3190 | 29 of 76 | 4 of 4 |
| proxygen | Engine | 1227 | 30 of 37 | 1 of 2 |

> 数据来源：HttpArena C++ 框架对比页（<https://www.http-arena.com/frameworks/lang/cpp/>）

**libuvcpp 以 3373 的综合得分 ，在 C++ 框架中排名第 3**，超越了功能完备性更高的 userver（3190）。更值得注意的是，libuvcpp 被归类为 **Emerging** 类型，而 drogon 和 cutelyst 均为 **Flagship** 全栈框架——这意味着 libuvcpp 以更轻量的定位，在核心 HTTP 处理能力上已经具备了很强的竞争力。

#### 关键对比：内存与 CPU 效率

这才是 libuvcpp 真正拉开差距的地方。以下将 libuvcpp 与 drogon、cutelyst、userver 在关键测试场景中进行资源占用对比：

| 测试场景 | 指标 | **libuvcpp** | drogon | cutelyst | userver |
| --- | --- | --- | --- | --- | --- |
| **Baseline** | 内存 | **113 MiB** | 147 MiB | 225 MiB | 437 MiB |
|  | RPS | 1.14M | 2.02M | 2.15M | 0.95M |
| **Pipelined** | 内存 | **135 MiB** | 188 MiB | 196 MiB | 884 MiB |
|  | RPS | 3.61M | 7.80M | 10.17M | 1.40M |
| **Short-lived** | 内存 | **65 MiB** | **1.3 GiB** | 721 MiB | 583 MiB |
|  | RPS | 908K | 1.69M | 1.74M | 899K |
| **Async Delay** | 内存 | **478 MiB** | 572 MiB | **1.4 GiB** | **2.8 GiB** |
|  | RPS | 725K | 143K | 762K | 409K |
| **Latency-10K** | 内存 | **59 MiB** | 72 MiB | 80 MiB | 193 MiB |
|  | CPU | **40.5%** | 30.5% | 32.2% | 84.7% |
| **JSON TLS** | 内存 | **646 MiB** | 506 MiB | 756 MiB | 630 MiB |
|  | RPS | 371K | 253K | 327K | 562K |

> 数据来源：各框架 HttpArena 详情页（libuvcpp：<https://www.http-arena.com/frameworks/libuvcpp/>；drogon：<https://www.http-arena.com/frameworks/drogon/>；cutelyst：<https://www.http-arena.com/frameworks/cutelyst/>；userver：<https://www.http-arena.com/frameworks/userver/>）

**从表格中可以清晰看到 libuvcpp 的效率优势 ：**

**1\. 内存占用显著低于同类框架**

  * **Baseline 场景** ：libuvcpp 仅占 **113 MiB** ，而 drogon 需要 147 MiB（多 30%），cutelyst 需要 225 MiB（多 99%），userver 需要 437 MiB（多 287%）
  * **Short-lived 场景** ：差距最为悬殊——libuvcpp 仅需 **65 MiB** ，而 drogon 的内存占用飙升至 **1.3 GiB** ，是 libuvcpp 的 **20 倍** ；cutelyst 也高达 721 MiB，是 libuvcpp 的 **11 倍**
  * **Async Delay 场景** （32,000 并发连接）：libuvcpp 占用 **478 MiB** ，而 cutelyst 需要 **1.4 GiB** （近 3 倍），userver 更是需要 **2.8 GiB** （近 6 倍）
  * **Latency-10K 场景** ：libuvcpp 仅 **59 MiB** ，userver 需要 193 MiB（3.3 倍），cutelyst 需要 80 MiB，drogon 需要 72 MiB

**2\. CPU 效率出色**

在 Latency-10K 测试中，libuvcpp 的 CPU 占用仅为 **40.5%** ，在 C++ 框架中处于最低水平（drogon 30.5% 略低，但 drogon 在该场景下的内存占用为 72 MiB，高于 libuvcpp 的 59 MiB）。相比之下，userver 在该场景下的 CPU 占用高达 **84.7%** ，是 libuvcpp 的两倍以上。

**3\. 低资源占用下的高吞吐**

在 Async Delay 场景（32,000 并发连接）中，libuvcpp 以 **478 MiB** 的内存占用实现了 **725K RPS** 的吞吐量，而 drogon 以 **572 MiB** 的内存仅实现了 **143K RPS** ——libuvcpp 的每 MiB 内存吞吐量是 drogon 的 **6 倍以上** 。这充分说明 libuvcpp 在**高并发异步处理** 方面具有极高的资源效率。

### 三、为什么 libuvcpp 能做到如此低的内存占用？

libuvcpp 的内存效率源于其**轻量级的架构设计** 。

libuvcpp 是基于 libuv 的现代 C++11 封装库，在 libuv 的事件循环、句柄和请求之上，提供了一层**薄而符合 C ++ 习惯的封装**——保持 libuv 性能的同时，引入 RAII 资源管理、std::function 回调，以及面向 TCP、UDP、HTTP 和 WebSocket 的高级抽象。

与 drogon、cutelyst 这类全栈框架不同，libuvcpp 的 **completeness factor 仅为 4/4 ，但定位为 Emerging 类型**——它不内置 ORM、模板引擎、依赖注入等“重型”组件，而是专注于**把 HTTP 协议处理和事件循环做到极致** 。这种“薄封装”的设计理念，使得 libuvcpp 在运行时不需要为框架自身的功能模块分配大量内存。

**核心特性 ：**

| 特性 | 说明 |
| --- | --- |
| 定位 | 轻量级 C++ Web 服务框架 |
| 双模式 | 异步回调 / 同步等待 |
| HTTP/1.1 | 完整支持，合规性 157/159 |
| HTTP/2 | 基于 nghttp2 静态链入，ALPN 协商，部分测试已取得优异成绩 |
| HTTP/3 | 尚未完全实现，后续持续关注 |
| WebSocket | RFC 6455 完整实现 |
| SSL/TLS | 基于 OpenSSL 封装 |
| 平台 | Windows x64/arm64、Linux x64/arm64 |
| 许可证 | MIT |

项目地址：<https://github.com/Antruly/libuvcpp>

### 四、HttpProbe：HTTP/1.1 合规性评分 157/159，排名第 6

性能只是衡量框架的一个维度。一个 HTTP 框架能否正确处理畸形请求、防止请求走私（Request Smuggling）、以及符合 RFC 规范，直接关系到生产环境的安全。

**HttpProbe** （http-probe.com）正是为此而生的——它对每个框架发送特定构造的畸形或歧义 HTTP 请求，并将服务器响应与精确期望的状态码进行比对。测试覆盖合规性（Compliance）、请求走私（Smuggling）、畸形输入（Malformed Input）和规范化（Normalization）四大类别。

#### libuvcpp 成绩

> **合规性评分 ：157 / 159 | 排名：第 6**

在 HttpProbe 的排名中，libuvcpp 位列第 6，评分 157/159。**作为第 6 名中唯一的 C ++ 框架，这一成绩尤为突出。** 对比其他主流框架的表现：

| 框架 | 语言 | 合规性得分 | 失败数 |
| --- | --- | --- | --- |
| Effinitive | C# | 161 | 0 |
| FastPySGI | Python | 145 + 14 | 2 |
| Node | JavaScript | 133 + 19 | 9 |
| Express | JavaScript | 133 + 18 | 10 |
| Jetty | Java | 126 + 24 | 11 |
| Uvicorn | Python | 127 + 20 | 14 |
| Envoy | C++ | 118 + 24 | 19 |
| Ntex | Rust | 114 + 23 | 24 |
| Tomcat | Java | 113 + 20 | 28 |
| Bun | JavaScript | 109 + 22 | 30 |
| Actix | Rust | 101 + 26 | 34 |
| H2O | C | 101 + 26 | 34 |
| Hyper | Rust | 90 + 34 | 37 |
| **libuvcpp** | **C++** | **157** | **—** |

> 数据来源：HttpProbe 结果页（<https://www.http-probe.com/probe-results/>）

从表格中可以看到，**libuvcpp 的 157/159 合规性评分在所有 C ++ 框架中名列前茅**（对比 Envoy 的 118 + 24 分，H2O 的 101 + 26 分），甚至超过了 Rust 生态中广受好评的 Actix（101 + 26 分）和 Hyper（90 + 34 分），以及 Java 生态的 Tomcat（113 + 20 分）和 Jetty（126 + 24 分）。

**HTTP/1.1 合规性 157/159 意味着 libuvcpp 在几乎所有的边界情况和安全测试中都做出了正确的响应** ——这对于生产环境的稳定性至关重要。

### 五、libuvcpp 的核心优势总结

**1\. 轻量级架构 ，内存占用极低**

libuvcpp 最大的差异化优势在于**极低的内存占用** 。在 Baseline 场景中仅需 113 MiB 内存，在 Short-lived 场景中仅需 65 MiB——而同场景下 drogon 的内存占用高达 **1.3 GiB** ，是 libuvcpp 的 **20 倍** 。对于需要**大量实例部署** 或**资源受限环境** （如容器、边缘计算）的场景，这一优势意味着可以在同样的硬件上运行更多的服务实例。

**2\. 低资源占用下的高吞吐效率**

在 Async Delay（32,000 并发连接）场景中，libuvcpp 以 478 MiB 的内存实现了 725K RPS，而 drogon 以 572 MiB 的内存仅实现了 143K RPS——**libuvcpp 的每 MiB 内存吞吐量是 drogon 的 6 倍以上** 。在 Latency-10K 场景中，libuvcpp 的 CPU 占用仅为 40.5%，而 userver 高达 84.7%。

**3\. 通过 HttpArena 代码审计 ，成绩可信**

HttpArena 对作弊行为的严格审计在社区中有目共睹。libuvcpp 能够入围测试名单并通过审计，意味着它的实现符合平台的基准测试规则，成绩是经过验证的真实数据。

**4\. JSON TLS 场景表现突出**

在 HTTP/1.1 合规性评分中，libuvcpp 以 **157/159** 的成绩排名第 6，是排名前 10 中唯一的 C++ 框架。在 JSON TLS 场景中，libuvcpp 以 371K RPS 的吞吐量超过了 drogon（253K）和 cutelyst（327K），在加密传输场景下展现了优异的性能。

**5\. C ++ Web 服务生态的重要补充**

C++ 在 Web 服务领域长期缺少轻量、好用、容易上手的框架。libuvcpp 站在 libuv 的肩膀上——libuv 是 Node.js 的底层异步事件引擎，经过大规模生产验证。libuvcpp 保留了 libuv 的性能优势，同时让 C++ 开发者能够用熟悉的 RAII 和 std::function 范式来构建 Web 服务。

**6\. HTTP/2 部分测试已展现优异表现 ，HTTP/3 值得期待**

需要特别说明的是，目前 libuvcpp 的 **HTTP/2 与 HTTP/3 测试尚未完全实现** ，因此本文暂不列出完整的 H2/H3 排名数据。但在已经完成的 **HTTP/2 部分测试** 中，libuvcpp 取得了**优异的成绩** ，这表明其底层对多路复用、头部压缩、二进制帧等核心机制具备良好支撑。后续我们将持续关注 HttpArena 与 HttpProbe 的 H2/H3 测试更新，第一时间同步最新数据。

### 六、快速上手

```bash
git clone https://github.com/Antruly/libuvcpp.git
cd libuvcpp
mkdir build && cd build
cmake .. -DUVCPP_BUILD_WEB=ON
cmake --build . -j
```

### 七、数据来源汇总

| 平台 | 用途 | 地址 |
| --- | --- | --- |
| HttpArena 排行榜 | 性能测试综合排名 | [https://www.http-arena.com](https://www.http-arena.com) |
| HttpArena C++ 对比页 | C++ 框架横向对比 | [https://www.http-arena.com/frameworks/lang/cpp/](https://www.http-arena.com/frameworks/lang/cpp/) |
| HttpArena libuvcpp 详情 | libuvcpp 各项测试数据 | [https://www.http-arena.com/frameworks/libuvcpp/](https://www.http-arena.com/frameworks/libuvcpp/) |
| HttpArena drogon 详情 | drogon 各项测试数据 | [https://www.http-arena.com/frameworks/drogon/](https://www.http-arena.com/frameworks/drogon/) |
| HttpArena cutelyst 详情 | cutelyst 各项测试数据 | [https://www.http-arena.com/frameworks/cutelyst/](https://www.http-arena.com/frameworks/cutelyst/) |
| HttpArena userver 详情 | userver 各项测试数据 | [https://www.http-arena.com/frameworks/userver/](https://www.http-arena.com/frameworks/userver/) |
| HttpProbe | HTTP/1.1 合规性测试 | [https://www.http-probe.com](https://www.http-probe.com) |
| HttpProbe 详细结果 | 各类别测试明细 | [https://www.http-probe.com/probe-results/](https://www.http-probe.com/probe-results/) |
| libuvcpp 项目 | 源码与文档 | [https://github.com/Antruly/libuvcpp](https://github.com/Antruly/libuvcpp) |
| HttpArena 项目 | 基准测试平台源码 | [https://github.com/MDA2AV/HttpArena](https://github.com/MDA2AV/HttpArena) |

* * *

_本文数据截至 2026 年 10 月 ，各平台实时数据请以官网为准。HTTP/2 与 HTTP/3 完整测试进展请持续关注官方更新。_
