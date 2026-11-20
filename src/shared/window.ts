export const closeWindowChannel = 'btc-float:close'
export const expandWindowChannel = 'btc-float:expand'
export const moveWindowChannel = 'btc-float:move'

export interface FloatWindowApi {
  close(): void
  setExpanded(expanded: boolean): Promise<boolean>
  dragFrom(offsetX: number, offsetY: number): void
}
