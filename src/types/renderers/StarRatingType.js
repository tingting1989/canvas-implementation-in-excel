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
            console.log(`[StarRating] 📍 静态悬停状态: [${cellKey}] = ${newValue}`);
        }
        return StarRatingType.#hoverStateMap.get(cellKey) ?? null;
    }

    /**
     * 清除指定单元格的悬停状态
     *
     * @param {string} cellKey - 单元格标识
     */
    static clearHoverState(cellKey) {
        const hadValue = StarRatingType.#hoverStateMap.has(cellKey);
        StarRatingType.#hoverStateMap.delete(cellKey);
        if (hadValue) {
            console.log(`[StarRating] 🧹 清除悬停状态: [${cellKey}]`);
        }
    }

    /**
     * 清除所有悬停状态（静态方法）
     */
    static clearAllHoverStates() {
        const size = StarRatingType.#hoverStateMap.size;
        StarRatingType.#hoverStateMap.clear();
        if (size > 0) {
            console.log(`[StarRating] 🧹 清除全部 ${size} 个悬停状态`);
        }
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
        return { ...baseStyle, textAlign: "left", cursor: "pointer" };
    }

    format(value) {
        return value != null ? `${value} 星` : "";
    }

    validate(value) {
        if (value === "" || value == null) return true;
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
    handleClick(context, event) {
        const { x: cellX, y: cellY, width, height, value } = context;

        // ✅ 使用与 render() 一致的参数计算（基于单元格内部坐标）
        const baseStarSize = this.options?.starSize || Math.min(CONFIG.STAR_RATING_STAR_SIZE, height * 0.6);
        const starSize = Math.max(12, Math.round(baseStarSize));
        const gap = Math.round(starSize * CONFIG.STAR_RATING_GAP_RATIO);
        const maxStars = this.options?.maxStars || CONFIG.STAR_RATING_MAX_STARS;
        const totalWidth = starSize * maxStars + gap * (maxStars - 1);

        // ✅ 关键：render() 中的坐标是基于单元格内部的（从 0 开始）
        // 所以这里也必须从 0 开始计算，而不是使用 cellX
        const startX = Math.round((width - totalWidth) / 2); // ← 相对于单元格左边缘
        const centerY = Math.round(height / 2); // ← 相对于单元格上边缘

        // 获取鼠标相对于单元格内部的精确位置
        let mouseX, mouseY;

        // ✅ 尝试多种方式获取鼠标坐标（兼容不同浏览器和事件类型）
        if (event.offsetX !== undefined && event.offsetY !== undefined && event.offsetX !== 0) {
            // 方式1: offsetX/offsetY（最常用）
            mouseX = event.offsetX - cellX;
            mouseY = event.offsetY - cellY;
            console.log(`[StarRating] 📐 使用 offsetX 计算`);
        } else if (event.layerX !== undefined && event.layerY !== undefined) {
            // 方式2: layerX/layerY（Firefox 兼容）
            mouseX = event.layerX - cellX;
            mouseY = event.layerY - cellY;
            console.log(`[StarRating] 📐 使用 layerX 计算`);
        } else if (event.clientX !== undefined && event.clientY !== undefined) {
            // 方式3: clientX/clientY（备选方案）
            mouseX = event.clientX - cellX;
            mouseY = event.clientY - cellY;
            console.log(`[StarRating] 📐 使用 clientX 计算`);
        } else {
            console.error("[StarRating] ❌ 无法获取有效的鼠标坐标!", {
                eventKeys: Object.keys(event),
                offsetX: event.offsetX,
                layerX: event.layerX,
                clientX: event.clientX,
            });
            return null;
        }

        console.log(`[StarRating] 点击检测（坐标系修复）:`, {
            Canvas坐标: { cellX: cellX.toFixed(1), cellY: cellY.toFixed(1) },
            原始事件: { offsetX: event.offsetX, offsetY: event.offsetY },
            单元格内坐标: { mouseX: mouseX.toFixed(1), mouseY: mouseY.toFixed(1) },
            星星布局: { startX, centerY, starSize, gap, width, height },
        });

        // 诊断信息
        const firstStarX = startX;
        const lastStarX = startX + (maxStars - 1) * (starSize + gap) + starSize;
        const starTopY = centerY - starSize / 2;
        const starBottomY = centerY + starSize / 2;

        console.log(`[StarRating] 📍 坐标范围:`, {
            星星X: `[${firstStarX}, ${lastStarX}]`,
            星星Y: `[${starTopY.toFixed(1)}, ${starBottomY.toFixed(1)}]`,
            鼠标: `(${mouseX.toFixed(1)}, ${mouseY.toFixed(1)})`,
            在范围内: `${mouseX >= firstStarX && mouseX <= lastStarX && mouseY >= starTopY && mouseY <= starBottomY}`,
        });

        // 检查是否点击了星星区域（使用单元格内相对坐标）
        for (let i = 0; i < maxStars; i++) {
            const starX = Math.round(startX + i * (starSize + gap));
            const starY = Math.round(centerY - starSize / 2);

            console.log(`[StarRating]   第${i + 1}颗星: [${starX}, ${starY}] +${starSize}`);

            // 矩形碰撞检测（使用单元格内相对坐标）
            if (mouseX >= starX && mouseX <= starX + starSize && mouseY >= starY && mouseY <= starY + starSize) {
                const newRating = i + 1;
                console.log(`[StarRating] ✅ 命中第 ${newRating} 颗星!`);
                this.#startAnimation(Number(value) || 0, newRating);
                return newRating;
            }
        }

        console.log(`[StarRating] ❌ 未命中`);
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
        // 🔍 诊断：打印接收到的 event 对象结构
        console.log(`[StarRating] 🔍 handleHover 接收到的事件:`, {
            type: event?.type,
            hasOffsetX: "offsetX" in event,
            offsetX: event?.offsetX,
            offsetY: event?.offsetY,
        });

        // ✅ 直接复用 handleClick 的逻辑（已修复坐标系问题）
        const newHoverRating = this.handleClick(context, event);

        // 获取单元格标识
        const cellKey = `${context.row},${context.col}`;
        this.#currentCellKey = cellKey;

        // 读取当前的静态悬停状态
        const currentStaticHover = StarRatingType.hoverState(cellKey);

        console.log(`[StarRating] handleHover 检测:`, {
            cellKey,
            当前静态悬停值: currentStaticHover,
            当前实例悬停值: this.#hoverRating,
            新检测值: newHoverRating,
            是否变化: newHoverRating !== currentStaticHover,
        });

        // ✅ 关键：同时更新静态状态和实例属性
        if (newHoverRating !== currentStaticHover) {
            // 更新静态状态（跨实例共享）
            StarRatingType.hoverState(cellKey, newHoverRating);
            // 同步更新实例属性（兼容旧代码）
            this.#hoverRating = newHoverRating;

            console.log(`[StarRating] ✅ 悬停状态更新为: ${newHoverRating}, 需要重绘`);
            return true; // 状态改变，需要重绘以显示新的悬停效果
        }

        console.log(`[StarRating] ℹ️ 悬停状态未变化 (${currentStaticHover}), 无需重绘`);
        return false;
    }

    /**
     * 处理鼠标移出事件（静态状态版）
     *
     * 清除当前单元格的悬停状态。
     */
    handleMouseLeave() {
        // ✅ 清除静态悬停状态
        if (this.#currentCellKey) {
            StarRatingType.clearHoverState(this.#currentCellKey);
        }

        // 同时清除实例属性
        if (this.#hoverRating !== null) {
            this.#hoverRating = null;
            console.log(`[StarRating] 🚪 handleMouseLeave: 清除悬停状态`);
            return true; // 需要重绘
        }
        return false;
    }

    /**
     * 处理键盘事件 ⭐ 新增键盘支持
     *
     * 支持以下快捷键：
     * - Arrow Right / Up：增加 1 星
     * - Arrow Left / Down：减少 1 星
     * - 数字键 1-5：直接设置对应评分
     *
     * @param {KeyboardEvent} event - 键盘事件对象
     * @param {*} currentValue - 当前值
     * @returns {number|null} 返回新值，或 null 表示未处理
     */
    handleKeydown(event, currentValue) {
        const max = this.options?.maxStars || CONFIG.STAR_RATING_MAX_STARS;
        const current = Number(currentValue) || 0;
        let newValue = null;

        switch (event.key) {
            case "ArrowRight":
            case "ArrowUp":
                event.preventDefault();
                // ✅ 整星步进：每次增加 1 颗星
                newValue = Math.min(max, Math.round(current) + 1);
                break;
            case "ArrowLeft":
            case "ArrowDown":
                event.preventDefault();
                // ✅ 整星步进：每次减少 1 颗星
                newValue = Math.max(0, Math.round(current) - 1);
                break;
            case "1":
            case "2":
            case "3":
            case "4":
            case "5":
                event.preventDefault();
                newValue = parseInt(event.key, 10);
                break;
            default:
                return null;
        }

        if (newValue !== current && newValue !== null) {
            this.#startAnimation(current, newValue);
            return newValue;
        }

        return null;
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

        // ✅ 关键修复：使用静态状态而非实例属性
        // 因为 getCellTypeInstance() 可能每次返回新实例，导致实例属性丢失
        const cellKey = `${context.row},${context.col}`;
        this.#currentCellKey = cellKey; // 缓存当前单元格标识

        // 从静态 Map 读取悬停状态（跨实例共享）
        const staticHoverRating = StarRatingType.hoverState(cellKey);

        // 🔍 诊断日志
        if (staticHoverRating !== null) {
            console.log(`[StarRating] 🎨 render() 使用静态悬停状态:`, {
                cellKey,
                staticHoverRating,
                instanceHoverRating: this.#hoverRating,
                使用静态状态: "✅",
            });
        }

        // 获取实际显示的评分值（优先级：静态悬停 > 实例悬停 > 动画 > 实际值）
        let displayValue;
        if (staticHoverRating !== null) {
            // ✅ 优先使用静态悬停状态（解决实例复用问题）
            displayValue = staticHoverRating;
        } else if (this.#hoverRating !== null) {
            // 兼容旧代码：如果静态状态没有，尝试实例属性
            displayValue = this.#hoverRating;
        } else if (this.#animatedRating !== null) {
            // 动画进行中（评分变化过渡动画）
            displayValue = this.#updateAnimation();
        } else {
            // 正常显示当前单元格的实际值
            displayValue = Number(value) || 0;
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
