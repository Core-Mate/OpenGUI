import { Global, Module } from "@nestjs/common";
import { LeaseService } from "./lease.service";

/**
 *
 */
@Global()
@Module({
	providers: [LeaseService],
	exports: [LeaseService],
})
export class LeaseModule {}
