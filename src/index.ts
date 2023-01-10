import { Context, Dict, interpolate, Logger, Schema } from 'koishi'
import OneBotBot from '@koishijs/plugin-adapter-onebot'
import { DataService } from '@koishijs/plugin-console'
import {} from '@koishijs/plugin-market'
import { ChildProcess } from 'child_process'
import { resolve } from 'path'
import { createReadStream, promises as fsp } from 'fs'
import gocqhttp from 'go-cqhttp'
import strip from 'strip-ansi'

const { mkdir, readFile, writeFile } = fsp

declare module '@koishijs/plugin-console' {
  namespace Console {
    interface Services {
      gocqhttp: Launcher
    }
  }

  interface Events {
    'gocqhttp/write'(sid: string, text: string): void
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
    | 'offline'
    | 'success'
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
}

class Launcher extends DataService<Dict<Data>> {
  payload: Dict<Data> = Object.create(null)
  templateTask: Promise<string>

  constructor(ctx: Context, private config: Launcher.Config) {
    super(ctx, 'gocqhttp', { authority: 4 })
    logger.level = config.logLevel || 3

    ctx.on('bot-connect', async (bot: OneBotBot) => {
      if (!bot.config.gocqhttp?.enabled) return
      return this.connect(bot)
    })

    ctx.on('bot-disconnect', async (bot: OneBotBot) => {
      if (!bot.config.gocqhttp?.enabled) return
      return this.disconnect(bot)
    })

    ctx.using(['console'], (ctx) => {
      ctx.console.addEntry({
        dev: resolve(__dirname, '../client/index.ts'),
        prod: resolve(__dirname, '../dist'),
      })

      ctx.console.addListener('gocqhttp/write', (sid, text) => {
        const bot = ctx.bots[sid] as OneBotBot
        return new Promise<void>((resolve, reject) => {
          bot.process.stdin.write(text + '\n', (error) => {
            error ? reject(error) : resolve()
          })
        })
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
      ...bot.config,
      ...bot.config.gocqhttp,
    }
    if ('endpoint' in config) {
      config.endpoint = `0.0.0.0:${new URL(config.endpoint).port}`
    }
    if ('path' in config) {
      const { port, host = 'localhost' } = bot.ctx.root.config
      config['selfUrl'] = `${host}:${port}${config.path}`
    }
    return interpolate(template, config, /\$\{\{(.+?)\}\}/g)
  }

  async get() {
    return this.payload
  }

  private setData(bot: OneBotBot, data: Data) {
    this.payload[bot.sid] = data
    this.refresh()
  }

  async connect(bot: OneBotBot) {
    // create working folder
    const cwd = resolve(bot.ctx.baseDir, this.config.root, bot.selfId)
    await mkdir(cwd, { recursive: true })

    // create config.yml
    await writeFile(cwd + '/config.yml', await this.getConfig(bot))

    return new Promise<void>((resolve, reject) => {
      this.setData(bot, { status: 'init' })

      // spawn go-cqhttp process
      bot.process = gocqhttp({ cwd, faststart: true })

      bot.process.stdout.on('data', async (data) => {
        data = strip(data.toString()).trim()
        if (!data) return
        for (const line of data.trim().split('\n')) {
          const text = line.slice(23)
          const [type] = text.split(']: ', 1)
          if (type in logLevelMap) {
            logger[logLevelMap[type]](text.slice(type.length + 3))
          } else {
            logger.info(line.trim())
          }

          let cap: RegExpMatchArray
          if (text.includes('アトリは、高性能ですから')) {
            resolve()
            this.setData(bot, { status: 'success' })
          } else if (text.includes('将在10秒后自动选择')) {
            this.refresh()
          } else if (text.includes('账号已开启设备锁') && text.includes('请选择验证方式')) {
            this.payload[bot.sid] = { status: 'sms-or-qrcode' }
          } else if (text.includes('登录需要滑条验证码') && text.includes('请选择验证方式')) {
            this.payload[bot.sid] = { status: 'slider-or-qrcode' }
            // eslint-disable-next-line no-cond-assign
          } else if (cap = text.match(/向手机(.+)发送短信验证码/)) {
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
              link: text.match(/https:\S+/)[0],
            })
          }
        }
      })

      bot.process.on('exit', () => {
        bot.stop()
        reject(new Error())
      })

      if (bot.config.protocol === 'ws-reverse') {
        resolve()
      }
    })
  }

  async disconnect(bot: OneBotBot) {
    bot.process?.kill()
    bot.process = null
    this.setData(bot, { status: 'offline' })
  }
}

namespace Launcher {
  export interface Config {
    root?: string
    logLevel?: number
    template?: string
    message?: Dict
  }

  export const Config: Schema<Config> = Schema.object({
    root: Schema.string().description('存放账户文件的目录。').default('accounts'),
    logLevel: Schema.number().description('输出日志等级。').default(3),
    template: Schema.string().description('使用的配置文件模板。').hidden(),
    message: Schema.object({
      'ignore-invalid-cqcode': Schema.boolean().default(false).description('是否忽略无效的消息段 (默认情况下将原样发送)。'),
      'force-fragment': Schema.boolean().default(false).description('是否强制分片发送消息 (分片发送将会带来更快的速度，但是兼容性会有些问题)。'),
      'fix-url': Schema.boolean().default(false).description('是否将 URL 分片发送。'),
      'proxy-rewrite': Schema.string().default('').description('下载图片等资源是要请求的网络代理。'),
      'report-self-message': Schema.boolean().default(false).description('是否上报自身消息。'),
      'remove-reply-at': Schema.boolean().default(false).description('移除 reply 消息段附带的 at 消息段。'),
      'extra-reply-data': Schema.boolean().default(false).description('为 reply 消息段附加更多信息。'),
      'skip-mime-scan': Schema.boolean().default(false).description('跳过 mime 扫描，忽略错误数据。'),
    }).description('消息设置'),
  })
}

export default Launcher
