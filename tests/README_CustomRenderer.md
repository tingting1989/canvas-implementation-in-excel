# 自定义渲染器测试指南

## 📋 测试套件概述

本测试文件 `CustomRenderer.test.js` 包含 **9 大类、60+ 个测试用例**，全面覆盖自定义渲染器的功能、性能和安全性。

---

## 🧪 测试分类

### 1️⃣ 基础功能测试（12个）
- ✅ CellRenderContext 属性正确性
- ✅ 双轨行列号体系（row vs realRow）
- ✅ 默认值回退机制
- ✅ 辅助方法（getCenterX/Y, drawRoundedRect）
- ✅ Sheet 引用和 PageInfo 传递

### 2️⃣ 行列号转换方法测试（6个）
- ✅ 无 Sheet 无 PageInfo 时返回原值
- ✅ 有 PageInfo 时使用偏移量计算
- ✅ 优先使用 Sheet 自定义转换方法
- ✅ 双向转换一致性验证

### 3️⃣ BaseColumnType 扩展测试（4个）
- ✅ 基类 render() 空操作
- ✅ hasCustomRenderer 默认/重写行为

### 4️⃣ 内置渲染器功能测试（15+个）
- ✅ BooleanCheckboxType：选中/未选中/禁用态
- ✅ ProgressBarType：正常/超范围/负值/null
- ✅ StarRatingType：整数/半星/零分
- ✅ SparklineType：折线图/柱状图/空数据/非数组
- ✅ ColorPreviewType：Hex/RGB/空值

### 5️⃣ 攻击性测试 ⭐⭐⭐（20+个）
#### 异常输入：
- 极端坐标值（MAX_SAFE_INTEGER）
- 负数坐标值
- 零尺寸/极小尺寸单元格
- 特殊值（NaN, Infinity, undefined, null）
- 循环引用对象
- 超长字符串（100KB）

#### 边界条件：
- ProgressBarType 接受极端数值（-Infinity 到 +Infinity）
- StarRatingType 处理非数字类型
- SparklineType 处理大数据集（10000点）和平坦数据
- ColorPreviewType 处理无效颜色值

#### 性能压力：
- 批量创建 10000 个 Context（<500ms）
- 高频调用转换方法 100000 次（<200ms）
- 内存泄漏检测（大量创建销毁）

### 6️⃣ 冻结/分页模式专项测试（5个）
- ✅ 冻结2行的行号映射
- ✅ 分页模式第2页的行号计算
- ✅ 冻结+分页组合场景（最复杂情况）
- ✅ 渲染器在冻结区域的行为

### 7️⃣ 与图表引擎一致性验证（3个）
- ✅ 实际行号用于数据访问
- ✅ 数据范围定义使用实际行号
- ✅ 双轨体系在冻结场景下保持一致

### 8️⃣ 并发安全性测试（2个）
- ✅ 多实例并行创建无竞争条件
- ✅ 共享 Sheet 引用的线程安全读取

### 9️⃣ 类型安全运行时检查（2个）
- ✅ 缺少必需参数时的容错
- ✅ 属性类型错误时的行为

---

## 🚀 运行测试

### 前置要求

```bash
# 安装依赖
npm install

# 安装测试框架（如果尚未安装）
npm install -D vitest jsdom
```

### 运行所有测试

```bash
# 使用 Vitest 运行
npx vitest run tests/CustomRenderer.test.js

# 或使用 npm script
npm test -- tests/CustomRenderer.test.js
```

### 运行特定测试组

```bash
# 只运行攻击性测试
npx vitest run tests/CustomRenderer.test.js -t "攻击性测试"

# 只运行冻结/分页测试
npx vitest run tests/CustomRenderer.test.js -t "冻结"

# 只运行性能测试
npx vitest run tests/CustomRenderer.test.js -t "Performance"
```

### 查看详细输出

```bash
# 显示完整日志（包括 console.log）
npx vitest run tests/CustomRenderer.test.js --reporter=verbose

# 生成覆盖率报告
npx vitest run tests/CustomRenderer.test.js --coverage
```

