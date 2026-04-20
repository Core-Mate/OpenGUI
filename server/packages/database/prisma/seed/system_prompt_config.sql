-- ============================================================================
-- System Prompt Config 初始化数据
-- 使用方法: psql -U opengui -d opengui -f system_prompt_config.sql
-- ============================================================================

-- ============================================================================
-- 1. Plan Supervisor 配置 (使用 Claude Sonnet 模型)
-- ============================================================================
INSERT INTO system_prompt_config (
    agent_name,
    config_name,
    description,
    base_url,
    api_key,
    model_name,
    temperature,
    max_tokens,
    top_p,
    system_prompt,
    extra,
    is_active,
    created_at,
    updated_at,
    is_deleted
) VALUES (
    'plan-supervisor',
    'Plan Supervisor Default',
    'Plan Supervisor 默认配置，用于任务规划与编排',
    NULL,
    NULL,
    'claude-sonnet-4-20250514',
    0.1,
    NULL,
    NULL,
    '# 角色：GUI操作任务规划与编排专家

## 核心身份
你是顶级任务规划与编排专家，负责移动端自动化任务的分析和规划。

## 核心职责

### 1. 分析用户需求
- 深入理解用户输入和意图
- 识别任务目标和成功标准
- 提取关键需求和约束条件

### 2. 任务拆解与规划

**⚠️ 粗粒度拆解原则（必须遵守）**

执行子任务的 Executor Node 具备强大的自主执行能力，可以完成包含多个连续操作步骤的长路径任务。因此：

- **每个子任务应该是一个完整的、有意义的工作单元**，而不是单个原子操作
- **子任务应该以"阶段性目标"为导向**，而非以"单个动作"为导向
- **通常一个完整任务只需要拆分为 2-4 个子任务**

**拆解时的关注重点：**
1. **跨 APP 协调** - 当任务需要在多个应用间切换时，以应用边界作为拆分点
2. **内容创作** - 需要生成评论、私信、文案等内容时，在任务描述中明确提供内容
3. **策略决策** - 需要根据中间结果调整后续行动时，作为拆分点
4. **数据收集** - 需要记录和整理信息时，明确告知需要收集的数据

### 3. 任务拆解完成后，请使用 `write_todos` 工具制定对应的 Todo List，并使用 Markdown 格式输出你的任务执行计划。

### 4. 将子任务逐步下发给 Executor Node 串行执行，并根据执行总结评估每一条子任务的执行结果

### 5. 根据子任务的执行情况，决定下一步动作：
- 如果子任务执行成功，则使用 `write_todos` 工具标记任务成功，并将下一步子任务下发给 Executor Node 执行。如果所有的 Todo List 都已经完成，则返回 `total_complete = true`。
- 如果子任务执行失败，则根据失败信息尝试调整任务并重新下发执行。

## 注意事项
- 必须使用中文进行思考和输出',
    NULL,
    true,
    NOW(),
    NOW(),
    false
);

-- ============================================================================
-- 2. Summarizer 配置 (使用 Claude Sonnet 模型)
-- ============================================================================
INSERT INTO system_prompt_config (
    agent_name,
    config_name,
    description,
    base_url,
    api_key,
    model_name,
    temperature,
    max_tokens,
    top_p,
    system_prompt,
    extra,
    is_active,
    created_at,
    updated_at,
    is_deleted
) VALUES (
    'summarizer',
    'Summarizer Default',
    'Summarizer 默认配置，用于生成任务执行总结',
    NULL,
    NULL,
    'claude-sonnet-4-20250514',
    0.1,
    2048,
    NULL,
    '# 角色：任务执行总结专家

## 核心职责
根据任务执行情况，生成清晰、简洁的执行报告。

## 总结要求

### 1. 结果概述
- 明确说明任务是否成功完成
- 简要描述最终状态

### 2. 执行过程
- 说明执行的具体操作
- 说明遇到的问题（如有）
- 记录收集的重要信息

### 3. 特殊情况
- 如果任务被取消，说明取消时的状态
- 如果执行失败，说明原因

## 输出格式
- 使用中文
- 结构清晰，分段明确
- 重点突出，避免冗余',
    NULL,
    true,
    NOW(),
    NOW(),
    false
);

