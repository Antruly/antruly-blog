---
title: "用 C++ 写 Web 服务实战（七）：测试、调试与内存问题定位"
published: 2026-09-27
image: "/images/posts/covers/libuvcpp-web-guide-07.webp"
description: "本文聚焦异步C++ Web框架libuvcpp的测试与调试，针对事件循环特性提出“逻辑剥离”策略：将业务逻辑从handler中抽离为纯函数，实现单元测试；利用GoogleTest配合原子计数与NOWAIT模式驱动事件循环，精准测试定时器等异步行为；最后通过启动真实服务进行HTTP集成测试，确保路由、中间件与响应全流程正确。"
tags: ["c++", "log4j", "websocket", "开源"]
category: "libuvcpp"
lang: "zh_CN"
author: "Antruly"
sourceLink: "https://blog.csdn.net/qq_41697882/article/details/166699484"
series: "用 C++ 写 Web 服务实战"
seriesOrder: 7
comment: true
---

前六篇我们从零搭起了 Web 应用，走完了路由、中间件、上传、WebSocket、推送、SSL/TLS、HTTP/2、生产部署和性能调优。功能有了，性能也知道怎么测了。但还有一个问题没系统回答：**代码写完了 ，怎么知道它是对的？出了问题怎么查？**

这篇是实战系列的第七篇，专门讲测试与调试。不讲理论，讲**怎么为 libuvcpp 应用写测试、怎么用工具定位内存和事件循环问题** 。

### 一、为什么异步框架的测试比同步难

libuvcpp 是异步事件循环模型，这给测试带来两个天然挑战：

**第一 ，回调的执行时机不确定。** 同步代码里 `result = do_something()` 执行完就能断言，异步代码里 `do_something(callback)` 返回时结果还没出来。测试必须等待回调触发。

**第二 ，事件循环需要被驱动。** 回调不会自己执行——必须有事件循环在跑。测试代码需要启动循环、等待条件满足、然后停止循环。这个“等待条件”的过程容易写出 flaky 测试（有时过有时不过）。

理解这两点，才能理解下面测试方案的设计逻辑。

### 二、单元测试：从可测试的代码结构开始

#### 2.1 单元测试框架选型

C++ 生态中三个主流框架：

| 维度 | GoogleTest | Catch2 | doctest |
| --- | --- | --- | --- |
| 哲学定位 | 企业级、全覆盖 | 现代化、开发者友好 | 极简主义 |
| 编译时间（相对） | 1.00x | 0.85x | 0.35x |
| 运行开销（相对） | 1.00x | 0.92x | 0.78x |
| 二进制大小（相对） | 1.00x | 0.75x | 0.45x |
| 断言风格 | `EXPECT_*` / `ASSERT_*` | 自然表达式 | 自然表达式 |
| Mock 支持 | Google Mock 集成 | 需第三方 | 需第三方 |

**libuvcpp 项目本身用 GoogleTest** ，如果你要贡献代码或深度定制，用 GoogleTest 能和项目保持一致。如果是自己的应用项目，**Catch2 和 doctest 的编译速度优势在大项目中非常明显** ——10 万行代码库的完整测试构建，GoogleTest 约 15 分钟，doctest 约 5 分钟[reference:0]。

下面的示例统一用 GoogleTest，因为它与 libuvcpp 的测试风格一致，且 Mock 支持更完整。

#### 2.2 把业务逻辑从 handler 中抽离

异步 handler 本身很难单元测试——它依赖请求对象、响应对象和事件循环。**正确的做法是把业务逻辑抽成纯函数或纯类 ，handler 只做适配。**

```cpp
// ❌ 难以测试：逻辑嵌在 handler 里
app.get("/user/:id", [](uvcpp_web_request& req,
                        uvcpp_web_response& resp,
                        uvcpp_web_next) {
    const std::string* id = req.param("id");
    if (id == nullptr) {
        resp.status(400).json_str("{\"error\":\"missing id\"}");
        resp.end();
        return;
    }
    // 业务逻辑：查用户、格式化、错误处理
    auto user = find_user_by_id(*id);
    if (!user) {
        resp.status(404).json_str("{\"error\":\"not found\"}");
        resp.end();
        return;
    }
    resp.json_str(user->to_json());
    resp.end();
});
```

