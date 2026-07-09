# ImportFilePlugin 使用指南

## 📋 概述

ImportFilePlugin 是 Canvas-Sheet 的导入文件插件，用于将 Excel 文件（XLSX）导入到 Canvas-Sheet 工作表中。

## 🚀 快速开始

### 1. 基础用法

```javascript
import { Workbook } from 'canvas-sheet';

const wb = new Workbook(document.getElementById('app'), {
    plugins: ['importFile']  // 启用导入插件
});

// 获取插件实例
const importPlugin = wb.getPlugin('importFile');
```

### 2. 导入文件

#### 方式一：直接导入

```javascript
import { HOOKS } from 'canvas-sheet/constants/hookNames';

// 通过 Workbook Hooks 监听事件（统一标准方式）
wb.addHook(HOOKS.IMPORT_PROGRESS, (progress) => {
    console.log(`进度: ${progress.percent}%`);
    console.log(`阶段: ${progress.stage}`);
    console.log(`消息: ${progress.message}`);
});

wb.addHook(HOOKS.IMPORT_COMPLETE, (result) => {
    console.log(`导入成功! 共 ${result.rowCount} 行, ${result.colCount} 列`);
});

wb.addHook(HOOKS.IMPORT_ERROR, (error) => {
    console.error('导入失败:', error.message);
    console.error('错误码:', error.code);
});

// 执行导入
try {
    const result = await importPlugin.importFromFile(file, {
        startRow: 0,           // 起始行（默认 0）
        startCol: 0,          // 起始列（默认 0）
        firstRowAsHeader: true, // 第一行作为表头（默认 true）
        applyStyles: true,     // 应用样式（默认 true）
        overwriteExisting: true, // 覆盖已有数据（默认 true）
        batchSize: 100,       // 每批处理行数（默认 100）
    });

    console.log('导入结果:', result);
} catch (error) {
    console.error('导入异常:', error);
}
```

#### 方式二：先预览再导入

```javascript
// 1. 预览文件内容
const preview = await importPlugin.previewFile(file, {
    previewRows: 10  // 预览前 10 行
});

console.log('文件名:', preview.fileName);
console.log('总行数:', preview.totalRows);
console.log('总列数:', preview.totalCols);
console.log('预览数据:', preview.previewData);
console.log('工作表名:', preview.sheetName);
console.log('包含样式:', preview.hasStyles);
console.log('包含合并单元格:', preview.hasMergedCells);

// 2. 用户确认后导入
if (confirm(`确定要导入 ${preview.fileName} 吗？\n共 ${preview.totalRows} 行 x ${preview.totalCols} 列`)) {
    const result = await importPlugin.importFromFile(file);
}
```

### 3. 取消导入

```javascript
// 开始导入
const importPromise = importPlugin.importFromFile(largeFile);

// 用户点击取消按钮时
cancelButton.onclick = () => {
    importPlugin.cancelImport();
};

try {
    const result = await importPromise;
} catch (error) {
    if (error.message === 'IMPORT_CANCELLED_BY_USER') {
        console.log('用户取消了导入');
    }
}
```

## 🔧 高级功能

### 1. 使用 Hooks 系统

ImportFilePlugin 完全遵循 Canvas-Sheet 的 Hooks 规范。

**重要提示**: 所有导入相关的 Hook 常量已迁移到全局 `HOOKS` 对象中（位于 `src/constants/hookNames.js`），使用 `IMPORT_` 前缀标识：

