---
title: "VWebAppServer 使用指南：基于 VLibuv 的录制服务实现（纯C++开发，类似软录像机，支持RTSP流）"
published: 2025-06-17
image: "/images/posts/covers/vwebappserver-guide.webp"
description: "介绍一款基于VLibuv框架的VWebAppServer类实现的 轻量级C++流媒体录制管理系统，具备RTSP流管理、视频录制、日志控制等功能。系统采用纯C++实现，资源占用低（CPU接近0%，内存<10MB），提供RESTful API和Web界面。核心组件包括StreamerManager（流管理）、RecordingManager（录制控制）和Web服务器。通过API可添加RTSP源、启停录制任务，支持预录制和多线程优化。项目依赖VLibuv、JsonCpp和FFmpeg，编译简单，高效运行_vwebserver"
tags: ["c++", "ffmpeg", "uv", "视频编解码", "web"]
category: "VLibuv"
lang: "zh_CN"
author: "Antruly"
sourceLink: "https://blog.csdn.net/qq_41697882/article/details/148722793"
comment: true
---

## VWebAppServer 使用指南：基于 VLibuv 的录制服务实现

### 目录

  1. 项目概述
  2. 环境准备
  3. 核心组件解析
  4. Web服务器配置
  5. API接口详解
  6. 使用示例
  7. 进阶用法
  8. 常见问题
  9. 项目截图

* * *

### 1\. 项目概述