```cpp
// ✅ 可测试：业务逻辑抽成独立函数
struct UserResult {
    bool found;
    std::string json;
    int http_status;
};

UserResult get_user_json(const std::string& id) {
    if (id.empty()) {
        return {false, "{\"error\":\"missing id\"}", 400};
    }
    auto user = find_user_by_id(id);
    if (!user) {
        return {false, "{\"error\":\"not found\"}", 404};
    }
    return {true, user->to_json(), 200};
}

// handler 只做适配
app.get("/user/:id", [](uvcpp_web_request& req,
                        uvcpp_web_response& resp,
                        uvcpp_web_next) {
    const std::string* id = req.param("id");
    auto result = get_user_json(id ? *id : "");
    resp.status(result.http_status).json_str(result.json);
    resp.end();
});
```

**`get_user_json` 可以直接单元测试，不需要事件循环、不需要请求对象。** 这是异步框架下最有效的测试策略——把可测试的部分从异步环境中剥离出来。

#### 2.3 为抽离出的逻辑写测试

```cpp
// test_user_logic.cpp
#include <gtest/gtest.h>

TEST(UserJson, EmptyIdReturns400) {
    auto r = get_user_json("");
    EXPECT_EQ(r.http_status, 400);
    EXPECT_FALSE(r.found);
}

TEST(UserJson, UnknownIdReturns404) {
    auto r = get_user_json("nonexistent_user_999");
    EXPECT_EQ(r.http_status, 404);
    EXPECT_FALSE(r.found);
}

TEST(UserJson, ValidIdReturns200) {
    // 假设测试环境有测试数据
    auto r = get_user_json("test_user_1");
    EXPECT_EQ(r.http_status, 200);
    EXPECT_TRUE(r.found);
    EXPECT_FALSE(r.json.empty());
}
```

#### 2.4 测试中间件逻辑

中间件同样是异步环境，但中间件的**决策逻辑** 可以抽离：

```cpp
// 鉴权逻辑抽离
enum class AuthResult { ALLOW, DENY_MISSING, DENY_INVALID };

AuthResult check_auth(const std::string* token) {
    if (token == nullptr || token->empty()) {
        return AuthResult::DENY_MISSING;
    }
    if (!verify_token(*token)) {
        return AuthResult::DENY_INVALID;
    }
    return AuthResult::ALLOW;
}

// 测试
TEST(AuthLogic, MissingToken) {
    EXPECT_EQ(check_auth(nullptr), AuthResult::DENY_MISSING);
}

TEST(AuthLogic, InvalidToken) {
    EXPECT_EQ(check_auth("bad_token"), AuthResult::DENY_INVALID);
}
```

#### 2.5 测试事件循环驱动的逻辑

对于确实依赖事件循环的逻辑（比如定时器行为、连接生命周期），需要**在测试中驱动事件循环** ：

```cpp
#include <uvcpp.h>
#include <gtest/gtest.h>
#include <atomic>

TEST(TimerTest, PeriodicTimerFires) {
    uvcpp::uvcpp_loop loop;
    std::atomic<int> count{0};

    uvcpp::uvcpp_timer timer;
    timer.init(loop.handle());
    timer.start([&count](uvcpp::uvcpp_timer*) {
        count.fetch_add(1);
    }, 10, 10);   // 10ms 后首次触发，每 10ms 重复

    // 手动跑循环一段时间
    auto start = std::chrono::steady_clock::now();
    while (std::chrono::steady_clock::now() - start <
           std::chrono::milliseconds(55)) {
        loop.run(uvcpp::uvcpp_loop::mode::NOWAIT);
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
    }

    // 55ms 内至少触发 3 次（10ms, 20ms, 30ms, 40ms, 50ms）
    EXPECT_GE(count.load(), 3);

    timer.stop();
}
```

**关键点 ：**

**用`NOWAIT` 模式跑循环。** `loop.run(mode::NOWAIT)` 只处理当前就绪的事件，不阻塞等待。配合 `sleep_for` 模拟时间推进，测试代码完全可控。

**用`std::atomic` 计数。** 虽然这个测试是单线程的，但 `uvcpp_timer` 的回调在循环线程上执行，用 atomic 更安全。

