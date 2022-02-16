<template>
  <k-comment class="qrcode" type="warning" v-if="data.qrcode">
    请使用手机登录 QQ 扫描二维码：
    <template #body>
      <img :src="data.qrcode"/>
    </template>
  </k-comment>
</template>

<script lang="ts" setup>

import { PropType } from 'vue'
import { BotProvider } from '@koishijs/plugin-manager'
import {} from 'koishi-plugin-gocqhttp'

defineProps({
  data: {} as PropType<BotProvider.Data>,
})

</script>

<style lang="scss" scoped>

.qrcode img {
  display: block;
  margin: 1rem 0;
}

</style>
