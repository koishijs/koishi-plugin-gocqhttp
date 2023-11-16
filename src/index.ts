import { Context, Dict, interpolate, Logger, noop, Schema } from 'koishi'
import OneBotBot from '@koishijs/plugin-adapter-onebot'
import { DataService } from '@koishijs/plugin-console'
import {} from '@koishijs/plugin-market'
import { ChildProcess } from 'child_process'
import { resolve } from 'path'
import { cp, mkdir, readFile, rm, stat, writeFile } from 'fs/promises'
import { createReadStream, promises as fsp, Stats } from 'fs'
import gocqhttp from 'go-cqhttp'
import strip from 'strip-ansi'

declare module '@koishijs/plugin-console' {
  namespace Console {
    interface Services {
      gocqhttp: Launcher
    }
  }

  interface Events {
    'gocqhttp/device'(sid: string, device: string): void
    'gocqhttp/write'(sid: string, text: string): void
    'gocqhttp/start'(sid: string): void
    'gocqhttp/stop'(sid: string): void
  }
}

declare module '@satorijs/adapter-onebot/lib/bot' {
  interface OneBotBot {
    process: ChildProcess
  }

  namespace OneBotBot {
    interface BaseConfig {
      gocqhttp?: GoCqhttpConfig
    }
  }
}

interface GoCqhttpConfig {
  enabled: boolean
  password?: string
}

export const logger = new Logger('gocqhttp')

const logLevelMap = {
  DEBUG: 'debug',
  INFO: 'debug',
  WARNING: 'warn',
  ERROR: 'error',
  FATAL: 'error',
}

namespace Data {
  export type Status =
    | 'error'
    | 'offline'
    | 'success'
    | 'continue'
    | 'init'
    | 'sms'
    | 'qrcode'
    | 'slider'
    | 'captcha'
    | 'sms-confirm'
    | 'sms-or-qrcode'
    | 'slider-or-qrcode'
}

interface Data {
  status: Data.Status
  image?: string
  phone?: string
  link?: string
  message?: string
  device?: string
}

class Launcher extends DataService<Dict<Data>> {
  payload: Dict<Data> = Object.create(null)
  templateTask: Promise<string>
  migrateTask: Promise<void>

  constructor(ctx: Context, private config: Launcher.Config) {
    super(ctx, 'gocqhttp', { authority: 4 })
    logger.level = config.logLevel

    ctx.on('bot-connect', async (bot: OneBotBot) => {
      if (!bot.config.gocqhttp?.enabled) return
      await this.start()
      return this.connect(bot)
    })

    ctx.on('bot-disconnect', async (bot: OneBotBot) => {
      return this.disconnect(bot, true)
    })

    ctx.using(['console'], (ctx) => {
      ctx.console.addEntry({
        dev: resolve(__dirname, '../client/index.ts'),
        prod: resolve(__dirname, '../dist'),
      })

      ctx.console.addListener('gocqhttp/device', (sid, device) => {
        const bot = this.ctx.bots[sid] as OneBotBot
        const cwd = resolve(bot.ctx.baseDir, this.config.root, bot.selfId)
        return this.writeDevice(cwd, device)
      }, { authority: 4 })

      ctx.console.addListener('gocqhttp/write', (sid, text) => {
        return this.write(sid, text)
      }, { authority: 4 })

      ctx.console.addListener('gocqhttp/start', (sid) => {
        const bot = this.ctx.bots[sid] as OneBotBot
        if (!bot) return
        return this.connect(bot)
      }, { authority: 4 })

      ctx.console.addListener('gocqhttp/stop', (sid) => {
        const bot = this.ctx.bots[sid] as OneBotBot
        if (!bot) return
        return this.disconnect(bot)
      }, { authority: 4 })
    })

    ctx.router.get('/gocqhttp/captcha', (ctx, next) => {
      ctx.type = '.html'
      ctx.body = createReadStream(resolve(__dirname, '../captcha.html'))
    })

    ctx.router.post('/gocqhttp/ticket', (ctx, next) => {
      if (!ctx.query.id || !ctx.query.ticket) return ctx.status = 400
      const sid = ctx.query.id.toString()
      const ticket = ctx.query.ticket.toString()
      const bot = this.ctx.bots[sid] as OneBotBot
      if (!bot) return ctx.status = 404
      ctx.status = 200
      this.setData(bot, { status: 'continue' })
      return this.write(sid, ticket)
    })
  }

  private async migrate() {
    const legacy = resolve(this.ctx.baseDir, 'accounts')
    const folder = resolve(this.ctx.baseDir, this.config.root)
    await mkdir(folder, { recursive: true })
    const stats: Stats = await stat(legacy).catch(() => null)
    if (stats?.isDirectory()) {
      logger.info('migrating to data directory')
      await cp(legacy, folder)
      await rm(legacy, { recursive: true, force: true })
    }
  }

  async start() {
    return this.migrateTask = this.migrate()
  }

  async stop() {
    for (const bot of this.ctx.bots) {
      this.disconnect(bot as OneBotBot, true)
    }
  }

