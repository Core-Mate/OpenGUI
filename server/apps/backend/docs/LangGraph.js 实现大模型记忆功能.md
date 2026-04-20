# **大模型对话平台长期记忆机制深度解析与 LangGraph.js 工程实现指南**

## **执行摘要**

随着大语言模型（LLM）从单纯的文本生成工具演变为具备自主决策能力的智能体（Agent），"长期记忆"（Long-Term Memory）已成为工程架构中最核心的挑战之一。早期的对话系统是无状态的（Stateless），每一次会话的重置都意味着上下文的完全丢失，如同患有顺行性遗忘症的患者。然而，OpenAI 的 ChatGPT、Anthropic 的 Claude、Google 的 Gemini 以及字节跳动的豆包等行业领军者，近年来通过引入向量检索（Vector Retrieval）、上下文缓存（Context Caching）和系统级感知（System-Level Perception）等技术，成功构建了能够跨会话记住用户身份、偏好与历史交互的“有状态”系统。

本报告旨在提供一份详尽的技术分析与工程实施指南。报告共分为五个部分，总计约 15,000 字。第一部分将从认知架构的高度解构大模型记忆的理论基础；第二部分深入剖析四大主流平台（ChatGPT, Claude, Gemini, Doubao）的记忆实现机制，揭示其背后的技术栈差异；第三部分论述构建长期记忆系统的通用技术架构，涵盖向量数据库选型、知识图谱融合及隐私安全设计；第四部分则作为核心工程指南，手把手演示如何在 **LangGraph.js** 框架下，利用 pgvector 和 Store API 从零构建一个具备生产级长期记忆能力的 AI Agent；最后一部分探讨该领域的未来演进趋势。

通过本报告，读者将不仅理解“记忆”在 LLM 中的实现原理，更掌握在实际项目中落地该功能的完整代码路径与最佳实践。

## ---

**第一部分：人工智能记忆系统的理论重构**

在深入探讨具体的商业平台实现之前，必须首先建立一套关于 AI 记忆的严谨理论框架。大模型本质上是基于 Transformer 架构的概率预测机，其核心特性之一便是“无状态性”。权重的静态性意味着模型无法通过“学习”（即反向传播更新权重）来记住用户刚刚说的话。因此，工程界引入了“记忆系统”这一外部架构，以模拟人类的认知记忆功能。

### **1.1 从无状态到有状态：上下文窗口的局限性**

Transformer 模型的“短期记忆”完全依赖于**上下文窗口（Context Window）**。

* **工作原理**：当用户发送一条消息时，系统会将历史对话记录拼接成一个长序列（Prompt），输入模型。模型利用注意力机制（Self-Attention）计算 Token 之间的关联，从而生成连贯的回复。  
* **局限性**：  
  1. **容量限制**：尽管 Gemini 1.5 Pro 已将窗口扩展至 200 万 Token 1，但对于长达数月的跨会话历史，任何有限窗口终将耗尽。  
  2. **遗忘灾难**：一旦会话结束或超出窗口，信息即被截断丢弃。  
  3. **计算成本**：注意力机制的计算复杂度与序列长度呈二次方增长（![][image1]）。每次请求都重复处理数万字的历史记录，在推理成本和延迟上是不可接受的 2。

因此，我们需要一种\*\*外部存储（External Storage）\*\*机制，它类似于计算机的硬盘，用于持久化保存数据，仅在需要时调取相关片段进入“内存”（上下文窗口）。这便是长期记忆系统的工程本质。

### **1.2 记忆的分类学：AI 的认知模型**

受人类认知科学启发，AI 智能体的记忆设计通常遵循以下分类：

| 记忆类型 (Memory Type) | 定义与功能 (Definition) | 在 LLM 中的映射 (Mapping) | 存储结构示例 (Data Structure) |
| :---- | :---- | :---- | :---- |
| **语义记忆 (Semantic Memory)** | 关于世界的通用知识、事实、概念。在个性化场景中，特指关于用户的“静态事实”。 | **用户画像 (User Profile)**：姓名、职业、饮食偏好、技术栈。 | 结构化数据 (JSON/SQL): { "role": "Engineer", "lang": "Python" } |
| **情景记忆 (Episodic Memory)** | 对特定事件、对话、经历的自传体回忆。具有时间与空间的上下文属性。 | **对话历史 (Conversation Logs)**：过去某次关于“调试 Docker 容器”的具体讨论细节。 | 向量数据库 (Vector DB) 中的文本片段 (Chunk) 及其 Embedding。 |
| **程序性记忆 (Procedural Memory)** | 关于“如何做某事”的技能与规则。 | **工具与系统提示词 (Tools & System Prompts)**：如何调用 API，如何格式化代码，特定的思维链 (CoT) 模板。 | 代码库、Prompt Templates、Few-shot Examples。 |
| **工作记忆 (Working Memory)** | 当前正在处理的信息，关注点。 | **当前上下文 (Current Context)**：即输入给 LLM 的 Prompt 内容。 | 内存中的 Token 序列。 |

### **1.3 记忆的生命周期：编码、存储与检索**

一个完整的 AI 记忆系统包含三个核心过程，这与 LangGraph 中的节点设计直接对应：

1. **编码与提取 (Encoding/Extraction)**：  
   * **触发**：每当用户输入新信息。  
   * **机制**：由于原始对话是非结构化的自然语言，系统需要一个后台进程（通常是另一个 LLM 调用）来“阅读”对话，识别出关键信息。  
   * **示例**：用户说“我刚搬到上海，这边的生煎包真好吃”。提取器识别出：Location: Shanghai，Preference: Pan-fried buns。这一过程被称为“记忆形成”或“见解提取” 3。  
