---
title: "ffmpeg windows 编译 最详细（完整包，包括所有依赖环境）"
published: 2022-08-01
image: "/images/posts/covers/ffmpeg-windows-build.webp"
updated: 2024-10-22
description: "本文档详细介绍了如何在Windows环境下编译FFmpeg源码，并将其配置到Visual Studio项目中。关键步骤包括：安装VS2015或以上版本，使用VS命令提示符安装汇编工具，打开解决方案文件直接编译，以及在项目中包含必要的头文件和库。特别注意国内下载依赖库的困难和VS工程的安全检查设置。"
tags: ["windows", "c++", "c语言", "visual studio"]
category: "环境配置"
lang: "zh_CN"
author: "Antruly"
sourceLink: "https://blog.csdn.net/qq_41697882/article/details/126098237"
comment: true
---

经过一段时间的折腾，发现ffmpeg windows 版本（源文件在github上[Shift Media Project · GitHub](<https://github.com/ShiftMediaProject> "Shift Media Project · GitHub")）实际配起来编译到项目使用上，还是有很多坑的，比如很多项目依赖库需要代理加速下载，国内下载有点困难，最终总算是折腾好了，现在分享给大家，节省时间，提高开发效率。[windows系统下ffmpegvs项目文件（完整包，包括所有依赖环境）-C文档类资源-CSDN下载](<https://download.csdn.net/download/qq_41697882/86269850?spm=1001.2014.3001.5503> "windows系统下ffmpegvs项目文件（完整包，包括所有依赖环境）-C文档类资源-CSDN下载")

1\. 仅需要安装vs2015及以上vs版本（如不行则安装vs2019，肯定是可以的），c++程序包即可

![](/images/posts/ffmpeg-windows-build/01.png)

2\. 使用vs 自带开发工具命令提示符（需要管理员身份运行，我这里是vs2022），安装VSNASM和VSYASM（汇编工具），分别cd 到对应文件夹目录，然后执行install_script.bat，安装完成即可

![](/images/posts/ffmpeg-windows-build/02.png)

![](/images/posts/ffmpeg-windows-build/03.png)

![](/images/posts/ffmpeg-windows-build/04.png)

3\. 打开sln项目文件，直接编译对应版本即可。输出目录在mscv目录下

![](/images/posts/ffmpeg-windows-build/05.png)

![](/images/posts/ffmpeg-windows-build/06.png)

![](/images/posts/ffmpeg-windows-build/07.png)

4\. 拷走对应bin、include和lib文件即可，这里直接编写了一个ffmpeg.h文件，直接快速包含所有头文件和lib，直接引用后开始写自己的代码

```cpp
#ifndef _FFMPEG_INCLUDE
#define _FFMPEG_INCLUDE

// 修改自己的相对路径即可（我这里是头文件和源文件分开的）
extern "C" {
#include "../ffmpeg/libavcodec/avcodec.h"
#include "../ffmpeg/libavformat/avformat.h"
#include "../ffmpeg/libavutil/imgutils.h"
#include "../ffmpeg/libavcodec/codec.h"
#include "../ffmpeg/libavutil/opt.h"
#include "../ffmpeg/libavutil/time.h"
#include "../ffmpeg/libavutil/channel_layout.h"
#include "../ffmpeg/libswscale/swscale.h"
#include "../ffmpeg/libswresample/swresample.h"
}

// windows
#ifdef WIN32
// debug
#ifdef _DEBUG
#define SPRINTF printf
#define FFMPEG_LOG_TYPE AV_LOG_INFO
// x64
#ifdef _WIN64
#pragma comment(lib, "./lib/ffmpeg/x64/libassd.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libavcodecd.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libavdeviced.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libavfilterd.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libavformatd.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libavutild.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libblurayd.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libbz2d.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libcdiod.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libcdio_paranoiad.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libfontconfigd.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libfreetyped.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libfribidid.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libgcryptd.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libgmed.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libgmpd.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libgnutlsd.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libgpg-errord.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libharfbuzzd.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libhogweedd.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libiconvd.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libilbcd.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/liblzmad.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libmfxd.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libmodplugd.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libmp3lamed.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libnettled.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/liboggd.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libopusd.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libpostprocd.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libsdl2d.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libsoxrd.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libspeexd.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libsshd.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libswresampled.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libswscaled.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libtheorad.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libvorbisd.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libvpxd.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libx264d.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libx265d.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libxml2d.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libxvidcored.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libzlibd.lib")
// x86
#else
#pragma comment(lib, "./lib/ffmpeg/x86/libassd.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libavcodecd.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libavdeviced.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libavfilterd.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libavformatd.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libavutild.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libblurayd.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libbz2d.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libcdiod.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libcdio_paranoiad.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libfontconfigd.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libfreetyped.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libfribidid.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libgcryptd.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libgmed.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libgmpd.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libgnutlsd.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libgpg-errord.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libharfbuzzd.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libhogweedd.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libiconvd.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libilbcd.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/liblzmad.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libmfxd.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libmodplugd.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libmp3lamed.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libnettled.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/liboggd.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libopusd.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libpostprocd.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libsdl2d.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libsoxrd.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libspeexd.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libsshd.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libswresampled.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libswscaled.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libtheorad.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libvorbisd.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libvpxd.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libx264d.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libx265d.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libxml2d.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libxvidcored.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libzlibd.lib")
#endif
// release
#else
// x64
#ifdef _WIN64
#pragma comment(lib, "./lib/ffmpeg/x64/libass.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libavcodec.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libavdevice.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libavfilter.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libavformat.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libavutil.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libbluray.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libbz2.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libcdio.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libcdio_paranoia.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libfontconfig.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libfreetype.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libfribidi.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libgcrypt.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libgme.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libgmp.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libgnutls.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libgpg-error.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libharfbuzz.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libhogweed.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libiconv.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libilbc.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/liblzma.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libmfx.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libmodplug.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libmp3lame.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libnettle.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libogg.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libopus.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libpostproc.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libsdl2.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libsoxr.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libspeex.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libssh.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libswresample.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libswscale.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libtheora.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libvorbis.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libvpx.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libx264.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libx265.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libxml2.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libxvidcore.lib")
#pragma comment(lib, "./lib/ffmpeg/x64/libzlib.lib")
// x86
#else
#pragma comment(lib, "./lib/ffmpeg/x86/libass.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libavcodec.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libavdevice.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libavfilter.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libavformat.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libavutil.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libbluray.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libbz2.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libcdio.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libcdio_paranoia.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libfontconfig.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libfreetype.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libfribidi.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libgcrypt.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libgme.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libgmp.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libgnutls.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libgpg-error.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libharfbuzz.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libhogweed.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libiconv.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libilbc.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/liblzma.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libmfx.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libmodplug.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libmp3lame.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libnettle.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libogg.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libopus.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libpostproc.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libsdl2.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libsoxr.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libspeex.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libssh.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libswresample.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libswscale.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libtheora.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libvorbis.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libvpx.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libx264.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libx265.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libxml2.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libxvidcore.lib")
#pragma comment(lib, "./lib/ffmpeg/x86/libzlib.lib")
#endif
#endif
// Not WIN32
#else

#endif

#endif // !_FFMPEG_INCLUDE
```

5\. vs工程配置，需要把sdl检查关掉，并在程序最开头添加宏_CRT_SECURE_NO_DEPRECATE，关掉安全检查，否则项目经常会出现4996错误

![](/images/posts/ffmpeg-windows-build/08.png)

```cpp
#ifndef _CRT_SECURE_NO_DEPRECATE
#define _CRT_SECURE_NO_DEPRECATE
#endif // !_CRT_SECURE_NO_DEPRECATE
```

附上参考文献

[vs2019编译ffmpeg源码为静态库动态库【完整步骤、亲测可行】_令狐掌门的博客-CSDN博客_ffmpeg编译静态库](<https://blog.csdn.net/yao_hou/article/details/121581878?utm_medium=distribute.pc_relevant.none-task-blog-2~default~baidujs_baidulandingword~default-1-121581878-blog-121115825.pc_relevant_default&spm=1001.2101.3001.4242.2&utm_relevant_index=4> "vs2019编译ffmpeg源码为静态库动态库【完整步骤、亲测可行】_令狐掌门的博客-CSDN博客_ffmpeg编译静态库")
