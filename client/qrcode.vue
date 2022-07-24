<template>
  <template v-if="data">
    <k-comment v-if="data.qrcode" class="qrcode" type="warning">
      请使用手机登录 QQ 扫描二维码：
      <template #body>
        <img :src="data.qrcode"/>
      </template>
    </k-comment>
    <k-comment v-else type="success">
      已成功绑定 go-cqhttp 子进程。
    </k-comment>
  </template>
</template>

<script lang="ts" setup>

import { inject, computed } from 'vue'
import {} from 'koishi-plugin-gocqhttp'
import { store } from '@koishijs/client'

const local: any = inject('manager.local')
const config: any = inject('manager.config')

const data = computed(() => {
  if (local.value.name !== '@koishijs/plugin-adapter-onebot') return
  const sid = `${config.value.platform || 'onebot'}:${config.value.selfId}`
  return store.gocqhttp?.[sid]
})

</script>

<style lang="scss">

.qrcode img {
  display: block;
  margin: 1rem 0;
}

</style>
