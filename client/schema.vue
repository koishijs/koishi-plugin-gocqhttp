<template>
  <k-schema v-if="data.adapter === 'onebot'" :schema="boolean" v-model="data.config.gocqhttp">
    <h3>gocqhttp</h3>
    <p>自动启动 go-cqhttp 子进程。</p>
  </k-schema>
</template>

<script lang="ts" setup>

import { PropType } from 'vue'
import { BotProvider } from '@koishijs/plugin-manager'
import {} from 'koishi-plugin-gocqhttp'
import { Schema } from '@koishijs/client'

defineProps({
  data: {} as PropType<BotProvider.Data>,
})

const boolean = Schema.boolean()

</script>
