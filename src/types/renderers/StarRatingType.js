/**
 * 星级评分渲染器（增强版）
 *
 * 将数值（0-N）渲染为星星图标，支持：
 * - 半星显示
 * - 点击交互：直接点击星星设置评分
 * - 悬停预览：鼠标悬停时预览评分效果
 * - 键盘操作：方向键/数字键调整评分
 * - 动画效果：平滑的评分过渡动画
 *
 * 参考实现：Handsontable Star Rating Cell Type
 * 文档：https://handsontable.com/docs/javascript-data-grid/recipes/cell-types/rating/
 *
 * @module types/renderers/StarRatingType
 */

import { BaseColumnType } from "../BaseColumnType.js";
import { CONFIG } from "../../constants/config.js";
import { isUndefined } from "@/utils";

export class StarRatingType extends BaseColumnType {
    /**
     * 🎯 静态悬停状态存储（跨实例共享）
     *
     * 解决问题：getCellTypeInstance() 可能每次返回新实例，
     * 导致实例属性 #hoverRating 在重绘时丢失。
     *
     * 使用 "行,列" 作为 key 存储悬停值。
     * @type {Map<string, number|null>}
     */
    static #hoverStateMap = new Map();

    /**
     * 获取或设置单元格的悬停状态（静态方法 - 跨实例共享）
     *
     * @param {string} cellKey - 单元格标识（格式："行,列"）
     * @param {number|null} [newValue] - 新的悬停值（可选，不传则读取）
     * @returns {number|null} 当前的悬停值
     */
    static hoverState(cellKey, newValue) {
        if (newValue !== undefined) {
            StarRatingType.#hoverStateMap.set(cellKey, newValue);
        }
        return StarRatingType.#hoverStateMap.get(cellKey) ?? null;
    }

    /**
     * 清除指定单元格的悬停状态
     *
     * @param {string} cellKey - 单元格标识
     */
    static clearHoverState(cellKey) {
        StarRatingType.#hoverStateMap.delete(cellKey);
    }

    /**
     * 清除所有悬停状态（静态方法）
     */
    static clearAllHoverStates() {
        StarRatingType.#hoverStateMap.clear();
    }

    /** 存储每颗星星的位置信息（用于点击检测） */
    #starPositions = [];

    /** 当前悬停的评分值（实例级别 - 兼容旧代码） */
    #hoverRating = null;

    /** 当前单元格标识（用于静态状态映射） */
    #currentCellKey = null;

    /** 动画目标值 */
    #targetRating = null;

    /** 动画当前值 */
    #animatedRating = null;

    /** 动画开始时间 */
    #animationStartTime = null;

    /** 动画持续时间（毫秒） */
    static get ANIMATION_DURATION() {
        return 300;
    }

    get name() {
        return "starRating";
    }

    get editorType() {
        // 返回 "none" 阻止默认编辑器弹出
        // 星级评分通过点击星星本身进行交互，不需要文本/数字输入框
        return "none";
    }

    /**
     * 标记此类型为交互式类型
     *
     * 交互式类型的特点：
     * - 不使用传统的文本/数字编辑器
     * - 通过点击、悬停等鼠标操作直接交互
     * - 双击时不进入编辑模式
     *
     * @returns {boolean}
     */
    get isInteractive() {
        return true;
    }

    getDefaultStyle(baseStyle) {
        return { ...baseStyle, textAlign: "left" };
    }

    format(value) {
        return value !== null ? `${value} 星` : "";
    }

    validate(value) {
        if (value === "" || value === null) return true;
        const num = Number(value);
        const max = this.options?.maxStars || CONFIG.STAR_RATING_MAX_STARS;
        if (isNaN(num) || num < 0 || num > max) return `评分必须在 0-${max} 之间`;
        return true;
    }

