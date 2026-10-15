---
title: "用 C++ 写 Web 服务实战（二）：路由进阶、中间件链与文件上传"
published: 2026-09-23
image: "/images/posts/covers/libuvcpp-web-guide-02.webp"
description: "本文基于C++框架uvcpp，深入实践Web服务核心功能：路由参数与通配符实现动态路径匹配；通过中间件链（支持同步/异步、洋葱模型）构建灵活的请求处理流程；引入流式接收机制，支持大文件上传与背压控制；最终实现multipart/form-data格式的文件上传，逐块落盘，避免内存溢出。完整覆盖真实业务场景所需的关键能力。"
tags: ["c++", "http", "web", "uv"]
category: "libuvcpp"
lang: "zh_CN"
author: "Antruly"
sourceLink: "https://blog.csdn.net/qq_41697882/article/details/166490055"
series: "用 C++ 写 Web 服务实战"
seriesOrder: 2
comment: true
---

上一篇我们搭起了一个能跑的 Web 应用骨架——监听端口、注册 JSON 路由、绑定静态目录、开启多事件循环、写了一个文件日志中间件。这篇在这个骨架之上继续往上盖：**路由参数与通配符、中间件链的深度使用、请求体流式接收与文件上传** 。读完这篇，你的 C++ Web 应用就能处理真实业务了。

### 一、路由进阶：不止是 `app.get("/hello")`

上篇只用了最简单的精确匹配路由。实际业务中，你需要从 URL 中提取参数、匹配前缀、区分 HTTP 方法。`uvcpp_web_router` 提供的模式路由覆盖了这些场景，匹配优先级为**静态 > 参数 > 通配**。

#### 1.1 路径参数 `/user/:id`

```cpp
app.get("/user/:id", [](uvcpp_web_request& req,
                        uvcpp_web_response& resp,
                        uvcpp_web_next next) {
    const std::string* id = req.param("id");
    resp.text(id != nullptr ? *id : std::string());
    resp.end();
});
```

`req.param("id")` 返回的是 `const std::string*`，参数不存在时返回 `nullptr`——这比返回空字符串更明确，不会把“参数没传”和“参数是空串”混在一起。

多个参数可以混搭：

```cpp
app.get("/api/v:version/users/:uid/posts/:pid", handler);
```

#### 1.2 通配符 `/files/*path`

`*path` 匹配一段或多段路径，捕获的内容同样通过 `req.param("path")` 获取：

```cpp
app.get("/files/*path", [](uvcpp_web_request& req,
                           uvcpp_web_response& resp,
                           uvcpp_web_next next) {
    const std::string* p = req.param("path");
    // 请求 /files/docs/readme.txt → p = "docs/readme.txt"
    resp.text("你请求了: " + *p);
    resp.end();
});
```

通配符**至少吃一段** 。`/files/*path` 匹配 `/files/a`，但不匹配 `/files`——如果连前缀本身也要处理，需要单独注册 `/files` 的路由。`serve_static` 内部就是靠这个机制工作的。

#### 1.3 HTTP 方法

`app.get()`、`app.post()`、`app.put()`、`app.del()` 分别注册对应方法的路由。同一个路径可以注册多个方法，`uvcpp_web_router` 会正确区分：

```cpp
app.get("/resource", get_handler);
app.post("/resource", post_handler);
```

当请求方法不匹配已注册的路由时，框架自动返回 405 并填充 `Allow` 头；`OPTIONS` 请求自动生成允许的方法列表。这些语义是框架保证的，不需要你手写。

### 二、中间件链：Express 风格的 `next()` 模型

上篇的日志中间件已经展示了 `.use()` 的基本用法。这一节深入中间件链的执行模型。

#### 2.1 中间件就是“会调 next() 的 handler”

```cpp
uvcpp_web_middleware auth_middleware() {
    return [](uvcpp_web_request& req, uvcpp_web_response& resp,
              uvcpp_web_next next) {
        const std::string* token = req.header("Authorization");
        if (token == nullptr || !verify_token(*token)) {
            resp.status(401).json_str("{\"error\":\"unauthorized\"}");
            resp.end();
            return;   // 不调 next()，链到此结束
        }
        next();       // 放行，进入下一个中间件或路由 handler
    };
}
```

中间件和路由 handler 的类型完全相同（`uvcpp_web_handler`）。区别只在行为：**不调`next()` 就是这一环直接结束，链不再往下走**。

