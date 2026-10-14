---
title: "展望未来：libuvcpp 的下一站——从“入围者”到“最好用的 C++ Web 框架”"
published: 2026-10-13
image: "/images/posts/covers/libuvcpp-next-stop.webp"
description: "libuvcpp 作为新兴 C++ Web 框架，已在 HttpArena 和 HttpProbe 中展现强劲实力：性能领先、内存占用极低、合规性接近满分。尽管当前仍处“Emerging”阶段，但其轻量架构与高效设计为未来突破奠定基础。下一步将聚焦 HTTP/3 支持、开发体验优化（如 CLI 脚手架、热重载、OpenTelemetry 集成），并强化 AI 友好生态。若持续迭代，有望从“优秀”迈向“最好用的 C++ Web 框架”。"
tags: ["c++", "uv", "web", "http", "开源"]
category: "libuvcpp"
lang: "zh_CN"
author: "Antruly"
sourceLink: "https://blog.csdn.net/qq_41697882/article/details/167704589"
comment: true
---

> libuvcpp 还很年轻。它刚刚在 HttpArena 和 HttpProbe 上证明了自己，但这只是起点，不是终点。
>
> 这篇文章不吹嘘已经做到的事，而是想认真聊聊：**一个刚刚起步的 C ++ Web 框架，未来能走到多高？**

### 一、先看现在的底子：数据不会撒谎

在谈未来之前，先回顾 libuvcpp 目前已经拿到的成绩。这些数据来自公开测试平台，是它继续往上走的“地基”。

#### 1.1 HttpArena：C++ 框架中排名第 3

在 HttpArena 的 HTTP/1.1 综合排行榜上（Emerging / Flagship 类别），libuvcpp 的综合得分为 **3373** ，在全部框架中排名第 **24** ，在 C++ 框架中排名第 **3** ，这个对于轻量级服务框架已经很不错了。

| 框架 | 类型 | 综合得分 | 总排名 | C++ 内排名 |
| --- | --- | --- | --- | --- |
| drogon | Flagship | 4408 | 13 of 76 | 1 of 4 |
| cutelyst | Flagship | 4380 | 15 of 76 | 2 of 4 |
| **libuvcpp** | **Emerging** | **3373** | **24 of 76** | **3 of 4** |
| userver | Flagship | 3190 | 29 of 76 | 4 of 4 |

> 数据来源：<https://www.http-arena.com/frameworks/lang/cpp/>

**注意一个关键事实 ：libuvcpp 被归类为 Emerging，而 drogon 和 cutelyst 是 Flagship。** 这意味着 libuvcpp 以更轻量的定位、更少的“重型组件”，在核心 HTTP 处理能力上已经逼近全栈框架。

#### 1.2 内存与吞吐：轻量级架构的硬实力

| 测试场景 | 指标 | **libuvcpp** | drogon | cutelyst | userver |
| --- | --- | --- | --- | --- | --- |
| **Baseline** | 内存 | **113 MiB** | 147 MiB | 225 MiB | 437 MiB |
|  | RPS | 1.14M | 2.02M | 2.15M | 0.95M |
| **Short-lived** | 内存 | **65 MiB** | **1.3 GiB** | 721 MiB | 583 MiB |
|  | RPS | 908K | 1.69M | 1.74M | 899K |
| **Async Delay** | 内存 | **478 MiB** | 572 MiB | **1.4 GiB** | **2.8 GiB** |
|  | RPS | **725K** | 143K | 762K | 409K |
| **JSON TLS** | RPS | **371K** | 253K | 327K | 562K |
| **Latency-10K** | CPU | **40.5%** | 30.5% | 32.2% | **84.7%** |

> 数据来源：各框架 HttpArena 详情页，例如 <https://www.http-arena.com/frameworks/libuvcpp/>