```javascript
import { HOOKS } from 'canvas-sheet/constants/hookNames';

// 可用的导入 Hook 常量：
// - HOOKS.IMPORT_PROGRESS       → "onImportProgress"      (导入进度更新)
// - HOOKS.IMPORT_COMPLETE       → "onImportComplete"      (导入完成)
// - HOOKS.IMPORT_ERROR          → "onImportError"         (导入失败)
// - HOOKS.IMPORT_BEFORE_IMPORT  → "beforeImport"          (导入开始前)
// - HOOKS.IMPORT_ROW_PROCESSED  → "onRowProcessed"        (行处理完成)
// - HOOKS.IMPORT_STYLE_WARNING  → "onStyleWarning"        (样式警告)

// 在 Workbook 初始化时配置 Hooks
const wb = new Workbook(document.getElementById('app'), {
    hooks: {
        // ✅ 推荐方式：使用全局 HOOKS 常量
        [HOOKS.IMPORT_PROGRESS]: (progress) => {
            progressBar.value = progress.percent;
            statusText.textContent = progress.message;
        },

        [HOOKS.IMPORT_COMPLETE]: (result) => {
            showToast(`成功导入 ${result.rowCount} 行数据`, 'success');
        },

        [HOOKS.IMPORT_ERROR]: (error) => {
            showToast(`导入失败: ${error.message}`, 'error');
        },

        [HOOKS.IMPORT_BEFORE_IMPORT]: (preview) => {
            // 返回 false 可以取消导入
            if (preview.totalRows > 10000) {
                confirm('文件过大，确定要导入吗？');
            }
            return true;  // 继续导入
        },

        [HOOKS.IMPORT_ROW_PROCESSED]: ({ rowIndex, processedCount, totalCount }) => {
            console.log(`正在处理第 ${rowIndex + 1} 行 (${processedCount}/${totalCount})`);
        },

        [HOOKS.IMPORT_STYLE_WARNING]: (warning) => {
            console.warn('样式转换警告:', warning.message);
            console.warn('位置:', warning.cellLocation);
        },
    }
});
```

### 2. 样式转换

ImportFilePlugin 使用共享的 `style-converter` 模块进行样式转换，确保与 ExportFilePlugin 的完全一致性：

```javascript
import { StyleConverter, toArgb, fromArgb } from 'canvas-sheet/shared/style-converter';

const converter = new StyleConverter();

// Excel → Canvas-Sheet
const canvasStyle = converter.convertFromExcel(excelStyle, 'flat');
console.log(canvasStyle);
// 输出: { fontFamily: 'Arial', fontSize: 14, fontWeight: 'bold', ... }

// Canvas-Sheet → Excel
const excelStyle = converter.convertToExcel(canvasStyle);
console.log(excelStyle);
// 输出: { font: { name: 'Arial', size: 14, bold: true }, ... }

// 颜色转换
const argb = toArgb('#FF0000');      // → 'FFFF0000'
const hex = fromArgb('FFFF0000');     // → '#FF0000'
```

### 3. 错误处理

ImportFilePlugin 定义了完整的错误码体系：

```javascript
import { IMPORT_ERROR_CODES } from 'canvas-sheet/plugins/ImportFilePlugin';

// 错误码列表:
// - IMPORT_FILE_READ_ERROR: 文件读取失败
// - IMPORT_FILE_PARSE_ERROR: 文件解析失败
// - IMPORT_UNSUPPORTED_FORMAT: 不支持的文件格式
// - IMPORT_DATA_VALIDATION_ERROR: 数据验证失败
// - IMPORT_STYLE_CONVERSION_ERROR: 样式转换失败
// - IMPORT_CANCELLED_BY_USER: 用户取消操作
// - IMPORT_UNKNOWN_ERROR: 未知错误

wb.addHook(HOOKS.IMPORT_ERROR, (error) => {
    switch (error.code) {
        case 'IMPORT_UNSUPPORTED_FORMAT':
            showError('不支持的文件格式，请选择 .xlsx 文件');
            break;

        case 'IMPORT_FILE_READ_ERROR':
            showError('文件读取失败，请检查文件是否损坏');
            break;

        case 'IMPORT_CANCELLED_BY_USER':
            console.log('用户取消导入');
            break;

        default:
            showError(`导入失败: ${error.message}`);
    }
});
```

## 📊 完整示例

### HTML 文件上传组件