---

## 📊 预期结果

### 成功标准

✅ **所有测试通过**（60+/60+）
✅ **无内存泄漏**（增长 <10MB）
✅ **性能达标**：
   - Context 创建 <50μs/次
   - 行列号转换 <2μs/次
   - 渲染器执行 <5ms/次

### 典型输出示例

```
 ✓ tests/CustomRenderer.test.js (62 tests) (234ms)

   CellRenderContext - 基础功能 (12 tests) 45ms
     ✓ 基础属性正确读取
     ✓ 双轨行列号体系 - 页面行号和实际行号分离
     ✓ ...

   攻击性测试 - 异常输入与边界条件 (22 tests) 89ms
     ✓ 极端坐标值（超大数值）
     ✓ 负数坐标值
     ✓ ...
     ✓ [Performance] Created 10000 contexts in 123.45ms
     ✓ [Performance] 100000 conversions in 67.89ms
     ✓ [Memory] Increase: 0.52MB

   冻结/分页模式专项测试 (5 tests) 34ms
     ✓ 冻结2行的行号映射
     ...

 Test Files  1 passed (62 tests)
      Time    234ms
```

---

## 🔍 调试技巧

### 单个测试失败时

```bash
# 只运行失败的测试
npx vitest run tests/CustomRenderer.test.js -t "测试名称"
```

### 查看 Canvas 绘制调用

测试中的 `mockCtx.calls` 数组记录了所有 Canvas API 调用：

```javascript
test('某个渲染器的绘制逻辑', () => {
    renderer.render(context);

    // 打印所有 Canvas 调用
    console.log(mockCtx.calls);

    // 检查特定调用是否存在
    expect(mockCtx.calls.some(c => c.method === 'fill')).toBe(true);
});
```

### 性能分析

测试中包含自动性能检查，会在控制台输出：

```
[Performance] Created 10000 contexts in 123.45ms
[Performance] 100000 conversions in 67.89ms
[Memory] Increase: 0.52MB
```

---

## ⚠️ 已知限制与注意事项

### Node.js 环境
- Canvas API 是模拟的，不会真正渲染图形
- `global.gc()` 需要 `node --expose-gc` 参数才能使用
- 部分 DOM API 在 Node.js 中不可用（已通过 mock 解决）

### 浏览器环境
- 如需在真实浏览器中测试，需配置 Vitest 的 `jsdom` 环境
- 可以集成 Puppeteer 进行端到端测试

---

## 📈 测试覆盖率目标

| 模块 | 目标覆盖率 | 当前状态 |
|------|-----------|---------|
| CellRenderContext | ≥95% | ✅ 待验证 |
| BaseColumnType.render() | ≥90% | ✅ 待验证 |
| BooleanCheckboxType | ≥85% | ✅ 待验证 |
| ProgressBarType | ≥85% | ✅ 待验证 |
| StarRatingType | ≥80% | ✅ 待验证 |
| SparklineType | ≥80% | ✅ 待验证 |
| ColorPreviewType | ≥80% | ✅ 待验证 |

---

## 🎯 下一步计划

### Phase 1: 核心功能验证 [当前]
- [x] 完成基础功能测试
- [x] 完成攻击性测试
- [ ] 运行完整测试套件并修复失败项
- [ ] 达成覆盖率目标

### Phase 2: 集成测试
- [ ] TileRenderer 集成测试
- [ ] 与图表引擎联合测试
- [ ] 用户交互事件测试（点击复选框等）

### Phase 3: E2E 测试
- [ ] Puppeteer 自动化浏览器测试
- [ ] 真实 Canvas 渲染截图对比
- [ ] 性能基准测试（大表格 10000x50）

---

## 📝 更新记录

**v1.0.0** (2026-06-27)
- 初始版本，包含完整的测试套件
- 覆盖 9 大类测试场景
- 包含详细的攻击性测试用例

---

## 👥 维护者

- **主要作者**: AI Assistant
- **审核**: 技术团队
- **最后更新**: 2026-06-27

---

**祝测试愉快！🚀**