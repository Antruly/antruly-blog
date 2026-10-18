---
title: "uvp"
published: 2026-10-15
draft: false
# 置顶三件套之一，见 libuvcpp.md 的说明
order: 120
description: "libuvcpp 的配套工具链：一个 CLI 加一个 MCP server，让你从终端或 AI agent 里构建、运行、验证 libuvcpp 驱动的 C++ Web 服务。"
image: "images/uvp.webp"
status: "developing"
tags: ["TypeScript", "MCP"]
link:
  - label: "GitHub"
    icon: "fa7-brands:github"
    value: "https://github.com/Antruly/uvp"
  - label: "★ 1"
    icon: "material-symbols:star"
    value: "https://github.com/Antruly/uvp/stargazers"
---

[libuvcpp](/projects/libuvcpp/) 写起来是舒服的，但**跑起来麻烦**：C++ 项目该有的依赖、构建、进程管理一样不少，改一行要重新编一遍，服务起没起来、接口通不通还得自己盯。

`uvp` 就是来收拾这段脏活的——把「构建 → 运行 → 验证」这条链路收进**一个 CLI**。

## 为什么还带一个 MCP server

同样的能力也以 **MCP server** 的形式暴露出去，这样 AI agent 能直接调用它来构建和验证服务：改完代码自己编译、自己起服务、自己打接口确认改动生效，而不是让你在中间当传话筒。

对 libuvcpp 这种「改了底层要一路验到 HTTP 响应」的项目，这个闭环省事很多。

::github{repo="Antruly/uvp"}