#### 2.2 执行顺序与“前后包裹”

`.use()` 的注册顺序就是执行顺序。`next()` 调用之前的代码在“请求进入”阶段执行，之后的代码在“响应完成”阶段执行——这是 Express/Koa 的经典洋葱模型：

```cpp
app.use([]{ /* ① 请求进入 */ next(); /* ③ 响应完成后 */ });
app.use([]{ /* ② 请求进入 */ next(); /* ② 响应完成后 */ });
app.get("/x", handler);  // ④ 最后执行
```

上篇的日志中间件正是利用了这个特性：`next()` 之前记录时间戳，之后记录状态码。

#### 2.3 异步中间件与 `hold()` / `release()`

如果中间件需要做异步操作（查数据库、调外部 API），不能直接 `next()` 后返回——框架可能在这一环还没完成时就结束了请求。`uvcpp_web_context` 提供 `hold()` 和 `release()` 来显式声明“我还没完成”：

```cpp
app.use([](uvcpp_web_request& req, uvcpp_web_response& resp,
           uvcpp_web_next next) {
    uvcpp_web_context* ctx = req.context();
    ctx->hold();   // 告诉框架：这一环还在进行中，别往下走

    // 异步操作（比如查数据库）
    do_async_query(req.path(), [ctx, next](bool allowed) {
        if (allowed) {
            ctx->release();  // 解除 hold
            next();          // 放行
        } else {
            // 拒绝请求
            ctx->release();
            // ...写响应...
        }
    });
});
```

`hold()` 的本质是给上下文加一个引用计数，`release()` 减一。计数归零时框架才认为这一环完成。这在异步中间件中是必须的——不 hold 直接返回，框架会在异步回调执行前就结束请求。

#### 2.4 内置中间件

libuvcpp 自带了一些常用中间件：

```cpp
app.use(web_middleware_access_log());   // 访问日志
app.use(web_middleware_cors());          // CORS 跨域
```

`web_middleware_access_log()` 会写框架标准格式的访问日志。但如果你需要自定义格式（比如上篇那样输出到本地文件），自己写中间件更灵活。`web_middleware_cors()` 处理跨域预检请求和 `Access-Control-*` 头，前端调试时很省心。

#### 2.5 中间件挂载建议

推荐的注册顺序：

```cpp
// 1. 日志（最先注册，记录一切）
app.use(my_log_middleware());

// 2. CORS（在鉴权之前，预检请求不应被鉴权拦截）
app.use(web_middleware_cors());

// 3. 鉴权
app.use(auth_middleware());

// 4. 业务路由
app.get("/api/...", handler);

// 5. 静态文件（最后注册，避免拦截 API 路由）
app.serve_static("/assets", "./public");
```

### 三、请求体流式接收

默认情况下，框架会把整个请求体缓冲在内存中，handler 触发时 `req.body()` 已经完整可用。这对于小体积 JSON 或表单请求完全够用。但**大文件上传或流式数据** 不能走这条路——一个 1 GB 的上传会把整个请求体拉进内存。

`uvcpp_web_stream` 提供了流式接收能力，通过 `on_data` / `on_end` 回调逐块处理请求体：

```cpp
app.post("/upload/stream", [](uvcpp_web_request& req,
                              uvcpp_web_response& resp,
                              uvcpp_web_next next) {
    auto* stream = req.stream();

    stream->on_data([](const char* data, size_t len) {
        // 逐块到达的数据，可以直接写入磁盘或做增量处理
        // 注意：data 只在回调期间有效，需要持久化就拷贝或立刻写入
    });

    stream->on_end([]() {
        // 请求体全部接收完毕
    });

    // 流式模式下，handler 返回后框架不会自动结束请求，
    // 需要在 on_end 中调用 resp.end()
});
```

`stream->pause()` 和 `stream->resume()` 可以在消费端忙不过来时暂停接收，形成背压。这在写入磁盘较慢的场景下很有用——暂停接收比在内存中无限堆积要安全得多。

### 四、文件上传：multipart 流式落盘

`uvcpp_web_upload` / `uvcpp_web_multipart` 构建在流式接收之上，专门处理 `multipart/form-data` 请求。

#### 4.1 基本用法