**测试要 stop 定时器。** 测试结束时如果不停止定时器，循环会一直有活跃句柄，`loop` 析构时可能报错。

### 三、集成测试：用 HTTP 客户端测真实服务

单元测试覆盖了业务逻辑，但**请求解析、路由匹配、中间件链、响应序列化** 这些框架行为需要集成测试——启动一个真实的服务，发真实请求，验证真实响应。

#### 3.1 用 curl 做冒烟测试

最简单的方式：启动服务，用 curl 发请求：

```bash
# 启动服务
./myapp &
SERVER_PID=$!

# 等待服务就绪
sleep 1

# 测试端点
curl -s http://127.0.0.1:8080/hello | grep -q "hello" && echo "PASS" || echo "FAIL"
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8080/hello | grep -q 200 && echo "PASS" || echo "FAIL"

# 测试 404
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8080/nonexistent | grep -q 404 && echo "PASS" || echo "FAIL"

# 清理
kill $SERVER_PID
```

**这个方案的问题** ：`sleep 1` 不可靠——服务可能还没启动完，或者启动了但端口还没绑定。更好的做法是**轮询健康检查端点** ：

```bash
# 等待服务就绪（最多 10 秒）
for i in $(seq 1 100); do
    if curl -s http://127.0.0.1:8080/health > /dev/null 2>&1; then
        break
    fi
    sleep 0.1
done
```

#### 3.2 在测试代码中启动服务

更可控的方式是在 GoogleTest 的 `SetUp` 中启动服务，`TearDown` 中停止：

```cpp
#include <gtest/gtest.h>
#include <webapp/uvcpp_web_app.h>
#include <web/uvcpp_http_client.h>
#include <thread>
#include <chrono>

class WebAppIntegrationTest : public ::testing::Test {
protected:
    uvcpp::uvcpp_web_app app_;
    std::thread server_thread_;

    void SetUp() override {
        app_.set_host("127.0.0.1").set_port(18080);

        app_.get("/hello", [](uvcpp::uvcpp_web_request&,
                              uvcpp::uvcpp_web_response& resp,
                              uvcpp::uvcpp_web_next) {
            resp.json_str("{\"msg\":\"hello\"}");
            resp.end();
        });

        app_.get("/user/:id", [](uvcpp::uvcpp_web_request& req,
                                 uvcpp::uvcpp_web_response& resp,
                                 uvcpp::uvcpp_web_next) {
            const std::string* id = req.param("id");
            resp.json_str("{\"id\":\"" + (id ? *id : "") + "\"}");
            resp.end();
        });

        app_.start();   // 在后台线程启动
        // 等待就绪
        std::this_thread::sleep_for(std::chrono::milliseconds(200));
    }

    void TearDown() override {
        app_.stop();
        app_.join();
    }

    // 同步发一个 GET 请求，返回响应体
    std::string get(const std::string& path) {
        uvcpp::uvcpp_http_client client;
        std::string body;
        bool done = false;

        client.get("http://127.0.0.1:18080" + path,
            [&body, &done](const uvcpp::uvcpp_http_response& rsp, int err) {
                if (err == 0) {
                    body.assign(rsp.body.get_const_data(),
                                rsp.body.size());
                }
                done = true;
            });

        // 驱动客户端循环直到完成
        auto start = std::chrono::steady_clock::now();
        while (!done) {
            client.loop().run(uvcpp::uvcpp_loop::mode::NOWAIT);
            std::this_thread::sleep_for(std::chrono::milliseconds(1));
            if (std::chrono::steady_clock::now() - start >
                std::chrono::seconds(5)) {
                break;   // 超时保护
            }
        }
        return body;
    }
};

TEST_F(WebAppIntegrationTest, HelloEndpoint) {
    auto body = get("/hello");
    EXPECT_NE(body.find("hello"), std::string::npos);
}

TEST_F(WebAppIntegrationTest, PathParam) {
    auto body = get("/user/42");
    EXPECT_NE(body.find("42"), std::string::npos);
}
```

**关键点 ：**

**用独立端口 （18080）避免与开发服务冲突。** 测试环境不要用 8080 这类常用端口。