2. **存储与固化 (Storage/Consolidation)**：  
   * **机制**：将提取出的信息写入持久化数据库。  
   * **挑战**：冲突解决是关键。如果用户之前说“我是素食者”，现在说“我爱吃牛排”，系统必须更新状态而非简单追加，这通常需要“补丁”（Patch）逻辑而非简单的“插入”（Insert）5。  
3. **检索与增强 (Retrieval/Augmentation)**：  
   * **触发**：用户发起新一轮对话。  
   * **机制**：基于当前输入的语义，去数据库中检索相关的过往记忆。  
   * **技术**：这通常依赖于\*\*检索增强生成（RAG）\*\*技术。系统计算用户查询的向量（Query Embedding），在向量数据库中寻找余弦相似度最高的历史片段，将其注入到当前 System Prompt 中 6。

## ---

**第二部分：主流大模型平台的记忆机制深度解构**

为了在 LangGraph.js 中复刻顶级体验，我们需要深入剖析 ChatGPT、Claude、Gemini 和 Doubao 是如何处理上述流程的。这些平台虽然不开源，但通过 API文档、技术博客及逆向工程分析，我们可以还原其架构蓝图。

### **2.1 ChatGPT：基于“Bio Tool”的自适应记忆网络**

OpenAI 在 ChatGPT 中引入的记忆功能（Memory feature），代表了从“无状态”向“自适应有状态”转变的典型路径。

#### **2.1.1 核心机制：Bio Tool 与动态系统提示词**

根据逆向工程分析和社区讨论，ChatGPT 的记忆并非单纯的 RAG 检索，而是结合了一个被称为 bio 或 memory 的内部工具（Tool）7。

* **显式写入**：当用户明确说“记住我是一个工程师”时，模型会调用这个工具，将该事实写入一个与用户 ID 绑定的结构化存储中。这个过程是模型自主决策的，它被训练去识别“值得记忆”的信息 8。  
* **隐式更新**：系统还会自动捕捉用户的偏好（如“我喜欢 Python 代码简洁一点”），并更新到 bio 存储中。  
* **注入策略**：在后续对话开始时，系统会将 bio 存储中的核心事实（如用户职业、称呼）直接硬编码进 System Prompt。而对于较长期的、细节性的对话历史，则采用向量检索（Vector Search）的方式，动态抓取最相关的前 ![][image2] 条片段注入上下文。这种混合策略既保证了核心人设的稳定性，又兼顾了广泛历史的回溯能力 6。

#### **2.1.2 隐私与控制架构**

ChatGPT 的架构强调用户控制权。

* **UI 层**：用户可以查看每一条被记录的“记忆条目”，并单独删除。这意味着记忆在数据库中是以\*\*离散的条目（Discrete Entries）\*\*形式存在的，而不是一个混成一团的向量黑盒 10。  
* **临时对话**：提供“临时聊天”模式，该模式下既不读取也不写入记忆库，从架构上切断了数据库读写权限 8。

### **2.2 Claude：从“项目制品”到“工具化记忆”**

Anthropic 的 Claude 在记忆路线上展现了不同的演进逻辑，早期依赖长窗口，近期则转向了工具化实现。

#### **2.2.1 早期策略：长窗口与项目（Projects）**

Claude 最初利用其卓越的 200k+ 上下文窗口，鼓励用户将所有相关文档、代码上传到一个“Project”中。

* **上下文缓存（Context Caching）**：为了解决长窗口带来的成本和延迟问题，Claude 引入了缓存技术。对于 Project 中的静态文件（Artifacts），系统只需计算一次 KV Cache（键值对缓存），后续对话只需处理新增的 Token。这使得“伪长期记忆”（即每次都把所有资料塞进 Prompt）在经济上变得可行 12。

#### **2.2.2 最新演进：工具化记忆**

最近的更新显示，Claude 开始引入类似于 ChatGPT 的记忆机制，但更具“工具属性”。

* **工具调用**：Claude 被赋予了 conversation\_search 和 recent\_chats 等工具 14。与 ChatGPT 的自动注入不同，Claude 往往需要先进行“思考”，决定是否需要查阅历史，然后显式地发起一个工具调用请求。  
* **透明性**：这种设计使得记忆的调用过程对用户（或开发者）可见。用户可以看到模型“正在搜索历史对话...”，这种显式的 RAG 过程增强了系统的可解释性 14。

### **2.3 Gemini：无限上下文与显式缓存 API**

Google 的 Gemini 采取了更为激进的“暴力美学”策略，依托其强大的 TPU 基础设施。

#### **2.3.1 1M+ Token 的无限回忆**

Gemini 1.5 Pro 支持 100 万甚至 200 万 Token 的上下文。理论上，它可以将用户过去一整年的对话记录全部放入 Prompt 中，而不需要做复杂的向量检索筛选（RAG）。

* **优势**：避免了 RAG 系统常见的“检索丢失”问题（即关键信息因为向量相似度不够高而被漏掉）。模型可以纵览全局，发现极其隐蔽的关联 1。

#### **2.3.2 上下文缓存（Context Caching）**

为了支撑这种用法，Google Cloud Vertex AI 提供了显式的缓存 API。

