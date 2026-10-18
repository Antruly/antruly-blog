---
title: "uvp-templates"
published: 2026-10-18
draft: false
order: 110
description: "uvp 的官方模板仓库：标准化的 uvp.template/1 包、一份可复现的索引，以及每个提交都要过的结构检查。"
image: "images/uvp-templates.webp"
status: "developing"
tags: ["JavaScript", "uvp"]
link:
  - label: "GitHub"
    icon: "fa7-brands:github"
    value: "https://github.com/Antruly/uvp-templates"
---

[uvp](/projects/uvp/) 负责客户端那一半：校验、存储、搜索、渲染模板包。这里是另一半——**包本身**，以及让包可信的那套流程。

## 格式归 uvp，不归这里

`uvp.template/1` 的定义在 uvp 那边，这个仓库只承载符合标准的包和那份确定性索引。两边对不上时以 uvp 为准，那时候是这里的 bug。

每个提交都要过同一套 CI：包结构、路径、体积上限、摘要、许可证与来源、一次有界的敏感信息扫描，以及索引是否可复现。索引由 `packages/` 生成，不手改。包一旦发布就不可变——要改只能发新版本。

## 现在的状态

Bootstrap。结构性检查已经在跑；**运行时**那条线（装上已发布的 uvp、导入模板、生成工作区、对着 libuvcpp 构建并真的跑起来）写好了但处于关闭状态，要等 uvp 发布带模板命令的版本。

所以结构检查通过，只能说明这个包的字节和元数据没问题，**不等于**生成的 C++ 能编译或能跑。这点 README 写得很直白，这里照抄。

::github{repo="Antruly/uvp-templates"}
