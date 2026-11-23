<script setup lang="ts">
const emit = defineEmits<{ expand: [] }>()
let start: { id: number; x: number; y: number; width: number; height: number } | null = null
let dragged = false

function press(event: PointerEvent) {
  if (event.button !== 0 || !event.isPrimary) return
  dragged = false
  start = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    width: window.innerWidth,
    height: window.innerHeight
  }
  const button = event.currentTarget as HTMLElement
  button.setPointerCapture(event.pointerId)
}

function click(event: MouseEvent) {
  if (!dragged || event.detail === 0) emit('expand')
}

function move(event: PointerEvent) {
  if (!start || event.pointerId !== start.id || !(event.buttons & 1)) return
  if (!dragged && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 4) return
  dragged = true
  window.btcFloat.dragFrom(start.x / start.width, start.y / start.height)
}
</script>

<template>
  <button class="compact-trigger" type="button" aria-label="展开 K 线" title="点击展开 K 线，按住拖动"
    @pointerdown="press" @pointermove="move" @pointerup="start = null"
    @pointercancel="start = null" @lostpointercapture="start = null"
    @click="click" />
</template>
