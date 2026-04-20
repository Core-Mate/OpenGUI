import { parseVlmPrediction } from "./parse-action.node";

describe("parseVlmPrediction", () => {
	it("should parse click action with point format", () => {
		const text = `现在已经打开飞书了，看到消息列表里有【全员群】，需要先进入这个群。接下来点击全员群的聊天项，进入群聊界面，这样才能发红包。
Action: click(point='<point>450 361</point>')`;
		const screenWidth = 720;
		const screenHeight = 1604;

		const result = parseVlmPrediction(text, screenWidth, screenHeight);

		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({
			reflection: null,
			thought: "",
			action_type: "click",
			action_inputs: {
				start_box: "[0.45,0.361,0.45,0.361]",
				start_coords: [324, 579],
			},
			summary: null,
		});
	});

	it("should parse action with Thought prefix", () => {
		const text = `Thought: 需要点击确认按钮
Action: click(start_box='(500,600)')`;
		const result = parseVlmPrediction(text,1000, 1000);

		expect(result[0].thought).toBe("需要点击确认按钮");
		expect(result[0].action_type).toBe("click");
	});

	it("should parse action with Reflection and Action_Summary", () => {
		const text = `Reflection: 上一步操作成功
Action_Summary: 点击下一步按钮
Action: click(start_box='(200,300)')`;
		const result = parseVlmPrediction(text,1000, 1000);

		expect(result[0].reflection).toBe("上一步操作成功");
		expect(result[0].thought).toBe("点击下一步按钮");
	});

	it("should parse drag action with start and end points", () => {
		const text = `Action: drag(start_point='<point>100 200</point>', end_point='<point>300 400</point>')`;
		const result = parseVlmPrediction(text,1000, 1000);

		expect(result[0].action_type).toBe("drag");
		expect(result[0].action_inputs.start_coords).toEqual([100, 200]);
		expect(result[0].action_inputs.end_coords).toEqual([300, 400]);
	});

	it("should parse action with bbox format", () => {
		const text = `Action: click(start_box='<bbox>500 600 500 600</bbox>')`;
		const result = parseVlmPrediction(text,1000, 1000);

		expect(result[0].action_type).toBe("click");
		expect(result[0].action_inputs.start_coords).toEqual([500, 600]);
	});

	it("should handle finished action type", () => {
		const text = `Action: finished()`;
		const result = parseVlmPrediction(text,1000, 1000);

		expect(result[0].action_type).toBe("finished");
	});

	it("should handle call_user action type", () => {
		const text = `Thought: 需要用户确认
Action: call_user()`;
		const result = parseVlmPrediction(text,1000, 1000);

		expect(result[0].action_type).toBe("call_user");
		expect(result[0].thought).toBe("需要用户确认");
	});

	it("should clamp coordinates within screen bounds", () => {
		const text = `Action: click(start_box='(999,999)')`;
		const result = parseVlmPrediction(text, 100, 100);

		// maxX = 100 - 1 = 99, maxY = 100 - 1 = 99
		// rawX = 0.999 * 100 = 99.9 → clamped to 99
		// rawY = 0.999 * 100 = 99.9 → clamped to 99
		expect(result[0].action_inputs.start_coords).toEqual([99, 99]);
	});

	it("should handle text with Chinese colon in Action", () => {
		const text = `Action：click(start_box='(500,500)')`;
		const result = parseVlmPrediction(text,1000, 1000);

		expect(result[0].action_type).toBe("click");
	});

	it("should normalize coordinates for gui channel (explicit)", () => {
		const text =
			"Thought: 点击搜索按钮\nAction: click(point='<point>500 640</point>')";
		const result = parseVlmPrediction(text,1080, 2340, "gui");
		// GUI channel: 500/1000 = 0.5 * 1080 = 540, 640/1000 = 0.64 * 2340 = 1497.6
		expect(result[0]!.action_inputs.start_coords![0]).toBe(540);
		expect(result[0]!.action_inputs.start_coords![1]).toBe(1498);
	});

	it("should default to gui channel when channel not specified", () => {
		const text =
			"Thought: 点击搜索按钮\nAction: click(point='<point>500 640</point>')";
		const result = parseVlmPrediction(text,1080, 2340);
		// Default (gui): should normalize — same as gui channel
		expect(result[0]!.action_inputs.start_coords![0]).toBe(540);
		expect(result[0]!.action_inputs.start_coords![1]).toBe(1498);
	});

	it("should strip markdown code block wrappers", () => {
		const text = "```\nSummary: 点击回到首页\nThought: 需要点击\nAction: click(point='<point>122 531</point>')\n```";
		const result = parseVlmPrediction(text, 1080, 2340);

		expect(result).toHaveLength(1);
		expect(result[0].action_type).toBe("click");
		// GUI: 122/1000 * 1080 = 131.76 → 132, 531/1000 * 2340 = 1242.54 → 1243
		expect(result[0].action_inputs.start_coords).toEqual([132, 1243]);
		expect(result[0].summary).toBe("点击回到首页");
	});

	it("should parse multiple actions separated by single newline", () => {
		const text = `Summary: 点击回到首页
Thought: 完成任务
Action: click(point='<point>122 531</point>')
finished(content='已完成任务')`;
		const result = parseVlmPrediction(text, 1080, 2340);

		expect(result).toHaveLength(2);
		expect(result[0].action_type).toBe("click");
		expect(result[0].action_inputs.start_coords).toEqual([132, 1243]);
		expect(result[1].action_type).toBe("finished");
		expect(result[1].action_inputs.content).toBe("已完成任务");
	});

	it("should handle markdown code blocks with multiple actions (exact log scenario)", () => {
		const text = `\`\`\`
Summary: 点击回到首页
Thought: 已经成功查看并记录当前登录账号的昵称为down
Action: click(point='<point>122 531</point>')
finished(content='已完成任务：打开小红书APP，查看并记录当前登录账号信息')
\`\`\``;
		const result = parseVlmPrediction(text, 1080, 2340);

		expect(result).toHaveLength(2);
		expect(result[0].action_type).toBe("click");
		expect(result[0].action_inputs.start_coords).toEqual([132, 1243]);
		expect(result[1].action_type).toBe("finished");
		expect(result[1].action_inputs.content).toBe("已完成任务：打开小红书APP，查看并记录当前登录账号信息");
	});

	it("should still parse actions separated by double newlines", () => {
		const text = `Action: click(start_box='(500,600)')

finished(content='done')`;
		const result = parseVlmPrediction(text, 1000, 1000);

		expect(result).toHaveLength(2);
		expect(result[0].action_type).toBe("click");
		expect(result[1].action_type).toBe("finished");
	});

	it("should return empty action when no valid actions found", () => {
		const text = "Thought: 思考中\nAction: invalid text here";
		const result = parseVlmPrediction(text, 1000, 1000);

		expect(result).toHaveLength(1);
		expect(result[0].action_type).toBe("");
		expect(result[0].thought).toBe("思考中");
	});

	it("should handle code block with language tag", () => {
		const text = "```json\nAction: click(point='<point>500 600</point>')\n```";
		const result = parseVlmPrediction(text, 1080, 2340);

		expect(result).toHaveLength(1);
		expect(result[0].action_type).toBe("click");
	});
});
