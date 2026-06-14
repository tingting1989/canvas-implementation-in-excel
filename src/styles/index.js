/**
 * 样式池（Flyweight 模式）
 * 所有样式通过整数 ID 引用，避免重复存储
 */
export class StylePool {
    constructor() {
        this.idToStyle = new Map();
        this.styleToId = new Map();
        this.nextId = 1;
    }

    /**
     * 将样式对象标准化为可比较的字符串
     */
    #normalize(obj) {
        return JSON.stringify(obj, Object.keys(obj).sort());
    }

    /**
     * 注册或获取已有样式的 ID
     * @param {Object} obj - 样式对象
     * @returns {number} 样式 ID
     */
    getStyleId(obj = {}) {
        const key = this.#normalize(obj);
        if (this.styleToId.has(key)) return this.styleToId.get(key);
        const id = this.nextId++;
        this.idToStyle.set(id, {...obj});
        this.styleToId.set(key, id);
        return id;
    }

    /**
     * 根据 ID 获取样式对象
     * @param {number} id
     * @returns {Object}
     */
    getStyle(id) {
        return this.idToStyle.get(id) || {};
    }
}

/**
 * 边框样式
 */
export class BorderStyle {
    constructor({width = 1, style = "solid", color = "#000"} = {}) {
        this.width = width;
        this.style = style;
        this.color = color;
    }
}

/**
 * 单元格样式定义
 */
export class CellStyle {
    constructor({
                    fontFamily = "Segoe UI",
                    fontSize = 12,
                    fontWeight = "normal",
                    color = "#000",
                    backgroundColor = "transparent",
                    textAlign = "left",
                    verticalAlign = "middle",
                    border = null,
                } = {}) {
        this.fontFamily = fontFamily;
        this.fontSize = fontSize;
        this.fontWeight = fontWeight;
        this.color = color;
        this.backgroundColor = backgroundColor;
        this.textAlign = textAlign;
        this.verticalAlign = verticalAlign;
        this.border = border;
    }
}

// 全局样式池实例
export const stylePool = new StylePool();

// 预注册默认样式
export const DEFAULT_STYLE_ID = stylePool.getStyleId({
    fontFamily: "Segoe UI",
    fontSize: 12,
    color: "#222",
    backgroundColor: "transparent",
    textAlign: "left",
    verticalAlign: "middle",
});

// 预注册禁用样式
export const DISABLED_STYLE_ID = stylePool.getStyleId({
    color: "#888",
    backgroundColor: "#f5f5f5",
});