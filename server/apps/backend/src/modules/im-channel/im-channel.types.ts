export type ImPlatform = "feishu" | "telegram" | "discord";

export interface ImInboundMessage {
	platform: ImPlatform;
	conversationId: string;
	platformUserId: string;
	text: string;
	guildId?: string;
}

export interface ActiveImExecution {
	platform: ImPlatform;
	conversationId: string;
	platformUserId: string;
	taskName: string;
	startedAt: number;
}
