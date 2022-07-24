import Settings from './settings.vue'
import { defineExtension } from '@koishijs/client'
import {} from '@koishijs/plugin-market'
import {} from 'koishi-plugin-gocqhttp'

export default defineExtension((ctx) => {
  ctx.slot({
    type: 'market-settings',
    component: Settings,
  })
})