**`SetUp` 中 `start()` + 等待就绪。** `app_.start()` 在后台线程启动事件循环，但端口绑定需要一点时间。`sleep_for(200ms)` 是简单方案，生产级测试可以用重试连接的方式等待就绪。

**`TearDown` 中 `stop()` + `join()`。** 确保服务完全停止，不留后台线程，不影响下一个测试。

**HTTP 客户端测试中驱动循环。** `uvcpp_http_client` 也是异步的，需要手动跑循环直到 `done` 标志被设置。超时保护是必须的——否则测试可能永远挂住。

#### 3.3 测试 WebSocket

WebSocket 的集成测试稍微复杂——需要先建立连接，再发消息，再验证响应：

```cpp
#include <web/uvcpp_ws_client.h>

TEST_F(WebAppIntegrationTest, WebSocketEcho) {
    uvcpp::uvcpp_ws_client client;
    std::string received;
    bool connected = false;
    bool done = false;

    client.connect("ws://127.0.0.1:18080/echo",
        [&connected](int err) {
            connected = (err == 0);
        });

    // 连接成功后发消息
    // ... 需要在 on_text 中处理 ...

    // 驱动循环
    auto start = std::chrono::steady_clock::now();
    while (!done) {
        client.loop().run(uvcpp::uvcpp_loop::mode::NOWAIT);
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
        if (std::chrono::steady_clock::now() - start >
            std::chrono::seconds(5)) {
            break;
        }
    }
}
```

WebSocket 的测试代码比较繁琐，**更推荐用 Python 或 Node.js 写端到端测试** ，在 CI 中启动 C++ 服务后，用成熟 WebSocket 客户端库发请求。C++ 侧专注单元测试和简单的 HTTP 集成测试。

### 四、内存问题定位

异步 + C++ 内存管理，最容易出的问题是**内存泄漏** 和**悬空指针** 。以下工具按使用顺序排列。

#### 4.1 AddressSanitizer（ASan）：首选的运行期检测

ASan 是编译期插桩工具，能检测：

  * **Use-after-free** （悬空指针访问）
  * **Double-free** （重复释放）
  * **Buffer overflow** （缓冲区越界）
  * **Stack overflow**
  * **内存泄漏** （LeakSanitizer 集成）

编译时开启：

```bash
cmake .. -DCMAKE_BUILD_TYPE=Debug \
  -DCMAKE_CXX_FLAGS="-fsanitize=address -fno-omit-frame-pointer -g" \
  -DCMAKE_EXE_LINKER_FLAGS="-fsanitize=address"
```

运行程序，ASan 会在检测到问题时打印详细报告：

```
==12345==ERROR: AddressSanitizer: heap-use-after-free on address 0x...
READ of size 8 at 0x... thread T2
    #0 uvcpp::uvcpp_ws_connection::send_text(...) at uvcpp_ws_connection.cpp:123
    #1 ...
0x... is located 0 bytes inside of 512-byte region [...]
freed by thread T1 here:
    #0 operator delete(...)
    #1 uvcpp::uvcpp_ws_connection::~uvcpp_ws_connection()
    ...
```

**关键点 ：**

**ASan 的`-fno-omit-frame-pointer` 必须加。** 否则调用栈不完整，定位困难。

**用 Debug 构建加 ASan 跑测试。** 不要在 Release 下跑 ASan——优化会改变内存布局，误报率上升。

**ASan 和 Expand 内存池不兼容。** 如果开启了 `UVCPP_BUILD_EXPAND=ON`，ASan 无法追踪池内分配。**调试内存问题时关掉 Expand。**

**ASan 报告中的`freed by thread T1` 和 `READ at thread T2` 是最关键的信息。** 它直接告诉你“谁释放的、谁在访问”，悬空指针的问题一目了然。

#### 4.2 Valgrind：经典的内存检测

Valgrind 不要求重新编译，直接在二进制上运行：

```bash
valgrind --leak-check=full \
         --show-leak-kinds=all \
         --track-origins=yes \
         --log-file=valgrind.log \
         ./myapp
```

**Valgrind 的缺点是慢** （通常 10-50 倍性能损失），不适合跑压测。但它的**未初始化内存检测** （`--track-origins=yes`）比 ASan 更细，适合排查“偶发读到垃圾值”这类问题[reference:1]。

