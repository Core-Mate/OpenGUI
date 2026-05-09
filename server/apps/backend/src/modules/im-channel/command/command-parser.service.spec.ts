import { CommandParserService } from "./command-parser.service";
import { CommandType } from "./command.types";

describe("CommandParserService", () => {
	let parser: CommandParserService;

	beforeEach(() => {
		parser = new CommandParserService();
	});

	it("parses Discord prefix help command", () => {
		expect(parser.parse("!opengui help")).toMatchObject({
			type: CommandType.HELP,
		});
	});

	it("parses Discord prefix do command", () => {
		expect(
			parser.parse("!opengui do open browser and search OpenGUI"),
		).toMatchObject({
			type: CommandType.DO_TASK,
			description: "open browser and search OpenGUI",
		});
	});

	it("parses Discord prefix run command", () => {
		expect(parser.parse("!opengui run 123")).toMatchObject({
			type: CommandType.RUN_TASK,
			taskId: 123,
		});
	});

	it("parses execution id for status, cancel, and pause commands", () => {
		expect(parser.parse("!opengui status 456")).toMatchObject({
			type: CommandType.STATUS,
			executionId: 456,
		});
		expect(parser.parse("/cancel 456")).toMatchObject({
			type: CommandType.CANCEL,
			executionId: 456,
		});
		expect(parser.parse("/pause 456")).toMatchObject({
			type: CommandType.PAUSE,
			executionId: 456,
		});
	});

	it("parses resume command with execution id and feedback", () => {
		expect(parser.parse("!opengui resume 456 continue now")).toMatchObject({
			type: CommandType.RESUME,
			executionId: 456,
			feedback: "continue now",
		});
	});

	it("keeps existing slash commands working", () => {
		expect(parser.parse("/do test task")).toMatchObject({
			type: CommandType.DO_TASK,
			description: "test task",
		});
		expect(parser.parse("/run 7")).toMatchObject({
			type: CommandType.RUN_TASK,
			taskId: 7,
		});
	});

	it("keeps existing Chinese commands working", () => {
		expect(parser.parse("做：打开浏览器")).toMatchObject({
			type: CommandType.DO_TASK,
			description: "打开浏览器",
		});
		expect(parser.parse("执行：8")).toMatchObject({
			type: CommandType.RUN_TASK,
			taskId: 8,
		});
	});
});
