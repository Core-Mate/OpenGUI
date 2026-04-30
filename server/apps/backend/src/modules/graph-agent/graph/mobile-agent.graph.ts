import { END, START, StateGraph } from "@langchain/langgraph";
import {
	forwardRef,
	Inject,
	Injectable,
	Logger,
	OnModuleInit,
} from "@nestjs/common";
import { ExecutionGateway } from "../../../common/ws";
import { PrismaService } from "../../../prisma/prisma.service";
import { BillingService } from "../../credits/billing.service";
import { PostgresCheckpointerService } from "../checkpointer/postgres-checkpointer";
import { AgentConfigProvider } from "../config/agent-config.provider";
import { TaskMemoryService } from "../memory/task-memory.service";
import { SkillProvider } from "../skill/skill.provider";
import { PostgresStoreService } from "../store/postgres-store.service";
import { SupervisorTodosToolService } from "../tools/supervisor-todos.tool";
import { WorkingMemoryToolService } from "../tools/working-memory.tool";
import { WorkingMemoryService } from "../working-memory/working-memory.service";
import {
	NODE_NAMES,
	ROUTING_PATHS,
	routeAfterSupervisor,
	routeAfterExecutor,
	routeAfterExtractTodo,
} from "./edges/routing";
import { ExecutorGraphService } from "./executor.graph";
import { createExtractTodoNode } from "./nodes/extract-todo.node";
import { createFallbackExtractNode } from "./nodes/fallback-extract.node";
import { createSupervisorNode } from "./nodes/plan-supervisor.node";
import { createSummarizerNode } from "./nodes/summarizer.node";
import { AgentStateSchema } from "./state/state.types";

/**
 *
 *
 * ```
 * START -> supervisor -> extract_todo
 *   |
 *   +-- todoFound=true -> executor (subgraph) -> supervisor (loop)
 *   |
 *   +-- planTodoComplete=true -> summarizer -> END
 *   |
 *   +-- no todos -> fallback_extract -> executor -> supervisor (loop)
 * ```
 *
 */
@Injectable()
export class MobileAgentGraphService implements OnModuleInit {
	private readonly logger = new Logger(MobileAgentGraphService.name);
	private mobileAgentGraph: ReturnType<typeof this.buildGraph> | null = null;

	constructor(
		private readonly configProvider: AgentConfigProvider,
		private readonly checkpointerService: PostgresCheckpointerService,
		private readonly postgresStoreService: PostgresStoreService,
		private readonly taskMemoryService: TaskMemoryService,
		private readonly skillProvider: SkillProvider,
		private readonly workingMemoryToolService: WorkingMemoryToolService,
		private readonly supervisorTodosToolService: SupervisorTodosToolService,
		private readonly workingMemoryService: WorkingMemoryService,
		@Inject(forwardRef(() => ExecutionGateway))
		private readonly executionGateway: ExecutionGateway,
		private readonly executorGraphService: ExecutorGraphService,
		private readonly prismaService: PrismaService,
		private readonly billingService: BillingService,
	) {}

	async onModuleInit(): Promise<void> {
		await this.initializeGraph();
	}

	/**
	 */
	private async initializeGraph(): Promise<void> {
		this.logger.log("Initializing Mobile Agent Graph...");
		this.mobileAgentGraph = this.buildGraph();
	}

	private buildGraph() {
		try {



			const supervisorNode = createSupervisorNode(
				this.configProvider,
				this.skillProvider,
				this.supervisorTodosToolService,
				this.executionGateway,
				this.billingService,
				this.prismaService,
			);


			const extractTodoNode = createExtractTodoNode(
				this.workingMemoryService,
				this.skillProvider,
			);


			const fallbackExtractNode = createFallbackExtractNode(
				this.configProvider,
				this.workingMemoryService,
				this.skillProvider,
			);


			const checkpointer =
				this.checkpointerService.getCheckpointer();


			const executorSubgraph =
				this.executorGraphService.getCompiledGraph(checkpointer);


			const summarizerNode = createSummarizerNode(
				this.configProvider,
				this.workingMemoryToolService,
				this.prismaService,
				this.executionGateway,
				this.taskMemoryService,
				this.billingService,
			);


			const graph = new StateGraph(AgentStateSchema)

				.addNode(NODE_NAMES.SUPERVISOR, supervisorNode)
				.addNode(NODE_NAMES.EXTRACT_TODO, extractTodoNode)
				.addNode(
					NODE_NAMES.FALLBACK_EXTRACT,
					fallbackExtractNode,
				)

				.addNode(NODE_NAMES.EXECUTOR, executorSubgraph)
				.addNode(NODE_NAMES.SUMMARIZER, summarizerNode)



				// START -> supervisor
				.addEdge(START, NODE_NAMES.SUPERVISOR)


				.addConditionalEdges(
					NODE_NAMES.SUPERVISOR,
					routeAfterSupervisor,
					ROUTING_PATHS.SUPERVISOR,
				)

				// extract_todo -> executor | summarizer | fallback_extract
				.addConditionalEdges(
					NODE_NAMES.EXTRACT_TODO,
					routeAfterExtractTodo,
					ROUTING_PATHS.EXTRACT_TODO,
				)


				.addEdge(
					NODE_NAMES.FALLBACK_EXTRACT,
					NODE_NAMES.EXECUTOR,
				)

				// executor -> supervisor | summarizer
				.addConditionalEdges(
					NODE_NAMES.EXECUTOR,
					routeAfterExecutor,
					ROUTING_PATHS.EXECUTOR,
				)

				// summarizer -> END
				.addEdge(NODE_NAMES.SUMMARIZER, END);


			const store = this.postgresStoreService.getStore();

			this.logger.log(
				"Mobile Agent Graph initialized successfully",
			);
			return graph.compile({ checkpointer, store });
		} catch (error) {
			this.logger.error(
				`Failed to initialize graph: ${(error as Error).message}`,
				(error as Error).stack,
			);
			throw error;
		}
	}

	public getMobileAgentGraph() {
		if (!this.mobileAgentGraph) {
			this.mobileAgentGraph = this.buildGraph();
		}
		return this.mobileAgentGraph;
	}
}
