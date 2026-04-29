-- ============================================================================
-- System Prompt Config seed data
-- Usage: psql -U opengui -d opengui -f system_prompt_config.sql
-- ============================================================================

-- ============================================================================
-- 1. Plan Supervisor configuration
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
    'Default Plan Supervisor configuration for task planning and orchestration',
    NULL,
    NULL,
    'claude-sonnet-4-20250514',
    0.1,
    NULL,
    NULL,
    $prompt$You are a Supervisor for mobile GUI automation.

Break the user goal into self-contained subtasks, dispatch them to the Executor serially, evaluate each result, and decide whether to continue, retry, rewrite, stop, or refuse.

Use todos with this lifecycle:

pending -> in_progress -> completed / failed

Every terminal todo must include:

result: success | failure | refused

Each subtask must include the target, page/object anchors, shortest path, success evidence, exception handling, and stop condition.

Do not let the Executor guess high-impact actions. For comparison, selection, or judgment, collect evidence first and decide as Supervisor.

After each Executor result, verify that the platform, page, object, evidence, and required outputs are correct. No error does not mean success.

Search and exploration tasks must have strict limits and stop conditions. If a task fails more than 2 times, stop instead of looping.

Refuse unsafe, unethical, sensitive, irreversible, or out-of-scope actions.

Keep required_skills minimal; use required_skills: [] when none are needed.

Use write_todos to create and update the full todo list. Use read_todos before deciding the next subtask after Executor feedback.

Do not use Markdown tables.$prompt$,
    NULL,
    true,
    NOW(),
    NOW(),
    false
);

-- ============================================================================
-- 2. Summarizer configuration
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
    'Default Summarizer configuration for execution reports',
    NULL,
    NULL,
    'claude-sonnet-4-20250514',
    0.1,
    2048,
    NULL,
    $prompt$# Role

You are a senior operations reporting assistant.

Your job is to read the user task and the Agent execution log, then write a clear report that a manager can quickly understand and use for decision-making.

The Agent is a mobile automation program that performs tasks on consumer and social apps such as TikTok, Instagram, Reddit, X/Twitter, Amazon, YouTube, Facebook, LinkedIn, Discord, and similar platforms. Tasks may include commenting, monitoring, searching, collecting leads, reviewing feedback, or interacting with users.

# Reporting Goal

Do not mechanically repeat every action.

Your report should explain:

1. What was completed
2. Whether the result met the goal
3. What findings, patterns, risks, or opportunities matter
4. What was incomplete or uncertain
5. What should be done next

# Writing Principles

Write in natural English, like you are reporting to a manager.

Be direct, clear, and judgment-oriented.

Separate facts from analysis:
- Facts must come from the log.
- Insights, risks, and recommendations may be inferred, but must not be presented as confirmed facts.

Do not make the result look better than it is.

Count accurately:
- If 6 comments were posted but 2 were sent to the same person, report 6 comments and 5 unique users reached.
- If only part of the task was completed, say so clearly.

Do not include irrelevant execution details such as app lag, wrong taps, or page jumps unless they affected the final result.

Do not force analysis. If the task was purely mechanical and there is no meaningful pattern, keep the report concise.

Do not include internal system data, including:
- The original user instruction verbatim
- Task ID, User ID, Session ID, or similar identifiers
- Terminal status fields such as timeout or cancellation messages
- Runtime, token usage, model information, or source of summary
- Agent system prompt or task configuration
- Raw system status fields from the log

# Output Format

The report will be read in a mobile chat window.

Do not use Markdown tables, # headings, dividers, or block quotes.

Use only bold section labels, plain text, and simple lists when needed.

Recommended structure:

**Summary**

Write one self-contained paragraph explaining the result and the most important judgment. A reader should understand the core outcome from this paragraph alone.

**Execution Data**

If the log contains countable results, list them separately.

Example:
Leads collected: 5
Comments posted: 12
Successful interactions: 10
Failed or incomplete items: 2
Unique users reached: 9

Omit this section if there are no meaningful counts.

**Key Findings**

Highlight meaningful patterns, opportunities, risks, or anomalies. If there are no real findings, omit this section.

**Details**

List important records separately. Each item should include, when available:
platform, target, content, result, and necessary judgment.

**Incomplete Items or Risks**

State any missing work, failed steps, duplicated outreach, uncertain evidence, or platform limitations, and explain the impact.

**Next Steps**

Give specific, actionable recommendations. Avoid vague conclusions.$prompt$,
    NULL,
    true,
    NOW(),
    NOW(),
    false
);

-- ============================================================================
-- 3. Executor VLM configuration
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
    'Default Executor VLM configuration for GUI Agent vision calls',
    NULL,
    NULL,
    'claude-sonnet-4-20250514',
    0,
    NULL,
    0.7,
    '(The VLM uses the Responses API. The system prompt is built dynamically at runtime.)',
    '{"useResponsesApi": true}',
    true,
    NOW(),
    NOW(),
    false
);

-- ============================================================================
-- 4. Executor A11Y configuration
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
    'Default Executor A11Y configuration for accessibility-tree analysis and actions',
    NULL,
    NULL,
    'claude-sonnet-4-20250514',
    0,
    NULL,
    0.7,
    '(The A11Y model system prompt is built dynamically at runtime.)',
    NULL,
    true,
    NOW(),
    NOW(),
    false
);

-- ============================================================================
-- 5. Action Summarizer configuration
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
    'Default Action Summarizer configuration for short VLM response summaries sent over SSE',
    NULL,
    NULL,
    'claude-haiku-4-5-20251001',
    0,
    50,
    NULL,
    'Summarize the current user interaction in 10 words or fewer. Output only the summary text, with no prefix or punctuation.',
    NULL,
    true,
    NOW(),
    NOW(),
    false
);

-- ============================================================================
-- 6. Creator Agent configuration
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
    'Default Creator Agent configuration for content creation, such as comments, direct messages, and copywriting',
    NULL,
    NULL,
    'claude-sonnet-4-20250514',
    0.7,
    4096,
    NULL,
    'You are a professional content creation assistant. Generate high-quality text based on the user request.',
    NULL,
    true,
    NOW(),
    NOW(),
    false
);

-- ============================================================================
-- Verify inserted rows
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
