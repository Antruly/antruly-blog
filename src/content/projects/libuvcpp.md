---
title: "libuvcpp"
published: 2026-01-27
draft: false
# 置顶三件套之一：libuvcpp(130) → uvp(120) → uvp-templates(110)。
# order 降序排列，这一档刻意与其余项目（最高 95）拉开距离。
order: 130
description: "在保留 libuv 高性能与原有语义的前提下，把 libuv 的基础类型系统化封装成对应的 C++ 类，并扩展了内存池、Net、Web、SSL 等模块。"
image: "images/libuvcpp.webp"
status: "published"
tags: ["C++", "libuv", "异步IO", "网络库"]
link:
  - label: "GitHub"
    icon: "fa7-brands:github"
    value: "https://github.com/Antruly/libuvcpp"
  - label: "★ 13"
    icon: "material-symbols:star"
    value: "https://github.com/Antruly/libuvcpp/stargazers"
---

把 libuv 这类 C 风格的异步库直接用在 C++ 里，写起来是比较别扭的：回调签名长、生命周期要靠手动管理、类型信息在 `void*` 里丢失。libuvcpp 要解决的就是这层摩擦——**不改变 libuv 的语义和性能特征**，只是把它封装成符合 C++ 使用习惯的形态。

## 做法

- 把 libuv 的基础类型系统化地封装为对应的 C++ 类，相关方法归并到合适的类里
- 在此基础上扩展了**内存池、Net、Web、SSL** 等模块，覆盖日常开发中常见的工具服务
- 保留 C ABI 导出，需要时仍然可以从 C 侧调用

## 在这套封装之上

`uvcpp_web_app` / `uvcpp_web_router` 是它的 Web 框架层：路由（含 `:param` 参数路由）、中间件（洋葱模型）、静态文件服务、WebSocket、JSON 响应都是现成的。

本站的后端就打算建在这一层上。相关的接口约定见 [关于我](/about/) 里提到的两阶段方案。

::github{repo="Antruly/libuvcpp"}