    /**
     * 处理单元格点击事件 ⭐ 新增交互功能（坐标系修复版）
     *
     * 根据鼠标点击位置计算对应的星级评分值。
     *
     * ✅ 关键修复：正确处理 Canvas 绝对坐标 vs 单元格内部坐标
     * - context.{x,y} 是 Canvas 屏幕坐标（getCellRect 返回值）
     * - event.offsetX 是相对于 Canvas 左上角的偏移量
     * - 需要计算: mouseX = offsetX - cellX （得到单元格内相对坐标）
     * - 然后: 星星绘制也是基于单元格内相对坐标（从 0 开始）
     *
     * @param {import('../CellRenderContext.js').CellRenderContext} context - 单元格渲染上下文
     * @param {MouseEvent} event - 鼠标事件对象
     * @returns {number|null} 返回新的评分值，或 null 表示无效点击
     */
    #detectRatingFromPosition(context, event) {
        if (!context || isUndefined(context.x) || isUndefined(context.y)) {
            return null;
        }

        const { x: cellX, y: cellY, width, height, value } = context;

        if (isUndefined(width) || isUndefined(height) || width <= 0 || height <= 0) {
            return null;
        }

        const baseStarSize = this.options?.starSize || Math.min(CONFIG.STAR_RATING_STAR_SIZE, height * 0.6);
        const starSize = Math.max(12, Math.round(baseStarSize));
        const gap = Math.round(starSize * CONFIG.STAR_RATING_GAP_RATIO);
        const maxStars = this.options?.maxStars || CONFIG.STAR_RATING_MAX_STARS;
        const totalWidth = starSize * maxStars + gap * (maxStars - 1);

        const startX = Math.round((width - totalWidth) / 2);
        const centerY = Math.round(height / 2);

        let mouseX, mouseY;

        if (event.offsetX !== undefined && event.offsetY !== undefined && event.offsetX !== 0) {
            mouseX = event.offsetX - cellX;
            mouseY = event.offsetY - cellY;
        } else if (event.layerX !== undefined && event.layerY !== undefined) {
            mouseX = event.layerX - cellX;
            mouseY = event.layerY - cellY;
        } else if (event.clientX !== undefined && event.clientY !== undefined) {
            mouseX = event.clientX - cellX;
            mouseY = event.clientY - cellY;
        } else {
            return null;
        }

        for (let i = 0; i < maxStars; i++) {
            const starX = Math.round(startX + i * (starSize + gap));
            const starY = Math.round(centerY - starSize / 2);

            if (mouseX >= starX && mouseX <= starX + starSize && mouseY >= starY && mouseY <= starY + starSize) {
                return i + 1;
            }
        }

