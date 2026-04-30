/**
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
 */
export enum TaskCategory {
    CONTENT_PUBLISH = 'CONTENT_PUBLISH',
    SOCIAL_INTERACT = 'SOCIAL_INTERACT',
    AUTO_REPLY = 'AUTO_REPLY',
    DATA_COLLECT = 'DATA_COLLECT',
    CUSTOM = 'CUSTOM',
}

/**
 */
export enum ExecutionMode {
    IMMEDIATE = 'IMMEDIATE',
    SCHEDULED = 'SCHEDULED',
    RECURRING = 'RECURRING',
}

/**
 */
export enum ExecutionStatus {
    INITIAL = 'INITIAL',
    PENDING = 'PENDING',
    RUNNING = 'RUNNING',
    SUSPENDED = 'SUSPENDED',
    USER_PAUSED = 'USER_PAUSED',
    SUMMARIZING = 'SUMMARIZING',
    FINISHED = 'FINISHED',
}

/**
 */
export enum ExecutionResult {
    SUCCEED = 'SUCCEED',
    FAILED = 'FAILED',
    CANCELLED = 'CANCELLED',
}
