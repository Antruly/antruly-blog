---
title: "MysqlSyncMonitor"
published: 2025-06-17
draft: false
order: 25
description: "MySQL 主备服务检查工具：连接断开或主从同步异常时告警。"
image: "images/mysql-sync-monitor.webp"
status: "published"
tags: ["C", "MySQL", "监控"]
link:
  - label: "GitHub"
    icon: "fa7-brands:github"
    value: "https://github.com/Antruly/MysqlSyncMonitor"
---

MySQL 主备（主从）架构的巡检小工具。

盯着两件事：**主备之间的连接有没有断**，以及**主从同步有没有出现异常**。一旦不满足预期就告警——这类问题如果不主动发现，通常要等到业务出问题才会暴露。

::github{repo="Antruly/MysqlSyncMonitor"}
