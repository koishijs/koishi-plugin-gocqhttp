# koishi-plugin-gocqhttp
 
[![npm](https://img.shields.io/npm/v/koishi-plugin-dice?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-gocqhttp)

此插件将自动下载 [go-cqhttp](https://github.com/Mrs4s/go-cqhttp)，并在启动时自动运行，从而支持无需后端的 @koishijs/plugin-adapter-onebot。

目前支持以下功能：

- [x] 扫描二维码登录
- [x] 手机短信验证码
- [x] captcha 图片
- [ ] 滑条验证
- [ ] 设置设备信息

## 安装

```sh
npm install koishi-plugin-gocqhttp
```

此插件在**安装时**支持以下环境变量：

- GITHUB_MIRROR：下载所用的 GitHub 镜像，默认为 https://github.com
- GOCQHTTP_VERSION：要使用的 go-cqhttp 版本，设置为 latest 则使用最新版本，当前默认为 v1.0.0-rc3

## 使用方法

要使用此插件，需要完成两步配置：

```yaml
# koishi.yml
plugins:
  # 1. 添加这个插件
  gocqhttp:

  adapter-onebot:
    selfId: '123456789'
    protocol: ws-reverse
    # 2. 向机器人配置中添加 gocqhttp 属性
    # 未设置 enabled=true 的机器人不会创建子进程
    gocqhttp:
      enabled: true
      password: xxxxx
```