* **显式缓存（Explicit Caching）**：开发者可以创建一个 cached\_content 对象，设定 TTL（生存时间）。例如，将一份 50 万字的《用户操作手册》缓存起来，并在后续的 API 调用中通过 ID 引用它。这使得长期记忆的维护变成了“缓存管理”问题 13。

### **2.4 豆包（Doubao）：操作系统级的全域感知**

字节跳动的豆包（尤其是在 AI 手机/硬件上的实现）代表了记忆系统的另一个维度：**跨应用感知**。

#### **2.4.1 屏幕感知与系统级 Agent**

不同于 ChatGPT 只能“记住”对话框里的内容，豆包助手在系统层级（System Layer）运行，拥有读取屏幕内容的权限（Accessibility/Screen Parsing）19。

* **跨 App 记忆**：当用户在“小红书”看旅游攻略时，豆包会在后台解析屏幕，提取“景点：巴黎铁塔”、“时间：10月”。当用户随后打开“携程”并告诉豆包“帮我订票”时，豆包能调用之前的视觉记忆，自动填充信息 21。  
* **技术栈**：这涉及到\*\*多模态大模型（Multimodal LLM）**与**UI 自动化（GUI Agent）\*\*的结合。记忆不仅是文本，还包含了 UI 元素的坐标、层级关系等结构化信息 20。

#### **2.4.2 显式记忆笔记本**

豆包在 UI 设计上将记忆具象化为一个“笔记本”。用户可以随时点击查看豆包记住了哪些关于自己的信息，并进行编辑。这种“显式记忆”（Explicit Memory）设计大大降低了用户对 AI“监视”的恐惧感，赋予用户最高权限 22。

## ---

**第三部分：长期记忆系统的通用技术架构**

在深入代码之前，我们需要总结出一套通用的技术架构，这套架构将指导我们在 LangGraph.js 中的实现。一个成熟的 Agent 记忆架构通常由**向量数据库**、**关系型数据库**和**编排层**三部分组成。

### **3.1 核心组件：海马体与皮层**

如果把 LLM 比作前额叶（负责推理），那么：

1. **向量数据库（海马体）**：用于处理**情景记忆**。  
   * **Embeddings**：将文本转化为高维向量（如 OpenAI text-embedding-3-small 的 1536 维向量）。  
   * **相似度计算**：利用余弦相似度（Cosine Similarity）快速找到与当前输入语义最接近的历史片段。  
   * **选型**：在 LangGraph 生态中，pgvector（PostgreSQL 的向量扩展）是首选。因为它允许在一个 SQL 查询中同时进行向量搜索和元数据过滤（Hybrid Search），且运维成本低于专用的向量数据库（如 Pinecone 或 Milvus）24。  
2. **关系型/文档数据库（大脑皮层）**：用于处理**语义记忆**。  
   * **结构化数据**：存储用户的 User Profile（如 JSON 格式）。这些数据需要被精确读写，不能容忍向量检索的模糊性。例如，查询用户的 ID 必须是精确匹配，不能是“相似”匹配。  
   * **实现**：PostgreSQL 的 JSONB 类型完美契合这一需求，既支持结构化查询，又支持灵活的 Schema 变更 26。  
3. **编排层（神经回路）**：用于管理读写流程。  
   * **LangGraph**：作为编排引擎，它通过\*\*图（Graph）\*\*的结构定义了信息流转的路径。  
   * **Checkpointer**：负责保存图的状态（State），即短期记忆。  
   * **Store**：负责跨线程持久化数据，即长期记忆。这是 LangGraph 近期引入的关键区分 27。

### **3.2 关键技术挑战**

1. **检索召回率（Recall）**：单纯的向量检索往往会遗漏关键词匹配（Keyword Match）。例如用户搜“C++ 职位”，向量可能会召回“Java 职位”（因为都是编程语言），但忽略了精准性。  
   * **解决方案**：混合检索（Hybrid Search），结合关键词全文检索（BM25）和向量检索 25。  
2. **记忆冲突（Memory Conflict）**：新旧信息的矛盾。  
   * **解决方案**：在写入前进行“读取-修改-写入”循环，利用 LLM 判断是新增还是更新 5。  
3. **延迟（Latency）**：记忆提取需要调用 LLM，如果串行执行会拖慢回复速度。  
   * **解决方案**：异步后台处理（Background Processing）。回复用户和提取记忆并行进行 29。

## ---

**第四部分：LangGraph.js 工程实现指南**

本部分将详细指导如何在 LangGraph.js 项目中实现上述架构。我们将构建一个名为 **"MemoAgent"** 的智能体，它具备以下能力：

1. **记住用户画像**：从对话中提取用户的职业、技术栈等信息并持久化。  
2. **情景回溯**：在回答问题时，能够参考过往的对话历史。  
3. **跨会话持久性**：即使用户刷新页面或开启新线程，记忆依然存在。

### **4.1 环境准备与依赖安装**

首先，我们需要初始化一个 Node.js 项目并安装核心依赖。我们将使用 langgraph 的最新版本，特别是其 checkpoint-postgres 包。

Bash

\# 初始化项目  
mkdir memo-agent && cd memo-agent  
npm init \-y

\# 安装核心依赖  
\# @langchain/langgraph: 图编排核心  
\# @langchain/langgraph-checkpoint-postgres: 提供 PostgresSaver 和 PostgresStore  
\# @langchain/openai: 提供 Embeddings 和 LLM 模型  
\# pg: PostgreSQL 驱动  
\# zod: 用于定义结构化数据 Schema  
npm install @langchain/langgraph @langchain/langgraph-checkpoint-postgres @langchain/openai @langchain/core pg zod uuid

