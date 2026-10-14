---
title: "libuv C++ 开源库（面向对象编程的libuv库VLibuv）"
published: 2024-01-04
image: "/images/posts/covers/vlibuv-intro.webp"
updated: 2025-07-03
description: "VLibuv是一个基于libuv的C++库，提供了面向对象的封装，简化异步和事件驱动应用开发。它封装了uv_handle_t和uv_req_t，扩展了缓冲区操作，支持TCP服务和连接。文章详细分析了库的主要特性和源码实现，包括VBuf.h、VHandle.h、VLoop.h和VTimer.h文件。"
tags: ["c++", "开发语言", "开源", "uv", "github"]
category: "VLibuv"
lang: "zh_CN"
author: "Antruly"
sourceLink: "https://blog.csdn.net/qq_41697882/article/details/135378682"
comment: true
---

#### 文章目录

libuv

VLibuv

项目简介:

主要特性:

源码分析:

VBuf.h

VHandle.h

VLoop.h

VTimer.h

代码示例:

GitHub源码地址:

* * *

### libuv

`libuv` 是一个跨平台的异步 I/O 库，主要用于构建事件驱动的程序。它最初是 Node.js 项目中的一部分，用于处理非阻塞 I/O 操作、定时器、事件循环等，以便构建高性能的网络应用和服务器。由于其独立性和跨平台特性，`libuv` 逐渐演变成一个单独的项目，可以被其他应用程序使用。

### VLibuv

#### **项目简介:**

