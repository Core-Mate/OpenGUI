import { END } from "@langchain/langgraph";
import {
	NODE_NAMES,
	routeAfterExecuteAction,
	routeByAction,
} from "./executor-routing";
import type { AgentState } from "../state/executor-state.types";

function createState(
	status: AgentState["executor"]["status"],
	actionType?: string,
): AgentState {
	return {
		executor: {
			status,
			parsedPrediction: actionType
				? {
						action_type: actionType,
						action_inputs: {},
						reflection: null,
						thought: "",
						summary: null,
					}
				: null,
		},
	} as AgentState;
}

describe("executor-routing", () => {
	it("routes call_user through execute_action before interrupt node", () => {
		const state = createState("call_user", "call_user");

		expect(routeByAction(state)).toBe(NODE_NAMES.EXECUTE_ACTION);
	});

	it("routes to call_user node only after execute_action succeeds", () => {
		const state = createState("running", "call_user");

		expect(routeAfterExecuteAction(state)).toBe(NODE_NAMES.CALL_USER);
	});

	it("keeps request_visual as control-flow only and skips execute_action", () => {
		const state = createState("running", "request_visual");

		expect(routeByAction(state)).toBe(NODE_NAMES.POST_EXECUTE);
		expect(routeAfterExecuteAction(state)).toBe(NODE_NAMES.POST_EXECUTE);
	});

	it("ends immediately when executor is already in error state", () => {
		const state = createState("error", "call_user");

		expect(routeByAction(state)).toBe(END);
		expect(routeAfterExecuteAction(state)).toBe(END);
	});
});