```html
<!DOCTYPE html>
<html>
<head>
    <title>Excel 导入示例</title>
</head>
<body>
    <div id="app"></div>

    <input type="file" id="fileInput" accept=".xlsx" />
    <button id="importBtn" disabled>导入</button>
    <div id="progressBar" style="width: 0%; background: #4CAF50;"></div>
    <div id="statusText">准备就绪</div>

    <script type="module">
        import { Workbook } from 'canvas-sheet';

        const wb = new Workbook(document.getElementById('app'), {
            hooks: {
                [HOOKS.IMPORT_PROGRESS]: (progress) => {
                    document.getElementById('progressBar').style.width = `${progress.percent}%`;
                    document.getElementById('statusText').textContent = progress.message;
                },
                [HOOKS.IMPORT_COMPLETE]: (result) => {
                    document.getElementById('statusText').textContent =
                        `导入成功! 共 ${result.rowCount} 行 x ${result.colCount} 列`;
                    alert(`成功导入 ${result.rowCount} 行数据!`);
                },
                [HOOKS.IMPORT_ERROR]: (error) => {
                    document.getElementById('statusText').textContent = `错误: ${error.message}`;
                    alert(`导入失败: ${error.message}`);
                },
            }
        });

        const fileInput = document.getElementById('fileInput');
        const importBtn = document.getElementById('importBtn');

        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                importBtn.disabled = false;
                importBtn.dataset.file = JSON.stringify({
                    name: file.name,
                    size: file.size,
                });
            }
        });

        importBtn.addEventListener('click', async () => {
            const file = fileInput.files[0];
            if (!file) return;

            const importPlugin = wb.getPlugin('importFile');

            try {
                importBtn.disabled = true;
                document.getElementById('statusText').textContent = '正在导入...';

                await importPlugin.importFromFile(file);
            } catch (error) {
                console.error('导入失败:', error);
            } finally {
                importBtn.disabled = false;
            }
        });
    </script>
</body>
</html>
```

## ⚙️ 配置选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `startRow` | number | 0 | 起始行索引（0-based） |
| `startCol` | number | 0 | 起始列索引（0-based） |
| `firstRowAsHeader` | boolean | true | 是否将第一行作为表头 |
| `applyStyles` | boolean | true | 是否应用单元格样式 |
| `overwriteExisting` | boolean | true | 是否覆盖已有数据 |
| `batchSize` | number | 100 | 每批处理的行数（影响进度报告频率） |

## 🔌 API 参考

### 方法

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `init(options?)` | Object | Promise\<void\> | 初始化插件 |
| `destroy()` | - | void | 销毁插件 |
| `importFromFile(file, options?)` | File, Object | Promise\<ImportResult\> | 导入文件 |
| `previewFile(file, options?)` | File, Object | Promise\<FilePreview\> | 预览文件内容 |
| `cancelImport()` | - | void | 取消当前导入任务 |

**注意：** 事件监听请通过 Workbook Hooks 统一管理：
```javascript
import { HOOKS } from 'canvas-sheet/constants/hookNames';

// 监听事件
wb.addHook(HOOKS.IMPORT_PROGRESS, (progress) => { ... });
wb.addHook(HOOKS.IMPORT_COMPLETE, (result) => { ... });
wb.addHook(HOOKS.IMPORT_ERROR, (error) => { ... });

// 取消监听（wb.removeHook 或保存返回的取消函数）
```

### 事件类型

#### ImportProgress
```typescript
{
    percent: number;         // 进度百分比 (0-100)
    stage: string;           // 当前阶段 ('reading'|'parsing'|'validating'|'applying'|'styling')
    message: string;         // 进度描述消息
    taskId?: number;         // 任务 ID
    processedRows?: number;  // 已处理的行数
    totalRows?: number;      // 总行数
}
```

#### ImportResult
```typescript
{
    success: boolean;        // 是否成功
    rowCount: number;        // 导入的行数
    colCount: number;        // 导入的列数
    taskId: number;          // 任务 ID
    timestamp: Date;         // 完成时间戳
    warnings?: Array;        // 警告列表
}
```

#### ImportError
```typescript
{
    code: string;            // 错误码
    message: string;         // 错误消息
    taskId: number;          // 任务 ID
    timestamp: Date;         // 时间戳
    stack?: string;          // 堆栈跟踪
}
```

