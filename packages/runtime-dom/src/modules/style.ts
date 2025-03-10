import { isString, hyphenate, capitalize, isArray } from '@vue/shared'
import { camelize, warn } from '@vue/runtime-core'

type Style = string | Record<string, string | string[]> | null

// 更新style
export function patchStyle(el: Element, prev: Style, next: Style) {
  // 拿到节点上面的style对象
  const style = (el as HTMLElement).style
  // 判断新的值是否是一个字符串
  const isCssString = isString(next)
  if (next && !isCssString) {
    // 如果不是一个字符串则则是对象使用forin循环
    for (const key in next) {
      // 调用方法设置style的属性
      setStyle(style, key, next[key])
    }
    // 遍历旧的style
    if (prev && !isString(prev)) {
      for (const key in prev) {
        // 判断新的值中是否存在，如果不存在则删除
        if (next[key] == null) {
          setStyle(style, key, '')
        }
      }
    }
  } else {
    // 如果是字符串
    const currentDisplay = style.display
    if (isCssString) {
      if (prev !== next) {
        style.cssText = next as string
      }
    } else if (prev) {
      el.removeAttribute('style')
    }
    // indicates that the `display` of the element is controlled by `v-show`,
    // so we always keep the current `display` value regardless of the `style`
    // value, thus handing over control to `v-show`.
    if ('_vod' in el) {
      style.display = currentDisplay
    }
  }
}

const semicolonRE = /[^\\];\s*$/
const importantRE = /\s*!important$/

function setStyle(
  style: CSSStyleDeclaration,
  name: string,
  val: string | string[]
) {
  if (isArray(val)) {
    val.forEach(v => setStyle(style, name, v))
  } else {
    if (val == null) val = ''
    if (__DEV__) {
      if (semicolonRE.test(val)) {
        warn(
          `Unexpected semicolon at the end of '${name}' style value: '${val}'`
        )
      }
    }
    if (name.startsWith('--')) {
      // custom property definition
      style.setProperty(name, val)
    } else {
      const prefixed = autoPrefix(style, name)
      if (importantRE.test(val)) {
        // !important
        style.setProperty(
          hyphenate(prefixed),
          val.replace(importantRE, ''),
          'important'
        )
      } else {
        style[prefixed as any] = val
      }
    }
  }
}

const prefixes = ['Webkit', 'Moz', 'ms']
const prefixCache: Record<string, string> = {}

function autoPrefix(style: CSSStyleDeclaration, rawName: string): string {
  const cached = prefixCache[rawName]
  if (cached) {
    return cached
  }
  let name = camelize(rawName)
  if (name !== 'filter' && name in style) {
    return (prefixCache[rawName] = name)
  }
  name = capitalize(name)
  for (let i = 0; i < prefixes.length; i++) {
    const prefixed = prefixes[i] + name
    if (prefixed in style) {
      return (prefixCache[rawName] = prefixed)
    }
  }
  return rawName
}
