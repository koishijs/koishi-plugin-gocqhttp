<template>
  <template v-if="data">
    <k-comment v-if="data.qrcode" class="qrcode" type="warning">
      请使用手机登录 QQ 扫描二维码：
      <template #body>
        <img :src="data.qrcode"/>
      </template>
    </k-comment>
    <k-comment v-else type="success">
      已成功创建 go-cqhttp 子进程。
    </k-comment>
  </template>
  <k-form v-if="isOneBot" v-model="config" :initial="current.config" :schema="schema"></k-form>
</template>

<script lang="ts" setup>

import { inject, computed } from 'vue'
import {} from 'koishi-plugin-gocqhttp'
import { Schema, store } from '@koishijs/client'

const local: any = inject('manager.local')
const config: any = inject('manager.config')
const current: any = inject('manager.current')

const isOneBot = computed(() => local.value.name === '@koishijs/plugin-adapter-onebot')

const data = computed(() => {
  if (!isOneBot.value) return
  const sid = `${config.value.platform || 'onebot'}:${config.value.selfId}`
  return store.gocqhttp?.[sid]
})

const schema = Schema.object({
  gocqhttp: Schema.object({
    enabled: Schema.boolean().default(false).description('是否自动创建 go-cqhttp 子进程。'),
    password: Schema.string().role('secret').description('机器人的密码。'),
  }).description('go-cqhttp 基础设置'),
})

</script>

<style lang="scss">

.qrcode img {
  display: block;
  margin: 1rem 0;
}

</style>
