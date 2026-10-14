---
title: "centos 安装tomcat(arm和x86通用, 全网最详细步骤)"
published: 2024-05-12
image: "/images/posts/covers/centos-tomcat-install.webp"
updated: 2025-07-03
description: "在linux系统下安装tomcat服务,从下载安装到服务启动和开机自动启动项, 以及日志查询,日常维护等命令_tomcat arm版"
tags: ["centos", "tomcat", "arm开发"]
category: "环境配置"
lang: "zh_CN"
author: "Antruly"
sourceLink: "https://blog.csdn.net/qq_41697882/article/details/138736629"
comment: true
---

## 1\. 下载tomcat

```bash
wget https://archive.apache.org/dist/tomcat/tomcat-9/v9.0.5/bin/apache-tomcat-9.0.5.tar.gz
```

## 2\. 解压

```bash
tar -xzvf apache-tomcat-9.0.5.tar.gz
```

## 3\. 移动到指定目录

```bash
sudo mv apache-tomcat-9.0.5 /opt/tomcat
```

## 4\. 设置环境变量

```bash
echo "export CATALINA_HOME=/opt/tomcat" >> ~/.bashrc
source ~/.bashrc
```

## 5\. 拷贝war包进去

```bash
sudo cp test.war /opt/tomcat/webapps/
```

## 6\. 启动tomcat

```bash
/opt/tomcat/bin/startup.sh
```

## 7\. 关闭tomcat

```bash
/opt/tomcat/bin/shutdown.sh
```

## 8\. 设置防火墙端口过滤8080

```bash
sudo firewall-cmd --zone=public --add-port=8080/tcp --permanent
sudo firewall-cmd --reload
```

## 9\. 如防火墙没有运行(先执行这个启动防火墙)

```bash
sudo systemctl start firewalld
```

## 10\. 安装openjdk1.8(可选oracle的jdk,最后面有)

```bash
sudo yum install java-1.8.0-openjdk-devel -y
```

## 11\. 设置jdk1.8环境变量

```bash
export JAVA_HOME=/usr/lib/jvm/java-1.8.0-openjdk
export PATH=$PATH:$JAVA_HOME/bin
source ~/.bashrc
```

## 12\. 设置为服务启动

```bash
vim tomcat.service
```

### 写入以下内容

```bash
[Unit]
Description=Apache Tomcat Web Application Container
After=syslog.target network.target

[Service]
Type=forking

Environment=CATALINA_HOME=/opt/tomcat
Environment=JAVA_HOME=/usr/lib/jvm/jdk1.8.0_411
Environment=CATALINA_PID=/opt/tomcat/temp/tomcat.pid

ExecStart=/opt/tomcat/bin/startup.sh
ExecStop=/opt/tomcat/bin/shutdown.sh

User=tomcat
Group=tomcat
UMask=0007
RestartSec=10
Restart=always

[Install]
WantedBy=multi-user.target
```

### 将服务文件保存到系统目录中

```bash
sudo cp tomcat.service /etc/systemd/system/
```

```bash
## 重新加载systemd管理器配置
sudo systemctl daemon-reload
## 设置自动启用Tomcat服务
sudo systemctl enable tomcat.service
## 启动Tomcat服务
sudo systemctl start tomcat.service
```

```bash
# 13. 查看实时控制台日志
tail -f /opt/tomcat/logs/catalina.out
# 14. 查看tomcat日志
sudo less /opt/tomcat/logs/catalina.out
# 15. 查看systemd日志
sudo journalctl -xe
```

## 16\. 手动启动成功,服务启动失败

### 有可能没有创建tomcat用户

```bash
sudo useradd -r -m -U -d /opt/tomcat -s /bin/false tomcat
sudo chown -R tomcat:tomcat /opt/tomcat
sudo chmod -R 755 /opt/tomcat
```

### 在tomcat.service文件中，将User和Group字段设置为tomcat，以确保Tomcat以tomcat用户的身份运行

```ini
[Service]
...
User=tomcat
Group=tomcat
...
```

### 重新加载systemd配置并启动Tomcat服务

```bash
sudo systemctl daemon-reload
sudo systemctl start tomcat.service
```

## 17\. 如果需要安装oracle的jdk1.8版本

```bash
# 浏览器访问 https://www.oracle.com/java/technologies/downloads/# java8
1. 下载对应linux系统版本的jdk包
2. 将安装包复制到服务器
3. 将下载的安装包复制到你的CentOS服务器上
4. 然后在服务器上解压下载的安装包
tar -zxvf jdk-8u411-linux-aarch64.tar.gz

5. 移动解压后的文件夹到适当的位置
sudo mkdir -p /usr/lib/jvm
sudo mv jdk1.8.0_411  /usr/lib/jvm/

6. 设置环境变量：
编辑/etc/profile文件，添加以下行到文件末尾(如果已经安装了其他版本,则打开文件修改)：
export JAVA_HOME=/usr/lib/jvm/jdk1.8.0_411
export PATH=$PATH:$JAVA_HOME/bin
source /etc/profile

7. 验证Java安装：
执行以下命令验证Java是否成功安装：
java -version

8. 修改tomcat启动文件里的环境变量
vim /etc/systemd/system/tomcat.service
Environment=JAVA_HOME=/usr/lib/jvm/java-1.8.0-xxxx
```
