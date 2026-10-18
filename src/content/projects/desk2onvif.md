---
title: "Desk2ONVIF"
published: 2026-10-13
draft: false
order: 95
description: "把 Windows 桌面变成一台标准 ONVIF Profile S 网络摄像机。DeskCamera（闭源收费）的开源替代：多通道、主/子双码流、音频、OSD，无需硬件编码器。"
image: "images/desk2onvif.webp"
status: "developing"
tags: ["C++", "ONVIF", "RTSP", "Windows"]
link:
  - label: "GitHub"
    icon: "fa7-brands:github"
    value: "https://github.com/Antruly/Desk2ONVIF"
---

把一台普通 Windows 机器的桌面画面，伪装成一台**符合 ONVIF Profile S 标准的网络摄像机**——任何支持 ONVIF 的 NVR、录像机或监控客户端都能像添加一台真实 IPC 那样把它加进来。

用途很实际：给 NVR 做通道测试、在没有硬件编码器的情况下搭监控环境、或者单纯想把某台机器的屏幕纳入已有的监控体系。

## 关键点

- **标准 ONVIF Profile S**：WS-Discovery 设备发现 + ONVIF 设备/媒体服务，不是「仿了个样子」
- **多通道**、**主/子双码流**，音频与 OSD 叠加
- **不需要硬件编码器**：走 DXGI 抓屏 + FFmpeg 编码 + live555 推流
- 带一个 Vue 3 写的 Web 控制台

后端网络层用的就是自己写的 [libuvcpp](/projects/libuvcpp/)。

::github{repo="Antruly/Desk2ONVIF"}