**libuv 自身的库代码可能有一些“still reachable”的分配** ，这不是你的代码的问题。在 Valgrind 报告中区分 `definitely lost`（你的代码泄漏）和 `still reachable`（框架/库持有的全局对象）。

#### 4.3 事件循环延迟监控：发现隐式阻塞

内存问题之外，**事件循环被阻塞** 是另一类常见 bug。症状：延迟突然飙升，吞吐下降，但 CPU 使用率不高（因为循环在 `sleep` 或等锁）。

用定时器测量循环延迟：

```cpp
auto last = std::chrono::steady_clock::now();
auto* lag_timer = new uvcpp_timer();
lag_timer->init(app.loop());
lag_timer->start([last](uvcpp_timer*) mutable {
    auto now = std::chrono::steady_clock::now();
    auto elapsed = std::chrono::duration_cast<
        std::chrono::milliseconds>(now - last).count();
    if (elapsed > 110) {   // 预期 100ms，超过 110ms 说明有阻塞
        std::cerr << "Loop lag: " << (elapsed - 100)
                  << "ms (expected 100ms)" << std::endl;
        // 可以在这里打印调用栈，定位阻塞点
    }
    last = now;
}, 100, 100);
```

**如果 lag 持续高于 10ms ，检查这些常见原因：**

| 原因 | 排查方法 |
| --- | --- |
| handler 中的 `sleep` | 搜索代码中的 `sleep_for` / `sleep` |
| 同步文件 I/O | 搜索 `std::ifstream` / `fopen` / `read()` |
| 同步 DNS 解析 | 用 `uvcpp_getaddrinfo` 替代 `getaddrinfo` |
| 锁竞争 | `perf` 看 `pthread_mutex_lock` 占比 |
| 长时间的计算 | 火焰图看 CPU 热点 |

**把阻塞操作移到`uvcpp_work` 线程池**是标准解法，但注意线程池默认只有 4 个线程，`UV_THREADPOOL_SIZE` 环境变量可以调整（最大 1024）：

```bash
UV_THREADPOOL_SIZE=16 ./myapp
```

#### 4.4 core dump 分析

服务崩溃时，core dump 是最后的线索。确保系统开启了 core dump：

```bash
# 查看当前限制
ulimit -c

# 开启（不限制大小）
ulimit -c unlimited

# 查看 core 文件路径模式
cat /proc/sys/kernel/core_pattern
```

崩溃后用 gdb 分析：

```bash
gdb ./myapp core

# 在 gdb 中
(gdb) bt              # 完整调用栈
(gdb) thread apply all bt   # 所有线程的调用栈
(gdb) frame 3         # 切到第 3 帧
(gdb) info locals     # 查看局部变量
(gdb) print ptr       # 打印指针值
```

**异步框架的崩溃通常是“在错误的线程上访问了已释放的对象”。** `thread apply all bt` 能看出是哪个线程在访问、哪个线程在释放。

### 五、日志调试：最朴素也最有效

工具再强大，**日志仍然是定位问题的第一手段** 。关键是日志要有足够的信息量。

#### 5.1 在关键路径打日志

```cpp
app.websocket("/chat/:room", [](uvcpp_web_ws_request& ws) {
    uvcpp_ws_connection* conn = ws.connection();

    // 连接建立
    std::cout << "[WS] connect: " << conn
              << " room=" << *ws.param("room")
              << " thread=" << std::this_thread::get_id() << std::endl;

    conn->on_text([conn](const std::string& msg) {
        std::cout << "[WS] text from " << conn
                  << " len=" << msg.size()
                  << " thread=" << std::this_thread::get_id() << std::endl;
    });

    conn->on_close([conn](ws_close_code code, const std::string& reason) {
        std::cout << "[WS] close: " << conn
                  << " code=" << static_cast<int>(code)
                  << " reason=" << reason
                  << " thread=" << std::this_thread::get_id() << std::endl;
    });
});
```

**打印`thread::id` 是异步调试的关键技巧。** 多事件循环下，你不知道回调在哪个线程上执行——打印线程 ID 能立刻看出问题。如果同一个连接的回调在不同线程上执行，说明有跨线程错误。

