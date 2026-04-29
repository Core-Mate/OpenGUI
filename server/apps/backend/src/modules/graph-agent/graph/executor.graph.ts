import { BaseCheckpointSaver, END, START, StateGraph } from "@langchain/langgraph";
import {
	forwardRef,
	Inject,
	Injectable,
	Logger,
	OnModuleInit,
} from "@nestjs/common";
import { ExecutionGateway } from "../../../common/ws";
import { PrismaService } from "../../../prisma/prisma.service";
import { TosService } from "../../tos/tos.service";
import { BillingService } from "../../credits/billing.service";
import { AgentConfigProvider } from "../config/agent-config.provider";
import { SkillProvider } from "../skill/skill.provider";
import { ContentCreationToolService } from "../tools/content-creation.tool";
import { WorkingMemoryToolService } from "../tools/working-memory.tool";
import { WorkingMemoryService } from "../working-memory/working-memory.service";
import {
	NODE_NAMES,
	routeAfterExecuteAction,
	routeAfterSense,
	routeAfterVisionModel,
	routeByAction,
	routeAfterPostExecute,
} from "./edges/executor-routing";
import {
	createExecuteActionNode,
	createExecutorEntryNode,
	createExecutorExitNode,
	createParseActionNode,
	createPostExecuteNode,
	createSenseNode,
	createVisionModelNode,
} from "./nodes/executor";
import { createCallUserNode } from "./nodes/executor/call-user.node";
import { AgentState, AgentStateSchema } from "./state/executor-state.types";

/**
 */
const EXECUTOR_NODE_NAMES = {
	...NODE_NAMES,
	ENTRY: "executor_entry",
	EXIT: "executor_exit",
} as const;

@Injectable()
export class ExecutorGraphService implements OnModuleInit {
	private readonly logger = new Logger(ExecutorGraphService.name);
	private executorGraph: ReturnType<
		typeof this.buildGraph
	> | null = null;
	private currentCheckpointer: BaseCheckpointSaver | null = null;

	constructor(
		@Inject(forwardRef(() => ExecutionGateway))
		private readonly executionGateway: ExecutionGateway,
		private readonly prismaService: PrismaService,
		private readonly tosService: TosService,
		private readonly configProvider: AgentConfigProvider,
		private readonly workingMemoryToolService: WorkingMemoryToolService,
		private readonly contentCreationToolService: ContentCreationToolService,
		private readonly workingMemoryService: WorkingMemoryService,
		private readonly skillProvider: SkillProvider,
		private readonly billingService: BillingService,
	) {}

	async onModuleInit(): Promise<void> {

		this.logger.log("ExecutorGraphService initialized, waiting for checkpointer");
	}

	/**
	 *
	 * entry → sense → vision_model → parse_action → execute_action
	 *       → post_execute → sense (loop)
	 *
	 *
	 */
	private buildGraph(checkpointer?: BaseCheckpointSaver) {

		const entryNode = createExecutorEntryNode(
			this.configProvider,
			this.executionGateway,
			this.skillProvider,
		);
		const exitNode = createExecutorExitNode(
			this.executionGateway,
			this.workingMemoryService,
		);


		const senseNode = createSenseNode(
			this.executionGateway,
			this.tosService,
		);
		const visionModelNode = createVisionModelNode(
			this.configProvider,
			this.workingMemoryToolService,
			this.contentCreationToolService,
			this.tosService,
			this.billingService,
			this.prismaService,
		);
		const parseActionNode = createParseActionNode(this.prismaService, this.workingMemoryService);
		const callUserNode = createCallUserNode(this.prismaService);
		const executeActionNode = createExecuteActionNode(
			this.executionGateway,
		);
		const postExecuteNode = createPostExecuteNode(
			this.executionGateway,
			this.configProvider,
		);


		//
		// entry → sense → vision_model → parse_action → execute_action
		//       → post_execute → sense (loop)
		//
		const subgraph = new StateGraph(AgentStateSchema)

			.addNode(EXECUTOR_NODE_NAMES.ENTRY, entryNode)
			.addNode(EXECUTOR_NODE_NAMES.SENSE, senseNode, {
				retryPolicy: { maxAttempts: 3, initialInterval: 500 },
			})
			.addNode(EXECUTOR_NODE_NAMES.VISION_MODEL, visionModelNode)
			.addNode(EXECUTOR_NODE_NAMES.PARSE_ACTION, parseActionNode)
			.addNode(EXECUTOR_NODE_NAMES.CALL_USER, callUserNode)
			.addNode(EXECUTOR_NODE_NAMES.EXECUTE_ACTION, executeActionNode, {
				retryPolicy: { maxAttempts: 3, initialInterval: 500 },
			})
			.addNode(EXECUTOR_NODE_NAMES.POST_EXECUTE, postExecuteNode)
			.addNode(EXECUTOR_NODE_NAMES.EXIT, exitNode)



			// START → entry → sense
			.addEdge(START, EXECUTOR_NODE_NAMES.ENTRY)
			.addEdge(EXECUTOR_NODE_NAMES.ENTRY, EXECUTOR_NODE_NAMES.SENSE)

			// sense → vision_model (always GUI)
			.addConditionalEdges(EXECUTOR_NODE_NAMES.SENSE, (state: AgentState) => {
				const result = routeAfterSense(state);
				if (result === END) {
					return EXECUTOR_NODE_NAMES.EXIT;
				}
				return result;
			})


			.addConditionalEdges(
				EXECUTOR_NODE_NAMES.VISION_MODEL,
				(state: AgentState) => {
					const result = routeAfterVisionModel(state);
					if (result === END) {
						return EXECUTOR_NODE_NAMES.EXIT;
					}
					return result;
				},
			)

			// parse_action → execute_action | post_execute | EXIT
			.addConditionalEdges(
				EXECUTOR_NODE_NAMES.PARSE_ACTION,
				(state: AgentState) => {
					const result = routeByAction(state);
					if (result === END) {
						return EXECUTOR_NODE_NAMES.EXIT;
					}
					return result;
				},
			)


			.addConditionalEdges(
				EXECUTOR_NODE_NAMES.EXECUTE_ACTION,
				(state: AgentState) => {
					const result = routeAfterExecuteAction(state);
					if (result === END) {
						return EXECUTOR_NODE_NAMES.EXIT;
					}
					return result;
				},
			)


			.addEdge(EXECUTOR_NODE_NAMES.CALL_USER, EXECUTOR_NODE_NAMES.SENSE)

			// post_execute → sense | EXIT
			.addConditionalEdges(
				EXECUTOR_NODE_NAMES.POST_EXECUTE,
				(state: AgentState) => {
					const result = routeAfterPostExecute(state);
					if (result === END) {
						return EXECUTOR_NODE_NAMES.EXIT;
					}
					return result;
				},
			)

			// EXIT → END
			.addEdge(EXECUTOR_NODE_NAMES.EXIT, END);

		this.logger.log(
			`Executor Graph created successfully${checkpointer ? " with checkpointer" : ""}`,
		);


		return subgraph.compile(checkpointer ? { checkpointer } : undefined);
	}

	/**
	 *
	 */
	getCompiledGraph(checkpointer?: BaseCheckpointSaver) {

		if (
			!this.executorGraph ||
			this.currentCheckpointer !== checkpointer
		) {
			this.currentCheckpointer = checkpointer ?? null;
			this.executorGraph = this.buildGraph(checkpointer);
		}
		return this.executorGraph;
	}
}
