<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'

const state = ref({ addresses: [], settings: {}, devices: [] })
const tab = ref('connect')
const address = ref('')
const qr = ref('')
const settings = ref({})
const message = ref('')
const saving = ref(false)
const desktop = window.desktop
let unsubscribe, qrVersion = 0
const heading = computed(() => tab.value === 'connect' ? { eyebrow: 'YOUR PHONE. YOUR CONTROL.', title: '让手机，成为你的键鼠。', subtitle: '连接同一个 Wi-Fi，即可开始无线操控。' } : tab.value === 'settings' ? { eyebrow: 'MAKE IT YOURS', title: '偏好设置', subtitle: '调整电脑的连接与输入体验。' } : { eyebrow: 'TRUSTED DEVICES', title: '已配对设备', subtitle: '已配对的手机可自动连接，你可以随时撤销授权。' })
const endpoint = computed(() => address.value ? `${address.value}:${state.value.port}` : '未找到局域网地址')
function update(value) {
  state.value = value
  if (!value.addresses.includes(address.value)) address.value = value.addresses[0] || ''
}
watch(() => [address.value, state.value.code, state.value.port], async () => {
  const version = ++qrVersion
  qr.value = ''
  if (address.value) {
    const result = await window.desktop.getQr(address.value)
    if (version === qrVersion) qr.value = result
  }
})
watch(tab, () => { settings.value = { ...state.value.settings }; message.value = '' })
onMounted(async () => {
  if (!window.desktop) { message.value = '请通过桌面程序打开'; return }
  unsubscribe = window.desktop.onState(update)
  update(await window.desktop.getState())
  settings.value = { ...state.value.settings }
})
onUnmounted(() => unsubscribe?.())
async function save() {
  saving.value = true; message.value = ''
  try { update(await window.desktop.saveSettings({ ...settings.value })); message.value = '设置已保存' }
  catch (error) { message.value = error.message }
  finally { saving.value = false }
}
async function revoke(id) { update(await window.desktop.revokeDevice(id)) }
</script>

<template>
  <div class="shell">
    <aside>
      <div class="brand"><span class="brand-icon">⌘</span><div>PControlW<small>手机控制电脑</small></div></div>
      <div class="nav-label">工作空间</div>
      <button :class="{ active: tab === 'connect' }" @click="tab = 'connect'"><span>▣</span>设备连接</button>
      <button :class="{ active: tab === 'settings' }" @click="tab = 'settings'"><span>⚙</span>偏好设置</button>
      <button :class="{ active: tab === 'devices' }" @click="tab = 'devices'"><span>▤</span>已配对设备</button>
      <div class="sidebar-bottom"><span class="dot" :class="{ online: state.connected }"></span>{{ state.connected ? '手机已连接' : '等待连接' }}<small>Windows · v0.1.0</small></div>
    </aside>
    <main>
      <header><span>个人设备 / {{ tab === 'connect' ? '设备连接' : tab === 'settings' ? '偏好设置' : '已配对设备' }}</span><span class="local-tag">◉ 仅局域网</span></header>
      <div class="content">
        <div class="page-heading"><div class="eyebrow">{{ heading.eyebrow }}</div><h1>{{ heading.title }}</h1><p class="subtitle">{{ heading.subtitle }}</p></div>
        <div class="scroll-content">
        <template v-if="tab === 'connect'">
          <div v-if="state.error" class="notice error">服务未启动：{{ state.error }}</div>
          <div class="connect-grid">
            <section class="card qr-card">
              <div class="card-heading"><span>01 / 扫码连接</span><span class="badge">推荐</span></div>
              <div class="qr"><img v-if="qr" :src="qr" alt="连接二维码"><span v-else>等待网络连接</span></div>
              <h3>用手机相机或手机端扫描二维码</h3><p>自动填入地址与配对码</p>
            </section>
            <section class="card manual-card">
              <div class="card-heading">02 / 手动连接</div>
              <label>电脑地址</label>
              <select v-if="state.addresses.length > 1" v-model="address"><option v-for="ip in state.addresses" :key="ip" :value="ip">{{ ip }}</option></select>
              <div class="endpoint">{{ endpoint }}</div>
              <p class="web-address">手机浏览器也可打开 http://{{ endpoint }}</p>
              <div class="code-label"><label>配对码</label><button class="text-button" @click="desktop.rotateCode()">刷新 ↻</button></div>
              <div class="pair-code"><span v-for="(digit, index) in (state.code || '------')" :key="index">{{ digit }}</span></div>
              <p>配对码 5 分钟内有效，成功配对后自动更新。</p>
              <div class="connection-status"><span class="dot" :class="{ online: state.connected }"></span>{{ state.connected ? `已连接 · ${state.clientName}` : '服务已就绪，等待手机连接' }}</div>
            </section>
          </div>
          <div class="footer-note"><span>✧</span> 关闭主窗口后仍在托盘运行，双击托盘图标可再次打开。<button class="text-button" @click="desktop.hide()">收起到托盘 ↗</button></div>
        </template>
        <template v-else-if="tab === 'settings'">
          <form class="card settings-card" @submit.prevent="save">
            <div class="setting"><div><strong>网络端口</strong><p>更改端口会断开当前连接</p></div><input v-model.number="settings.port" type="number" min="1024" max="65535" required></div>
            <div class="setting"><div><strong>鼠标灵敏度</strong><p>{{ settings.sensitivity }}×</p></div><input v-model.number="settings.sensitivity" type="range" min="0.2" max="4" step="0.1"></div>
            <div class="setting"><div><strong>滚动速度</strong><p>{{ settings.scrollSpeed }}×</p></div><input v-model.number="settings.scrollSpeed" type="range" min="0.2" max="4" step="0.1"></div>
            <div class="setting"><strong>反转滚动方向</strong><input v-model="settings.reverseScroll" type="checkbox"></div>
            <div class="setting"><strong>键盘布局</strong><span>标准 QWERTY · 手机端可编辑键位</span></div>
            <div class="setting"><strong>断开连接时通知</strong><input v-model="settings.notifyDisconnect" type="checkbox"></div>
            <div class="form-footer"><span>{{ message }}</span><button class="primary" :disabled="saving" type="submit">保存设置</button></div>
          </form>
        </template>
        <template v-else>
          <section class="card devices-card"><p v-if="!state.devices.length">暂时没有配对设备，使用手机扫码开始。</p><div v-for="device in state.devices" :key="device.id" class="setting"><div><strong>{{ device.name }}</strong><p>{{ new Date(device.createdAt).toLocaleString() }}</p></div><button class="danger" @click="revoke(device.id)">撤销授权</button></div></section>
        </template>
        <p v-if="message && tab !== 'settings'" class="notice">{{ message }}</p>
        </div>
      </div>
    </main>
  </div>
</template>