**几个关键结论 ：**

  * Baseline 内存仅 **113 MiB** ，是 userver 的 1/4、cutelyst 的 1/2。
  * Short-lived 内存仅 **65 MiB** ，而 drogon 高达 **1.3 GiB** ，相差 **20 倍** 。
  * Async Delay 场景下，libuvcpp 以 **478 MiB** 实现 **725K RPS** ，吞吐量是 drogon 的 **5 倍以上** ，内存却只有 cutelyst 的 1/3、userver 的 1/6。
  * JSON TLS 场景下，libuvcpp 的 **371K RPS** 超过 drogon（253K）和 cutelyst（327K）。

#### 1.3 HttpProbe：合规性 157/159，排名第 6

在 HttpProbe 的 HTTP/1.1 合规性测试中，libuvcpp 拿到 **157 / 159** ，排名第 **6** ，是前 10 中唯一的 C++ 框架。

| 框架 | 语言 | 合规性得分 | 失败数 |
| --- | --- | --- | --- |
| **libuvcpp** | **C++** | **157 / 159** | **—** |
| Jetty | Java | 126 + 24 | 11 |
| Envoy | C++ | 118 + 24 | 19 |
| Tomcat | Java | 113 + 20 | 28 |
| Actix | Rust | 101 + 26 | 34 |
| H2O | C | 101 + 26 | 34 |
| Hyper | Rust | 90 + 34 | 37 |

> 数据来源：<https://www.http-probe.com/probe-results/>

**157/159 意味着距离满分只差 2 分。** 对于一个还在早期阶段的项目来说，这个起点已经足够高。

### 二、为什么说 libuvcpp 还有巨大的上升空间？

因为现在的成绩，是在 **HTTP/2 和 HTTP/3 尚未完全实现** 的情况下拿到的。

#### 2.1 H2/H3 是下一阶段最大的增量

目前 libuvcpp 已经支持 HTTP/2（基于 nghttp2 静态链入，ALPN 协商），**部分 H2 测试已经取得优异成绩** 。但完整的 H2 测试矩阵和 HTTP/3（QUIC）尚未完全落地。

这意味着什么？

在 HttpArena 的评分体系中，协议覆盖度、并发模型、TLS 场景都是重要维度。一旦 libuvcpp 补齐 H2/H3 的完整测试项，它的综合得分有**确定性的上升空间** 。

做一个保守推演：

| 项目 | 当前状态 | 补齐后潜在影响 |
| --- | --- | --- |
| HTTP/1.1 | 完整，合规 157/159 | 基本盘稳定 |
| HTTP/2 | 部分测试优异 | 可新增多个测试项得分 |
| HTTP/3 | 尚未完全实现 | 打开 QUIC 场景评分 |
| 多线程循环 | 已扩展，非默认 | 可优化高并发配置 |
| 数据库/工具链 | 基础支持 | 提升完整度因子 |

**如果 libuvcpp 保持当前 HTTP/1.1 的资源效率 ，同时补齐 H2/H3 的完整能力，它完全有可能从 C++ 第 3 名继续向上冲击。** 目前它与 drogon（4408）、cutelyst（4380）的差距大约在 1000 分左右，而 libuvcpp 在 Async Delay、JSON TLS、内存效率等单项上已经展现出超越对手的能力。

#### 2.2 合规性距离满分只差 2 分

157/159 已经非常接近满分。剩下的 2 分，来自宽松情况的处理，为了兼容老旧协议等情况，是有意为之。当然随着测试反馈的积累和社区贡献，逐步迭代，**159/159 并非遥不可及** 。

一个 HTTP/1.1 合规性满分的 C++ 框架，在安全敏感场景中的说服力将完全不同。

#### 2.3 开发复杂度还有下降空间

libuvcpp 目前已经提供了完善的文档和示例，但一个框架要成为“最好用最方便”的选择，还需要更多便捷工具：

  * 项目脚手架 / CLI
  * 配置管理
  * 热重载
  * 可观测性（日志、指标、追踪）
  * 数据库 ORM / 查询构建器
  * 中间件生态
  * 包管理与依赖集成

