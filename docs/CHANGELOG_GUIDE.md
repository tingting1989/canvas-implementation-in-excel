# 更新日志管理指南

本文档说明如何在使用 `npm version` 时自动维护 CHANGELOG.md 文件。

## 📋 工作流程概览

```
开发完成 → 更新 [Unreleased] → npm version → 自动更新版本号 → 发布
    ↓              ↓                    ↓                ↓
  代码修改    记录本次变更        package.json      npm publish
           到 CHANGELOG.md     版本号升级          推送到 registry
```

## 🔧 手动更新步骤（推荐）

### 步骤1：记录本次变更到 [Unreleased] 部分

在 `CHANGELOG.md` 的 `[Unreleased]` 部分添加本次所有改动：

```markdown
## [Unreleased]

### Added
- 新功能A
- 新功能B

### Fixed
- 修复问题X
- 修复问题Y

### Changed
- 改动行为Z
```

**分类标准**：
- **Added**: 新功能
- **Changed**: 现有功能的变更
- **Deprecated**: 即将移除的功能
- **Removed**: 已移除的功能
- **Fixed**: Bug 修复
- **Security**: 安全性修复

### 步骤2：运行版本命令

根据语义化版本规则选择合适的命令：

```bash
# 补丁版本：Bug 修复（向后兼容）
npm version patch
# 示例：1.0.12 → 1.0.13

# 次版本：新功能（向后兼容）
npm version minor
# 示例：1.0.13 → 1.1.0

# 主版本：不兼容的 API 变更
npm version major
# 示例：1.0.13 → 2.0.0
```

### 步骤3：验证自动生成的 Git Tag

```bash
git tag -l "v*"
# 应该看到新生成的 tag，如 v1.0.13
```

### 步骤4：发布到 NPM

```bash
npm run publish:npm
# 或手动执行：
# npm publish --access public
```

## 🤖 自动化脚本（可选）

如果需要更自动化的流程，可以使用以下方法：

### 方法1：使用 standard-version（推荐）

安装依赖：

```bash
npm install --save-dev standard-version
```

在 `package.json` 中添加脚本：

```json
{
  "scripts": {
    "release": "standard-version"
  }
}
```

运行发布：

```bash
npm run release
# 自动完成：
# 1. 从 git commit 消息提取变更内容
# 2. 更新 CHANGELOG.md
# 3. 升级 package.json 版本
# 4. 创建 Git commit 和 tag
```

**Commit Message 格式规范**：

```
feat: add new export feature

- Support XLSX format export
- Implement 8-layer style priority system
- Add nested headers support

Closes #123
```

支持的类型前缀：
- `feat`: 新功能 (→ minor)
- `fix`: Bug 修复 (→ patch)
- `docs`: 文档更新 (→ patch)
- `style`: 代码格式调整 (→ patch)
- `refactor`: 重构 (→ patch)
- `perf`: 性能优化 (→ patch)
- `test`: 测试相关 (→ patch)
- `chore`: 构建/工具链 (→ patch)
- `break`: 破坏性变更 (→ major)

### 方法2：使用 release-it（高级）

```bash
npm install --save-dev release-it
```

配置文件 `.release-it.json`：

```json
{
  "hooks": {
    "before:init": ["npm test", "npm run lint"],
    "after:bump": [
      "npm run build:lib",
      "echo 'Version bumped to ${version}'"
    ],
    "after:release": "echo 'Successfully released ${name} v${version}'"
  },
  "git": {
    "commitMessage": "chore(release): ${version}",
    "tagName": "v${version}"
  },
  "npm": {
    "publish": true,
    "publishPath": "./dist"
  }
}
```

运行：

```bash
npx release-it major/minor/patch
```

## 📝 CHANGELOG.md 格式规范

本项目遵循 [Keep a Changelog](https://keepachangelog.com/) 标准：

### 版本号格式

```markdown
## [版本号] - YYYY-MM-DD

### 类型（中文或英文）
- 具体描述
```

**示例**：

```markdown
## [1.0.13] - 2026-07-09

### 🎨 Features (Export Enhancement)

#### ExportFilePlugin v2.1 - Complete Rewrite
- **8-Layer Style Priority System**: Full implementation matching SheetStyleManager architecture
  - Layer 1: Default styles (base)
  - Layer 2: Column styles (`colStyles`)
  - ...

### 🔧 Bug Fixes

#### Critical Fixes
- **Fixed**: Nested header export missing colspan columns
- ...
```

### 分类图标建议

| 类型 | 图标 | 说明 |
|------|------|------|
| Features | ✨ / 🎨 | 新功能 |
| Bug Fixes | 🐛 / 🔧 | 问题修复 |
| Performance | ⚡ / 🚀 | 性能优化 |
| Documentation | 📝 / 📚 | 文档更新 |
| Breaking Changes | 💥 / ⚠️ | 不兼容变更 |
| Security | 🔒 / 🛡️ | 安全修复 |
| Tests | 🧪 / ✅ | 测试相关 |

## 🎯 本次 v1.0.13 发布检查清单

在发布前，请确认以下项目：

### 代码质量
- [x] ESLint 检查通过（0 errors）
- [x] 所有测试用例通过（28/28 for ExportFilePlugin）
- [x] 无 console.warn/error 残留（已替换为 errorHandler）
- [x] JSDoc 注释完整（100% 覆盖率）

### 功能完整性
- [x] 8层样式权重体系正确实现
- [x] 条件格式导出正常工作
- [x] 嵌套表头完整导出
- [x] 禁用单元格样式正确应用
- [x] 边框颜色使用 GRID_COLOR 配置

### 文档更新
- [x] CHANGELOG.md 已更新（包含所有变更）
- [x] package.json 版本号已升级（1.0.13）
- [x] 关键函数注释完善

### 发布准备
- [ ] 运行完整测试套件：`npm run test`
- [ ] 构建生产版本：`npm run build:lib`
- [ ] 执行版本命令：`npm version patch`
- [ ] 推送 Git 标签：`git push --tags`
- [ ] 发布到 NPM：`npm run publish:npm`

## 📊 版本历史统计

| 版本 | 日期 | 主要特性 | 代码行数 | 测试数量 |
|------|------|---------|----------|----------|
| **1.0.13** | **2026-07-09** | **企业级导出系统** | **1680** | **54 (+28)** |
| 1.0.12 | 2026-07-07 | 开源发布 | ~1500 | 26 |
| 1.0.11 | 2026-07-06 | 性能优化 | ~1450 | 24 |
| ... | ... | ... | ... | ... |

## 🔗 相关资源

- [Keep a Changelog 规范](https://keepachangelog.com/en/1.0.0/)
- [语义化版本 SemVer](https://semver.org/lang/zh-CN/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [standard-version 工具](https://github.com/conventional-changelog/standard-version)
- [NPM 版本管理文档](https://docs.npmjs.com/cli/v10/commands/npm-version)

---

**最后更新时间**: 2026-07-09  
**维护者**: Canvas-Sheet Team  
**适用版本**: v1.0.13+