---
title: "从零实现的多文件系统数据恢复工具：fsrec 项目完全解析"
published: 2026-09-10
image: "/images/posts/covers/fsrec-data-recovery.webp"
updated: 2026-09-20
description: "fsrec 是一款开源、跨文件系统（NTFS/FAT/exFAT）的数据恢复工具，基于C++17实现，不依赖第三方引擎，直接解析磁盘底层结构（如$MFT、BPB、数据运行），在内存中重建目录树，支持误删、清空回收站、分区误格式化等场景下的文件恢复。具备多文件系统兼容、原目录结构恢复、实时进度推送、热插拔检测与安全校验（序列号/型号/容量匹配）等功能，通过单文件前端与RESTful API提供直观交互，确保源盘只读操作，保障数据安全。"
tags: ["c++", "websocket", "http", "uv"]
category: "开源项目"
lang: "zh_CN"
author: "Antruly"
sourceLink: "https://blog.csdn.net/qq_41697882/article/details/164758637"
comment: true
---

### 写在前面

在日常使用电脑的过程中，误格式化硬盘、误删文件、分区表损坏等情况时有发生。面对这些数据丢失的困境，市面上虽然有各种恢复软件，但要么收费高昂，要么闭源不透明。今天给大家介绍一款我最近开源的跨文件系统数据恢复工具——**fsrec** 。

项目地址：<https://github.com/Antruly/fsrec>

fsrec 是一款面向 Windows 的数据恢复工具，**不依赖任何第三方恢复引擎** ，而是直接从文件系统底层数据结构出发——解析引导扇区（BPB）、NTFS 主文件表（`$MFT`）、FAT 目录项与数据运行（Data Run），在内存中重建完整的目录树[reference:0][reference:1]。你可以像浏览普通文件一样浏览那些已被删除、被清空回收站，甚至在分区被误格式化后仍残留在磁盘上的文件，并**按原目录结构** 把它们恢复到另一块磁盘。

### 项目背景与技术选型

作为一个从零实现的多文件系统数据恢复工具，fsrec 的技术栈选择如下[reference:2][reference:3]：

| 维度 | 说明 |
| --- | --- |
| 语言 / 运行时 | C++17（MSVC，Windows x64） |
| 网络层 | libuvcpp（HTTP / WebSocket / 静态文件） |
| JSON | nlohmann/json（单头文件，已内置） |
| 前端 | 单文件原生 HTML/CSS/JS（零构建步骤） |

选择 C++ 是为了更好地进行底层磁盘操作和性能优化；网络层基于 libuvcpp 库，提供 HTTP 服务和 WebSocket 实时推送；前端则采用单文件设计，用户无需任何构建工具即可直接使用。

### 功能特性一览

fsrec 提供了完整的数据恢复工作流，从磁盘扫描到文件恢复，再到实时监控，一应俱全[reference:4][reference:5]：

#### 核心恢复能力

  * **多文件系统支持** — 同时支持 **NTFS / FAT12 / FAT16 / FAT32 / exFAT** 五种文件系统[reference:6]
  * **磁盘枚举** — 列出物理磁盘与盘符，自动识别并锁定系统盘（磁盘 0，禁止选择），防止误操作
  * **引导扇区解析** — 读取 BPB：字节/扇区、扇区/簇、`$MFT` 起始 LCN、记录大小等
  * **`$MFT` 解析** — 遍历文件记录，USA 修复，提取 `$STANDARD_INFORMATION` / `$FILE_NAME` / `$DATA`
  * **数据运行解析** — 支持 resident / non-resident 属性，含稀疏簇处理
  * **目录树重建** — 依据父引用与文件名（含 `$MFT` 编号兜底）构建完整树
  * **分区级扫描** — `raw_scan_all` 遍历整盘，定位每个分区（NTFS 经 `$MFT` 搜索，FAT/exFAT 经 MBR 分区表）并分别缓存[reference:7]
  * **FAT/exFAT 专项解析** — 同时解析 FAT12/16/32 与 exFAT（BPB / 目录项 / FAT 链 / exFAT 文件+流+名称项）[reference:8]

