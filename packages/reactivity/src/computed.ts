import { DebuggerOptions, ReactiveEffect } from './effect'
import { Ref, trackRefValue, triggerRefValue } from './ref'
import { isFunction, NOOP } from '@vue/shared'
import { ReactiveFlags, toRaw } from './reactive'
import { Dep } from './dep'

declare const ComputedRefSymbol: unique symbol

export interface ComputedRef<T = any> extends WritableComputedRef<T> {
  readonly value: T
  [ComputedRefSymbol]: true
}

export interface WritableComputedRef<T> extends Ref<T> {
  readonly effect: ReactiveEffect<T>
}

export type ComputedGetter<T> = (...args: any[]) => T
export type ComputedSetter<T> = (v: T) => void

export interface WritableComputedOptions<T> {
  get: ComputedGetter<T>
  set: ComputedSetter<T>
}

export class ComputedRefImpl<T> {
  public dep?: Dep = undefined

  private _value!: T
  public readonly effect: ReactiveEffect<T>

  public readonly __v_isRef = true
  public readonly [ReactiveFlags.IS_READONLY]: boolean = false

  // 脏变量
  public _dirty = true
  public _cacheable: boolean

  constructor(
    getter: ComputedGetter<T>,
    private readonly _setter: ComputedSetter<T>,
    isReadonly: boolean,
    isSSR: boolean
  ) {
    // 创建Effect,第二个参数是调度器
    // 当触发依赖的时候如果有传第二个参数则是执行第二个参数，没有则是执行第一个参数的方法
    // 这里的思路是当ref或者是reactive值改变的时候都会触发trigger，导致计算属性的ReactiveEffect会执行
    // 我们有用_dirty函数需要去将原有的状态从新赋值为true，所以需要使用调度器来改变
    // 之后再重新调用triggerRefValue，因为计算属性，如果在已经调用了get value 的情况下是有执行trackRefValue收集依赖的
    // 所以调用triggerRefValue会执行getter函数导致计算属性从新执行
    this.effect = new ReactiveEffect(getter, () => {
      if (!this._dirty) {
        this._dirty = true
        triggerRefValue(this)
      }
    })
    this.effect.computed = this
    this.effect.active = this._cacheable = !isSSR
    this[ReactiveFlags.IS_READONLY] = isReadonly
  }

  get value() {
    // the computed ref may get wrapped by other proxies e.g. readonly() #3376
    // self可以理解为this
    const self = toRaw(this)
    // 收集依赖
    trackRefValue(self)
    // 如果_dirty脏变量为真则进入
    if (self._dirty || !self._cacheable) {
      // 变为假
      self._dirty = false
      // 执行计算属性的getter函数,拿到结果保存到_value
      self._value = self.effect.run()!
    }
    // 返回结果,当下一次执行的时候因为this._dirty === false 所以不会从新执行run函数，会返回上一次的结果
    return self._value
  }

  set value(newValue: T) {
    this._setter(newValue)
  }
}

export function computed<T>(
  getter: ComputedGetter<T>,
  debugOptions?: DebuggerOptions
): ComputedRef<T>
export function computed<T>(
  options: WritableComputedOptions<T>,
  debugOptions?: DebuggerOptions
): WritableComputedRef<T>
export function computed<T>(
  getterOrOptions: ComputedGetter<T> | WritableComputedOptions<T>,
  debugOptions?: DebuggerOptions,
  isSSR = false
) {
  let getter: ComputedGetter<T>
  let setter: ComputedSetter<T>

  // 判断是否是一个函数类型
  const onlyGetter = isFunction(getterOrOptions)
  if (onlyGetter) {
    // 只传入一个函数的情况下getter是计算属性传入的回调函数
    getter = getterOrOptions
    // 在只有传入一个函数的情况下的话，这个setter可以理解为一个空的函数
    setter = __DEV__
      ? () => {
          console.warn('Write operation failed: computed value is readonly')
        }
      : NOOP
  } else {
    // 如果传入的是一个对象，则分别有一个get跟set的key，值为函数
    getter = getterOrOptions.get
    setter = getterOrOptions.set
  }

  // 创建一个ComputedRefImpl
  const cRef = new ComputedRefImpl(getter, setter, onlyGetter || !setter, isSSR)

  if (__DEV__ && debugOptions && !isSSR) {
    cRef.effect.onTrack = debugOptions.onTrack
    cRef.effect.onTrigger = debugOptions.onTrigger
  }

  // 返回ComputedRefImpl的实例化对象
  return cRef as any
}
