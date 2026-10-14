---
title: "用 C++ 写 Web 服务实战（六）：性能压测、瓶颈定位与调优实战"
published: 2026-09-26
image: "/images/posts/covers/libuvcpp-web-guide-06.webp"
description: "本文实战讲解C++ Web服务性能压测与调优，强调“先测后改”的三步法：建立基线、定位瓶颈、验证效果。推荐使用wrk进行高并发HTTP压测，结合Lua脚本模拟复杂场景；针对WebSocket，建议自研压测客户端以精准模拟真实流量。重点分析libuvcpp事件循环性能特征，揭示单循环75k RPS上限及多循环扩展衰减原因，指出锁竞争与阻塞操作是主要瓶颈。通过uvcpp_work将同步任务移至线程池，并合理设置UV_THREADPOOL_SIZE，避免阻塞事件循环。最终实现高性能、低延迟的生产级服务。"
tags: ["c++", "uv", "web", "http", "开源"]
category: "libuvcpp"
lang: "zh_CN"
author: "Antruly"
sourceLink: "https://blog.csdn.net/qq_41697882/article/details/166647989"
series: "用 C++ 写 Web 服务实战"
seriesOrder: 6
comment: true
---

前五篇我们从零搭起了 Web 应用，走完了路由、中间件、上传、WebSocket、推送、SSL/TLS、HTTP/2 和生产部署。功能完整了，部署方案也有了。但有一件事始终没有系统讲过：**你怎么知道你的服务到底能扛多少 ？瓶颈在哪里？下一个该优化什么？**

这篇是实战系列的进阶篇，专门讲性能。不讲理论，讲**怎么测、怎么读、怎么改** 。

### 一、先明确：优化之前必须测

一个常见陷阱：看到某个地方“可能慢”就去改。结果改完发现整体性能没变化，因为真正的瓶颈在别处。

**性能优化三步法 ：**

  1. **建立基线** ——当前版本在标准负载下的吞吐、延迟、资源占用
  2. **定位瓶颈** ——是 CPU 跑满？内存涨？还是 I/O 等？用数据说话
  3. **验证改动** ——改完之后在同样条件下重测，确认有提升且没有引入回归

跳过第一步直接改代码，等于闭着眼睛开车。

### 二、压测工具选型

#### 2.1 wrk：高并发 HTTP 压测首选

`wrk` 是 C 写的多线程压测工具，单机轻松打满十万 QPS，适合测 libuvcpp 这种高性能服务：

```bash
# Ubuntu 安装
sudo apt-get install wrk

# 或从源码编译（推荐，版本更新）
git clone https://github.com/wg/wrk.git
cd wrk && make -j$(nproc)
```

基本用法：

```bash
# 4 线程、100 连接、持续 30 秒
wrk -t4 -c100 -d30s http://127.0.0.1:8080/hello

# 输出示例
Running 30s test @ http://127.0.0.1:8080/hello
  4 threads and 100 connections
  Thread Stats   Avg      Stdev     Max   +/- Stdev
    Latency     1.32ms  512.34us  12.45ms   82.31%
    Req/Sec    19.23k     1.21k    22.45k    73.50%
  2298741 requests in 30.02s, 412.31MB read
Requests/sec:  76562.18
Transfer/sec:     13.73MB
```

**关键指标 ：**

| 指标 | 含义 | 关注点 |
| --- | --- | --- |
| `Requests/sec` | 吞吐量（RPS） | 核心指标 |
| `Latency Avg` | 平均延迟 | 用户体验 |
| `Latency Max` | 最大延迟 | 是否有长尾 |
| `Latency Stdev` | 延迟标准差 | 稳定性 |

**长尾延迟比平均值更重要。** 如果 `Avg=1ms` 但 `Max=500ms`，说明有少量请求遭遇了严重卡顿——可能是 GC 式的内存分配尖峰、锁竞争、或某个慢操作阻塞了事件循环。

#### 2.2 带 Lua 脚本的复杂场景

wrk 支持 Lua 脚本，可以测 POST、带 header、多 URL：

```lua
-- post.lua
wrk.method = "POST"
wrk.headers["Content-Type"] = "application/json"
wrk.body = '{"key":"value"}'

-- 自定义请求
request = function()
    local path = "/api/user/" .. math.random(1, 10000)
    return wrk.format(nil, path)
end
```

```bash
wrk -t4 -c100 -d30s -s post.lua http://127.0.0.1:8080
```

#### 2.3 长连接与 WebSocket 压测