-- ============================================================================
-- 3. Executor VLM 配置 (视觉语言模型)
-- ============================================================================
INSERT INTO system_prompt_config (
    agent_name,
    config_name,
    description,
    base_url,
    api_key,
    model_name,
    temperature,
    max_tokens,
    top_p,
    system_prompt,
    extra,
    is_active,
    created_at,
    updated_at,
    is_deleted
) VALUES (
    'executor-vlm',
    'Executor VLM Default',
    'Executor VLM 默认配置，用于 GUI Agent 视觉模型调用',
    NULL,
    NULL,
    'claude-sonnet-4-20250514',
    0,
    NULL,
    0.7,
    '(VLM 模型使用 Response API，System Prompt 在运行时动态构建)',
    '{"useResponsesApi": true}',
    true,
    NOW(),
    NOW(),
    false
);

-- ============================================================================
-- 4. Executor A11Y 配置 (无障碍树模型)
-- ============================================================================
INSERT INTO system_prompt_config (
    agent_name,
    config_name,
    description,
    base_url,
    api_key,
    model_name,
    temperature,
    max_tokens,
    top_p,
    system_prompt,
    extra,
    is_active,
    created_at,
    updated_at,
    is_deleted
) VALUES (
    'executor-a11y',
    'Executor A11Y Default',
    'Executor A11Y 默认配置，用于无障碍树分析和操作',
    NULL,
    NULL,
    'claude-sonnet-4-20250514',
    0,
    NULL,
    0.7,
    '(A11Y 模型 System Prompt 在运行时动态构建)',
    NULL,
    true,
    NOW(),
    NOW(),
    false
);

-- ============================================================================
-- 5. Action Summarizer 配置 (使用 Haiku 模型)
-- ============================================================================
INSERT INTO system_prompt_config (
    agent_name,
    config_name,
    description,
    base_url,
    api_key,
    model_name,
    temperature,
    max_tokens,
    top_p,
    system_prompt,
    extra,
    is_active,
    created_at,
    updated_at,
    is_deleted
) VALUES (
    'action-summarizer',
    'Action Summarizer Default',
    'Action Summarizer 默认配置，用于对 VLM 响应进行 10 字以内的总结并通过 SSE 下发',
    NULL,
    NULL,
    'claude-haiku-4-5-20251001',
    0,
    50,
    NULL,
    '用10个字以内总结用户正在进行的交互操作，只输出总结内容，不要任何前缀或标点',
    NULL,
    true,
    NOW(),
    NOW(),
    false
);

-- ============================================================================
-- 6. Creator Agent 配置 (内容创作)
-- ============================================================================
INSERT INTO system_prompt_config (
    agent_name,
    config_name,
    description,
    base_url,
    api_key,
    model_name,
    temperature,
    max_tokens,
    top_p,
    system_prompt,
    extra,
    is_active,
    created_at,
    updated_at,
    is_deleted
) VALUES (
    'creator-agent',
    'Creator Agent Default',
    'Creator Agent 默认配置，用于内容创作（评论、私信、文案等）',
    NULL,
    NULL,
    'claude-sonnet-4-20250514',
    0.7,
    4096,
    NULL,
    '你是一个专业的内容创作助手，根据用户需求生成高质量的文本内容。',
    NULL,
    true,
    NOW(),
    NOW(),
    false
);

-- ============================================================================
-- 验证插入结果
-- ============================================================================
SELECT
    id,
    agent_name,
    config_name,
    model_name,
    temperature,
    is_active
FROM system_prompt_config
WHERE is_deleted = false
ORDER BY id;
