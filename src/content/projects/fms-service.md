---
title: "FMS-Service"
published: 2026-06-11
draft: false
order: 80
description: "自托管的文件管理服务，提供端到端加密、文件分享、WebDAV 访问和 Android 客户端。"
image: "images/fms-service.webp"
status: "developing"
tags: ["自托管", "WebDAV", "端到端加密"]
link:
  - label: "GitHub"
    icon: "fa7-brands:github"
    value: "https://github.com/Antruly/FMS-Service"
---

FMS（FileService）是一个**自己部署、数据自己拿着**的文件管理服务。

选自托管的人通常在意的是同一件事：文件不该躺在别人的服务器上。所以 FMS 的核心能力是：

- **端到端加密** —— 服务端拿不到明文
- **文件分享** —— 生成分享链接
- **WebDAV 访问** —— 可以直接挂载到系统文件管理器，或用支持 WebDAV 的任意客户端读写
- **Android 客户端** —— 配套的 [FMS-Service-app](/projects/fms-service-app/)

::github{repo="Antruly/FMS-Service"}
