## 本插件停止维护

请移步：<https://github.com/Mrs4s/go-cqhttp/issues/2471>

愿我们能在更加开放的平行世界再次相遇。

---

# koishi-plugin-gocqhttp
 
[![npm](https://img.shields.io/npm/v/koishi-plugin-gocqhttp?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-gocqhttp)

此插件将自动下载 [go-cqhttp](https://github.com/Mrs4s/go-cqhttp)，并在启动时自动运行，从而支持无需后端的 @koishijs/plugin-adapter-onebot。

目前支持以下功能：

- [x] 扫描二维码登录
- [x] 手机短信验证码
- [x] captcha 图片
- [x] 滑条验证
- [x] 设置登录设备

## 安装

```sh
npm install koishi-plugin-gocqhttp
```

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