本项目基于 [VLibuv](<https://github.com/Antruly/VLibuv>) 框架实现了一个全部基于C++实现（Web框架基于VLibuv/Web,也是自己的开源项目，是电脑就能运行，不依赖目前比如说Java，Python等需要复杂环境，且资源可控，不吃电脑性能，个人实测cpu几乎为0%，内存10m以下稳定运行）的一个完整的流媒体录制管理系统（部分类似软录像机功能，支持RTSP流拉取存储为视频文件的功能）。系统提供以下核心功能：

  * ​**RTSP流管理** ​：添加、移除、启动和停止RTSP流拉取
  * ​**录制任务管理** ​：创建、停止和查询录制任务
  * ​**日志管理** ​：动态调整日志级别
  * ​**Web界面** ​：提供简单的管理界面
  * ​**API接口** ​：完整的RESTful API接口

### 2\. 环境准备

#### 2.1 依赖库

  * VLibuv (v1.5.0或更高版本)
  * JsonCpp (用于JSON处理)
  * FFmpeg (用于流媒体处理和录制)

#### 2.2 编译项目

```bash
git clone https://github.com/Antruly/VLibuv.git
cd VLibuv
make
```

### 3\. 核心组件解析

#### 3.1 RecordWebServer

```cpp
class RecordWebServer {
public:
    RecordWebServer();
    ~RecordWebServer();

    void initWebServer();     // 初始化Web服务器
    void runServer(...);      // 启动服务器
    void stopServer();        // 停止服务器

private:
    // 请求处理函数
    int handleStreamerAddRequest(VWebAppRequest &req, VWebAppResponse &res);
    int handleRecordingStartRequest(VWebAppRequest &req, VWebAppResponse &res);
    // ...其他处理函数

    VWebAppServer webServer;  // Web服务器实例
    RecorderManager recorderManager;
    std::shared_ptr<StreamerManager> streamer_manager_;
    std::shared_ptr<RecordingManager> recording_manager_;
};
```

#### 3.2 关键组件

  1. ​**StreamerManager** ​：管理RTSP流拉取

     * 支持多线程拉流
     * 流缓存管理
     * 流状态监控
  2. ​**RecordingManager** ​：管理录制任务

     * 支持预录制功能
     * 任务状态管理
     * 录制进度跟踪
  3. ​**RecorderManager** ​：兼容旧版录制接口

     * 提供简单的录制控制
     * 状态查询功能

### 4\. Web服务器配置

#### 4.1 初始化服务器

```cpp
RecordWebServer server;
server.initWebServer();
```

#### 4.2 注册请求处理器

```cpp
void RecordWebServer::initWebServer() {
    // 静态资源处理
    this->webServer.registerHandler("./", "/web", ...);
    this->webServer.registerHandler("./", "/static", ...);

    // API接口注册
    this->webServer.registerHandler(METHOD_TYPE::POST, "/api/v1/streamer/add", ...);
    this->webServer.registerHandler(METHOD_TYPE::POST, "/api/v1/recording/start", ...);
    // ...其他接口注册
}
```

#### 4.3 启动服务器

```cpp
server.runServer("0.0.0.0", 8080); // 监听所有接口的8080端口
```

### 5\. API接口详解

#### 5.1 流管理接口

##### 添加流媒体源

```http
POST /api/v1/streamer/add
Content-Type: application/json

{
    "id": "camera1",
    "url": "rtsp://admin:password@192.168.1.100:554/stream1"
}
```

​**响应示例** ​：

```json
{
    "success": true,
    "code": 200,
    "message": "添加流媒体源成功",
    "result": {
        "id": "camera1",
        "url": "rtsp://admin:password@192.168.1.100:554/stream1",
        "cache_seconds": 10
    }
}
```

##### 启动流拉取

```http
POST /api/v1/streamer/start
Content-Type: application/json

{
    "id": "camera1"
}
```

#### 5.2 录制任务管理

##### 开始录制

```http
POST /api/v1/recording/start
Content-Type: application/json

{
    "task_id": "recording1",
    "streamer_id": "camera1",
    "output_path": "/videos/camera1.mp4"
}
```

##### 查询录制任务状态

```http
GET /api/v1/recording/info?task_id=recording1
```

​**响应示例** ​：

```json
{
    "success": true,
    "code": 200,
    "message": "录制任务信息查询成功",
    "result": [
        {
            "task_id": "recording1",
            "stream_id": "camera1",
            "output_path": "/videos/camera1.mp4",
            "state": 1,
            "frame_count": 3000,
            "progress": 50,
            "start_time": 1672531200000
        }
    ]
}
```

#### 5.3 日志管理

```http
POST /api/v1/logging/settings
Content-Type: application/json

{
    "level": "DEBUG"
}
```

### 6\. 使用示例

#### 6.1 完整服务启动代码

```cpp
#include "RecordWebServer.h"

int main() {
    RecordWebServer server;
    server.initWebServer();
    server.runServer("0.0.0.0", 8080);

    // 主循环
    while (true) {
        std::this_thread::sleep_for(std::chrono::seconds(1));
    }

    return 0;
}
```

#### 6.2 使用cURL管理录制任务

```bash
# 添加流媒体源
curl -X POST http://localhost:8080/api/v1/streamer/add \
     -H "Content-Type: application/json" \
     -d '{"id":"camera1", "url":"rtsp://example.com/stream1"}'

# 启动流拉取
curl -X POST http://localhost:8080/api/v1/streamer/start \
     -H "Content-Type: application/json" \
     -d '{"id":"camera1"}'

# 开始录制
curl -X POST http://localhost:8080/api/v1/recording/start \
     -H "Content-Type: application/json" \
     -d '{"task_id":"recording1", "streamer_id":"camera1", "output_path":"/videos/camera1.mp4"}'

# 查询录制状态
curl http://localhost:8080/api/v1/recording/info?task_id=recording1
```

#### 6.3 Web界面访问

访问 `http://localhost:8080/web` 查看管理界面

### 7\. 进阶用法

#### 7.1 预录制功能

```cpp
// 在开始录制时指定预录制时间
recording_manager_->startRecording(
    streamer_id.stdString(),
    streamer_manager_,
    output_path.stdString(),
    duration_seconds,
    pre_record_seconds, // 预录制秒数
    true); // 是否异步
```

#### 7.2 多线程优化

```cpp
// 在构造函数中指定线程数量
RecordWebServer::RecordWebServer()
    : streamer_manager_(std::make_shared<StreamerManager>(8)), // 8个拉流线程
      recording_manager_(std::make_shared<RecordingManager>(20)) // 最多20个录制任务
{}
```

#### 7.3 自定义错误处理

```cpp
int RecordWebServer::handleStreamerAddRequest(...) {
    try {
        // 业务逻辑
    } catch (const std::exception &e) {
        LOGEX(LOG_ERROR, MODULE_API) << "添加流异常: " << e.what();
        Json::Value response = createErrorResponse(500, "内部错误");
        return sendJsonResponse(res, 500, response);
    }
}
```

### 8\. 常见问题

#### Q1: 如何解决流连接失败问题？

A:

  1. 检查网络连接
  2. 验证RTSP URL和凭证
  3. 检查防火墙设置
  4. 增加日志级别查看详细错误

#### Q2: 录制文件不完整怎么办？

A:

  1. 增加预录制时间
  2. 检查磁盘空间
  3. 确保流缓存时间足够
  4. 使用`handleRecordingInfoRequest`查询任务状态

#### Q3: 如何提高系统性能？

A:

  1. 增加StreamerManager线程数
  2. 使用SSD存储录制文件
  3. 分离API服务和流处理服务
  4. 限制同时录制的任务数量

#### Q4: 如何处理API请求参数错误？

A: 使用`extractParam`模板函数：

```cpp
VString streamer_id;
if (!extractParam(params, "id", streamer_id)) {
    return sendJsonResponse(res, 400,
        createErrorResponse(400, "缺少必要参数: id"));
}
```

* * *

通过本指南，您应该能够：

  1. 理解VWebAppServer的基本架构
  2. 部署并运行流媒体录制服务
  3. 使用API管理流媒体源和录制任务
  4. 实现高级功能如预录制和多线程优化
  5. 解决常见问题并优化系统性能

### 9\. 项目截图

![个人不太会写前端，凑合看吧](/images/posts/vwebappserver-guide/01.png)
![资源占用情况，正常视频拉流运行](/images/posts/vwebappserver-guide/02.png)

![Web框架类头文件，还算比较清晰，一个接口一个回调函数，自己控制请求和响应](/images/posts/vwebappserver-guide/03.png)
![注册接口，支持静态路径](/images/posts/vwebappserver-guide/04.png)
![接口实现，基本上很清爽，也清晰](/images/posts/vwebappserver-guide/05.png)