```cpp
app.post("/upload", [](uvcpp_web_request& req,
                       uvcpp_web_response& resp,
                       uvcpp_web_next next) {
    auto* upload = req.upload();

    // 设置落盘目录和大小上限
    upload->set_upload_dir("./uploads");
    upload->set_max_file_size(50 * 1024 * 1024);    // 单文件 50 MB
    upload->set_max_total_size(200 * 1024 * 1024);  // 总大小 200 MB

    upload->on_file([](const uvcpp_web_uploaded_file& file) {
        // 每个文件落盘完成后触发
        // file.field_name —— 表单字段名
        // file.original_name —— 原始文件名
        // file.saved_path —— 实际保存路径（随机叶子名）
        // file.size —— 文件大小
    });

    upload->on_end([&resp]() {
        resp.json_str("{\"status\":\"ok\"}");
        resp.end();
    });

    upload->on_error([](int err) {
        // 上传过程中出错（超限、磁盘写入失败等）
    });
});
```

#### 4.2 大小限制与安全策略

`uvcpp_web_upload` 内置了**六条大小上限** ，分别覆盖：

| 限制项 | 作用 |
| --- | --- |
| 单文件大小 | 防止单个超大文件打满磁盘 |
| 总请求大小 | 防止大量小文件组合成 DoS |
| 文件数量 | 防止 multipart 边界攻击 |
| 字段名长度 | 防止超长字段名消耗内存 |
| 文件名长度 | 同上 |
| part 头部大小 | 防止畸形 multipart 头 |

落盘策略是**随机叶子名 + 流式写入**：文件名在服务端生成随机名，不使用客户端提供的原始文件名作为磁盘路径——这直接封死了路径穿越攻击（`../../etc/passwd` 这类）。原始文件名只作为元数据保留在 `original_name` 中。

#### 4.3 与流式接收的区别

| 场景 | 用 `uvcpp_web_stream` | 用 `uvcpp_web_upload` |
| --- | --- | --- |
| raw body 流式处理 | ✅ | ❌ |
| multipart 表单 | ❌ | ✅ |
| 需要解析字段名/文件名 | ❌ | ✅ |
| 自己控制落盘逻辑 | ✅ | ❌（框架落盘） |

如果上传的是非 multipart 格式的原始数据（比如直接 PUT 一个文件），用 `uvcpp_web_stream` 自己处理；如果是标准 HTML 表单上传，用 `uvcpp_web_upload` 更省事。

### 五、请求对象操作速查

`uvcpp_web_request` 封装了日常业务最常用的访问方式：

```cpp
// 方法 & 路径
req.method()           // http_method 枚举
req.method_str()       // "GET" / "POST" ...
req.path()             // "/user/123"
req.query()            // 查询串（不含 ?）

// 路径参数
req.param("id")        // const std::string*

// 查询串参数
req.query_param("page")  // const std::string*

// 请求头
req.header("Content-Type")  // const std::string*

// Cookie
req.cookie("session_id")    // const std::string*

// 表单字段（application/x-www-form-urlencoded）
req.form("username")        // const std::string*

// 请求体
req.body()             // uvcpp_buf，完整请求体
```

响应侧：

```cpp
resp.status(200);
resp.set_header("X-Custom", "value");
resp.json_str("{\"ok\":true}");
resp.text("plain text");
resp.html("<h1>Hello</h1>");
resp.redirect("/new-location");
resp.send_file("./path/to/file.pdf");
resp.end();
```

### 六、完整示例：一个带鉴权、上传和路由参数的 API 服务

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

// 简单鉴权中间件
uvcpp_web_middleware auth_middleware() {
    return [](uvcpp_web_request& req, uvcpp_web_response& resp,
              uvcpp_web_next next) {
        const std::string* token = req.header("Authorization");
        if (token == nullptr || token->empty()) {
            resp.status(401).json_str("{\"error\":\"missing token\"}");
            resp.end();
            return;
        }
        next();
    };
}