wrk 默认每条连接发完一个请求就断开（除非用 `Connection: keep-alive`）。测 WebSocket 需要专门的工具：

  * **websocat** ——命令行 WebSocket 客户端
  * **tsung** ——Erlang 写的分布式压测工具，支持 WebSocket
  * **自写压测客户端** ——用 `uvcpp_ws_client` 写一个，最能反映真实场景

自写客户端示例（简化）：

```cpp
#include <web/uvcpp_ws_client.h>
#include <atomic>
#include <chrono>

std::atomic<int> g_connected{0};
std::atomic<long long> g_messages{0};

int main() {
    const int N = 1000;   // 1000 个并发连接
    for (int i = 0; i < N; ++i) {
        auto* client = new uvcpp_ws_client();
        client->connect("ws://127.0.0.1:8080/echo",
            [client](int err) {
                if (err) return;
                g_connected.fetch_add(1);
                client->on_text([](const std::string& msg) {
                    g_messages.fetch_add(1);
                });
                client->send_text("hello", 5);
            });
    }

    // 每秒打印统计
    while (true) {
        std::this_thread::sleep_for(std::chrono::seconds(1));
        std::cout << "Connected: " << g_connected.load()
                  << ", Messages: " << g_messages.load() << std::endl;
    }
}
```

**自己写压测客户端的优势** ：能精确控制行为（发什么、发多快、何时断开），能模拟真实业务流量。代价是要花时间写代码，而且要确保压测客户端本身不会成为瓶颈。

#### 2.4 关注压测机本身的瓶颈

**压测机可能先于被测服务跑满。** 测 100k RPS 时，wrk 本身可能吃掉 8 个核。观察压测机的 `top`：

  * 如果 wrk 的 CPU 接近 100%，说明压测机是瓶颈，需要多机分布式压测
  * 如果网络带宽跑满，也是压测机的问题
  * 用 `sar -n DEV 1` 看网卡流量

**分布式压测** ：用多台机器同时压被测服务，或者用 `wrk` 的 `--latency` 参数细化延迟统计。

### 三、读懂事件循环的性能特征

libuvcpp 基于 libuv 的单线程事件循环。理解它的性能模型，才能知道瓶颈在哪里。

#### 3.1 单循环吞吐上限

libuvcpp 的实测数据（来自 `doc/benchmark.md`）：

  * **单事件循环 75k RPS**
  * **每条空闲连接 4.62 KiB** （4734 B，R² = 0.999987）
  * **10 分钟 soak 3840 万请求 ，0 错误**

75k RPS 是单循环的合理上限。这个数字受限于：

  * 事件循环的 poll 开销
  * 每个请求的 handler 执行时间
  * 响应序列化和写出的开销

#### 3.2 多循环的线性扩展

`set_loops(4)` 后，理论上吞吐接近 4 倍。但实际上有衰减：

| 循环数 | 预期 RPS | 实际 RPS | 扩展比 |
| --- | --- | --- | --- |
| 1 | 75k | 75k | 1.0 |
| 2 | 150k | ~140k | 1.87 |
| 4 | 300k | ~260k | 3.47 |
| 8 | 600k | ~460k | 6.13 |

衰减来自：

  * **接受者循环的瓶颈** ——所有新连接都经过它，高连接建立速率下它会成为热点
  * **共享资源的锁竞争** ——如果你在 handler 中用了全局 mutex
  * **内存带宽** ——多核同时读写内存，L3 缓存命中率下降

**如果扩展比明显低于预期 ，先怀疑你的 handler 里有锁竞争。**

#### 3.3 如何定位事件循环卡顿

事件循环被阻塞的症状：**延迟突然飙升 ，RPS 下降**。常见原因：

**同步阻塞操作** ——在 handler 里调了 `sleep()`、同步文件 I/O、同步 DNS 解析。这些会卡住整个循环。

```cpp
// 错误：阻塞事件循环
app.get("/bad", [](uvcpp_web_request&, uvcpp_web_response& resp,
                   uvcpp_web_next) {
    std::this_thread::sleep_for(std::chrono::seconds(1));   // 阻塞！
    resp.text("done");
    resp.end();
});
```

**正确做法 ：用 `uvcpp_work` 把阻塞操作丢到线程池：**

