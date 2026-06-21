# 📊 Canvas Spreadsheet 公式引擎优化规划文档

> **版本**: v2.0  
> **更新日期**: 2026-06-21  
> **状态**: 规划中  
> **优先级**: P0（核心功能完善）

---

## 📋 目录

1. [执行摘要](#执行摘要)
2. [当前能力评估](#当前能力评估)
3. [优化目标与原则](#优化目标与原则)
4. [功能增强规划](#功能增强规划)
5. [性能优化方案](#性能优化方案)
6. [架构改进建议](#架构改进建议)
7. [用户体验提升](#用户体验提升)
8. [实施路线图](#实施路线图)
9. [测试策略](#测试策略)
10. [风险与应对](#风险与应对)
11. [成功指标](#成功指标)

---

## 执行摘要

### 🎯 核心目标

将 Canvas Spreadsheet 的公式引擎从 **基础可用版本** 提升至 **企业级生产就绪版本**，实现：

- ✅ **函数覆盖率**: 从 13 个 → 50+ 个内置函数
- ⚡ **性能提升**: 大表格场景下 10-100 倍提速
- 🔒 **稳定性**: 完善的错误处理和边界情况覆盖
- 🎨 **易用性**: 智能提示、调试工具、文档完善
- 🔌 **扩展性**: 插件化函数包、沙箱安全机制

### 📈 预期收益

| 维度 | 当前 | 目标 | 提升 |
|------|------|------|------|
| **Excel 兼容性** | 3% | 60%+ | 20x |
| **计算性能** | 基准 | 10-100x | 显著 |
| **错误处理** | 基础 | 完善 | 质的飞跃 |
| **开发体验** | 手动 | 半自动化 | 效率提升 |

---

## 当前能力评估

### ✅ 已实现功能（v2.0）

#### 核心架构
- ✅ 公式解析器（FormulaParser）- 支持 AST 生成
- ✅ 公式求值器（FormulaEvaluator）- 递归求值
- ✅ 依赖追踪系统 - 自动重算 + 级联更新
- ✅ 循环引用检测 - 调用栈机制
- ✅ 错误处理集成 - ErrorHandler 统一管理
- ✅ 自定义函数 API - 动态注册/注销

#### 内置函数库（13个）
```
数学运算: SUM, AVERAGE, MAX, MIN, ABS, ROUND (6个)
统计函数: COUNT, COUNTA (2个)
逻辑判断: IF (1个)
文本处理: UPPER, LOWER, CONCAT, CONCATENATE (4个)
```

#### 支持的语法特性
- ✅ 单元格引用: A1, B2, AA10
- ✅ 范围引用: A1:B10, Sheet2!C5:D20
- ✅ 运算符: +, -, *, /, ^, &, =, <>, <, >, <=, >=
- ✅ 函数调用: SUM(A1:A10), IF(condition, true_val, false_val)
- ✅ 跨表引用: Sheet2!A1
- ✅ 错误码: #VALUE!, #REF!, #DIV/0!, #NAME?, #PARSE!, #CIRCULAR!

---

## 优化目标与原则

### 🎯 设计原则

1. **渐进式增强**: 保持向后兼容，逐步添加新功能
2. **性能优先**: 所有新功能必须通过性能基准测试
3. **用户导向**: 优先解决高频使用场景
4. **标准化兼容**: 尽量遵循 Excel/Google Sheets 行为
5. **可测试性**: 每个新功能必须配备单元测试

### 📊 优先级定义

| 优先级 | 定义 | 示例 |
|--------|------|------|
| **P0 - 必须做** | 影响基本可用性，无此功能不可上线 | SUMIF, VLOOKUP |
| **P1 - 强烈推荐** | 高频使用，显著提升专业性 | 日期函数, 文本处理 |
| **P2 - 锦上添花** | 低频但专业场景需要 | 矩阵运算, 统计分布 |
| **P3 - 未来规划** | 生态建设，长期价值 | Lambda, 插件市场 |

---

## 功能增强规划

### 🔴 P0 - 必须实现（预计 3-5 天）

#### 1️⃣ 数学与统计函数增强（8个）

##### SUMIF / SUMIFS - 条件求和
```javascript
/**
 * SUMIF(range, criteria, [sum_range])
 * 对满足条件的单元格求和
 *
 * @example
 * =SUMIF(A1:A10, ">100")           // 求 A1:A10 中大于100的和
 * =SUMIF(B1:B10, "苹果", C1:C10)   // B列是"苹果"时，对C列求和
 */
_registerBuiltin('SUMIF', (args) => {
    const [range, criteria, sumRange] = args;
    const flatRange = _flatten(range);
    const flatSumRange = sumRange ? _flatten(sumRange) : flatRange;
    
    return flatSumRange.reduce((sum, value, index) => {
        if (_matchCriteria(flatRange[index], criteria)) {
            return sum + _toNum(value);
        }
        return sum;
    }, 0);
});

_registerBuiltin('SUMIFS', (args) => {
    // 多条件求和实现...
});
```

**使用频率**: ⭐⭐⭐⭐⭐ (Top 3 最常用函数)

**复杂度**: 中等（需实现条件匹配引擎）

---

##### PRODUCT - 乘积
```javascript
_registerBuiltin('PRODUCT', (args) => {
    const flat = _flatten(args);
    return flat.reduce((acc, v) => acc * _toNum(v), 1);
});
```

**使用频率**: ⭐⭐⭐⭐⭐ (比 SUM 还常用)

**复杂度**: 低

---

##### COUNTBLANK - 计数空单元格
```javascript
_registerBuiltin('COUNTBLANK', (args) => {
    const flat = _flatten(args);
    return flat.filter(v => 
        v === "" || v === null || v === undefined
    ).length;
});
```

**使用频率**: ⭐⭐⭐⭐ (数据清洗必备)

**复杂度**: 低

---

##### 其他数学函数
```javascript
MOD(number, divisor)      // 取模 - 编程常用
POWER(base, exponent)     // 幂运算
SQRT(number)              // 平方根
INT(number)               // 向下取整（财务必备）
CEILING(number, sig)      // 向上舍入
FLOOR(number, sig)        // 向下舍入
```

#### 2️⃣ 逻辑函数增强（4个）

```javascript
AND(condition1, condition2, ...)   // 逻辑与
OR(condition1, condition2, ...)    // 逻辑或
NOT(condition)                     // 逻辑非
IFS(cond1, val1, cond2, val2, ...) // 多条件判断（Excel 2016+）
```

**使用场景**: 与 IF 配合使用频率 >90%

**示例**:
```javascript
=IF(AND(A1>0, B1<100), "合格", "不合格")
=IFS(A1>=90,"A", A1>=80,"B", A1>=70,"C", "D")
```

#### 3️⃣ 查找引用函数（3个）- **关键差异化功能**

##### VLOOKUP - 垂直查找
```javascript
/**
 * VLOOKUP(lookup_value, table_array, col_index_num, [range_lookup])
 * 在表格第一列中查找值，返回指定列的值
 *
 * @param {any} lookup_value - 要查找的值
 * @param {array} table_array - 查找范围（二维数组）
 * @param {number} col_index_num - 返回第几列（从1开始）
 * @param {boolean} [range_lookup=true] - 是否近似匹配
 *
 * @example
 * =VLOOKUP("苹果", A1:C10, 3, false)  // 精确查找"苹果"，返回第3列
 */
_registerBuiltin('VLOOKUP', (args) => {
    const [lookupValue, tableArray, colIndex, rangeLookup] = args;
    
    if (!Array.isArray(tableArray)) return "#VALUE!";
    if (colIndex < 1 || colIndex > tableArray[0]?.length) return "#REF!";
    
    for (let i = 0; i < tableArray.length; i++) {
        const row = tableArray[i];
        const firstCol = row[0];
        
        if (_equals(firstCol, lookupValue)) {  // 精确匹配
            return row[colIndex - 1];
        }
        
        if (rangeLookup !== false && firstCol > lookupValue) {  // 近似匹配
            return i > 0 ? tableArray[i-1][colIndex - 1] : "#N/A";
        }
    }
    
    return rangeLookup === false ? "#N/A!" : tableArray[tableArray.length-1][colIndex-1];
});
```

**重要性**: Excel 最著名函数之一，**缺少此函数=不完整电子表格**

**复杂度**: 中高（需处理精确/近似匹配、边界情况）

---

##### HLOOKUP - 水平查找
```javascript
// 类似 VLOOKUP，但在行方向查找
_registerBuiltin('HLOOKUP', (args) => {
    // 实现...
});
```

##### MATCH - 匹配位置
```javascript
_registerBuiltin('MATCH', (args) => {
    const [lookupValue, lookupArray, matchType] = args;
    const flat = _flatten(lookupArray);
    
    for (let i = 0; i < flat.length; i++) {
        if (_equals(flat[i], lookupValue)) {
            return i + 1;  // Excel 使用 1-based 索引
        }
    }
    
    return "#N/A!";
});
```

---

### 🟡 P1 - 强烈推荐（预计 7-10 天）

#### 4️⃣ 日期时间函数（6个）

```javascript
TODAY()                          // 当前日期
NOW()                            // 当前日期时间
DATE(year, month, day)          // 构造日期
YEAR(date), MONTH(date), DAY(date)  // 提取日期部分
DATEDIF(start, end, unit)       // 日期差（天/月/年）
WEEKDAY(date, type)             // 星期几
```

**应用场景**: 项目管理、财务周期、考勤系统、合同期限

**技术挑战**: 需要统一的日期解析和格式化机制

---

#### 5️⃣ 文本处理增强（8个）

```javascript
LEFT(text, num_chars)                    // 左侧截取
RIGHT(text, num_chars)                   // 右侧截取
MID(text, start, num)                    // 中间截取
LEN(text)                                // 字符串长度
TRIM(text)                               // 去除首尾空格
SUBSTITUTE(text, old, new, [instance])    // 文本替换
REPLACE(old_text, start, num, new_text)  // 替换指定位置
TEXT(value, format_text)                 // 格式化数字为文本
```

**应用场景**: 数据清洗、格式化、文本分析

**示例**:
```javascript
=LEFT(A1, 3)                    // 取前3个字符
=TRIM("  hello world  ")       // → "hello world"
=SUBSTITUTE(A1, " ", "_")       // 替换空格为下划线
=TEXT(1234.567, "#,##0.00")    // → "1,234.57"
```

---

#### 6️⃣ 条件统计增强（4个）

```javascript
SUMIFS(sum_range, crit_range1, crit1, ...)  // 多条件求和
COUNTIFS(crit_range1, crit1, ...)            // 多条件计数
AVERAGEIFS(avg_range, crit_range1, crit1, ...) // 多条件平均
IFERROR(value, error_value)                  // 错误捕获
```

**使用频率**: 企业报表 Top 5

**示例**:
```javascript
// 计算北京地区销售额 > 10000 的订单总和
=SUMIFS(C2:C100, B2:B100, "北京", D2:D100, ">10000")

// 安全除法（避免 #DIV/0!）
=IFERROR(A1/B1, 0)
```

---

#### 7️⃣ 金融函数（5个）

```javascript
PMT(rate, nper, pv, [fv], [type])    // 每期还款额
FV(rate, nper, pmt, [pv], [type])     // 未来值
PV(rate, nper, pmt, [fv], [type])     // 现值
NPV(rate, value1, [value2], ...)       // 净现值
IRR(values, [guess])                  // 内部收益率
```

**应用场景**: 贷款计算器、投资分析、财务建模

**复杂度**: 高（涉及复利计算、迭代求解）

**示例**:
```javascript
// 计算房贷月供：贷款100万，30年，利率4.9%
=PMT(4.9%/12, 360, 1000000)  // → -5307.27
```

---

### 🟢 P2 - 锦上添花（按需实施）

#### 8️⃣ 高级数学（5个）
```javascript
RAND() / RANDBETWEEN(bottom, top)  // 随机数
PI(), E()                           // 数学常数
SQRTPI(number)                      // √(π×x)
LOG(number, base)                   // 对数
LN(number)                          // 自然对数
```

#### 9️⃣ 信息函数（4个）
```javascript
ISNUMBER(value)    // 是否数字
ISTEXT(value)      // 是否文本
ISBLANK(value)     // 是否空白
ISERROR(value)     // 是否错误
ISNA(value)        // 是否 #N/A
TYPE(value)        // 返回数据类型
```

#### 🔟 数组函数（3个）
```javascript
TRANSPOSE(array)               // 矩阵转置
INDEX(array, row, [col])       // 索引访问
ROW([ref]), COLUMN([ref])      // 返回行列号
```

---

## 性能优化方案

### 🚨 当前瓶颈识别

#### 问题 1: 全量重算导致性能问题
**现象**: 修改一个单元格触发所有依赖公式的重算

**影响**: 1000+ 公式时明显卡顿

**解决方案**:

##### 方案 A: 批量更新模式（立即可实施）
```javascript
class FormulaEngine {
    /**
     * 批量更新模式
     * 在回调内所有修改只触发一次最终重算
     */
    batchUpdate(callback) {
        this._batchMode = true;
        this._pendingChanges = new Set();
        
        try {
            callback();  // 用户的所有修改操作
        } finally {
            this._batchMode = false;
            
            // 统一触发一次重算
            if (this._pendingChanges.size > 0) {
                this.#recalculateDirtyCells();
            }
        }
    }
}

// 使用示例
engine.batchUpdate(() => {
    sheet.setCell(0, 0, 100);  // 不立即重算
    sheet.setCell(1, 0, 200);  // 不立即重算
    sheet.setCell(2, 0, 300);  // 不立即重算
});  // 此处统一重算一次
```

**预期收益**: 批量操作性能提升 **10-50倍**

**工作量**: 0.5 天

---

##### 方案 B: 增量计算 + 拓扑排序（中期目标）
```javascript
class TopologicalCalculator {
    /**
     * 拓扑排序确保计算顺序正确
     * 避免重复计算同一公式
     */
    #calculateDirtyCells(dirtySet) {
        // 1. 构建依赖图
        const graph = this.#buildDependencyGraph(dirtySet);
        
        // 2. 拓扑排序
        const sorted = this.#topologicalSort(graph);
        
        // 3. 按序计算（每个公式只算一次）
        for (const cellKey of sorted) {
            this.#evaluateCell(cellKey);
        }
    }
    
    #topologicalSort(graph) {
        // Kahn's 算法或 DFS
        const inDegree = new Map();
        const queue = [];
        const result = [];
        
        // 初始化入度
        for (const [node, deps] of graph.entries()) {
            inDegree.set(node, deps.size);
            if (deps.size === 0) queue.push(node);
        }
        
        while (queue.length > 0) {
            const node = queue.shift();
            result.push(node);
            
            for (const dependent of this.dependents.get(node) || []) {
                const newDegree = (inDegree.get(dependent) || 1) - 1;
                inDegree.set(dependent, newDegree);
                if (newDegree === 0) queue.push(dependent);
            }
        }
        
        return result;
    }
}
```

**预期收益**: 复杂依赖链场景性能提升 **5-20倍**

**工作量**: 2-3 天

---

##### 方案 C: AST 缓存 + 脏标记（长期优化）
```javascript
class CachedEvaluator {
    constructor() {
        /** AST 结果缓存 Map<cellKey, {result, version}> */
        this._cache = new Map();
        
        /** 单元格版本号 Map<cellKey, number> */
        this._versions = new Map();
    }
    
    evaluate(ast, sheet, cellKey) {
        const cached = this._cache.get(cellKey);
        const currentVersion = this.#getCellVersion(cellKey);
        
        // 缓存命中且未过期
        if (cached && cached.version === currentVersion) {
            return cached.result;
        }
        
        // 正常求值并缓存
        const result = this.#evaluateAST(ast, sheet);
        this._cache.set(cellKey, { result, version: currentVersion });
        
        return result;
    }
    
    invalidate(cellKey) {
        // 递增版本号使缓存失效
        const current = this._versions.get(cellKey) || 0;
        this._versions.set(cellKey, current + 1);
    }
}
```

**预期收益**: 重复计算场景性能提升 **2-5倍**

**工作量**: 1-2 天

---

### 性能基准测试框架

```javascript
class FormulaBenchmark {
    async runBenchmark() {
        const scenarios = [
            {
                name: '小规模 (100 cells)',
                setup: () => this.createSheet(100),
                operations: ['setCell', 'recalculate']
            },
            {
                name: '中等规模 (1000 cells)',
                setup: () => this.createSheet(1000),
                operations: ['batchUpdate', 'recalculateAll']
            },
            {
                name: '大规模 (10000 cells)',
                setup: () => this.createSheet(10000),
                operations: ['dependencyTracking', 'incrementalCalc']
            },
            {
                name: '复杂依赖链',
                setup: () => this.createComplexDependencies(),
                operations: ['circularDetection', 'topoSort']
            }
        ];
        
        for (const scenario of scenarios) {
            console.log(`\n📊 Testing: ${scenario.name}`);
            const result = await this.measure(scenario);
            this.report(result);
        }
    }
    
    measure(scenario) {
        const start = performance.now();
        // ... 执行操作
        const end = performance.now();
        
        return {
            duration: end - start,
            memoryUsage: process.memoryUsage().heapUsed,
            operationsPerSecond: scenario.operations.length / ((end - start) / 1000)
        };
    }
}
```

---

## 架构改进建议

### 1️⃣ 插件化函数包管理

```javascript
class FunctionPackManager {
    constructor(engine) {
        this.engine = engine;
        this.packs = new Map();
    }
    
    /**
     * 加载外部函数包
     * @param {string} packName - 包名（如 'financial'）
     * @param {object} config - 配置
     * @param {string} config.url - 包文件 URL 或路径
     * @param {string[]} config.functions - 包含的函数列表
     * @param {string} config.version - 版本号
     */
    async loadPack(packName, config) {
        if (this.packs.has(packName)) {
            throw new Error(`Pack "${packName}" already loaded`);
        }
        
        // 动态导入模块
        const module = await import(config.url);
        
        // 注册包中的所有函数
        const registeredFunctions = [];
        for (const fnName of config.functions) {
            if (typeof module[fnName] === 'function') {
                this.engine.registerFunction(fnName, module[fnName]);
                registeredFunctions.push(fnName);
            }
        }
        
        // 记录包信息
        this.packs.set(packName, {
            ...config,
            functions: registeredFunctions,
            loadedAt: Date.now()
        });
        
        console.log(`✅ Pack "${packName}" loaded (${registeredFunctions.length} functions)`);
    }
    
    unloadPack(packName) {
        const pack = this.packs.get(packName);
        if (!pack) return false;
        
        // 注销所有函数
        for (const fnName of pack.functions) {
            this.engine.unregisterFunction(fnName);
        }
        
        this.packs.delete(packName);
        return true;
    }
    
    listPacks() {
        return [...this.packs.entries()].map(([name, info]) => ({
            name,
            functionCount: info.functions.length,
            version: info.version,
            loadedAt: info.loadedAt
        }));
    }
}

// 使用示例
const packManager = new FunctionPackManager(engine);

await packManager.loadPack('financial', {
    url: './plugins/financial-functions.js',
    functions: ['PMT', 'FV', 'PV', 'NPV', 'IRR'],
    version: '1.0.0'
});

await packManager.loadPack('statistics', {
    url: './plugins/statistics-functions.js',
    functions: ['STDEV', 'VAR', 'CORREL'],
    version: '1.0.0'
});

console.log(packManager.listPacks());
/*
[
  { name: 'financial', functionCount: 5, version: '1.0.0' },
  { name: 'statistics', functionCount: 3, version: '1.0.0' }
]
*/
```

---

### 2️⃣ 沙箱安全机制

```javascript
class SecureSandbox {
    constructor(options = {}) {
        this.options = {
            maxExecutionTime: options.timeout || 5000,      // 5秒超时
            maxMemoryUsage: options.memoryLimit || 50 * 1024 * 1024,  // 50MB
            allowedFunctions: options.whitelist || null,    // 白名单（null=允许全部）
            forbiddenPatterns: options.blacklist || [
                'eval',
                'Function',
                'require',
                'import'
            ],
            ...options
        };
    }
    
    /**
     * 在安全环境中执行自定义函数
     */
    execute(userFunction, args, context) {
        const startTime = Date.now();
        let memoryBefore = process.memoryUsage().heapUsed;
        
        // 代码静态检查
        this.#validateCode(userFunction.toString());
        
        try {
            // 设置超时
            const timeoutId = setTimeout(() => {
                throw new Error('Execution timeout');
            }, this.options.maxExecutionTime);
            
            // 执行函数
            const result = userFunction(args, context);
            
            clearTimeout(timeoutId);
            
            // 内存检查
            const memoryAfter = process.memoryUsage().heapUsed;
            const memoryUsed = memoryAfter - memoryBefore;
            
            if (memoryUsed > this.options.maxMemoryUsage) {
                throw new Error(`Memory limit exceeded: ${memoryUsed} bytes`);
            }
            
            return {
                success: true,
                result,
                executionTime: Date.now() - startTime,
                memoryUsed
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message,
                executionTime: Date.now() - startTime
            };
        }
    }
    
    #validateCode(codeString) {
        for (const pattern of this.options.forbiddenPatterns) {
            if (codeString.includes(pattern)) {
                throw new Error(`Forbidden pattern detected: ${pattern}`);
            }
        }
    }
}
```

**适用场景**: 
- 多租户 SaaS 平台
- 用户上传的自定义函数
- 第三方插件市场

---

### 3️⃣ 国际化支持

```javascript
class LocaleManager {
    constructor() {
        this.currentLocale = 'en-US';
        this.locales = new Map();
        
        // 注册默认语言环境
        this.registerLocale('en-US', {
            decimalSeparator: '.',
            listSeparator: ',',
            functionNameMap: {}  // 英文是默认名称
        });
        
        this.registerLocale('zh-CN', {
            decimalSeparator: '.',
            listSeparator: ',',
            functionNameMap: {
                'SUM': '求和',
                'AVERAGE': '平均值',
                'IF': '如果',
                'VLOOKUP': '垂直查找'
            }
        });
        
        this.registerLocale('de-DE', {
            decimalSeparator: ',',
            listSeparator: ';',  // 德语使用分号
            functionNameMap: {
                'SUM': 'SUMME',
                'AVERAGE': 'MITTELWERT',
                'IF': 'WENN'
            }
        });
    }
    
    setLocale(locale) {
        if (!this.locales.has(locale)) {
            throw new Error(`Locale "${locale}" not supported`);
        }
        this.currentLocale = locale;
    }
    
    get currentConfig() {
        return this.locales.get(this.currentLocale);
    }
    
    /**
     * 本地化公式字符串
     * 将用户输入的本地化公式转换为标准英文公式
     */
    localizeFormula(formulaStr) {
        const config = this.currentConfig;
        let localized = formulaStr;
        
        // 替换函数名
        for (const [enName, localName] of Object.entries(config.functionNameMap)) {
            const regex = new RegExp(`\\b${localName}\\b`, 'gi');
            localized = localized.replace(regex, enName);
        }
        
        // 替换参数分隔符（如德语 ; → ,）
        if (config.listSeparator !== ',') {
            // 注意：只在函数调用内部替换
            localized = localized.replace(
                /\(([^)]+)\)/g, 
                (match, params) => `(${params.replace(new RegExp(config.listSeparator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), ',')})`
            );
        }
        
        return localized;
    }
}
```

**示例**:
```javascript
localeManager.setLocale('zh-CN');
localeManager.localizeFormula('=求和(A1:A10)');
// → '=SUM(A1:A10)'

localeManager.setLocale('de-DE');
localeManager.localizeFormula('=SUMME(A1;A10)');
// → '=SUM(A1,A10)'
```

---

## 用户体验提升

### 1️⃣ 函数自动完成 UI

```javascript
class FormulaAutoComplete {
    constructor(formulaEngine) {
        this.engine = formulaEngine;
        this.allFunctions = this.engine.getRegisteredFunctions();
    }
    
    /**
     * 获取输入提示
     * @param {string} input - 当前已输入的内容（如 "=SU"）
     * @returns {Suggestion[]}
     */
    getSuggestions(input) {
        if (!input.startsWith('=')) return [];
        
        const searchTerm = input.substring(1).toUpperCase();
        
        // 模糊匹配函数名
        const matches = this.allFunctions.filter(fn =>
            fn.startsWith(searchTerm) || fn.includes(searchTerm)
        ).slice(0, 10);  // 最多显示10条
        
        return matches.map(fnName => ({
            name: fnName,
            syntax: this.getFunctionSyntax(fnName),
            description: this.getFunctionDescription(fnName),
            category: this.getFunctionCategory(fnName),
            insertText: `${fnName}(${this.getDefaultArgs(fnName)})`
        }));
    }
    
    getFunctionSyntax(functionName) {
        const syntaxDB = {
            'SUM': 'SUM(number1, [number2], ...)',
            'SUMIF': 'SUMIF(range, criteria, [sum_range])',
            'VLOOKUP': 'VLOOKUP(lookup_value, table_array, col_index_num, [range_lookup])',
            'IF': 'IF(logical_test, value_if_true, [value_if_false])'
        };
        return syntaxDB[functionName] || `${functionName}(args...)`;
    }
    
    validateArguments(functionName, args) {
        const rules = {
            'SUM': { minArgs: 1, maxArgs: Infinity },
            'IF': { minArgs: 2, maxArgs: 3 },
            'VLOOKUP': { minArgs: 3, maxArgs: 4 },
            'ROUND': { minArgs: 1, maxArgs: 2 }
        };
        
        const rule = rules[functionName];
        if (!rule) return { valid: true };  // 未知函数，跳过验证
        
        if (args.length < rule.minArgs) {
            return {
                valid: false,
                error: `至少需要 ${rule.minArgs} 个参数`,
                suggestion: this.getFunctionSyntax(functionName)
            };
        }
        
        if (args.length > rule.maxArgs) {
            return {
                valid: false,
                error: `最多允许 ${rule.maxArgs} 个参数`
            };
        }
        
        return { valid: true };
    }
}
```

**UI 集成点**:
- FormulaBar 输入框实时监听
- 弹出智能提示下拉菜单
- 参数数量实时校验并高亮错误

---

### 2️⃣ 公式调试器

```javascript
class FormulaDebugger {
    constructor(formulaEngine) {
        this.engine = formulaEngine;
    }
    
    /**
     * 逐步求值（Evaluate Step by Step）
     * 将复杂公式拆解为多个步骤
     */
    stepEvaluate(formulaStr, sheet, row, col) {
        const steps = [];
        
        try {
            const ast = parseFormula(formulaStr.substring(1));
            this.#walkAST(ast, steps, sheet, 0);
        } catch (e) {
            steps.push({
                step: steps.length + 1,
                expression: formulaStr,
                result: '#PARSE!',
                error: e.message,
                type: 'error'
            });
        }
        
        return steps;
    }
    
    #walkAST(node, steps, sheet, depth) {
        switch (node.type) {
            case 'literal':
                steps.push({
                    step: steps.length + 1,
                    expression: String(node.value),
                    result: node.value,
                    type: 'literal'
                });
                break;
                
            case 'cellRef':
                const cellValue = sheet.cellStore.get(node.row, node.col)?.value;
                steps.push({
                    step: steps.length + 1,
                    expression: `${node.sheet || ''}${this.#colToLabel(node.col)}${node.row + 1}`,
                    result: cellValue,
                    type: 'cellRef'
                });
                break;
                
            case 'function':
                // 先递归求值参数
                const argResults = [];
                for (const arg of node.args) {
                    this.#walkAST(arg, steps, sheet, depth + 1);
                    argResults.push(steps[steps.length - 1].result);
                }
                
                // 再求值函数本身
                const fnResult = this.engine.evaluateFunction(node.name, argResults);
                steps.push({
                    step: steps.length + 1,
                    expression: `${node.name}(${argResults.join(', ')})`,
                    result: fnResult,
                    type: 'function',
                    depth
                });
                break;
                
            case 'binaryOp':
                this.#walkAST(node.left, steps, sheet, depth + 1);
                const leftResult = steps[steps.length - 1].result;
                this.#walkAST(node.right, steps, sheet, depth + 1);
                const rightResult = steps[steps.length - 1].result;
                
                const opResult = this.#applyOperator(node.operator, leftResult, rightResult);
                steps.push({
                    step: steps.length + 1,
                    expression: `(${leftResult} ${node.operator} ${rightResult})`,
                    result: opResult,
                    type: 'operator'
                });
                break;
        }
    }
    
    /**
     * 可视化依赖链
     */
    visualizeDependencies(cellKey) {
        const dependsOn = this.engine.getDependencies(...this.#parseKey(cellKey));
        const dependents = this.engine.getDependents(...this.#parseKey(cellKey));
        
        return {
            cell: cellKey,
            dependsOn: dependsOn || [],
            dependents: dependents || [],
            hasCircularRef: this.#detectCircular(cellKey),
            dependencyGraph: this.#buildGraph(cellKey)
        };
    }
    
    #buildGraph(cellKey) {
        // 构建 Mermaid/D3.js 可视化的图结构
        // ...
    }
}
```

**输出示例**:
```
公式: =SUM(A1:A10)*IF(B1>0,C1,D1)

步骤 1: A1 → 10
步骤 2: A2 → 20
...
步骤 11: A10 → 100
步骤 12: SUM(10, 20, ..., 100) → 550
步骤 13: B1 → 5
步骤 14: B1 > 0 → true
步骤 15: C1 → 200
步骤 16: IF(true, 200, D1) → 200
步骤 17: (550 * 200) → 110000 ✓
```

---

### 3️⃣ 公式历史与版本控制

```javascript
class FormulaHistory {
    constructor(maxHistory = 100) {
        this.maxHistory = maxHistory;
        this.history = new Map();  // cellKey -> HistoryEntry[]
    }
    
    saveSnapshot(cellKey, formula, result, user) {
        if (!this.history.has(cellKey)) {
            this.history.set(cellKey, []);
        }
        
        const entries = this.history.get(cellKey);
        entries.unshift({
            timestamp: Date.now(),
            formula,
            result,
            user: user || 'system',
            version: entries.length + 1
        });
        
        // 限制历史记录数量
        if (entries.length > this.maxHistory) {
            entries.pop();
        }
    }
    
    rollback(cellKey, targetVersion) {
        const entries = this.history.get(cellKey);
        if (!entries || !entries[targetVersion - 1]) {
            throw new Error('Version not found');
        }
        
        const snapshot = entries[targetVersion - 1];
        return {
            formula: snapshot.formula,
            rolledBackFrom: entries[0].version,
            rolledBackTo: targetVersion
        };
    }
    
    compareVersions(cellKey, v1, v2) {
        const entries = this.history.get(cellKey);
        if (!entries || !entries[v1-1] || !entries[v2-1]) {
            return null;
        }
        
        const oldEntry = entries[v1-1];
        const newEntry = entries[v2-1];
        
        return {
            oldVersion: {
                number: v1,
                formula: oldEntry.formula,
                result: oldEntry.result,
                timestamp: oldEntry.timestamp
            },
            newVersion: {
                number: v2,
                formula: newEntry.formula,
                result: newEntry.result,
                timestamp: newEntry.timestamp
            },
            changes: this.#diffFormulas(oldEntry.formula, newEntry.formula)
        };
    }
}
```

---

## 实施路线图

### Phase 1: 核心完善（Week 1-2）

**目标**: 达到"企业级基础版"标准

| 任务 | 优先级 | 工作量 | 交付物 |
|------|--------|--------|--------|
| 实现 SUMIF/SUMIFS | P0 | 1天 | 条件求和函数 |
| 实现 VLOOKUP/HLOOKUP | P0 | 2天 | 查找引用函数 |
| 实现 AND/OR/NOT/IFS | P0 | 1天 | 逻辑函数集 |
| 实现 PRODUCT/MOD/SQRT 等 | P0 | 1天 | 数学函数补全 |
| 批量更新 API | 性能 | 0.5天 | batchUpdate() |
| 单元测试覆盖 | 质量 | 1天 | 80%+ 覆盖率 |

**验收标准**:
- ✅ 支持 25+ 内置函数
- ✅ 通过 100+ 单元测试
- ✅ 1000 单元格批量操作 < 100ms

---

### Phase 2: 专业提升（Week 3-4）

**目标**: 可替代 Google Sheets 80% 功能

| 任务 | 优先级 | 工作量 | 交付物 |
|------|--------|--------|--------|
| 日期时间函数 | P1 | 2天 | 6个日期函数 |
| 文本处理增强 | P1 | 2天 | 8个文本函数 |
| 金融函数集 | P1 | 3天 | PMT/FV/PV/NPV/IRR |
| 增量计算引擎 | 性能 | 3天 | 拓扑排序优化 |
| 公式调试器 MVP | UX | 3天 | 逐步求值UI |
| 函数自动完成 | UX | 2天 | 智能提示组件 |

**验收标准**:
- ✅ 支持 45+ 内置函数
- ✅ 复杂依赖链性能提升 10x+
- ✅ 公式调试器可用

---

### Phase 3: 生态建设（Month 2+）

**目标**: 形成差异化竞争力

| 任务 | 优先级 | 工作量 | 交付物 |
|------|--------|--------|--------|
| 插件化函数包 | 架构 | 3天 | FunctionPackManager |
| 沙箱安全机制 | 安全 | 2天 | SecureSandbox |
| 国际化支持 | I18n | 2天 | LocaleManager |
| 公式历史版本控制 | UX | 2天 | FormulaHistory |
| 高级数学/统计函数 | P2 | 5天 | 15+ 专业函数 |
| Lambda/LET 支持 | P3 | 7天 | 现代函数式编程 |

**验收标准**:
- ✅ 支持 60+ 内置函数（可扩展至 100+）
- ✅ 插件市场雏形
- ✅ 多语言支持（中/英/德）

---

## 测试策略

### 单元测试框架

```javascript
// tests/formula-engine.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { FormulaEngine } from '../src/formula/FormulaEngine.js';

describe('FormulaEngine', () => {
    let engine, workbook, sheet;
    
    beforeEach(() => {
        workbook = createMockWorkbook();
        sheet = workbook.activeSheet;
        engine = new FormulaEngine(workbook);
    });
    
    describe('Math Functions', () => {
        it('should calculate SUM correctly', () => {
            sheet.setCell(0, 0, 1);
            sheet.setCell(1, 0, 2);
            sheet.setCell(2, 0, 3);
            
            expect(engine.setFormula(sheet, 3, 0, '=SUM(A1:A3)')).toBe(6);
        });
        
        it('should handle SUMIF with criteria', () => {
            // Setup test data...
            expect(engine.setFormula(sheet, 0, 5, '=SUMIF(A1:A10, ">100")')).toBe(450);
        });
    });
    
    describe('Lookup Functions', () => {
        it('should perform VLOOKUP exact match', () => {
            // Setup table data...
            expect(engine.setFormula(sheet, 0, 0, '=VLOOKUP("Apple", A1:C10, 3, FALSE)')).toBe('Red');
        });
        
        it('should return #N/A for missing values', () => {
            expect(engine.setFormula(sheet, 0, 0, '=VLOOKUP("Grape", A1:C10, 2, FALSE)')).toBe('#N/A!');
        });
    });
    
    describe('Circular Reference Detection', () => {
        it('should detect direct circular reference', () => {
            expect(engine.setFormula(sheet, 0, 0, '=A1+1')).toBe('#CIRCULAR!');
        });
        
        it('should detect indirect circular reference', () => {
            engine.setFormula(sheet, 0, 0, '=B1+1');
            engine.setFormula(sheet, 1, 0, '=C1+1');
            expect(engine.setFormula(sheet, 2, 0, '=A1+1')).toBe('#CIRCULAR!');
        });
    });
    
    describe('Performance Tests', () => {
        it('should handle 1000 formulas efficiently', () => {
            const start = performance.now();
            
            for (let i = 0; i < 1000; i++) {
                sheet.setCell(i, 0, i);
                engine.setFormula(sheet, i, 1, `=A${i+1}*2`);
            }
            
            const duration = performance.now() - start;
            expect(duration).toBeLessThan(1000);  // < 1 second
        });
    });
});
```

### 测试覆盖率目标

| 模块 | 当前覆盖率 | 目标覆盖率 | 重点测试场景 |
|------|-----------|-----------|-------------|
| FormulaParser | 40% | 85% | 边界语法、错误输入 |
| FormulaEvaluator | 35% | 90% | 所有节点类型、循环检测 |
| Functions (built-in) | 20% | 95% | 每个函数的正常/异常输入 |
| FormulaEngine | 50% | 85% | 依赖追踪、批量操作 |
| Custom Functions | 10% | 80% | 注册/注销、上下文传递 |

---

## 风险与应对

### 技术风险

| 风险 | 概率 | 影响 | 应对措施 |
|------|------|------|----------|
| **性能回归** | 中 | 高 | 每次提交运行性能基准测试 |
| **精度丢失** | 中 | 中 | 使用 Decimal.js 处理金融计算 |
| **内存泄漏** | 低 | 高 | 定期内存快照对比测试 |
| **循环依赖死锁** | 低 | 高 | 已实现调用栈检测 + 超时机制 |

### 兼容性风险

| 风险 | 概率 | 影响 | 应对措施 |
|------|------|------|----------|
| **Excel 行为差异** | 高 | 中 | 建立 Excel 兼容性测试套件 |
| **浏览器兼容性** | 低 | 中 | 目标支持 Chrome/Firefox/Safari/Edge |
| **旧版回退** | 低 | 低 | Feature detection + Graceful degradation |

---

## 成功指标（KPIs）

### 功能完整性

- [ ] **函数覆盖率**: ≥50 个内置函数（当前 13 个）
- [ ] **Excel 兼容性**: ≥60% 常用函数行为一致
- [ ] **语法支持**: 100% 支持当前已实现的语法特性

### 性能指标

- [ ] **小规模 (<100 cells)**: 单次计算 < 1ms
- [ ] **中等规模 (1K cells)**: 全量重算 < 100ms
- [ ] **大规模 (10K cells)**: 增量更新 < 500ms
- [ ] **内存占用**: 每 1000 个公式 < 5MB

### 质量指标

- [ ] **单元测试覆盖率**: ≥85%
- [ ] **集成测试通过率**: 100%
- [ ] **零已知崩溃 Bug**
- [ ] **错误码完整度**: 覆盖所有失败场景

### 用户体验

- [ ] **函数自动完成**: 响应延迟 < 100ms
- [ ] **公式调试器**: 支持逐步求值可视化
- [ ] **文档完整度**: 每个函数都有示例和说明
- [ ] **错误信息友好度**: 用户能理解并解决问题

---

## 附录

### A. 函数实现优先级矩阵

| 函数名 | 类别 | 优先级 | 复杂度 | 使用频率 | 预计工时 |
|--------|------|--------|--------|----------|----------|
| SUMIF | 统计 | P0 | 中 | ⭐⭐⭐⭐⭐ | 4h |
| SUMIFS | 统计 | P0 | 中高 | ⭐⭐⭐⭐⭐ | 6h |
| VLOOKUP | 查找 | P0 | 高 | ⭐⭐⭐⭐⭐ | 8h |
| HLOOKUP | 查找 | P0 | 高 | ⭐⭐⭐ | 6h |
| AND/OR/NOT | 逻辑 | P0 | 低 | ⭐⭐⭐⭐⭐ | 2h |
| IFS | 逻辑 | P0 | 中 | ⭐⭐⭐⭐ | 3h |
| PRODUCT | 数学 | P0 | 低 | ⭐⭐⭐⭐⭐ | 1h |
| MOD/SQRT/INT | 数学 | P0 | 低 | ⭐⭐⭐⭐ | 2h |
| PMT | 金融 | P1 | 高 | ⭐⭐⭐⭐ | 6h |
| FV/PV/NPV/IRR | 金融 | P1 | 高 | ⭐⭐⭐ | 12h |
| DATE/TIME | 日期 | P1 | 中 | ⭐⭐⭐⭐ | 8h |
| LEFT/RIGHT/MID | 文本 | P1 | 低 | ⭐⭐⭐⭐ | 4h |
| LEN/TRIM/SUBSTITUTE | 文本 | P1 | 低 | ⭐⭐⭐⭐ | 4h |

### B. 参考资料

- **Microsoft Excel 函数官方文档**: https://support.microsoft.com/en-us/office/excel-functions-alphabetical-b394aa7f-57dc-41f5-9c87-cf054232dd81
- **Google Sheets 函数参考**: https://support.google.com/docs/table/25273?hl=en
- **OpenFormula 标准 (ODF)**: https://docs.oasis-open.org/office/OpenDocument/v1.3/os/part4-formula/OpenDocument-v1.3-os-part4-formula.html
- **ECMAScript 规范**: https://tc39.es/ecma262/

### C. 术语表

| 术语 | 定义 |
|------|------|
| **AST** | Abstract Syntax Tree - 抽象语法树 |
| **UDF** | User Defined Function - 用户自定义函数 |
| **ChunkedCellStore** | 分块单元格存储（性能优化结构） |
| **拓扑排序** | 用于确定公式计算顺序的算法 |
| **脏标记** | 表示需要重新计算的标记 |
| **循环引用** | 公式间接或直接引用自身的情况 |

---

## 版本历史

| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| v1.0 | 2026-06-21 | AI Assistant | 初始版本，完成现状评估和规划 |

---

## 反馈与贡献

如有任何问题、建议或发现 Bug，请通过以下方式反馈：
- GitHub Issues: [项目地址]/issues
- Email: [联系邮箱]
- Slack: #[公式引擎频道]

---

**文档结束** | 最后更新: 2026-06-21 | 下次审查: 2026-07-21