# koishi-plugin-gocqhttp
 
[![npm](https://img.shields.io/npm/v/koishi-plugin-dice?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-gocqhttp)

此插件将自动下载 [go-cqhttp](https://github.com/Mrs4s/go-cqhttp)，并在启动时自动运行，从而支持无需后端的 @koishijs/plugin-adapter-onebot。

## 环境变量

- GITHUB_MIRROR：下载所用的 GitHub 镜像，默认为 https://github.com
- GOCQHTTP_VERSION：要使用的 go-cqhttp 版本，设置为 latest 则使用最新版本，当前默认为 v1.0.0-rc3