  private async write(sid: string, text: string) {
    const bot = this.ctx.bots[sid] as OneBotBot
    return new Promise<void>((resolve, reject) => {
      bot.process.stdin.write(text + '\n', (error) => {
        error ? reject(error) : resolve()
      })
    })
  }

  private async getTemplate() {
    const filename = this.config.template
      ? resolve(this.ctx.baseDir, this.config.template)
      : resolve(__dirname, '../template.yml')
    return readFile(filename, 'utf8')
  }

  private async getConfig(bot: OneBotBot) {
    const template = await (this.templateTask ||= this.getTemplate())
    const config = {
      message: JSON.stringify(this.config.message),
      signServer: this.config.signServer,
      key: this.config.key,
      isBelow110: this.config.isBelow110,
      ...bot.config,
      ...bot.config.gocqhttp,
    }
    if ('endpoint' in config) {
      try {
        config.endpoint = `${this.config.host}:${new URL(config.endpoint).port}`
      } catch (e) {
        logger.error('invalid endpoint:', config.endpoint)
      }
    }
    if ('path' in config) {
      config['selfUrl'] = `127.0.0.1:${this.ctx.router.port}${config.path}`
    }
    return interpolate(template, config, /\$\{\{(.+?)\}\}/g)
  }

  async get() {
    return this.payload
  }

  private async setData(bot: OneBotBot, data: Data) {
    this.payload[bot.sid] = data
    if (['error', 'success', 'offline'].includes(data.status)) {
      const cwd = resolve(bot.ctx.baseDir, this.config.root, bot.selfId)
      data.device = await this.readDevice(cwd).catch(noop)
    }
    this.refresh()
  }

  async readDevice(cwd: string) {
    const [json, buffer] = await Promise.all([
      fsp.readFile(cwd + '/device.json', 'utf8').catch(noop),
      fsp.readFile(cwd + '/session.token').catch(noop),
    ])
    if (!json) return 'qdvc:'
    const prefix = 'qdvc:' + Buffer.from(json).toString('base64')
    if (!buffer) return prefix
    return `${prefix},${Buffer.from(buffer).toString('base64')}`
  }

  async writeDevice(cwd: string, data: string) {
    if (!data.startsWith('qdvc:')) throw new Error('invalid qdvc string')
    const tasks: Promise<void>[] = []
    const [device, session] = data.slice(5).split(',')
    tasks.push(device
      ? fsp.writeFile(cwd + '/device.json', Buffer.from(device, 'base64').toString())
      : fsp.rm(cwd + '/device.json').catch(noop))
    tasks.push(session
      ? fsp.writeFile(cwd + '/session.token', Buffer.from(session, 'base64'))
      : fsp.rm(cwd + '/session.token').catch(noop))
    await Promise.all(tasks)
  }