```cpp
app.get("/good", [&app](uvcpp_web_request&, uvcpp_web_response& resp,
                        uvcpp_web_next next) {
    auto* rp = &resp;
    auto* w = new uvcpp_work();
    w->init();
    w->queue_work(app.loop(),
        [](uvcpp_work*) {
            // 这个 lambda 在工作线程池里执行，不阻塞事件循环
            std::this_thread::sleep_for(std::chrono::seconds(1));
        },
        [rp, next](uvcpp_work* done, int) {
            rp->text("done");
            rp->end();
            next();
            delete done;
        });
});
```

**libuv 的线程池默认只有 4 个线程。** 如果大量请求走 `uvcpp_work`，线程池会排队。可以通过环境变量 `UV_THREADPOOL_SIZE` 调整（最大 1024）：

```bash
UV_THREADPOOL_SIZE=16 ./myapp
```

但注意：**线程池调大不等于性能提升** ——CPU 核心数才是真正的上限。线程池只是让阻塞操作不卡事件循环，不是让 CPU 变多。

### 四、用 perf 和火焰图定位 CPU 瓶颈

当 CPU 跑满但 RPS 上不去，需要知道 CPU 花在哪里。

#### 4.1 perf 采样

Linux 上用 `perf` 采样：

```bash
# 记录 30 秒
sudo perf record -F 99 -p $(pgrep myapp) -g -- sleep 30

# 生成报告
sudo perf report
```

`-F 99` 表示每秒采样 99 次，`-g` 记录调用栈。perf report 会显示每个函数的 CPU 占比。

#### 4.2 火焰图

火焰图更直观。用 Brendan Gregg 的 FlameGraph 工具：

```bash
# 下载工具
git clone https://github.com/brendangregg/FlameGraph.git

# 采样
sudo perf record -F 99 -p $(pgrep myapp) -g -- sleep 30

# 生成火焰图
sudo perf script | ./FlameGraph/stackcollapse-perf.pl | \
  ./FlameGraph/flamegraph.pl > flame.svg
```

打开 `flame.svg`，**宽条 = 占用 CPU 多的函数**。常见发现：

  * `memcpy` / `malloc` 占比过高 → 分配/拷贝过多，考虑 Expand 内存池或减少拷贝
  * `write()` 系统调用占比高 → 写操作过多，考虑批量化
  * 某个 handler 函数特别宽 → 业务逻辑有优化空间
  * `pthread_mutex_lock` 占比高 → 锁竞争严重

#### 4.3 libuvcpp 的性能优化案例

libuvcpp 自身做过几轮性能优化，数据来自 `doc/benchmark.md`：

| 优化项 | 改动 | 效果 |
| --- | --- | --- |
| 响应序列化 | 不再走 `std::ostringstream` | 用户态 −10.19%，RPS 91k → 93k |
| 读缓冲清零 | 不再清零即将被覆盖的缓冲区 | 用户态 −22.88%，QPS +12.02% |
| 写队列批处理 | 能带走的整批拼成一次写 | 段/请求 3.43 → 2.06，CPU −30%，RPS 38k → 57k |
| 内存分配 | 每请求 16 次 → 13 次 | — |

**这些优化都是先测后改的结果。** 不是拍脑袋想出来的。

### 五、内存调优

#### 5.1 内存占用的构成

一个 libuvcpp 服务的内存占用来自几部分：

| 部分 | 说明 |
| --- | --- |
| 空闲连接 | 每条约 4.62 KiB（含 libuv handle、读写缓冲、连接对象） |
| 活跃请求 | 请求体 + 响应缓冲 + 上下文对象 |
| 框架开销 | 事件循环、路由表、中间件链 |
| 应用状态 | 你自己维护的全局数据结构 |

**4.62 KiB/连接** 是 libuvcpp 的实测数据（八档最小二乘拟合，R² = 0.999987）。外推到 100 万连接约 4.42 GiB。

#### 5.2 空闲连接的内存

100 万空闲连接要 4.42 GiB——这是 C10K/C1M 场景必须知道的数字。优化方向：

  * **降低单连接开销** ——调整读写缓冲区大小
  * **限制最大连接数** ——在 `on_connection` 中检查
  * **及时回收空闲连接** ——设置闲置超时

```cpp
app.set_idle_timeout_ms(60000);   // 闲置 60 秒断开

app.websocket("/push", [](uvcpp_web_ws_request& ws) {
    static std::atomic<int> g_count{0};
    if (g_count.load() >= 100000) {   // 上限 10 万
        ws.connection()->send_close(
            ws_close_code::POLICY_VIOLATION, "too many");
        return;
    }
    g_count.fetch_add(1);
    // ...
});
```

