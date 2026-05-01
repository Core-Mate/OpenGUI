const CONNECTION_LOST_PATTERNS = [
	"no connection for execution",
	"socket disconnected",
	"client disconnected",
	"connection lost",
	"ack timeout",
	"operation has timed out",
	"timeout",
];

function getErrorText(error: unknown): string {
	if (error instanceof Error) {
		return `${error.name} ${error.message}`.toLowerCase();
	}
	if (typeof error === "string") {
		return error.toLowerCase();
	}
	return "";
}

export function isExecutionConnectionLost(error: unknown): boolean {
	return isExecutionConnectionLostMessage(getErrorText(error));
}

export function isExecutionConnectionLostMessage(message: unknown): boolean {
	if (typeof message !== "string") return false;
	const lower = message.toLowerCase();
	return CONNECTION_LOST_PATTERNS.some((pattern) => lower.includes(pattern));
}

export function buildExecutionConnectionLostMessage(executionId: number): string {
	return `Execution ${executionId} lost the client connection. Reconnect the device and retry.`;
}