  async connect(bot: OneBotBot) {
    // create working folder
    const { root } = this.config
    const cwd = resolve(bot.ctx.baseDir, root, bot.selfId)
    await mkdir(cwd, { recursive: true })

    // create config.yml
    await writeFile(cwd + '/config.yml', await this.getConfig(bot))

    return new Promise<void>((resolve, reject) => {
      this.setData(bot, { status: 'init' })

      // spawn go-cqhttp process
      bot.process = gocqhttp({ cwd, faststart: true })

      const handleData = async (data: any) => {
        data = strip(data.toString()).trim()
        if (!data) return
        for (const line of data.trim().split('\n')) {
          let text: string = line.slice(23)
          const [type] = text.split(']: ', 1)
          if (type in logLevelMap) {
            text = text.slice(type.length + 3)
            logger[logLevelMap[type]](text)
          } else {
            logger.info(line.trim())
          }

          let cap: RegExpMatchArray
          if (text.includes('的消息')) {
            return
          } else if (text.includes('アトリは、高性能ですから')) {
            resolve()
            this.setData(bot, { status: 'success' })
          } else if (text.includes('请输入(1 - 2)')) {
            this.refresh()
          } else if (text.includes('账号已开启设备锁') && text.includes('请选择验证方式')) {
            this.payload[bot.sid] = { status: 'sms-or-qrcode' }
          } else if (text.includes('登录需要滑条验证码') && text.includes('请选择验证方式')) {
            this.payload[bot.sid] = { status: 'slider-or-qrcode' }
          } else if (text.includes('请选择提交滑块ticket方式')) {
            this.write(bot.sid, '2')
          } else if ((cap = text.match(/向手机 (.+?) 发送短信验证码/))) {
            const phone = cap[1].trim()
            if (text.includes('账号已开启设备锁')) {
              this.setData(bot, { status: 'sms-confirm', phone })
            } else {
              this.payload[bot.sid].phone = phone
            }
          } else if (text.includes('captcha.jpg')) {
            const buffer = await readFile(cwd + '/captcha.png')
            this.setData(bot, {
              status: 'captcha',
              image: 'data:image/png;base64,' + buffer.toString('base64'),
            })
          } else if (text.includes('qrcode.png')) {
            const buffer = await readFile(cwd + '/qrcode.png')
            this.setData(bot, {
              status: 'qrcode',
              image: 'data:image/png;base64,' + buffer.toString('base64'),
            })
          } else if (text.includes('请输入短信验证码')) {
            this.payload[bot.sid].status = 'sms'
            this.refresh()
          } else if (text.includes('请前往该地址验证')) {
            this.setData(bot, {
              status: 'slider',
              link: text
                .match(/https:\S+/)[0]
                .replace(/^https:\/\/ssl\.captcha\.qq\.com\/template\/wireless_mqq_captcha\.html\?/, `/gocqhttp/captcha?id=${bot.sid}&`),
            })
          } else if (text.includes('扫码被用户取消')) {
            this.payload[bot.sid].message = '扫码被用户取消。'
            this.refresh()
          } else if (text.includes('二维码过期')) {
            this.payload[bot.sid].message = '二维码已过期。'
            this.refresh()
          } else if (text.includes('扫码成功')) {
            this.payload[bot.sid].message = '扫码成功，请在手机端确认登录。'
            this.refresh()
          } else if (text.includes('删除 device.json')) {
            // TODO
          } else if (text.includes('Enter 继续')) {
            this.write(bot.sid, '')
          } else if (text.includes('发送验证码失败')) {
            this.setData(bot, {
              status: 'error',
              message: '发送验证码失败，可能是请求过于频繁。',
            })
          } else if (text.includes('验证超时')) {
            this.setData(bot, {
              status: 'error',
              message: '登录失败：验证超时。',
            })
          } else if (text.includes('登录失败')) {
            this.setData(bot, {
              status: 'error',
              message: text,
            })
          } else if (text.includes('账号已开启设备锁') && (cap = text.match(/-> (.+?) <-/))) {
            this.setData(bot, {
              status: 'error',
              message: '账号已开启设备锁，请前往验证后点击重启。',
              link: cap[1],
            })
            this.write(bot.sid, '')
          } else if (text.includes('当前协议不支持二维码登录')) {
            this.setData(bot, {
              status: 'error',
              message: '当前协议不支持二维码登录，请配置账号密码或更换协议。',
            })
          }
        }
      }

      bot.process.stdout.on('data', handleData)
      bot.process.stderr.on('data', handleData)

      bot.process.on('error', (error) => {
        logger.warn(error)
      })

      bot.process.on('exit', () => {
        const data = this.payload[bot.sid]
        if (data && !['offline', 'error'].includes(data.status)) {
          this.setData(bot, { status: 'offline', message: '遇到未知错误，请查看日志。' })
        }
        reject(new Error())
      })

      if (bot.config.protocol === 'ws-reverse') {
        resolve()
      }
    })
  }

  async disconnect(bot: OneBotBot, hard?: boolean) {
    bot.process?.kill()
    bot.process = null
    if (!this.payload[bot.sid]) return
    if (hard) {
      delete this.payload[bot.sid]
      this.refresh()
    } else if (this.payload[bot.sid]?.status !== 'error') {
      this.setData(bot, { status: 'offline' })
    }
  }
}

namespace Launcher {
  export const filter = false

  export interface Config {
    host: string
    root?: string
    signServer?: string
    key?: string
    isBelow110?: boolean
    logLevel?: number
    template?: string
    message?: Dict
  }

  export const Config: Schema<Config> = Schema.object({
    host: Schema.string().description('要监听的 IP 地址。如果将此设置为 0.0.0.0 将监听所有地址，包括局域网和公网地址。').default('127.0.0.1'),
    root: Schema.path({
      filters: ['directory'],
      allowCreate: true,
    }).description('存放账户文件的目录。').default('data/go-cqhttp/accounts'),
    signServer: Schema.string().description('签名服务器地址。'),
    key: Schema.string().description('签名服务器密钥。').default('114514'),
    isBelow110: Schema.boolean().default(false).description('签名服务器是否低于 1.1.0 版本。'),
    logLevel: Schema.number().description('输出日志等级。').default(2),
    template: Schema.string().description('使用的配置文件模板。').hidden(),
    message: Schema.object({
      'ignore-invalid-cqcode': Schema.boolean().default(false).description('是否忽略无效的消息段 (默认情况下将原样发送)。'),
      'force-fragment': Schema.boolean().default(false).description('是否强制分片发送消息 (分片发送将会带来更快的速度，但是兼容性会有些问题)。'),
      'fix-url': Schema.boolean().default(false).description('是否将 URL 分片发送。'),
      'proxy-rewrite': Schema.string().default('').description('下载图片等资源时要请求的网络代理。'),
      'report-self-message': Schema.boolean().default(false).description('是否上报自身消息。'),
      'remove-reply-at': Schema.boolean().default(false).description('移除 reply 消息段附带的 at 消息段。'),
      'extra-reply-data': Schema.boolean().default(false).description('为 reply 消息段附加更多信息。'),
      'skip-mime-scan': Schema.boolean().default(false).description('跳过 mime 扫描，忽略错误数据。'),
    }).description('消息设置'),
  })
}

export default Launcher
