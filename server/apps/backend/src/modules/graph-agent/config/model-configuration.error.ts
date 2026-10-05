/** Missing environment settings required for model execution. */
export class ModelConfigurationError extends Error {
	constructor(missing: string[]) {
		super(
			"Backend is running, but task execution requires model configuration. " +
				`Missing: ${missing.join(", ")}. ` +
				"Set these variables in server/apps/backend/.env before executing tasks.",
		);
		this.name = "ModelConfigurationError";
	}
}
