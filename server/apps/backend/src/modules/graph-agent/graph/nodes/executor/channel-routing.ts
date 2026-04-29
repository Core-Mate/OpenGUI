import { Logger } from "@nestjs/common";

const logger = new Logger("ChannelRouting");

/**
 * Channel routing — always returns "gui" (screenshot + VLM).
 *
 * A11y tree channel has been removed for the source-available release.
 */

/**
 * Always returns the GUI channel.
 */
export function resolveChannel(): {
	channel: "gui";
	shouldFallbackToScreenshot: boolean;
	updatedFailures: number;
} {
	return {
		channel: "gui",
		shouldFallbackToScreenshot: false,
		updatedFailures: 0,
	};
}
