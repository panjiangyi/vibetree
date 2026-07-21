const MAX_CHUNK = 1800
const ANSI_PATTERN = /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g

export function cleanAgentText(value: string): string {
  return value.replace(ANSI_PATTERN, '').replace(/\r/g, '').replace(/\n{4,}/g, '\n\n\n').trim()
}

export function chunks(value: string, max = MAX_CHUNK): string[] {
  const clean = cleanAgentText(value)
  if (!clean) return []
  const result: string[] = []
  let rest = clean
  while (rest.length > max) {
    let split = rest.lastIndexOf('\n', max)
    if (split < max * 0.5) split = rest.lastIndexOf(' ', max)
    if (split < max * 0.5) split = max
    result.push(rest.slice(0, split).trim())
    rest = rest.slice(split).trim()
  }
  if (rest) result.push(rest)
  return result
}

export function summarizeFinal(text: string): string[] {
  const parts = chunks(text)
  if (parts.length <= 3) return parts
  return [...parts.slice(0, 2), '结果较长。回复“查看详情”获取完整内容。']
}
