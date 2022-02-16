import SchemaView from './schema.vue'
import QRCodeView from './qrcode.vue'
import { defineExtension, store } from '@koishijs/client'
import {} from '@koishijs/plugin-manager'
import {} from 'koishi-plugin-gocqhttp'

export default defineExtension((ctx) => {
  ctx.addView({
    type: 'manager:bot-prolog',
    component: QRCodeView,
  })

  ctx.addView({
    type: 'manager:bot-config',
    component: SchemaView,
  })

  ctx.extendsPage({
    name: '机器人',
    badge: () => Object.values(store.bots).reduce((sum, bot) => sum + +!!bot.qrcode, 0),
  })
})
