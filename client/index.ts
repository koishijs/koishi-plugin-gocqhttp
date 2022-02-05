import SchemaView from './schema.vue'
import { defineExtension } from '~/client'

export default defineExtension((ctx) => {
  ctx.addView({
    type: 'manager:bot-config',
    component: SchemaView,
  })
})
