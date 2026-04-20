import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { LogModule } from "../../common/log";
import { UserController } from "./user.controller";
import { UserService } from "./user.service";

@Module({
	imports: [PrismaModule, LogModule],
	controllers: [UserController],
	providers: [UserService],
	exports: [UserService],
})
export class UserModule {}
