import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LogModule } from "../../common/log";
import { TaskModule } from "../task/task.module";
import { FeishuBotService } from "./feishu/feishu-bot.service";
import { TelegramBotService } from "./telegram/telegram-bot.service";
import { CommandParserService } from "./command/command-parser.service";
import { ImChannelService } from "./im-channel.service";

/**
 *
 *
 * - TaskModule（TaskService + TaskExecutionService）
 */
@Module({
	imports: [ConfigModule, LogModule, TaskModule],
	providers: [FeishuBotService, TelegramBotService, CommandParserService, ImChannelService],
})
export class ImChannelModule {}