#### FilePreview
```typescript
{
    fileName: string;        // 文件名
    fileSize: number;        // 文件大小（字节）
    fileType: string;        // MIME 类型
    totalRows: number;       // 总行数
    totalCols: number;       // 总列数
    previewData: Array;      // 预览数据（前 N 行）
    sheetName: string;       // 工作表名称
    hasStyles: boolean;      // 是否包含样式
    hasMergedCells: boolean; // 是否包含合并单元格
    error?: string;          // 错误信息（如果预览失败）
    success?: boolean;       // 是否成功
}
```

## 🎯 最佳实践

### 1. 大文件导入优化

```javascript
// 对于大文件（>10MB），建议增加 batchSize 并显示详细进度
const result = await importPlugin.importFromFile(largeFile, {
    batchSize: 500,  // 增大批次大小减少 UI 更新频率
});

// 显示详细的行级进度（通过 Workbook Hooks）
wb.addHook(HOOKS.IMPORT_ROW_PROCESSED, ({ rowIndex, processedCount, totalCount }) => {
    console.log(`处理进度: ${processedCount}/${totalCount} (${Math.round(processedCount/totalCount*100)}%)`);
});
```

### 2. 数据验证

```javascript
wb.addHook(HOOKS.IMPORT_COMPLETE, async (result) => {
    // 导入后进行数据验证
    const sheet = wb.activeSheet;

    for (let r = 0; r < result.rowCount; r++) {
        for (let c = 0; c < result.colCount; c++) {
            const cell = sheet.cellStore.get(r, c);

            // 自定义验证逻辑
            if (c === 0 && !cell?.value) {
                console.warn(`警告: 第 ${r+1} 行的第一列为空`);
            }
        }
    }
});
```

### 3. 样式警告监控

```javascript
wb.addHook(HOOKS.IMPORT_PROGRESS, (progress) => {
    // 在样式应用阶段显示特殊提示
    if (progress.stage === 'styling') {
        statusText.textContent = '正在应用样式...';
    }
});

// 监控样式转换警告（通过 Workbook Hooks）
wb.addHook(HOOKS.IMPORT_STYLE_WARNING, (warning) => {
    console.warn('样式警告:', warning.message);
    console.warn('位置:', warning.cellLocation);
    // 可以收集所有警告，在导入完成后统一展示
});
```

## 🐛 故障排除

### 常见问题

**Q: 导入的中文乱码？**
A: ImportFilePlugin 使用 ExcelJS 库，自动处理编码问题。如果仍然乱码，请确保源文件是标准的 XLSX 格式。

**Q: 样式没有正确应用？**
A: 检查 `applyStyles` 选项是否为 `true`。某些复杂的 Excel 样式可能不支持，会触发 `STYLE_WARNING` 事件。

**Q: 导入速度很慢？**
A: 对于大型文件（>5万行），建议：
- 增加 `batchSize` 减少进度更新频率
- 在 Web Worker 中运行（未来版本支持）
- 显示友好的等待提示

**Q: 内存占用过高？**
A: 目前 ImportFilePlugin 会一次性加载整个文件到内存。对于超大文件（>100MB），建议分批导入或使用服务端预处理。

## 📝 更新日志

### v1.0.0 (2026-07-09)
- ✅ 初始版本发布
- ✅ 支持 XLSX 格式导入
- ✅ 完整的样式转换支持
- ✅ Hooks 事件系统集成
- ✅ 进度报告和取消功能
- ✅ 文件预览功能
- ✅ 完善的错误处理机制
- ✅ 33 个单元测试全部通过

## 📚 相关文档

- [设计文档](../design/IMPORT_FILE_PLUGIN_DESIGN.md)
- [ExportFilePlugin](./EXPORT_FILE_PLUGIN_USAGE.md)
- [共享样式转换模块](./SHARED_STYLE_CONVERTER.md)
- [Canvas-Sheet Hooks 系统](./HOOKS_SYSTEM.md)

---

**作者**: Canvas-Sheet Team
**版本**: 1.0.0
**最后更新**: 2026-07-09