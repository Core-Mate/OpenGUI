import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { prisma } from '@repo/db'
import type { PrismaClient } from '@repo/db'

/**
 * PrismaService - 封装 @repo/db 的 prisma 客户端
 * 提供依赖注入和生命周期管理
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
    private readonly client = prisma

    async onModuleInit() {
        // prisma 客户端在 @repo/db 中已初始化为单例
    }

    async onModuleDestroy() {
        // 断开连接由 @repo/db 管理
    }

    // 表访问器
    get user_task() {
        return this.client.user_task
    }

    get task_execution() {
        return this.client.task_execution
    }

    get user_device_log() {
        return this.client.user_device_log
    }

    get user_accounts() {
        return this.client.user_accounts
    }

    get user_sessions() {
        return this.client.user_sessions
    }

    get user_verifications() {
        return this.client.user_verifications
    }

    get users() {
        return this.client.users
    }

    get tenants() {
        return this.client.tenants
    }

    // GUI Agent 相关表（如果存在于 schema 中）
    get gui_agent_session() {
        return (this.client as any).gui_agent_session
    }

    get gui_agent_history() {
        return (this.client as any).gui_agent_history
    }

    // Working Memory 表
    get working_memory() {
        return (this.client as any).working_memory
    }

    // User Profile 表
    get user_profile() {
        return this.client.user_profile
    }

    // Task Execution Feedback 表
    get task_execution_feedback() {
        return this.client.task_execution_feedback
    }

    // User Execution Preference 表
    get user_execution_preference() {
        return this.client.user_execution_preference
    }

    // Skill 表
    get skill() {
        return this.client.skill
    }

    // ==================== 积分与支付模块 ====================

    // 用户积分账户
    get user_balance() {
        return this.client.user_balance
    }

    // 充值订单
    get recharge_order() {
        return this.client.recharge_order
    }

    // 消费记录
    get usage_record() {
        return this.client.usage_record
    }

    // 积分流水
    get credit_flow() {
        return this.client.credit_flow
    }

    // 积分批次
    get credit_batch() {
        return this.client.credit_batch
    }

    // 充值套餐
    get recharge_plan() {
        return this.client.recharge_plan
    }

    // 用户签到
    get user_checkin() {
        return this.client.user_checkin
    }

    // 系统配置
    get system_config() {
        return this.client.system_config
    }

    // 管理员积分操作记录
    get admin_credit_operation() {
        return this.client.admin_credit_operation
    }

    // ==================== IM Channel 通知模块 ====================

    get im_channel_account() {
        return this.client.im_channel_account
    }

    get im_channel_conversation() {
        return this.client.im_channel_conversation
    }

    get im_channel_message() {
        return this.client.im_channel_message
    }

    // Executor 行为日志
    get executor_behavior_log() {
        return this.client.executor_behavior_log
    }

    // 高级操作
    $transaction<T>(
        fn: (prisma: Omit<PrismaClient, '$transaction'>) => Promise<T>,
    ): Promise<T> {
        return this.client.$transaction(fn as any)
    }

    $queryRaw<T = unknown>(
        query: TemplateStringsArray,
        ...values: any[]
    ): Promise<T> {
        return this.client.$queryRaw(query, ...values) as Promise<T>
    }

    $executeRaw(
        query: TemplateStringsArray,
        ...values: any[]
    ): Promise<number> {
        return this.client.$executeRaw(query, ...values)
    }
}