#### 5.3 请求体内的存控制

默认情况下，请求体全量缓冲在内存中。大请求体会瞬间消耗大量内存。设置上限：

```cpp
app.set_max_body_size(10 * 1024 * 1024);   // 10 MB 上限
```

超过上限的请求会被框架拒绝（413）。对于大文件上传，用 `uvcpp_web_upload` 的流式落盘，不要用普通请求体。

#### 5.4 用 Expand 内存池减少碎片

长时间运行的服务会遭遇内存碎片。Expand 内存池（TCMalloc 风格）通过线程缓存和 span 分配器减少碎片：

```bash
cmake .. -DUVCPP_BUILD_EXPAND=ON
```

**开启前后的对比 ：**

| 指标 | 系统 malloc | Expand |
| --- | --- | --- |
| 分配延迟 | 基准 | 降低 20-40% |
| 内存碎片 | 较高 | 显著降低 |
| 长时间运行内存增长 | 有 | 平缓 |
| 调试难度 | 低 | 高（ASan 不友好） |

**建议** ：开发阶段用系统 malloc 便于调试，生产环境开 Expand。用 `heaptrack` 或 `valgrind --tool=massif` 分析内存增长趋势。

### 六、延迟与吞吐的权衡

#### 6.1 批量化：牺牲延迟换吞吐

libuvcpp 的写队列批处理是一个典型例子：把多个小响应拼成一次 `write()` 系统调用，减少了系统调用次数（段/请求从 3.43 降到 2.06），但代价是**每个响应要等一小会儿** ，看能不能凑一批。

| 策略 | 吞吐 | 延迟 |
| --- | --- | --- |
| 立即写 | 低 | 低 |
| 批处理 | 高 | 略高 |

**大多数 Web 服务的瓶颈是吞吐而非延迟** ，所以批处理是划算的。但实时性要求极高的场景（比如游戏）需要权衡。

#### 6.2 背压：防止内存换吞吐

慢消费者会拖垮服务。如果一个客户端接收很慢，服务端的发送队列会积压，内存持续增长。背压机制在缓冲达到水位时暂停写入：

```cpp
resp.set_max_stream_buffer_bytes(512 * 1024);   // 512 KiB 水位

if (!resp.write_chunk(data)) {
    // 缓冲到顶了，等 drain 事件
    resp.on_drain([&resp]() {
        // 水位降下来，继续写
    });
}
```

**背压的本质是 ：宁可让上游慢下来，也不无限占内存。** 对于流式响应和大文件下载，背压是必须的。

#### 6.3 延迟测试：看 P99 而非平均

压测工具通常报告平均延迟。但**平均延迟会掩盖长尾问题** 。用 `wrk --latency` 看详细分布：

```bash
wrk -t4 -c100 -d30s --latency http://127.0.0.1:8080/hello

# 输出
  Latency Distribution
     50%    1.21ms
     75%    1.45ms
     90%    1.89ms
     99%    8.34ms   ← P99
```

**P99 是用户体验的关键指标。** 如果 P99 远高于 P50，说明有少量请求遭遇了卡顿——可能是 GC（C++ 没有 GC，但可能是内存分配尖峰）、锁竞争、或事件循环被长任务阻塞。

**目标 ：P99 < 3 × P50。** 超过这个比例就要查长尾来源。

### 七、实战案例：从 75k 到 260k RPS

假设一个 API 服务，单循环 75k RPS，用 4 核机器。优化过程：

**第一步 ：测基线**

```bash
wrk -t4 -c100 -d30s http://127.0.0.1:8080/hello
# Requests/sec: 76,562
```

**第二步 ：开启多循环**

```cpp
app.set_loops(4);
```

```bash
wrk -t4 -c100 -d30s http://127.0.0.1:8080/hello
# Requests/sec: 258,341
```

**第三步 ：火焰图定位**

采样发现 `malloc` / `free` 占比 12%：

```bash
sudo perf record -F 99 -p $(pgrep myapp) -g -- sleep 30
# 火焰图中 malloc 很宽
```

**第四步 ：开启 Expand 内存池**

```bash
cmake .. -DUVCPP_BUILD_EXPAND=ON
```

```bash
wrk -t4 -c100 -d30s http://127.0.0.1:8080/hello
# Requests/sec: 271,882  (+5.2%)
```

**第五步 ：检查 handler 中的锁**

发现日志中间件持有全局 mutex 写文件：

