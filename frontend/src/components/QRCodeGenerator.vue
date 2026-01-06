<template>
  <div class="qr-code-generator text-center">
    <div v-if="qrCode" class="qr-code-container q-mb-md"><canvas ref="canvas"></canvas></div>
    <div v-if="showValue" class="text-caption text-grey-7 q-mb-sm">{{ value }}</div>
    <q-btn v-if="qrCode && downloadable" flat label="Download QR" icon="download" color="primary" @click="download" size="sm" />
  </div>
</template>
<script>
import { defineComponent, ref, watch, onMounted } from 'vue'; import QRCode from 'qrcode';
export default defineComponent({ name: 'QRCodeGenerator', props: { value: { type: String, required: true }, size: { type: Number, default: 200 }, showValue: { type: Boolean, default: true }, downloadable: { type: Boolean, default: true } }, setup(props) { const canvas = ref(null); const qrCode = ref(null); const generate = async () => { if (!canvas.value || !props.value) return; try { await QRCode.toCanvas(canvas.value, props.value, { width: props.size, margin: 2, color: { dark: '#000000', light: '#FFFFFF' } }); qrCode.value = props.value; } catch (error) { console.error('QR generation failed', error); } }; const download = () => { if (!canvas.value) return; const url = canvas.value.toDataURL('image/png'); const link = document.createElement('a'); link.download = `qr-${Date.now()}.png`; link.href = url; link.click(); }; watch(() => props.value, generate); onMounted(generate); return { canvas, qrCode, download }; } });
</script>
<style lang="scss" scoped>
.qr-code-container { display: inline-block; padding: 16px; background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
</style>