int main() {
    g_log.open("access.log", std::ios::app);

    uvcpp_web_app app;
    app.set_host("0.0.0.0").set_port(8080);

    const int rc = app.set_loops(4);
    if (rc != 0) { std::cerr << "set_loops: " << rc << std::endl; return 1; }

    // ---- 中间件链 ----
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
    app.use(web_middleware_cors());

    // ---- 公开路由 ----
    app.get("/hello", [](uvcpp_web_request&, uvcpp_web_response& resp,
                         uvcpp_web_next) {
        resp.json_str("{\"hello\":\"world\"}");
        resp.end();
    });

    // ---- 路径参数 ----
    app.get("/user/:id", [](uvcpp_web_request& req,
                            uvcpp_web_response& resp,
                            uvcpp_web_next) {
        const std::string* id = req.param("id");
        resp.json_str("{\"user_id\":\"" + (id ? *id : "") + "\"}");
        resp.end();
    });

    // ---- 通配符 ----
    app.get("/files/*path", [](uvcpp_web_request& req,
                               uvcpp_web_response& resp,
                               uvcpp_web_next) {
        const std::string* p = req.param("path");
        resp.text("requested: " + (p ? *p : std::string()));
        resp.end();
    });

    // ---- 鉴权中间件只作用于 /api 前缀 ----
    // （实际项目中可以用路径前缀路由组，这里简化处理）
    app.use(auth_middleware());

    // ---- 文件上传 ----
    app.post("/api/upload", [](uvcpp_web_request& req,
                               uvcpp_web_response& resp,
                               uvcpp_web_next) {
        auto* upload = req.upload();
        upload->set_upload_dir("./uploads");
        upload->set_max_file_size(50 * 1024 * 1024);
        upload->set_max_total_size(200 * 1024 * 1024);

        upload->on_file([](const uvcpp_web_uploaded_file& f) {
            std::cout << "收到文件: " << f.original_name
                      << " (" << f.size << " bytes)"
                      << " -> " << f.saved_path << std::endl;
        });

        upload->on_end([&resp]() {
            resp.json_str("{\"status\":\"uploaded\"}");
            resp.end();
        });
    });

    // ---- 异步 handler ----
    app.get("/api/slow", [&app](uvcpp_web_request&,
                                uvcpp_web_response& resp,
                                uvcpp_web_next next) {
        uvcpp_web_response* rp = &resp;
        auto* w = new uvcpp_work();
        w->init();
        w->queue_work(app.loop(),
            [](uvcpp_work*) {
                std::this_thread::sleep_for(
                    std::chrono::milliseconds(20));
            },
            [next, rp](uvcpp_work* done, int) {
                rp->json_str("{\"slow\":true}");
                rp->end();
                next();
                delete done;
            });
    });

    // ---- 静态资源 ----
    app.serve_static("/assets", "./public", true);

    app.start();
    std::cout << "Server on :8080, 4 loops" << std::endl;
    app.join();
    return 0;
}
```

**几个关键点 ：**

**`app.use(auth_middleware())` 放在公开路由之后**，这样 `/hello`、`/user/:id`、`/files/*path` 不需要鉴权，而后续注册的 `/api/upload` 和 `/api/slow` 会经过鉴权。中间件的“路径前缀”作用域通过注册顺序来控制——先注册的中间件作用于所有后续路由。

**异步 handler 中`next` 按值捕获**。框架看到 `next` 被捕获到异步回调中，就知道这一环会异步恢复，不会提前结束请求。如果只是同步处理，`next` 可以直接调用。

**`resp.end()` 是“我写完了”的标记，不是发送**。框架在 handler 返回后统一收尾时才真正把响应写出去。

### 七、本篇小结与下一步

这篇覆盖了从“Hello World”到真实业务的关键跨越：

**路由进阶** ——路径参数 `:id`、通配符 `*path`、HTTP 方法区分，匹配优先级静态 > 参数 > 通配。

**中间件链** ——`next()` 洋葱模型，异步中间件用 `hold()` / `release()` 声明生命周期，`web_middleware_cors()` 开箱即用。

**流式请求体** ——`uvcpp_web_stream` 的 `on_data` / `on_end`，配合 `pause()` / `resume()` 实现背压。

**文件上传** ——`uvcpp_web_upload` 的 multipart 流式落盘、随机叶子名、六条大小上限。

**请求对象** ——`param()` / `query_param()` / `header()` / `cookie()` / `form()` 的统一访问入口。

下一篇会进入 **WebSocket 实时通信** ：`uvcpp_web_ws` 端点的创建、连接生命周期管理、广播与房间模型，以及与 HTTP 路由共存在同一个应用中的实践。如果你在实践过程中遇到问题，欢迎在 [GitHub Issues](<https://github.com/Antruly/libuvcpp/issues>) 提出。
