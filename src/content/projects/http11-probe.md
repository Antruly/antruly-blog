---
title: "Http11Probe"
published: 2026-10-10
draft: false
order: 35
description: "HTTP/1.1 服务端合规性探测平台，检查 RFC 9110/9112 一致性、请求走私向量与畸形输入处理。Fork 自 MDA2AV/Http11Probe。"
image: "images/http11-probe.webp"
status: "published"
tags: ["HTTP", "协议一致性", "Fork"]
link:
  - label: "站点"
    icon: "material-symbols:public"
    value: "https://www.http-probe.com/"
  - label: "GitHub"
    icon: "fa7-brands:github"
    value: "https://github.com/Antruly/Http11Probe"
---

探测一个 HTTP/1.1 服务端在各种边界情况下的行为：是否符合 RFC 9110 / 9112 的要求、对**请求走私（smuggling）向量**的处理、以及畸形输入会不会把服务打挂。

上游是 [MDA2AV/Http11Probe](https://github.com/MDA2AV/Http11Probe)，这个仓库是 fork，参与维护。

**注意这是 fork，不是我原创的项目。**

::github{repo="Antruly/Http11Probe"}
