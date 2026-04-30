/**
 *
 */

/**
 */
export type WorkingMemoryUpdateMode = "replace" | "append";

/**
 */
export interface GetWorkingMemoryOutput {
	success: boolean;
	content?: string | null;
	error?: string;
}

/**
 */
export interface UpdateWorkingMemoryOutput {
	success: boolean;
	error?: string;
}

/**
 */
export interface ClearWorkingMemoryOutput {
	success: boolean;
	error?: string;
}
