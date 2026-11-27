const localDateTime = new Intl.DateTimeFormat('sv-SE', {
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
})

export function formatLocalTime(milliseconds: number): string {
  return localDateTime.format(milliseconds)
}

export function priceDecimals(price: number): number {
  // Number.toString() 保留数值的有效十进制位，小额报价可能采用科学计数法。
  const [mantissa, exponent = '0'] = price.toString().split('e')
  return Math.max(0, (mantissa.split('.')[1]?.length ?? 0) - Number(exponent))
}

export function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: priceDecimals(price)
  }).format(price)
}
