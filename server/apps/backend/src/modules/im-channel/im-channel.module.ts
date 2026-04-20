import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LogModule } from "../../common/log";
import { TaskModule } from "../task/task.module";
import { FeishuBotService } from "./feishu/feishu-bot.service";
import { TelegramBotService } from "./telegram/telegram-bot.service";
import { CommandParserService } from "./command/command-parser.service";
import { ImChannelService } from "./im-channel.service";

/**
 * IM 频道模块
 *
 * 提供通过 IM（飞书/Telegram）远程控制手机的能力。
 * 只有在 .env 中配置了相应凭证的渠道才会激活。
 *
 * 依赖：
 * - TaskModule（TaskService + TaskExecutionService）
 * - WsModule（StandbyGateway + StandbySocketService，Global 模块自动可用）
 */
@Module({
	imports: [ConfigModule, LogModule, TaskModule],
	providers: [FeishuBotService, TelegramBotService, CommandParserService, ImChannelService],
})
export class ImChannelModule {}
