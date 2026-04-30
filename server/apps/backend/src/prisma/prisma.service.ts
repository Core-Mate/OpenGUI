import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { prisma } from '@repo/db'
import type { PrismaClient } from '@repo/db'

/**
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
    private readonly client = prisma

    async onModuleInit() {

    }

    async onModuleDestroy() {

    }


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


    get gui_agent_session() {
        return (this.client as any).gui_agent_session
    }

    get gui_agent_history() {
        return (this.client as any).gui_agent_history
    }


    get working_memory() {
        return (this.client as any).working_memory
    }


    get user_profile() {
        return this.client.user_profile
    }


    get task_execution_feedback() {
        return this.client.task_execution_feedback
    }


    get user_execution_preference() {
        return this.client.user_execution_preference
    }


    get skill() {
        return this.client.skill
    }




    get user_balance() {
        return this.client.user_balance
    }


    get recharge_order() {
        return this.client.recharge_order
    }


    get usage_record() {
        return this.client.usage_record
    }


    get credit_flow() {
        return this.client.credit_flow
    }


    get credit_batch() {
        return this.client.credit_batch
    }


    get recharge_plan() {
        return this.client.recharge_plan
    }


    get user_checkin() {
        return this.client.user_checkin
    }


    get system_config() {
        return this.client.system_config
    }


    get admin_credit_operation() {
        return this.client.admin_credit_operation
    }



    get im_channel_account() {
        return this.client.im_channel_account
    }

    get im_channel_conversation() {
        return this.client.im_channel_conversation
    }

    get im_channel_message() {
        return this.client.im_channel_message
    }


    get executor_behavior_log() {
        return this.client.executor_behavior_log
    }


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
