import { Module } from "@nestjs/common";
import { TaskModule } from "../task/task.module";
import { RemoteControlController } from "./remote-control.controller";
import { RemoteControlService } from "./remote-control.service";

@Module({
	imports: [TaskModule],
	controllers: [RemoteControlController],
	providers: [RemoteControlService],
	exports: [RemoteControlService],
})
export class RemoteControlModule {}