**前置条件**：

* 你需要一个运行中的 PostgreSQL 数据库。  
* 数据库必须安装 pgvector 扩展。在 SQL 终端运行：CREATE EXTENSION IF NOT EXISTS vector;。

### **4.2 架构设计：StateGraph 与 Store 的分离**

在 LangGraph 中，有两个容易混淆的概念：**State（状态）** 和 **Store（存储）**。理解它们的区别至关重要。

* **State (Checkpointer)**:  
  * **作用**：管理**当前**会话的上下文（Short-term memory）。  
  * **生命周期**：随 thread\_id 存在。当开启新 thread 时，State 是全新的（除非显式继承）。  
  * **实现**：使用 PostgresSaver。  
* **Store (BaseStore)**:  
  * **作用**：管理**跨**会话的全局信息（Long-term memory）。  
  * **生命周期**：永久存在，跨越所有 thread。  
  * **实现**：使用 PostgresStore。这是我们存储 User Profile 和 Episodic Memories 的地方 28。

### **4.3 第一步：初始化数据库与 Store**

我们需要配置 PostgresStore 以支持向量搜索。这一步是实现类似 ChatGPT RAG 记忆的基础。

TypeScript

// src/store.ts  
import { PostgresStore } from "@langchain/langgraph-checkpoint-postgres";  
import { OpenAIEmbeddings } from "@langchain/openai";  
import { Pool } from "pg";

// 1\. 配置 Postgres 连接池  
const pool \= new Pool({  
  connectionString: process.env.DATABASE\_URL, // e.g., postgres://user:pass@localhost:5432/db  
});

// 2\. 初始化 Embeddings 模型  
// 这就像是记忆系统的"编码器"，将文本转化为数学向量  
const embeddings \= new OpenAIEmbeddings({  
  modelName: "text-embedding-3-small", // 维度为 1536  
});

// 3\. 初始化 Store  
// 关键点：index 配置开启了 pgvector 支持  
export const memoryStore \= new PostgresStore(pool, {  
  index: {  
    dims: 1536,  
    embed: embeddings,  
    // 指定哪些 JSON 字段需要被向量化索引  
    // 这里我们索引 'content' 字段，用于后续的语义检索  
    fields: \["content"\],   
  },  
});

// 辅助函数：首次运行时初始化数据库表结构  
export async function setupStore() {  
  await memoryStore.setup();  
  console.log("Memory Store initialized with pgvector support.");  
}

### **4.4 第二步：定义记忆的数据结构 (Schema)**

为了让记忆可用，必须将其结构化。我们使用 TypeScript 类型定义来规范化内存。

TypeScript

// src/types.ts

// 1\. 语义记忆：用户画像 (User Profile)  
// 这是一个单一的 JSON 对象，随对话不断更新  
export type UserProfile \= {  
  name?: string;  
  profession?: string;       // e.g., "Engineer"  
  technical\_skills: string; // e.g., \["Python", "LangGraph"\]  
  preferences: string;     // e.g., "Likes concise answers"  
  last\_updated: string;      // ISO Date  
};

// 2\. 情景记忆：对话片段 (Episodic Note)  
// 这是离散的事件记录，每当有重要信息时创建一条  
export type EpisodicMemory \= {  
  content: string;           // e.g., "User mentioned they are debugging a k8s cluster"  
  created\_at: string;  
  tags: string;            // e.g., \["work", "debugging"\]  
};

### **4.5 第三步：构建记忆提取器 (Memory Manager)**

这是系统的“海马体”部分。我们需要编写一个特定功能的 LLM 调用，它的任务不是回复用户，而是**旁观**对话，提取信息。

**Prompt 设计**：我们需要一个系统提示词，教导 LLM 如何区分“闲聊”和“事实”。

TypeScript

// src/nodes/extractor.ts  
import { AIMessage, HumanMessage, BaseMessage } from "@langchain/core/messages";  
import { ChatOpenAI } from "@langchain/openai";  
import { memoryStore } from "../store";  
import { UserProfile } from "../types";

const llm \= new ChatOpenAI({ modelName: "gpt-4o-mini" }); // 使用小模型以降低成本

