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
 * Mobile Agent Graph 服务
 *
 * 负责创建和管理 LangGraph 状态图
 *
 * 流程:
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
 * 配置获取方式:
 * - 节点在每次执行时从 AgentConfigProvider 动态获取最新配置
 * - 支持通过 Admin 后台实时更新配置
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
	 * 初始化状态图
	 */
	private async initializeGraph(): Promise<void> {
		this.logger.log("Initializing Mobile Agent Graph...");
		this.mobileAgentGraph = this.buildGraph();
	}

	private buildGraph() {
		try {
			// 创建节点

			// Supervisor: 分析任务、流式生成计划、管理 Todo 列表
			const supervisorNode = createSupervisorNode(
				this.configProvider,
				this.skillProvider,
				this.supervisorTodosToolService,
				this.executionGateway,
				this.billingService,
				this.prismaService,
			);

			// Extract Todo: 从 DB 读取 Todo 列表，提取待执行任务
			const extractTodoNode = createExtractTodoNode(
				this.workingMemoryService,
				this.skillProvider,
			);

			// Fallback Extract: 当 Supervisor 未创建 Todo 时，用 Haiku 提取子任务
			const fallbackExtractNode = createFallbackExtractNode(
				this.configProvider,
				this.workingMemoryService,
				this.skillProvider,
			);

			// 获取 Checkpointer（提前获取，子图也需要使用）
			const checkpointer =
				this.checkpointerService.getCheckpointer();

			// Executor: 使用编译后的子图，传入相同的 checkpointer
			const executorSubgraph =
				this.executorGraphService.getCompiledGraph(checkpointer);

			// Summarizer: 生成最终总结（流式输出并更新数据库）
			const summarizerNode = createSummarizerNode(
				this.configProvider,
				this.workingMemoryToolService,
				this.prismaService,
				this.executionGateway,
				this.taskMemoryService,
				this.billingService,
			);

			// 创建状态图（使用统一状态）
			const graph = new StateGraph(AgentStateSchema)
				// 添加节点
				.addNode(NODE_NAMES.SUPERVISOR, supervisorNode)
				.addNode(NODE_NAMES.EXTRACT_TODO, extractTodoNode)
				.addNode(
					NODE_NAMES.FALLBACK_EXTRACT,
					fallbackExtractNode,
				)
				// 直接添加编译后的 executor 子图
				.addNode(NODE_NAMES.EXECUTOR, executorSubgraph)
				.addNode(NODE_NAMES.SUMMARIZER, summarizerNode)

				// 添加边

				// START -> supervisor
				.addEdge(START, NODE_NAMES.SUPERVISOR)

				// supervisor -> extract_todo | summarizer（错误时跳转 summarizer）
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

				// fallback_extract -> executor (固定边)
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

			// 获取 PostgresStore 实例（用于跨线程长期记忆）
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
