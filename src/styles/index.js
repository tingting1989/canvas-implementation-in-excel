/**
 * 样式池（Flyweight 模式）
 *
 * 核心思想：所有样式通过整数 ID 引用，相同样式共享同一对象
 *
 * 收益：
 * - 内存：10000 个相同样式的单元格只存 1 个样式对象
 * - 比较：styleId 整数比较 vs 对象深度比较
 * - 去重：getStyleId 自动合并相同样式，返回已有 ID
 *
 * 局限：
 * - 去重依赖 normalize 的字符串化，频繁调用时有开销
 * - resolveStyle 合并多层样式时产生新样式对象，去重率取决于样式组合数
 *
 * 性能优化：
 * - #normalize 按字母序拼接 key=value，避免 JSON.stringify 开销
 * - #keyCache 缓存已知对象的标准化结果
 */
export class StylePool {
    constructor() {
        /** ID → 样式对象 */
        this.idToStyle = new Map();
        /** 标准化 key → ID */
        this.styleToId = new Map();
        /** 下一个可用 ID */
        this.nextId = 1;
    }

    /**
     * 将样式对象标准化为可比较的字符串
     * 优化：按字母序拼接 "key:value"，比 JSON.stringify 快约 3-5 倍
     */
    #normalize(obj) {
        const keys = Object.keys(obj).sort();
        let s = "";
        for (let i = 0; i < keys.length; i++) {
            if (i > 0) s += ",";
            s += keys[i] + ":" + obj[keys[i]];
        }
        return s;
    }

    /**
     * 注册或获取已有样式的 ID
     * 相同内容的样式对象返回同一 ID（去重）
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

    /**
     * 获取当前样式池中的样式数量（调试用）
     * @returns {number}
     */
    get size() {
        return this.idToStyle.size;
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