这些不是“性能”问题，而是“开发体验”问题。**而开发体验 ，恰恰是决定一个框架能否被大规模采用的关键。**

### 三、未来路线图：libuvcpp 想成为什么样的框架？

根据项目当前的设计方向和社区讨论，libuvcpp 的未来可以围绕以下几个方向展开。以下为社区展望，不代表官方承诺，但方向是清晰的。

#### 3.1 协议层：从 HTTP/1.1 到 HTTP/3 全覆盖

| 目标 | 当前状态 | 未来方向 |
| --- | --- | --- |
| HTTP/1.1 | ✅ 完整，合规 157/159 | 冲击 159/159 |
| HTTP/2 | 🔄 部分测试优异 | 完整测试矩阵，多路复用优化 |
| HTTP/3 | 🔄 测试计划中 | 基于 QUIC 实现，支持 0-RTT |
| WebSocket | ✅ RFC 6455 | 支持 H2/H3 上的 WebSocket |
| SOAP/WSDL | ✅ 支持 | 增强工具链与代码生成 |
| SSL/TLS | ✅ OpenSSL | 支持更多后端，会话复用优化 |

#### 3.2 性能与资源：继续压低内存，提高吞吐

libuvcpp 的默认单线程事件循环设计，是它在轻量级服务中的绝对优势。未来可以继续优化：

  * **多线程事件循环** ：在需要更高并发的场景下，提供更灵活的多线程配置。
  * **内存池** ：进一步降低高频请求下的内存分配开销。
  * **零拷贝** ：减少数据在用户态与内核态之间的复制。
  * **CPU 亲和性** ：将事件循环绑定到特定核心，减少上下文切换。
  * **异步数据库** ：完善连接池、查询缓存、事务支持。

这些优化不会改变 libuvcpp 的轻量级定位，而是让它**在同样低的资源占用下 ，跑出更高的性能**。

#### 3.3 开发者体验：让 C++ Web 开发不再“困难”

C++ 长期被诟病“开发效率低”。libuvcpp 有机会改变这一点：

| 工具 | 作用 |
| --- | --- |
| 脚手架 CLI | 一条命令创建项目 |
| 项目模板 | 内置常见 Web 应用结构 |
| 热重载 | 修改代码即时生效 |
| 配置系统 | 支持 JSON/YAML/环境变量 |
| 日志/指标/追踪 | 内置 OpenTelemetry 支持 |
| 数据库工具 | 迁移、种子、查询构建 |
| 测试工具 | 内置 HTTP 测试客户端 |
| 文档生成 | 从路由自动生成 API 文档 |

当这些工具补齐后，**libuvcpp 的开发体验将不再输给 Spring Boot 或 Express** ，而资源占用和性能仍然是 C++ 级别的。

#### 3.4 AI 代码编辑友好：让 AI 帮你写 Web 应用

2026 年，AI 代码编辑工具已经能够生成多种语言的代码。但 AI 生成代码的质量，高度依赖框架的**文档完善度、API 规范性和示例丰富度** 。

libuvcpp 在这方面有天然优势：

  * 文档和示例覆盖核心场景
  * API 设计规范，命名统一
  * 功能完备：HTTP/1.1、H2、H3、WebSocket、SSL/TLS、数据库、SOAP/WSDL
  * 跨平台预编译包，开箱即用

**未来 ，libuvcpp 可以进一步提供：**

  * 更结构化的文档（适合 RAG 检索）
  * 更多可运行示例
  * AI 代码生成模板
  * 与主流 AI 编辑器的集成指南

当 AI 能够稳定生成高质量的 libuvcpp 代码时，**C ++ Web 开发的最后一道门槛也将被抹平**。

#### 3.5 社区与生态：一个人可以走得快，一群人才能走得远