[VLibuv](<https://github.com/Antruly/VLibuv> "VLibuv") 是一个基于 `libuv` 的 C++ 封装，旨在提供方便的面向对象编程接口，简化异步、事件驱动的应用程序开发的一个开源库。通过继承关系和扩展类型，VLibuv 提供了对 `libuv` 中的 `uv_handle_t` 和 `uv_req_t` 类型的封装，使其更符合 C++ 的面向对象编程风格。

#### **主要特性:**

  1. **C ++ 封装:** 提供对 `libuv` 原始类型的 C++ 封装，简化异步编程和事件处理。

  2. **uv_handle_t 和 uv_req_t 等扩展:** 通过 C++ 继承关系，扩展了每个 `uv_handle_t` 和 `uv_req_t` 类型和其他uv类型，方便管理和操作。

  3. **uv_buf_t 扩展:** 扩展了对 `uv_buf_t` 类型的方法，包括 `resize`、`clean`、`clone`、拷贝构造等，提高了缓冲区操作的灵活性。

  4. **衍生类型:** 在已有的 `libuv` 类型基础上，引入了一些衍生类型，如 `VTcpServer、VTcpClient`，可快速建立一个 TCP 服务和连接，避免繁琐的操作。

  5. **兼容性:** 保持与 `libuv` 1.0 所有系列版本的兼容性，同时跟踪官方更新，确保及时引入新特性和改进。

  6. **跨平台 ：**项目使用了cmake进行跨平台项目构建，Windows平台下测试生成vs2013和vs2022项目，Linux平台下生成makefile

#### 源码分析:

##### VBuf.h

```cpp
#pragma once

#include "VObject.h"

class VBuf final : public VObject {
 public:
  // 定义拷贝构造函数
  DEFINE_COPY_FUNC(VBuf);

  // 构造函数
  VBuf();

  // 析构函数
  ~VBuf();

  // 接受 char* 和 size_t 构造的构造函数
  VBuf(const char* bf, size_t sz);

  // 重载 new 操作符
  void* operator new(size_t size);

  // 重载 delete 操作符
  void operator delete(void* p);

  // 转换为 uv_buf_t 类型
  operator uv_buf_t();

  // 接受 uv_buf_t 类型的构造函数
  VBuf(const uv_buf_t& bf);

  // 重载 = 操作符，接受 uv_buf_t 类型
  VBuf& operator=(const uv_buf_t& bf);

  // 初始化函数
  int init();

  // 调整缓冲区大小
  void resize(size_t sz);

  // 设置缓冲区数据
  void setData(const char* bf, size_t sz);

  // 克隆数据到缓冲区
  void cloneData(const char* bf, size_t sz);

  // 获取缓冲区数据，返回可修改的指针
  char* getData() const;

  // 获取缓冲区数据，返回常量指针
  const char* getConstData() const;

  // 获取缓冲区大小
  size_t size() const;

  // 清空缓冲区
  void clean();

  // 克隆另一个 VBuf 对象
  void clone(const VBuf& cloneBuf);

 private:
  uv_buf_t buf; // 包含一个 uv_buf_t 对象作为成员变量
};
```

这里拿VBuf 做一个源码分析，VBuf 其实就是扩展uv_buf_t 类型，该类型作为libuv的字节数据存储类型，使用过程中，需要预先绑定一个char*类型，然后指定其长度，无法像大多数面向对象的字节数据类型一样，resize，或直接赋值等操作，这里Vbuf类型对其进行了扩展，uv_buf_t可直接强制转换为Vbuf类型，使用过程中可以无需关心其数据指针。

##### VHandle.h

```cpp
#pragma once
#include "VBuf.h"
#include "VObject.h"
#include <functional>

typedef uv_handle_type VHandleType;

class VHandle : public VObject {
 public:
  // 定义构造函数
  DEFINE_INHERIT_FUNC(VHandle);
  // 定义拷贝构造函数
  DEFINE_COPY_FUNC(VHandle);

  // 设置数据函数
  int setData(void* pdata);

  // 获取数据函数
  void* getData();

  // 引用计数相关操作
  void ref();
  void unref();
  int hasRef();

  // 获取 handle 类型和名称等信息
  VHandleType handleGetType();
  const char* handleTypeName();
  void* handleGetData();
  void* handleGetLoop();
  void handleSetData(void* data);

  // 获取 handle 的大小
  size_t handleSize();

  // 关闭 handle
  void close();
  int isClosing();

  // 判断 handle 是否活跃
  int isActive();

  // 关闭 handle，并指定关闭回调函数
  void close(std::function<void(VHandle*)> closeCallback);

  // 获取 handle 对象
  virtual uv_handle_t* getHandle() const;

  // 静态方法，克隆 VHandle 对象
  static VHandle* clone(VHandle* obj, int memSize);
  static void ref(void* hd);
  static void unref(void* hd);
  static int hasRef(const void* hd);

  // 静态方法，获取 handle 类型和名称等信息
  static VHandleType handleGetType(const VHandle* vhd);
  static const char* handleTypeName(VHandle* vhd);
  static void* handleGetData(const VHandle* vhd);
  static void* handleGetLoop(const VHandle* vhd);
  static void handleSetData(VHandle* vhd, void* data);

  // 静态方法，获取 handle 的大小
  static size_t handleSize(VHandle* vhd);

  // 静态方法，判断 handle 是否活跃
  static int isActive(const VHandle* vhd);

  // 静态方法，关闭 handle
  static void close(VHandle* vhd);

  // 静态方法，判断 handle 是否正在关闭
  static int isClosing(const VHandle* vhd);

 protected:
  // 设置 handle 对象
  void setHandle(void* hd);

 private:
  // 释放 handle 资源
  void freeHandle();

 protected:
  std::function<void(VHandle*)> handle_close_cb; // handle 关闭回调函数
  std::function<void(VHandle*, size_t, VBuf*)> handle_alloc_cb; // handle 分配回调函数
 private:
  uv_handle_t* handle = nullptr; // libuv handle 对象
  void* vdata = nullptr; // 数据指针
};
```

VHandle 类型其实就是 uv_handle_t 类型的扩展，类中继承了uv_handle_t类型的所有用法，并作为基类，扩展其他派生于VHandle的类型，数据结构包含了uv_handle_t* 类型指针和一个自定义void* 数据对象

##### VLoop.h

```cpp
#pragma once
#include "VCore.h"
#include "VHandle.h"

class VLoop : public VHandle {
 public:
  // 定义构造函数
  DEFINE_INHERIT_FUNC(VLoop);

  // 定义删除拷贝构造函数
  DEFINE_COPY_FUNC_DELETE(VLoop);

  // 初始化函数
  int init();

  // 关闭事件循环
  int close();

  // 运行事件循环，可指定运行模式，默认为 UV_RUN_DEFAULT
  int exec(uv_run_mode md = UV_RUN_DEFAULT);

 protected:
 private:
};
```

VLoop类型继承于VHandle，这里是uv_loop_t的扩展

##### VTimer.h

```cpp
#pragma once
#include "VLoop.h"
#include "VObject.h"

class VTimer : public VHandle {
 public:
  // 定义构造函数
  DEFINE_INHERIT_FUNC(VTimer);

  // 定义删除拷贝构造函数
  DEFINE_COPY_FUNC_DELETE(VTimer);

  // 构造函数，接受 VLoop 指针
  VTimer(VLoop* loop);

  // 初始化函数
  int init();

  // 重载初始化函数，接受 VLoop 指针
  int init(VLoop* loop);

  // 启动定时器，接受回调函数、超时时间和重复间隔
  int start(std::function<void(VTimer*)> start_cb,
            uint64_t timeout,
            uint64_t repeat);

  // 停止定时器
  int stop();

 protected:
  std::function<void(VTimer*)> timer_start_cb; // 定时器回调函数

 private:
  // 静态回调函数，用于传递到 libuv 的回调
  static void callback_start(uv_timer_t* handle);
};
```

这里举例出VHandle的一个功能派生类，用法也比较简单，直接调用其start方法即可

#### 代码示例:

```cpp
#include "VTimer.h"

// 定时器回调函数
void timerFunc(VTimer* vtimer) {
    // 在这里可以添加定时器触发时的逻辑
    // 例如输出一条消息
    std::cout << "Timer triggered!" << std::endl;

    // 从 VTimer 获取关联的 VBuf 对象
    VBuf* vbuf = static_cast<VBuf*>(vtimer->getData());

    // 检查 vbuf 是否为空
    if (vbuf) {
        // 输出缓冲区数据
        std::cout << "Buffer data: " << vbuf->getConstData() << std::endl;

        // 调整缓冲区大小
        vbuf->resize(20);

        // 输出调整后的缓冲区大小
        std::cout << "Resized buffer size: " << vbuf->size() << std::endl;
    } else {
        std::cerr << "Error: VBuf is not set in VTimer!" << std::endl;
    }
}

int main() {
    // 创建事件循环对象
    VLoop vloop;

    // 创建 VBuf 对象
    VBuf vbuf;
    // 设置缓冲区数据
    vbuf.cloneData("Hello, World!", 13);

    // 创建定时器对象，并关联到事件循环
    VTimer vtimer(&vloop);

    // 设置 VBuf 对象到定时器中
    vtimer.setData(&vbuf);

    // 启动定时器，设置回调函数为 timerFunc，定时间隔为 1000 毫秒，重复次数为 0 表示无限重复
    vtimer.start(timerFunc, 1000, 0);

    // 进入事件循环，等待事件的发生
    return vloop.exec();
}
```

#### GitHub源码地址:

[GitHub - Antruly/VLibuv: libuv 的c++ 扩展库](<https://www.github.com/Antruly/VLibuv> "GitHub - Antruly/VLibuv: libuv 的c++ 扩展库")