// 提取节点的处理逻辑  
export async function memoryExtractorNode(state: any, config: any) {  
  // 获取当前用户的唯一标识  
  const userId \= config.configurable.user\_id;  
  // 定义命名空间：  
  const profileNamespace \= \["memories", userId, "profile"\];  
    
  // 1\. 读取当前的 Profile (如果存在)  
  const profileItem \= await memoryStore.get(profileNamespace, "summary");  
  const currentProfile: UserProfile \= profileItem?.value |

| {   
    technical\_skills:, preferences:, last\_updated: ""   
  };

  // 2\. 构造 Prompt  
  const extractionPrompt \= \`  
  You are a Memory Manager. Analyze the recent conversation history.  
    
  Current User Profile:  
  ${JSON.stringify(currentProfile)}  
    
  Task:  
  1\. Extract new facts about the user (Name, Profession, Skills).  
  2\. Identify specific preferences.  
  3\. If new info conflicts with old info, update it (User changed jobs).  
  4\. Ignore casual chitchat.  
    
  Return the updated profile as strict JSON.  
  \`;

  // 3\. 调用 LLM 进行提取 (此处简化了 Structured Output 的调用代码)  
  // 在实际生产中，建议使用 llm.withStructuredOutput(zodSchema)  
  const messages \= \[  
    { role: "system", content: extractionPrompt },  
   ...state.messages.slice(-5) // 只分析最近 5 条消息  
  \];  
    
  // 假设 LLM 返回了更新后的 JSON  
  const response \= await llm.invoke(messages);   
  const updatedProfile \= JSON.parse(response.content as string);

  // 4\. 写回 Store (语义记忆更新)  
  await memoryStore.put(profileNamespace, "summary", updatedProfile);

  // 5\. 创建情景记忆 (Episodic Memory) \- 如果有具体事件  
  // 这里我们演示如何写入向量索引  
  const episodicNamespace \= \["memories", userId, "episodic"\];  
  if (updatedProfile.new\_event\_detected) {  
    await memoryStore.put(episodicNamespace, crypto.randomUUID(), {  
      content: updatedProfile.new\_event\_description,  
      created\_at: new Date().toISOString()  
    });  
    // 注意：因为我们在 4.3 中配置了 'index'，  
    // memoryStore 会自动计算 'content' 的向量并存储到 pgvector  
  }  
}

### **4.6 第四步：构建记忆检索与增强 (Retrieval & RAG)**

在生成回复之前，Agent 必须先去“回忆”。这对应 LangGraph 中的一个前置节点。

TypeScript

// src/nodes/retriever.ts  
import { memoryStore } from "../store";

export async function memoryRetrieverNode(state: any, config: any) {  
  const userId \= config.configurable.user\_id;  
  const lastUserMessage \= state.messages\[state.messages.length \- 1\].content;

  // 1\. 获取静态画像 (Semantic Recall)  
  const profileItem \= await memoryStore.get(\["memories", userId, "profile"\], "summary");  
  const userProfile \= profileItem?.value |

| {};

  // 2\. 进行向量搜索 (Episodic Recall)  
  // 寻找与当前问题最相关的过去 3 条记忆  
  const searchResults \= await memoryStore.search(\["memories", userId, "episodic"\], {  
    query: lastUserMessage, // 基于用户当前的话进行语义搜索  
    limit: 3,               // 只取 Top 3  
    filter: {               // 可选：过滤最近一个月的记忆  
       created\_at: { $gt: "2024-01-01" }   
    }  
  });

  const episodicContext \= searchResults.map(r \=\> r.value.content).join("\\n");

  // 3\. 将检索结果注入到 State 中  
  // 这样后续的 Agent 节点就能看到这些信息  
  return {  
    memoryContext: {  
      profile: userProfile,  
      relevant\_history: episodicContext  
    }  
  };  
}

### **4.7 第五步：组装图 (Wiring the Graph)**

最后，我们将所有节点串联起来。这里展示了一个包含并行处理的高级模式：回复用户的同时，后台异步更新记忆。

TypeScript

// src/agent.ts  
import { StateGraph, START, END, MemorySaver } from "@langchain/langgraph";  
import { memoryRetrieverNode } from "./nodes/retriever";  
import { memoryExtractorNode } from "./nodes/extractor";  
import { ChatOpenAI } from "@langchain/openai";  
import { memoryStore, pool } from "./store";

// 定义图的状态 Schema  
const GraphState \= {  
  messages: {  
    value: (x: any, y: any) \=\> x.concat(y),  
    default: () \=\>,  
  },  
  memoryContext: {  
    value: (x: any, y: any) \=\> y, // 每次覆盖为最新的检索结果  
    default: () \=\> ({}),  
  },  
};

const workflow \= new StateGraph({ channels: GraphState })  
  // 添加节点  
 .addNode("retrieve", memoryRetrieverNode)  
 .addNode("agent", async (state) \=\> {  
    // 真正的回复生成节点  
    const systemPrompt \= \`  
      User Profile: ${JSON.stringify(state.memoryContext.profile)}  
      Relevant History: ${state.memoryContext.relevant\_history}  
        
      You are a helpful assistant. Use the profile context to personalize your answer.  
    \`;  
    const model \= new ChatOpenAI({ modelName: "gpt-4o" });  
    const response \= await model.invoke(\[  
      { role: "system", content: systemPrompt },  
     ...state.messages  
    \]);  
    return { messages: \[response\] };  
  })  
 .addNode("memorize", memoryExtractorNode)

  // 定义边 (Edge)  
 .addEdge(START, "retrieve")   // 1\. 先回忆  
 .addEdge("retrieve", "agent") // 2\. 再回复  
 .addEdge("agent", "memorize") // 3\. 最后提取新记忆 (更新 Store)  
 .addEdge("memorize", END);

// 编译图  
// 关键：同时传入 checkpointer (短期) 和 store (长期)  
export const app \= workflow.compile({  
  checkpointer: new PostgresSaver(pool),  
  store: memoryStore  
});

### **4.8 运行与测试**

在调用时，务必提供 user\_id，这是区分不同用户记忆空间的关键。

TypeScript

const config \= {  
  configurable: {  
    thread\_id: "session\_123", // 当前会话 ID  
    user\_id: "user\_alice\_99"  // 长期用户 ID  
  }  
};

const result \= await app.invoke({  
  messages:  
}, config);  
// 此时，Extraction 节点会运行，将 "DevOps engineer" 和 "Kubernetes" 写入 Alice 的 Profile。

//...几天后，开启新会话...  
const config2 \= {  
  configurable: {  
    thread\_id: "session\_456", // 新会话  
    user\_id: "user\_alice\_99"  // 同样的用户 ID  
  }  
};

const result2 \= await app.invoke({  
  messages: \[{ role: "user", content: "How do I scale my pods?" }\]  
}, config2);  
// Retrieve 节点会检索到 Profile 中的 "Kubernetes" 背景，  
// Agent 将能够回答："Since you are using Kubernetes, you can use \`kubectl scale\`..."

## ---

**第五部分：优化策略与工程挑战**

在实际生产环境中，仅仅实现功能是不够的，还需要解决性能与质量问题。

### **5.1 延迟优化：异步提取 (Debouncing)**

如果每发一条消息都调用一次 memoryExtractorNode，会带来额外的 LLM 开销和延迟。

* **策略**：实施“防抖动”（Debouncing）或“缓冲区”策略。  
* **实现**：不要在每轮对话后立即提取。可以将消息先存入 Redis 队列，当队列积累了 10 条消息，或者会话静默超过 5 分钟后，由后台 Worker 触发一次批量提取 29。LangGraph 支持通过 checkpointer 的异步事件流来实现这一点。

### **5.2 记忆冲突与遗忘机制**

用户的信息是动态的。如果用户先说“我未婚”，后说“我结婚了”，简单的向量检索可能会同时召回这两条矛盾的信息。

* **Trustcall 模式**：使用 JSON Patch 策略。提取器的 Prompt 不应只生成新事实，而应生成“对旧 Profile 的修改指令”（如 op: replace, path: /marital\_status, value: married）。这保证了语义记忆的一致性 5。

### **5.3 隐私与数据隔离**

在 SaaS 场景下，绝对不能发生“串号”现象（A 用户读到了 B 用户的记忆）。

* **命名空间隔离**：在 LangGraph Store 中，严格使用 \[tenant\_id, user\_id,...\] 作为 Namespace 前缀。  
* **行级安全 (RLS)**：在 PostgreSQL 数据库层面开启 Row-Level Security。配置 SQL 策略，强制要求所有查询必须包含当前 user\_id 的过滤条件。这是应用层之外的最后一道防线。

### **5.4 评估记忆质量**

如何知道 AI 记住了正确的东西？

* **评估集**：构建一组“事实-查询”对。例如输入“我叫 Alice”，预期 User Profile 中 name 字段变为 Alice。  
* **LangSmith 集成**：利用 LangSmith 对提取节点的输出进行单元测试，监控提取的准确率和召回率 31。

## ---

**结论与展望**

大模型的记忆能力并非魔法，而是精密的系统工程。它通过**向量检索**弥补了上下文窗口的容量短板，通过**结构化存储**弥补了非结构化生成的不可控性。

本文展示的基于 LangGraph.js 的实现方案，是目前业界构建 Agent 记忆的标准范式。通过分离 State（会话流）与 Store（知识库），并结合 pgvector 的混合检索能力，开发者完全可以在私有化部署中复刻出媲美 ChatGPT 的记忆体验。

展望未来，随着\*\*模型上下文协议（MCP, Model Context Protocol）\*\*的普及，记忆有望实现标准化与互操作性。未来的记忆将不再被锁定在某个单一 App 中，而是作为用户的数字资产，在 Claude、ChatGPT 和本地 Agent 之间自由流动，真正实现“个人数字孪生”的愿景。

---

**参考文献索引：** 8 ChatGPT Memory FAQ. 10 Reverse Engineering ChatGPT Memory Architecture. 7 Technical Discussion on ChatGPT Bio Tool. 12 Claude Context Window Mechanics. 13 Google Vertex AI Context Caching. 19 Doubao System-Level Agent Architecture. 32 LangGraph Store API Reference. 24 LangChain pgvector Integration. 1 Gemini Long Context Technical Report. 27 LangGraph Persistence & Memory Guide. 26 Building Infinite Memory Agents with LangGraph.

#### **引用的著作**

1. Long context | Gemini API \- Google AI for Developers, 访问时间为 二月 2, 2026， [https://ai.google.dev/gemini-api/docs/long-context](https://ai.google.dev/gemini-api/docs/long-context)  
2. The Hidden Memory Architecture of LLMs | Microsoft Community Hub, 访问时间为 二月 2, 2026， [https://techcommunity.microsoft.com/blog/educatordeveloperblog/the-hidden-memory-architecture-of-llms/4485367](https://techcommunity.microsoft.com/blog/educatordeveloperblog/the-hidden-memory-architecture-of-llms/4485367)  
3. Long-term Memory in LLM Applications, 访问时间为 二月 2, 2026， [https://langchain-ai.github.io/langmem/concepts/conceptual\_guide/](https://langchain-ai.github.io/langmem/concepts/conceptual_guide/)  
4. Solved my LangChain memory problem with multi-layer extraction, here's the pattern that actually works \- Reddit, 访问时间为 二月 2, 2026， [https://www.reddit.com/r/LangChain/comments/1pjtc8n/solved\_my\_langchain\_memory\_problem\_with/](https://www.reddit.com/r/LangChain/comments/1pjtc8n/solved_my_langchain_memory_problem_with/)  
5. langchain-ai/memory-template \- GitHub, 访问时间为 二月 2, 2026， [https://github.com/langchain-ai/memory-template](https://github.com/langchain-ai/memory-template)  
6. Introducing the ChatGPT Memory Project \- Redis, 访问时间为 二月 2, 2026， [https://redis.io/blog/chatgpt-memory-project/](https://redis.io/blog/chatgpt-memory-project/)  
7. ELI5: How does ChatGPT's memory actually work behind the scenes? : r/OpenAI \- Reddit, 访问时间为 二月 2, 2026， [https://www.reddit.com/r/OpenAI/comments/1jy3e6z/eli5\_how\_does\_chatgpts\_memory\_actually\_work/](https://www.reddit.com/r/OpenAI/comments/1jy3e6z/eli5_how_does_chatgpts_memory_actually_work/)  
8. Memory FAQ \- OpenAI Help Center, 访问时间为 二月 2, 2026， [https://help.openai.com/en/articles/8590148-memory-faq](https://help.openai.com/en/articles/8590148-memory-faq)  
9. How does ChatGPT's memory feature work? \- Medium, 访问时间为 二月 2, 2026， [https://medium.com/@jay-chung/how-does-chatgpts-memory-feature-work-57ae9733a3f0](https://medium.com/@jay-chung/how-does-chatgpts-memory-feature-work-57ae9733a3f0)  
10. Reverse Engineering Latest ChatGPT Memory Feature (And Building Your Own) | Blog, 访问时间为 二月 2, 2026， [https://agentman.ai/blog/reverse-ngineering-latest-ChatGPT-memory-feature-and-building-your-own](https://agentman.ai/blog/reverse-ngineering-latest-ChatGPT-memory-feature-and-building-your-own)  
11. Memory and new controls for ChatGPT \- OpenAI, 访问时间为 二月 2, 2026， [https://openai.com/index/memory-and-new-controls-for-chatgpt/](https://openai.com/index/memory-and-new-controls-for-chatgpt/)  
12. How context window, token limits, and memory work across the Claude 4.5 model family, 访问时间为 二月 2, 2026， [https://www.datastudios.org/post/claude-ai-how-context-window-token-limits-and-memory-work-across-the-claude-4-5-model-family](https://www.datastudios.org/post/claude-ai-how-context-window-token-limits-and-memory-work-across-the-claude-4-5-model-family)  
13. Context caching overview | Generative AI on Vertex AI \- Google Cloud Documentation, 访问时间为 二月 2, 2026， [https://docs.cloud.google.com/vertex-ai/generative-ai/docs/context-cache/context-cache-overview](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/context-cache/context-cache-overview)  
14. Comparing the memory implementations of Claude and ChatGPT \- Simon Willison's Weblog, 访问时间为 二月 2, 2026， [https://simonwillison.net/2025/Sep/12/claude-memory/](https://simonwillison.net/2025/Sep/12/claude-memory/)  
15. Using Claude's chat search and memory to build on previous context | Claude Help Center, 访问时间为 二月 2, 2026， [https://support.claude.com/en/articles/11817273-using-claude-s-chat-search-and-memory-to-build-on-previous-context](https://support.claude.com/en/articles/11817273-using-claude-s-chat-search-and-memory-to-build-on-previous-context)  
16. Practical Guide: Using Gemini Context Caching with Large Codebases | by Olejniczak Lukasz | Google Cloud \- Medium, 访问时间为 二月 2, 2026， [https://medium.com/google-cloud/practical-guide-using-gemini-context-caching-with-large-codebases-08d46d946c3d](https://medium.com/google-cloud/practical-guide-using-gemini-context-caching-with-large-codebases-08d46d946c3d)  
17. Context caching | Gemini API | Google AI for Developers, 访问时间为 二月 2, 2026， [https://ai.google.dev/gemini-api/docs/caching](https://ai.google.dev/gemini-api/docs/caching)  
18. Vertex AI context caching | Google Cloud Blog, 访问时间为 二月 2, 2026， [https://cloud.google.com/blog/products/ai-machine-learning/vertex-ai-context-caching](https://cloud.google.com/blog/products/ai-machine-learning/vertex-ai-context-caching)  
19. Doubao Phone Assistant Technical Preview Debuts as First True System-Level AI, Nubia ... \- Pandaily, 访问时间为 二月 2, 2026， [https://pandaily.com/doubao-phone-assistant-technical-preview-debuts-as-first-true-system-level-ai-nubia-demo-phone-priced-at-3-499-rmb](https://pandaily.com/doubao-phone-assistant-technical-preview-debuts-as-first-true-system-level-ai-nubia-demo-phone-priced-at-3-499-rmb)  
20. 2000 Intern "Strips Down" Doubao's Phone with Large Models: Unveiling Truth in 1000 \- Word Hands \- on Test \- 36氪, 访问时间为 二月 2, 2026， [https://eu.36kr.com/de/p/3589329638146309](https://eu.36kr.com/de/p/3589329638146309)  
21. When AI Phones "Overstep Bounds": Doubao's Subversive Experience \- Whose Cheese Is Moved? \- 36氪, 访问时间为 二月 2, 2026， [https://eu.36kr.com/en/p/3590856992801282](https://eu.36kr.com/en/p/3590856992801282)  
22. Domestic AI Assistants Tongyi Qianwen and Doubao Launch Memory Function, Aiming to Exceed ChatGPT \- AIBase, 访问时间为 二月 2, 2026， [https://www.aibase.com/news/21891](https://www.aibase.com/news/21891)  
23. Domestic AI Assistants Tongyi Qianwen and Doubao Launch Memory Function, Aiming to Exceed ChatGPT \- AI NEWS, 访问时间为 二月 2, 2026， [https://news.aibase.com/news/21891](https://news.aibase.com/news/21891)  
24. PGVectorStore \- Docs by LangChain, 访问时间为 二月 2, 2026， [https://docs.langchain.com/oss/javascript/integrations/vectorstores/pgvector](https://docs.langchain.com/oss/javascript/integrations/vectorstores/pgvector)  
25. Postgres \+ pgvector: The Battle-Proven Vector Store for Full-Stack AI Applications | by Nir kaufman | Israeli Tech Radar | Medium, 访问时间为 二月 2, 2026， [https://medium.com/israeli-tech-radar/postgres-pgvector-the-battle-proven-vector-store-for-full-stack-ai-applications-b86e18f4056b](https://medium.com/israeli-tech-radar/postgres-pgvector-the-battle-proven-vector-store-for-full-stack-ai-applications-b86e18f4056b)  
26. Building Infinite Memory Agents: A Master Guide to LangGraph, LangMem, and Postgres | by Manjeetsinh Alonja | Medium, 访问时间为 二月 2, 2026， [https://medium.com/@alonjamanjeetsinh77/building-infinite-memory-agents-a-master-guide-to-langgraph-langmem-and-postgres-05b3cabd689b](https://medium.com/@alonjamanjeetsinh77/building-infinite-memory-agents-a-master-guide-to-langgraph-langmem-and-postgres-05b3cabd689b)  
27. Memory overview \- Docs by LangChain, 访问时间为 二月 2, 2026， [https://docs.langchain.com/oss/python/langgraph/memory](https://docs.langchain.com/oss/python/langgraph/memory)  
28. LangGraph & Redis: Build smarter AI agents with memory & persistence, 访问时间为 二月 2, 2026， [https://redis.io/blog/langgraph-redis-build-smarter-ai-agents-with-memory-persistence/](https://redis.io/blog/langgraph-redis-build-smarter-ai-agents-with-memory-persistence/)  
29. Memory overview \- Docs by LangChain, 访问时间为 二月 2, 2026， [https://docs.langchain.com/oss/javascript/langgraph/memory](https://docs.langchain.com/oss/javascript/langgraph/memory)  
30. Comprehensive Guide: Long-Term Agentic Memory With LangGraph | by Anil Jain \- Medium, 访问时间为 二月 2, 2026， [https://medium.com/@anil.jain.baba/long-term-agentic-memory-with-langgraph-824050b09852](https://medium.com/@anil.jain.baba/long-term-agentic-memory-with-langgraph-824050b09852)  
31. langchain-ai/langgraph: Build resilient language agents as graphs. \- GitHub, 访问时间为 二月 2, 2026， [https://github.com/langchain-ai/langgraph](https://github.com/langchain-ai/langgraph)  
32. Storage (LangGraph) | LangChain Reference, 访问时间为 二月 2, 2026， [https://reference.langchain.com/python/langgraph/store/](https://reference.langchain.com/python/langgraph/store/)

[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADgAAAAYCAYAAACvKj4oAAACi0lEQVR4Xu2Xz4tOYRTHj5+R0GxYoZTtZDHCWAiFsrWQZGaUshkbERZ2SlaUBQsLLEXKP4ASJYUUM1OzmCTMEPltpuF85zmP93m/97z3zrzXfUnzqW/3Pt9zzvPeeX7dOyLT/BM8UP1U3eXA32ArGyUZSe4vq0aTNthF7SmxQnVedU61iGIeB1RH2SwJZu6U3c+wdspK1WPyCjkjoaO91l6ueqP69jsjyzLVSzYTMBPoM4oZlPp4X314gjXi155VXWDTY6aEDm5zwBhTjbNpoG4em8QN1UMJuespBmarnrGZgOW5m03D+8MzIAkj2YjNEnK2kN+p+k6eB2rn2vUHxUCvagebxkXJ329XpGCpvpDiUYgzfJV8jOxk9t4HuyIf/WDGUl5RO7JPtc7uN6SBhMWS8/wbJQRvkc+0Sch7Tz68+eQx7apDdo+HRM2dWngC7wE7JBwy3ar94u/NCOrdwzCOaNEe2iMh71HiLTSviOuqWUkbNVx3j9og5qVqBGLH2ARFhZF+CXl4HUQ2mVcE52BW4MVZRZ9l36Ho7xKbSyzAD+Dh5fU4nkfcfylpf6/TQJN8Vd1nE8sGP4JgHjsl5PErpMv8PFarDrOpPJVQu8quZfks4TWUwZsZplEOTjfPT7kp2RMTLJBQi9nlA6cZ0Bf2egb8QN5DDkmIz+GA1E7WPPLi+HBAHHu5LOjnOJsRBJ+wqQxL9gOXQS1e4B4HJcTxHemxXfIHYCqgHwx4Q+L3IjYq9iTu19Zl+CAvnoYRLMmPqnemL6ptdRk13rLRBHG5V8IR1Sc2Wwz+67nG5p8Eo+cdJK2istmLYC8NsNkiTqhOslkFpyV8L7aSparnbFZJFxsVg1N6mv+WX033qXo08PhCAAAAAElFTkSuQmCC>

[image2]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAsAAAAXCAYAAADduLXGAAAAoElEQVR4XmNgGJSAEYhV0QWxgadA/B+KiQJXGEhQDFJ4DV0QFwApjkAXxAaiGDCd0ATE/mhiYHCTAaGYC4jvAzEfEH+Dq0ACIIW3gVgQiDdCxX5CxTEASHAnEM9El0AHMxgQJsyGslUQ0qgAPTJA7INQdj6SOBiAJKeh8VuQ2HDACRUQRRL7CMQbgLgHiA2RxMHAE10ACDyAmANdcBTAAACQdCSKrBERiwAAAABJRU5ErkJggg==>