#### 5.2 日志与 ASan 配合

ASan 报告崩溃时，崩溃点之前的日志能帮你还原现场：

```
[WS] connect: 0x7f... room=lobby thread=140234
[WS] text from 0x7f... len=5 thread=140235    ← 注意：线程变了！
==12345==ERROR: AddressSanitizer: heap-use-after-free ...
```

**线程 ID 变化本身不一定是 bug** （多循环下连接可能迁移），但如果连接迁移时没有正确的同步，就是 race condition 的源头。

### 六、完整示例：为之前的聊天服务加测试

把前面聊天服务的逻辑抽离并测试：

```cpp
// ---- 抽离的逻辑 ----
struct JoinResult {
    bool ok;
    std::string error;
    int close_code;
};

JoinResult validate_join(const std::string* room,
                         const std::string* token) {
    if (room == nullptr || room->empty()) {
        return {false, "missing room", 1008};
    }
    if (token == nullptr) {
        return {false, "missing token", 1008};
    }
    if (!verify_token(*token)) {
        return {false, "invalid token", 1008};
    }
    return {true, "", 0};
}

// ---- GoogleTest ----
TEST(JoinValidation, MissingRoom) {
    auto r = validate_join(nullptr, "valid");
    EXPECT_FALSE(r.ok);
    EXPECT_EQ(r.close_code, 1008);
}

TEST(JoinValidation, MissingToken) {
    auto r = validate_join("lobby", nullptr);
    EXPECT_FALSE(r.ok);
    EXPECT_EQ(r.close_code, 1008);
}

TEST(JoinValidation, ValidJoin) {
    auto r = validate_join("lobby", "valid_token");
    EXPECT_TRUE(r.ok);
}
```

```cpp
// ---- 集成测试 ----
class ChatIntegrationTest : public ::testing::Test {
protected:
    uvcpp::uvcpp_web_app app_;

    void SetUp() override {
        app_.set_host("127.0.0.1").set_port(18081);

        app_.get("/health", [](uvcpp::uvcpp_web_request&,
                               uvcpp::uvcpp_web_response& resp,
                               uvcpp::uvcpp_web_next) {
            resp.json_str("{\"status\":\"ok\"}");
            resp.end();
        });

        app_.start();
        std::this_thread::sleep_for(std::chrono::milliseconds(200));
    }

    void TearDown() override {
        app_.stop();
        app_.join();
    }
};

TEST_F(ChatIntegrationTest, HealthCheck) {
    // 用 curl 或 http_client 验证 /health
}
```

### 七、本篇小结与下一篇预告

这篇覆盖了 C++ 异步 Web 服务的测试与调试闭环：

**单元测试策略** ——把业务逻辑从 handler 中抽离成纯函数，用 GoogleTest/Catch2 直接测试；依赖事件循环的逻辑用 `NOWAIT` 模式驱动循环。

**集成测试** ——`SetUp` 启动真实服务、`TearDown` 停止，用 `uvcpp_http_client` 发真实请求，超时保护是必须的。

**内存问题定位** ——ASan 首选用 Debug 构建 + `-fsanitize=address`，Valgrind 补充未初始化内存检测，**Expand 内存池开启时 ASan 无效** 。

**事件循环阻塞排查** ——用定时器测量循环延迟，超过 10ms 持续出现就要查同步阻塞操作。

**日志调试** ——关键路径打日志，**打印线程 ID** 是异步调试的关键技巧。

**core dump 分析** ——`thread apply all bt` 看所有线程调用栈，异步崩溃通常是跨线程访问已释放对象。

**下一篇预告 ：** 在撰写这篇的过程中，我注意到 libuvcpp 已经发布了 **1.4.0 版本** 。下一篇会基于 1.4.0 的官方文档和 Release Notes，系统介绍新版本的变化——包括 HTTP/3（QUIC）的进展、HTTP/2 流级背压的应用层打通情况、以及可能在性能或 API 易用性上的改进。如果你已经在用 libuvcpp，建议关注这次升级。

如果你在测试或调试中遇到问题，欢迎在 [GitHub Issues](<https://github.com/Antruly/libuvcpp/issues>) 提出。