#### 交互与体验

  * **搜索过滤** — 前端按名称 / 类型快速筛选文件
  * **选择性恢复** — 保留原目录结构写入输出目录，同名文件自动改名（追加 `_1`、`_2`…），支持**暂停 / 继续 / 停止**[reference:9]
  * **实时进度** — WebSocket 推送总体进度 + 当前文件 + 每文件字节进度；刷新页面后自动恢复进行中的任务[reference:10]

#### 运维与监控

  * **磁盘监控** — 实时读取速度（全局 + 单盘）、点击磁盘展开**任务管理器风格动态折线图** 、磁盘**热插拔** 自动刷新并提示任务中断[reference:11]
  * **安全与空间** — 源盘锁定（目录选择器禁用源盘）、空间预估与不足警告[reference:12]

### 工作原理

fsrec 的工作流程可以概括为以下几个步骤：

```
Web UI <--> HTTP/WebSocket <--> libuvcpp 服务器
|
+--> Scanner 后台扫描
| |
| +--> 引导扇区解析（BPB）
| +--> $MFT / FAT 目录项解析
| +--> 数据运行 / FAT 链解析
| +--> 目录树重建
| +--> 扫描结果缓存
|
+--> Restorer 后台恢复
|
+--> 输出目录
```

  1. **读取** ：以 `CreateFile(\\\\.\\PhysicalDriveN, GENERIC_READ)` 只读打开源盘，**绝不在源盘写入**
  2. **定位** ：解析引导扇区 BPB，找到文件系统元数据起始位置
  3. **解析** ：遍历文件记录（NTFS 的 `$MFT` 或 FAT 的目录项），修复 USA，提取属性与数据运行，重建目录树
  4. **恢复** ：按用户勾选的路径，将文件内容（含已删除但仍残留的数据簇）原样写入另一块磁盘

### 快速开始

#### 直接下载（推荐）

