## MODIFIED Requirements

### Requirement: ILogger 从 plugins/types 重新导出
`plugins/types.ts` SHALL 保留 `ILogger` 和 `noopLogger` 的导出，但实际定义来自 `types/logger.ts`。这确保向后兼容性。

#### Scenario: 现有代码从 plugins/types 导入 ILogger
- **WHEN** 现有代码使用 `import { ILogger } from '../plugins/types.js'`
- **THEN** 编译通过，运行时行为不变

#### Scenario: 新代码从 types/logger 导入
- **WHEN** 新代码使用 `import { ILogger } from '../types/logger.js'`
- **THEN** 编译通过，与从 plugins/types 导入等效
