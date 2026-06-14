/**
 * 事件名称常量
 * 统一管理所有 DOM 事件名称
 */
export const EVENT_NAMES = {
    CLICK: 'click',
    DBLCLICK: 'dblclick',
    MOUSEDOWN: 'mousedown',
    MOUSEMOVE: 'mousemove',
    MOUSEUP: 'mouseup',
    KEYDOWN: 'keydown',
    KEYUP: 'keyup',
    SCROLL: 'scroll',
    WHEEL: 'wheel',
    BLUR: 'blur',
    FOCUS: 'focus',
    CONTEXTMENU: 'contextmenu',
    RESIZE: 'resize',
    COMPOSITIONSTART: 'compositionstart',
    COMPOSITIONEND: 'compositionend',
};

/**
 * 事件委托键常量
 * 格式: "target:eventType"
 * 用于 EventHandler 统一绑定和策略 getEventHandlers() 声明
 */
export const DELEGATE_KEYS = {
    CANVAS_MOUSEDOWN: 'canvas:mousedown',
    CANVAS_MOUSEMOVE: 'canvas:mousemove',
    CANVAS_MOUSEUP: 'canvas:mouseup',
    CANVAS_DBLCLICK: 'canvas:dblclick',
    CANVAS_CONTEXTMENU: 'canvas:contextmenu',
    DOCUMENT_MOUSEMOVE: 'document:mousemove',
    DOCUMENT_MOUSEUP: 'document:mouseup',
    DOCUMENT_MOUSEDOWN: 'document:mousedown',
    DOCUMENT_KEYDOWN: 'document:keydown',
};