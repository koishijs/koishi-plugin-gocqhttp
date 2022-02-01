# koishi-plugin-gocqhttp
 
[![npm](https://img.shields.io/npm/v/koishi-plugin-dice?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-gocqhttp)

此插件将自动下载 [go-cqhttp](https://github.com/Mrs4s/go-cqhttp)，并在启动时自动运行，从而支持无需后端的 @koishijs/plugin-adapter-onebot。

## 环境变量

- GITHUB_MIRROR：下载所用的 GitHub 镜像，默认为 https://download.fastgit.org
- GOCQHTTP_VERSION：要使用的 go-cqhttp 版本，设置为 latest 则使用最新版本，当前默认为 v1.0.0-beta8-fix2

## 配置项
- device: 改变设备协议(只有gocqhttp文件夹里面有device.json才会改生效) 默认是 'iPad'
- mirror: 跟GITHUB_MIRROR环境变量一样意义(只不过下载失败才生效会配置) 默认为 'https://download.fastgit.org'
- version: 跟GOCQHTTP_VERSION环境变量一样意义(只不过下载失败才会生效配置) 默认为 'v1.0.0-beta8-fix2'
