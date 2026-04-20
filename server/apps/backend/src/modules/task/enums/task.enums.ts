/**
 * 平台类型枚举
 * 与 Prisma schema 中的 platformtype 保持一致
 */
export enum PlatformType {
    XIAOHONGSHU = 'XIAOHONGSHU',
    DOUYIN = 'DOUYIN',
    KUAISHOU = 'KUAISHOU',
    WECHAT = 'WECHAT',
    LARK = 'LARK',
    GENERAL_APP = 'GENERAL_APP',
}

/**
 * 任务类别枚举
 */
export enum TaskCategory {
    CONTENT_PUBLISH = 'CONTENT_PUBLISH',
    SOCIAL_INTERACT = 'SOCIAL_INTERACT',
    AUTO_REPLY = 'AUTO_REPLY',
    DATA_COLLECT = 'DATA_COLLECT',
    CUSTOM = 'CUSTOM',
}

/**
 * 执行模式枚举
 */
export enum ExecutionMode {
    IMMEDIATE = 'IMMEDIATE',
    SCHEDULED = 'SCHEDULED',
    RECURRING = 'RECURRING',
}

/**
 * 执行状态枚举
 */
export enum ExecutionStatus {
    INITIAL = 'INITIAL',
    /** 等待客户端 WS 连接就绪后启动执行 */
    PENDING = 'PENDING',
    RUNNING = 'RUNNING',
    SUSPENDED = 'SUSPENDED',
    USER_PAUSED = 'USER_PAUSED',
    SUMMARIZING = 'SUMMARIZING',
    FINISHED = 'FINISHED',
}

/**
 * 执行结果枚举
 */
export enum ExecutionResult {
    SUCCEED = 'SUCCEED',
    FAILED = 'FAILED',
    CANCELLED = 'CANCELLED',
}
