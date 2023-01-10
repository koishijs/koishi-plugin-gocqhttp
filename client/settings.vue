<template>
  <k-comment class="gocqhttp" v-if="data" :type="type">
    <p v-if="data.status === 'offline'">
      未连接到 go-cqhttp 子进程。
    </p>
    <p v-else-if="data.status === 'init'">
      正在创建 go-cqhttp 子进程……
    </p>
    <p v-else-if="data.status === 'success'">
      已成功连接 go-cqhttp 子进程。
    </p>
    <template v-else-if="data.status === 'qrcode'">
      <p>请使用手机登录 QQ 扫描二维码：</p>
      <img class="qrcode" :src="data.image"/>
    </template>
    <template v-else-if="data.status === 'captcha'">
      <p>请填写图中的内容：</p>
      <img :src="data.image"/>
      <div class="submit">
        <el-input v-model="text"></el-input>
        <k-button @click="send('gocqhttp/write', sid, text)">提交</k-button>
      </div>
    </template>
    <template v-else-if="data.status === 'sms'">
      <p>请输入短信验证码：</p>
      <div class="submit">
        <el-input v-model="text"></el-input>
        <k-button @click="send('gocqhttp/write', sid, text)">提交</k-button>
      </div>
    </template>
    <template v-else-if="data.status === 'sms-confirm'">
      <p>账号已开启设备锁。点击确认将向手机 {{ data.phone }} 发送短信验证码。</p>
      <div class="submit">
        <k-button @click="send('gocqhttp/write', sid, '')">确认</k-button>
      </div>
    </template>
    <template v-else-if="data.status === 'sms-or-qrcode'">
      <p>账号已开启设备锁。请选择验证方式 (将在 10 秒后自动选择 2)：</p>
      <div class="submit">
        <k-button @click="send('gocqhttp/write', sid, '1')">1. 向手机 {{ data.phone }} 发送短信验证码</k-button>
        <k-button @click="send('gocqhttp/write', sid, '2')">2. 使用手机登录 QQ 并扫码验证</k-button>
      </div>
    </template>
    <template v-else-if="data.status === 'slider-or-qrcode'">
      <p>登录需要滑条验证码。请选择验证方式 (将在 10 秒后自动选择 1)：</p>
      <div class="submit">
        <k-button disabled @click="send('gocqhttp/write', sid, '1')">1. 使用浏览器抓取滑条并登录 (暂不支持)</k-button>
        <k-button @click="send('gocqhttp/write', sid, '2')">2. 使用手机登录 QQ 并扫码验证 (需要手机和 Koishi 在同一网络下)</k-button>
      </div>
    </template>
    <template v-else-if="data.status === 'slider'">
      <p>账号已开启设备锁。请点击<a :href="data.link" target="_blank">此链接</a>验证后重启 Bot。</p>
    </template>
  </k-comment>

  <k-form v-if="sid" v-model="config" :initial="current.config" :schema="schema"></k-form>
</template>

<script lang="ts" setup>

import { inject, computed, ref } from 'vue'
import {} from 'koishi-plugin-gocqhttp'
import { Schema, store, send } from '@koishijs/client'

const local: any = inject('manager.settings.local')
const config: any = inject('manager.settings.config')
const current: any = inject('manager.settings.current')

const text = ref('')

const sid = computed(() => {
  if (local.value.name !== '@koishijs/plugin-adapter-onebot') return
  return `${config.value?.platform || 'onebot'}:${config.value?.selfId}`
})

const data = computed(() => {
  return store.gocqhttp?.[sid.value]
})

const type = computed(() => {
  if (!data.value) return
  if (data.value.status === 'init') return
  if (data.value.status === 'offline') return 'error'
  if (data.value.status === 'success') return 'success'
  return 'warning'
})

const schema = Schema.object({
  gocqhttp: Schema.object({
    enabled: Schema.boolean().default(false).description('是否自动创建 go-cqhttp 子进程。'),
    password: Schema.string().role('secret').description('机器人的密码。'),
  }).description('go-cqhttp 基础设置'),
})

</script>

<style lang="scss" scoped>

.gocqhttp {
  img {
    display: block;
    margin: 1rem 0;
  }

  .qrcode {
    width: 200px;
    image-rendering: pixelated;
  }

  .submit {
    display: block;
    margin: 1rem 0;

    .el-input {
      width: 200px;
      margin-right: 1rem;
    }
  }
}

</style>