libuvcpp 目前还处于早期阶段，非常需要更多开发者参与。未来可以建立：

  * 贡献指南和 good first issue
  * 插件系统和中间件市场
  * 更多第三方数据库驱动
  * 更多平台预编译包
  * 企业用户案例和最佳实践
  * 定期社区会议和路线图投票

**一个框架的终极竞争力 ，不是代码，而是生态。**

### 四、用数据证明：未来能达到什么高度？

我们不画大饼，只做基于现有数据的合理推演。

#### 4.1 当前差距分析

| 框架 | 综合得分 | 优势场景 | libuvcpp 的追赶点 |
| --- | --- | --- | --- |
| drogon | 4408 | Baseline、Pipelined 吞吐高 | 内存远低于 drogon，Async Delay 是 drogon 5 倍 |
| cutelyst | 4380 | Pipelined 吞吐高 | Short-lived 内存是 cutelyst 的 1/11 |
| userver | 3190 | 功能完备 | 综合分已超越 userver，内存仅其 1/4 |
| libuvcpp | 3373 | 内存效率、Async Delay、JSON TLS | 补齐 H2/H3 和工具链 |

**libuvcpp 的核心 HTTP/1.1 能力并不弱 ，甚至在某些单项上领先。差距主要在“完整度”和“协议覆盖”。**

#### 4.2 补齐后的潜在排名

假设 libuvcpp 完成以下目标：

  1. HTTP/2 完整测试矩阵
  2. HTTP/3 基础支持
  3. 多线程循环优化
  4. 数据库和工具链完善
  5. 合规性冲击 159/159

那么，它的综合得分有较大概率**进入 C ++ 框架前二**，甚至冲击第一。原因很简单：

  * 它在 Async Delay（32K 并发）中已经展现出远超 drogon 的吞吐。
  * 它的内存效率在所有 C++ 框架中处于第一梯队。
  * 它的合规性评分已经超过 Envoy、H2O 等老牌 C++ 服务器。
  * 它的单线程默认设计在轻量级场景中具有架构级优势。

**这些优势不会消失 ，只会随着功能完善而放大。**

#### 4.3 对比其他语言的启示

| 框架 | 语言 | 综合得分 | 内存（Baseline） |
| --- | --- | --- | --- |
| **libuvcpp** | **C++** | **3373** | **113 MiB** |
| Spring Boot | Java | 1777 | 2.5 GiB |
| Express | JS | 1591 | 7.8 GiB |
| Node | JS | 2147 | — |

> 数据来源：<https://www.http-arena.com/frameworks/lang/java/>、<https://www.http-arena.com/frameworks/lang/js/>

**libuvcpp 用 113 MiB 内存跑出了 Spring Boot 4.4 倍的 Baseline 吞吐 ，内存却只有它的 1/22。** 当 libuvcpp 补齐 H2/H3 和工具链后，这个差距只会更大。

### 五、呼吁参与：libuvcpp 需要你

libuvcpp 目前还处于刚刚发展的阶段。它已经证明了自己的潜力，但距离“最好用、最方便、性能最高的 Web 框架”还有很长的路。

**如果你认同以下任何一点 ，欢迎加入：**

  * 你相信 C++ 可以写出优雅的 Web 服务
  * 你希望有一个低内存、高性能的 Web 框架
  * 你愿意为开源项目贡献代码、文档或测试
  * 你想在 AI 时代参与一个真正有潜力的基础设施项目

**你可以从这些地方开始 ：**

  * 给项目点一个 Star：<https://github.com/Antruly/libuvcpp>
  * 阅读文档和示例：<https://github.com/Antruly/libuvcpp/tree/master/doc>
  * 提交 Issue 或 PR：<https://github.com/Antruly/libuvcpp/issues>
  * 参与 HttpArena 测试讨论：<https://github.com/MDA2AV/HttpArena>
  * 查看 HttpProbe 结果：<https://www.http-probe.com/probe-results/>

**未来不是预测出来的 ，是构建出来的。**

libuvcpp 的下一站，需要更多人的手。

### 六、数据来源汇总

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