```cpp
// 优化前：每个请求都持锁写文件
app.use([](uvcpp_web_request& req, uvcpp_web_response& resp,
           uvcpp_web_next next) {
    next();
    std::lock_guard<std::mutex> lock(g_log_mutex);
    g_log << ... << "\n";
    g_log.flush();   // flush 是系统调用，持锁期间开销大
});
```

**优化 ：异步批量写日志**

```cpp
// 用队列缓冲日志，单独线程定期 flush
static std::queue<std::string> g_log_queue;
static std::mutex g_queue_mutex;

// 中间件只入队，不写文件
app.use([](uvcpp_web_request& req, uvcpp_web_response& resp,
           uvcpp_web_next next) {
    next();
    std::lock_guard<std::mutex> lock(g_queue_mutex);
    g_log_queue.push(format_log(req, resp));
});
```

```bash
wrk -t4 -c100 -d30s http://127.0.0.1:8080/hello
# Requests/sec: 285,143  (+4.9%)
```

**最终 ：75k → 285k，3.8 倍提升。** 每一步都有数据支撑，每一步都验证了效果。

### 八、监控：上线后的持续观测

压测是离线优化，上线后需要持续监控。

#### 8.1 关键指标

| 指标 | 获取方式 | 告警阈值 |
| --- | --- | --- |
| RPS | 应用层统计 | 低于基线 50% |
| P99 延迟 | 应用层统计 | > 100ms |
| 连接数 | `ws_session_count()` | > 80% 上限 |
| 内存占用 | `/proc//status` | 持续增长 |
| CPU 使用率 | `top` / `pidstat` | 持续 > 90% |
| 事件循环延迟 | 定时器测量 | > 10ms |

#### 8.2 事件循环延迟监控

事件循环延迟是指“定时器预期触发时间”和“实际触发时间”的差值。延迟高说明循环被阻塞：

```cpp
// 每 100ms 触发一次，测量实际间隔
auto last = std::chrono::steady_clock::now();
auto* timer = new uvcpp_timer();
timer->init(app.loop());
timer->start([last](uvcpp_timer*) mutable {
    auto now = std::chrono::steady_clock::now();
    auto elapsed = std::chrono::duration_cast<
        std::chrono::milliseconds>(now - last).count();
    if (elapsed > 110) {   // 预期 100ms，超过 110ms 说明有阻塞
        std::cerr << "Loop lag: " << (elapsed - 100) << "ms" << std::endl;
    }
    last = now;
}, 100, 100);
```

**事件循环延迟是最重要的健康指标之一。** 如果它持续高于 10ms，说明有同步阻塞操作，需要排查。

#### 8.3 用 /health 端点暴露指标

```cpp
app.get("/health", [&app](uvcpp_web_request&, uvcpp_web_response& resp,
                          uvcpp_web_next) {
    std::string json = "{";
    json += "\"loops\":" + std::to_string(app.loop_count()) + ",";
    json += "\"ws_sessions\":" +
            std::to_string(app.ws_session_count()) + ",";
    json += "\"status\":\"ok\"";
    json += "}";
    resp.json_str(json);
    resp.end();
});
```

配合 Prometheus 的 `node_exporter` 或自定义 exporter，就能接入监控系统。

### 九、本篇小结

这篇覆盖了 C++ Web 服务性能工作的完整闭环：

**压测工具** ——`wrk` 测 HTTP，自写客户端测 WebSocket，注意压测机本身可能成为瓶颈。

**事件循环模型** ——单循环 75k RPS，多循环接近线性扩展但有衰减，先怀疑锁竞争。

**CPU 瓶颈定位** ——`perf` + 火焰图，看 `malloc` / `memcpy` / `write` / `pthread_mutex_lock` 的占比。

**内存调优** ——空闲连接 4.62 KiB/条，设置请求体和连接数上限，Expand 内存池减少碎片。

**延迟与吞吐权衡** ——批量化提吞吐、背压防内存、P99 是用户体验关键。

**实战案例** ——从 75k 到 285k，多循环 + 内存池 + 异步日志，每步都有数据支撑。

**持续监控** ——事件循环延迟、连接数、内存增长，用 `/health` 端点暴露。

**核心原则 ：先测后改，用数据说话。** 没有测量的优化是赌博。

下一篇会进入 **测试与调试** ：单元测试怎么写、集成测试怎么做、内存泄漏怎么查、线上问题怎么诊断。如果你在性能调优中遇到问题，欢迎在 [GitHub Issues](<https://github.com/Antruly/libuvcpp/issues>) 提出。
