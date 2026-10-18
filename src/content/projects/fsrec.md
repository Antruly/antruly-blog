---
title: "fsrec"
published: 2026-09-08
draft: false
order: 90
description: "面向 Windows 的数据恢复工具，支持 NTFS / FAT12 / FAT16 / FAT32 / exFAT。不依赖第三方恢复引擎，直接从文件系统底层结构重建目录树。"
image: "images/fsrec.webp"
status: "published"
tags: ["C++", "NTFS", "数据恢复", "Windows"]
link:
  - label: "GitHub"
    icon: "fa7-brands:github"
    value: "https://github.com/Antruly/fsrec"
---

一个不套壳的 Windows 数据恢复工具。

市面上的恢复软件大多是在别人的恢复引擎上包一层界面。fsrec 走的是相反的路：**从文件系统的底层数据结构出发自己解析**，不依赖任何第三方恢复引擎。

## 它解析什么

| 文件系统 | 依赖的底层结构 |
|---|---|
| NTFS | 引导扇区 BPB、主文件表 `$MFT` |
| FAT12/16/32 | 引导扇区、FAT 目录项 |
| exFAT | 目录项与数据运行（Data Run） |

解析完之后在内存里**重建完整的目录树**，于是那些已被删除、已清空回收站、甚至在分区被误格式化之后仍残留在磁盘上的文件，可以像浏览普通文件一样浏览，并按原目录结构恢复到另一块磁盘。

::github{repo="Antruly/fsrec"}