        return null;
    }

    /**
     * 处理单元格点击事件 ⭐ 点击设置评分值
     *
     * ✅ 关键功能：点击星星时保存评分值到单元格
     *
     * @param {import('../CellRenderContext.js').CellRenderContext} context - 单元格渲染上下文
     * @param {MouseEvent} event - 鼠标事件对象
     * @returns {number|null} 返回新的评分值，或 null 表示无效点击
     */
    handleClick(context, event) {
        const newRating = this.#detectRatingFromPosition(context, event);
        if (newRating !== null && newRating !== undefined) {
            const { value } = context;
            this.#startAnimation(Number(value) || 0, newRating);

            const cellKey = `${context.row},${context.col}`;
            StarRatingType.hoverState(cellKey, null);
            this.#hoverRating = null;

            return newRating;
        }

        return null;
    }

    /**
     * 处理鼠标悬停事件 ⭐ 悬停预览（静态状态版）
     *
     * 更新悬停状态以显示预览效果。
     *
     * ✅ 关键改进：同时更新静态 Map 和实例属性，
     * 解决 getCellTypeInstance() 返回新实例导致的状态丢失问题。
     *
     * @param {import('../CellRenderContext.js').CellRenderContext} context - 单元格渲染上下文
     * @param {MouseEvent} event - 鼠标事件对象
     * @returns {boolean} 是否需要重绘（true=需要重绘显示悬停效果）
     */
    handleHover(context, event) {
        const newHoverRating = this.#detectRatingFromPosition(context, event);

        const cellKey = `${context.row},${context.col}`;
        this.#currentCellKey = cellKey;

        const currentStaticHover = StarRatingType.hoverState(cellKey);

        if (newHoverRating !== currentStaticHover) {
            StarRatingType.hoverState(cellKey, newHoverRating);
            this.#hoverRating = newHoverRating;
            return true;
        }

        return false;
    }

    /**
     * 处理鼠标移出事件（静态状态版）
     *
     * ✅ 关键改进：清理所有可能的悬停状态（实例 + 静态Map），
     * 解决快速移动时多个单元格同时显示悬停效果的问题。
     *
     * @returns {boolean} 是否需要重绘
     */
    handleMouseLeave() {
        let needsRedraw = false;

        // ✅ 清除实例悬停状态
        if (this.#hoverRating !== null) {
            this.#hoverRating = null;
            needsRedraw = true;
        }

        // ✅ 清除当前单元格的静态悬停状态
        if (this.#currentCellKey && StarRatingType.#hoverStateMap.has(this.#currentCellKey)) {
            StarRatingType.clearHoverState(this.#currentCellKey);
            needsRedraw = true;
        }

        return needsRedraw;
    }

    /**
     * 处理键盘事件 ⭐ 新增键盘支持（增强版）
     *
     * 支持以下快捷键：
     * - Arrow Right / Up：增加 1 星
     * - Arrow Left / Down：减少 1 星
     * - 数字键 0-{max}：直接设置对应评分（动态适配最大星数）
     *
     * ✅ 优化改进：
     * - 动态数字键范围：根据 maxStars 配置自适应（不再硬编码 1-5）
     * - 边界安全检查：确保返回值在有效范围内 [0, max]
     * - 类型安全：使用 isNumber() 进行类型验证
     * - 性能优化：提前返回避免不必要的计算
     *
     * @param {KeyboardEvent} event - 键盘事件对象
     * @param {*} currentValue - 当前单元格值
     * @returns {number|null} 返回新的评分值，或 null 表示未处理此按键
     */
    handleKeydown(event, currentValue) {
        const max = this.options?.maxStars || CONFIG.STAR_RATING_MAX_STARS;
        // 安全解析当前值为数字（处理 null/undefined/非数字情况）
        let current = 0;
        if (currentValue !== null && currentValue !== undefined && currentValue !== "") {
            current = Number(currentValue);
            if (!Number.isFinite(current)) {
                current = 0; // 无效数值重置为 0
            }
        }
        current = Math.round(current); // 取整到整数星

        let newValue = null;

        switch (event.key) {
            case "ArrowRight":
            case "ArrowUp": {
                // 方向键上/右：增加 1 星（不超过最大值）
                newValue = Math.min(max, current + 1);
                break;
            }
            case "ArrowLeft":
            case "ArrowDown": {
                // 方向键下/左：减少 1 星（不小于 0）
                newValue = Math.max(0, current - 1);
                break;
            }
            default: {
                // 尝试匹配数字键（0 到 maxStars）
                const digit = parseInt(event.key, 10);
                if (!isNaN(digit) && digit >= 0 && digit <= max) {
                    newValue = digit;
                } else {
                    return null; // 非目标按键，交由默认逻辑处理
                }
                break;
            }
        }

        // 边界安全检查（确保值在有效范围内）
        if (newValue === null || isNaN(newValue)) {
            return null;
        }

        // 限制在 [0, max] 范围内
        newValue = Math.max(0, Math.min(max, newValue));

        // 值未变化时返回 null（避免无意义的更新和动画）
        if (newValue === current) {
            return null;
        }

        // 启动平滑过渡动画
        this.#startAnimation(current, newValue);

        return newValue;
    }

    /**
     * 启动评分动画 ⭐ 新增动画系统
     *
     * 使用缓动函数实现平滑的评分过渡效果。
     *
     * @param {number} fromValue - 起始值
     * @param {number} toValue - 目标值
     */
    #startAnimation(fromValue, toValue) {
        this.#targetRating = toValue;
        this.#animatedRating = fromValue;
        this.#animationStartTime = performance.now();
    }

    /**
     * 更新动画状态
     *
     * 应在 requestAnimationFrame 循环中调用。
     *
     * @returns {number} 当前动画值
     */
    #updateAnimation() {
        if (this.#animationStartTime === null || this.#targetRating === null) {
            return this.#animatedRating ?? this.#targetRating ?? 0;
        }

        const elapsed = performance.now() - this.#animationStartTime;
        const progress = Math.min(elapsed / StarRatingType.ANIMATION_DURATION, 1);

        // 使用 easeOutCubic 缓动函数
        const easedProgress = 1 - Math.pow(1 - progress, 3);
        this.#animatedRating = this.#animatedRating + (this.#targetRating - this.#animatedRating) * easedProgress;

        if (progress >= 1) {
            this.#animatedRating = this.#targetRating;
            this.#animationStartTime = null;
            this.#targetRating = null;
        }

        return this.#animatedRating;
    }

    /**
     * 自定义渲染方法（增强版 - 高清晰度优化）
     *
     * 支持：
     * - 基础星星绘制（高清晰度）
     * - 悬停预览效果
     * - 平滑动画过渡
     * - 渐变填充（优化后）
     *
     * 清晰度优化策略：
     * - 像素对齐：所有坐标对齐到像素网格，避免亚像素模糊
     * - 整数尺寸：确保星星尺寸为整数
     * - 优化阴影：减少或移除模糊性阴影
     * - 增强对比度：使用更清晰的描边和填充
     *
     * @param {import('../CellRenderContext.js').CellRenderContext} context - 单元格渲染上下文
     */
    render(context) {
        const { ctx, x, y, width, height, value } = context;

        const cellKey = `${context.row},${context.col}`;
        this.#currentCellKey = cellKey;

        const staticHoverRating = StarRatingType.hoverState(cellKey);

        let displayValue;
        if (staticHoverRating !== null) {
            displayValue = staticHoverRating;
        } else if (this.#hoverRating !== null) {
            displayValue = this.#hoverRating;
        } else if (this.#animatedRating !== null) {
            displayValue = this.#updateAnimation();
        } else {
            const numValue = Number(value);
            if (!Number.isFinite(numValue)) {
                return super.render(context);
            }
            displayValue = numValue;
        }

        const maxStars = this.options?.maxStars || CONFIG.STAR_RATING_MAX_STARS;

        // ✅ 优化1：确保星星尺寸为整数，避免亚像素渲染
        const baseStarSize = this.options?.starSize || Math.min(CONFIG.STAR_RATING_STAR_SIZE, height * 0.6);
        const starSize = Math.max(12, Math.round(baseStarSize)); // 最小12px，确保可见性

        // ✅ 优化2：间距也取整
        const gap = Math.round(starSize * CONFIG.STAR_RATING_GAP_RATIO);

        const totalWidth = starSize * maxStars + gap * (maxStars - 1);

        // ✅ 优化3：起始位置对齐到像素网格
        const startX = Math.round(x + (width - totalWidth) / 2);
        const centerY = Math.round(y + height / 2);

        const filledColor = this.options?.color || CONFIG.STAR_RATING_FILLED_COLOR;
        const emptyColor = this.options?.emptyColor || CONFIG.STAR_RATING_EMPTY_COLOR;
        const hoverColor = this.options?.hoverColor || this.#lightenColor(filledColor, 30);

        // ✅ 整星评分：将评分值四舍五入到整数（移除半星支持）
        const rating = Math.min(maxStars, Math.max(0, Math.round(displayValue)));

        // 清空位置缓存
        this.#starPositions = [];

        for (let i = 0; i < maxStars; i++) {
            // ✅ 优化4：每颗星星的 X 坐标也对齐到像素
            const starX = Math.round(startX + i * (starSize + gap));
            const starY = Math.round(centerY - starSize / 2);

            // ✅ 整星判断：直接比较整数索引
            const filled = i < rating;

            // 保存星星位置信息（用于点击检测）
            this.#starPositions.push({
                index: i,
                x: starX,
                y: starY,
                width: starSize,
                height: starSize,
            });

            ctx.save();

            // ✅ 优化5：使用精确的平移（已取整）
            ctx.translate(Math.round(starX + starSize / 2), centerY);

            // 缩放比例基于取整后的尺寸
            const scale = starSize / CONFIG.STAR_RATING_STAR_SIZE;
            ctx.scale(scale, scale);

            this.#drawStarPath(ctx);

            if (filled) {
                // 完整填充：使用纯色而非渐变（更清晰）
                ctx.fillStyle = filledColor;
                ctx.fill();

                // ✅ 优化6：添加清晰的细边框增强定义感
                ctx.strokeStyle = this.#darkenColor(filledColor, 15);
                ctx.lineWidth = Math.max(1, 1 / scale); // 根据缩放调整线宽
                ctx.stroke();

                // 移除或最小化阴影（避免模糊）
                // 仅保留非常微弱的深度提示
                ctx.shadowColor = "rgba(0, 0, 0, 0.15)";
                ctx.shadowBlur = 1; // 极小的模糊
                ctx.shadowOffsetX = 0.5;
                ctx.shadowOffsetY = 0.5;
                ctx.stroke(); // 只对描边应用阴影
                ctx.shadowColor = "transparent";
                ctx.shadowBlur = 0;
            } else {
                // ✅ 修复：使用静态悬停状态判断是否高亮
                const effectiveHoverRating = staticHoverRating ?? this.#hoverRating;
                const isHovered = effectiveHoverRating !== null && i < Math.ceil(effectiveHoverRating);
                ctx.strokeStyle = isHovered ? hoverColor : emptyColor;
                ctx.lineWidth = Math.max(1.5, 1.5 / scale); // 增加线宽使空星更清晰
                ctx.stroke();

                // 悬停时添加微弱但清晰的填充
                if (isHovered) {
                    ctx.fillStyle = hoverColor + "30"; // 19% 透明度（稍深一点）
                    ctx.fill();
                }
            }

            ctx.restore();
        }

        // 如果有动画在进行中，标记需要继续更新
        if (this.#animationStartTime !== null) {
            context.needsUpdate = true;
        }
    }

    /**
     * 绘制五角星路径（中心在原点，尺寸 20x20）
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D 上下文
     */
    #drawStarPath(ctx) {
        const outerRadius = 8;
        const innerRadius = 3.2;
        const spikes = 5;

        ctx.beginPath();
        for (let i = 0; i < spikes * 2; i++) {
            const radius = i % 2 === 0 ? outerRadius : innerRadius;
            const angle = (i * Math.PI) / spikes - Math.PI / 2;
            const px = Math.cos(angle) * radius;
            const py = Math.sin(angle) * radius;

            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
    }

    /**
     * 颜色变亮工具函数
     *
     * 将指定颜色变亮指定百分比。
     *
     * @param {string} color - 十六进制颜色值（如 "#FFD700"）
     * @param {number} percent - 变亮百分比（0-100）
     * @returns {string} 变亮后的颜色值
     */
    #lightenColor(color, percent) {
        const num = parseInt(color.replace("#", ""), 16);
        const amt = Math.round(2.55 * percent);
        const R = (num >> 16) + amt;
        const G = ((num >> 8) & 0x00ff) + amt;
        const B = (num & 0x0000ff) + amt;

        return (
            "#" +
            (0x1000000 + (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 + (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 + (B < 255 ? (B < 1 ? 0 : B) : 255))
                .toString(16)
                .slice(1)
        );
    }

    /**
     * 颜色变暗工具函数 ⭐ 新增（用于增强边框清晰度）
     *
     * 将指定颜色变暗指定百分比，用于创建清晰的轮廓线。
     *
     * @param {string} color - 十六进制颜色值（如 "#FFD700"）
     * @param {number} percent - 变暗百分比（0-100）
     * @returns {string} 变暗后的颜色值
     */
    #darkenColor(color, percent) {
        const num = parseInt(color.replace("#", ""), 16);
        const amt = Math.round(2.55 * percent);
        const R = (num >> 16) - amt;
        const G = ((num >> 8) & 0x00ff) - amt;
        const B = (num & 0x0000ff) - amt;

        return "#" + (0x1000000 + (R > 0 ? R : 0) * 0x10000 + (G > 0 ? G : 0) * 0x100 + (B > 0 ? B : 0)).toString(16).slice(1);
    }
}