从 [Releases](<https://github.com/Antruly/fsrec/releases>) 下载 `fsrec_Setup_xxx.exe`，双击安装（全中文向导）[reference:13]。安装完成后[reference:14]：

  1. 自动触发 UAC 提权（`requireAdministrator` 清单）
  2. 服务在后台启动，并自动打开浏览器访问 Web UI
  3. 选择源磁盘 → 扫描 → 勾选文件 → 恢复到另一块磁盘

#### 从源码构建

前置条件：Windows、Visual Studio 2022（MSVC，需匹配预编译的 libuvcpp 二进制）、CMake ≥ 3.20[reference:15]。

```bash
git clone https://github.com/Antruly/fsrec.git
cd fsrec
cmake -S . -B build -A x64
cmake --build build --config Release
```

产物为 build\Release\recovery_server.exe，运行时依赖同目录下的 uvcpp.dll、uv.dll、llhttp.dll、libssl-3-x64.dll、libcrypto-3-x64.dll。

```bash
recovery_server.exe              # 监听 0.0.0.0:8080，自动打开浏览器
recovery_server.exe --port 8090  # 指定端口
recovery_server.exe --no-browser # 不自动打开浏览器
```

健康检查：curl http://localhost:8080/ping → {“status”:“ok”,“name”:“fsrec”,“version”:“1.0.10”}

### API 概览

fsrec 提供了一套完整的 RESTful API，方便二次开发或集成：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | /ping | 健康检查 |
| GET | /api/physical_disks | 物理磁盘列表 |
| POST | /api/raw_scan_all | 遍历整盘、定位所有分区 |
| GET | /api/scans | 已完成的扫描（含持久化缓存） |
| GET | /api/active | 进行中的扫描/恢复任务 |
| GET | /api/scan/{id}/status | 扫描进度 |
| GET | /api/scan/{id}/results | 目录树 |
| POST | /api/scan/{id}/pause\|resume\|stop | 控制扫描任务 |
| POST | /api/recover | 提交恢复任务 |
| GET | /api/recover/{id}/status | 恢复进度 |
| POST | /api/recover/{id}/pause\|resume\|stop | 控制恢复任务 |
| GET | /api/fs/drives | 盘符与磁盘映射 |
| GET | /api/fs/list?path= | 目录列表 |
| POST | /api/fs/mkdir | 新建目录 |
| GET | /api/fs/space?path= | 目标卷空间信息 |
| WS | /ws | WebSocket 实时推送 |

### 目录结构

```
fsrec/
├── CMakeLists.txt
├── src/
│   ├── main.cpp                 # 入口：管理员检测 + 参数解析 + 启动服务
│   ├── include/                 # types.h / util.h / util.cpp / version.h
│   ├── ntfs/                    # disk_reader / boot_parser / data_run / mft_parser / tree_builder
│   ├── fat/                     # FAT12/16/32 与 exFAT 解析模块
│   ├── recovery/                # scanner（后台扫描）/ restorer（后台恢复）
│   └── http/                    # 路由 + WebSocket 推送中心
├── resources/                   # 图标与资源文件
├── frontend/
│   └── dist/index.html          # 线上前端（单文件）
├── docs/
│   ├── 使用说明.md              # 用户手册
│   └── 免责声明.md
├── packaging/                   # Inno Setup 安装脚本
└── scripts/                     # 构建与打包脚本
```

### 最新版本更新亮点

fsrec 持续迭代，最新版本 v1.0.10 在安全性和稳定性上做了重要改进：

严格校验源磁盘身份：/api/recover 现在按磁盘序列号（serial）校验源盘，序列号为空或全零时回退至「型号 + 容量」匹配；身份不匹配或无法校验时一律拒绝恢复（HTTP 409）。彻底修复了「拔掉原盘、插入另一块盘占用同一 PhysicalDrive 槽位后，仍能恢复错盘数据」的严重问题。

权威连接状态显示：/api/scans 返回后端计算的 connected 字段，界面据此展示，不再用磁盘号兜底误判。

同槽位换盘识别：热插拔检测按全身份识别——磁盘号不变但序列号/型号/容量变化时也能触发刷新，界面及时显示断开。

此前 v1.0.9 版本还新增了 FAT12/16/32 与 exFAT 文件系统支持，并修复了 NTFS 扩展记录（$ATTRIBUTE_LIST）漏扫问题。

### 安全与注意事项

数据恢复涉及用户敏感数据，fsrec 在安全方面做了多重保障：

源盘通过 CreateFile(GENERIC_READ) 只读打开，绝不写入源盘

恢复输出目录后端会校验并拒绝与源盘 / 系统盘相同的磁盘

已删除文件的数据区可能已被覆写，不可恢复项会标注

同名文件自动追加 _1、_2… 后缀，不覆盖

请勿在存有重要数据的生产机上随意测试；详见 docs/使用说明.md 与 docs/免责声明.md

### 总结

fsrec 是一个从零实现的多文件系统数据恢复工具，涵盖了从底层磁盘读取、NTFS/FAT/exFAT 文件系统解析、目录树重建到 Web 可视化操作和实时进度推送的完整链路。项目采用 C++17 开发，前端为单文件 HTML/CSS/JS，零构建步骤即可使用。

目前项目已开源在 GitHub 上，采用 MIT 许可证，欢迎 Star、Fork 和提交 PR！

项目地址：<https://github.com/Antruly/fsrec>

技术交流：欢迎在 GitHub Issues 中讨论问题或提出建议。

如果你对文件系统底层原理感兴趣，或者正在寻找一款开源、透明、可定制的数据恢复工具，fsrec 值得你一试！
