<script setup lang="ts">
const emit = defineEmits<{ expand: [] }>()
let start: { x: number; y: number; screenX: number; screenY: number } | null = null
let dragged = false

function press(event: PointerEvent) {
  if (event.button !== 0 || !event.isPrimary) return
  dragged = false
  start = { x: event.clientX, y: event.clientY, screenX: event.screenX, screenY: event.screenY }
  const button = event.currentTarget as HTMLElement
  button.setPointerCapture(event.pointerId)
}

function click(event: MouseEvent) {
  if (!dragged || event.detail === 0) emit('expand')
}

function move(event: PointerEvent) {
  if (!start || !event.isPrimary || !(event.buttons & 1)) return
  if (!dragged && Math.hypot(event.screenX - start.screenX, event.screenY - start.screenY) < 4) return
  dragged = true
  window.btcFloat.dragFrom(start.x, start.y)
}
</script>

<template>
  <button class="compact-trigger" type="button" aria-label="展开 K 线" title="点击展开 K 线，按住拖动"
    @pointerdown="press" @pointermove="move" @lostpointercapture="start = null"
    @click="click" />
</template>
