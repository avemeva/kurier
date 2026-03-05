# OpenCode: Tool Execution Data Flow

How a user's message becomes a tool call and back. Every step shows the actual data moving through the system.

---

## Giant Diagram: The Complete Flow

```
╔══════════════════════════════════════════════════════════════════════════════════════╗
║  USER TYPES: "search me something" + ENTER                                         ║
╚═══════════════════════════════════════╤══════════════════════════════════════════════╝
                                        │
                    ┌───────────────────▼───────────────────┐
                    │     TUI Prompt Component               │
                    │     prompt/index.tsx:616                │
                    │                                        │
                    │  Captures text, builds request:         │
                    │  {                                      │
                    │    sessionID: "sess_abc",               │
                    │    agent: "coder",                      │
                    │    model: {                             │
                    │      providerID: "anthropic",           │
                    │      modelID: "claude-sonnet-4-..."     │
                    │    },                                   │
                    │    parts: [{                            │
                    │      type: "text",                      │
                    │      text: "search me something"        │
                    │    }]                                   │
                    │  }                                      │
                    └───────────────────┬───────────────────┘
                                        │
                              HTTP POST /session/:id/message
                                        │
                    ┌───────────────────▼───────────────────┐
                    │     Server Route Handler               │
                    │     server/routes/session.ts:768        │
                    │                                        │
                    │  Receives POST body                     │
                    │  Calls SessionPrompt.prompt(body)       │
                    └───────────────────┬───────────────────┘
                                        │
                    ┌───────────────────▼───────────────────┐
                    │     SessionPrompt.prompt()             │
                    │     session/prompt.ts:158               │
                    │                                        │
                    │  1. createUserMessage(input)            │
                    │     → Writes to DB:                     │
                    │                                        │
                    │     MessageV2.User {                    │
                    │       id: "msg_001",                    │
                    │       role: "user",                     │
                    │       sessionID: "sess_abc",            │
                    │       agent: "coder",                   │
                    │       model: { anthropic, sonnet }      │
                    │     }                                   │
                    │     MessageV2.TextPart {                │
                    │       id: "part_001",                   │
                    │       messageID: "msg_001",             │
                    │       type: "text",                     │
                    │       text: "search me something"       │
                    │     }                                   │
                    │                                        │
                    │  2. Calls loop({ sessionID })           │
                    └───────────────────┬───────────────────┘
                                        │
╔═══════════════════════════════════════▼══════════════════════════════════════════════╗
║                                                                                     ║
║   SessionPrompt.loop()    session/prompt.ts:274                                     ║
║   ═══════════════════════════════════════                                            ║
║                                                                                     ║
║   while (true) {                                                                    ║
║                                                                                     ║
║   ┌─────────────────────────────────────────────────────────────────────────────┐    ║
║   │  PHASE 1: LOAD STATE                                                        │    ║
║   │                                                                             │    ║
║   │  msgs = MessageV2.stream(sessionID)                                         │    ║
║   │                                                                             │    ║
║   │  ┌─ Iteration 1: ──────────────────────────────────────────────────────┐    │    ║
║   │  │  msgs = [                                                            │    │    ║
║   │  │    { info: { role: "user" },                                         │    │    ║
║   │  │      parts: [{ type: "text", text: "search me something" }] }        │    │    ║
║   │  │  ]                                                                   │    │    ║
║   │  └──────────────────────────────────────────────────────────────────────┘    │    ║
║   │                                                                             │    ║
║   │  ┌─ Iteration 2 (after tool call): ────────────────────────────────────┐    │    ║
║   │  │  msgs = [                                                            │    │    ║
║   │  │    { info: { role: "user" },                                         │    │    ║
║   │  │      parts: [{ type: "text", text: "search me something" }] },       │    │    ║
║   │  │    { info: { role: "assistant", finish: "tool-calls" },              │    │    ║
║   │  │      parts: [                                                        │    │    ║
║   │  │        { type: "text", text: "I'll search that for you." },          │    │    ║
║   │  │        { type: "tool", tool: "websearch", state: {                   │    │    ║
║   │  │            status: "completed",                                      │    │    ║
║   │  │            input: { query: "something" },                            │    │    ║
║   │  │            output: "1. Example.com - ..." } }                        │    │    ║
║   │  │      ] }                                                             │    │    ║
║   │  │  ]                                                                   │    │    ║
║   │  └──────────────────────────────────────────────────────────────────────┘    │    ║
║   │                                                                             │    ║
║   │  Find lastUser, lastAssistant, lastFinished                                 │    ║
║   │  If lastAssistant.finish is NOT "tool-calls" → break the while loop         │    ║
║   └─────────────────────────────────────────────────────────────────────────────┘    ║
║                                        │                                            ║
║                                        ▼                                            ║
║   ┌─────────────────────────────────────────────────────────────────────────────┐    ║
║   │  PHASE 2: BUILD SYSTEM PROMPT                                               │    ║
║   │                                                                             │    ║
║   │  system = [                                                                 │    ║
║   │    SystemPrompt.environment(model),     ← "You are claude-sonnet-4-...      │    ║
║   │                                            Working dir: /Users/.../opencode │    ║
║   │                                            Platform: darwin                 │    ║
║   │                                            Date: 2026-03-03"               │    ║
║   │                                                                             │    ║
║   │    InstructionPrompt.system(),          ← "Contents of CLAUDE.md: ..."      │    ║
║   │                                            "Contents of AGENTS.md: ..."     │    ║
║   │  ]                                                                          │    ║
║   └─────────────────────────────────────────────────────────────────────────────┘    ║
║                                        │                                            ║
║                                        ▼                                            ║
║   ┌─────────────────────────────────────────────────────────────────────────────┐    ║
║   │  PHASE 3: BUILD TOOLS MAP                                                   │    ║
║   │                                                                             │    ║
║   │  resolveTools()  →  prompt.ts:736                                           │    ║
║   │                                                                             │    ║
║   │  For each tool in ToolRegistry.tools():                                     │    ║
║   │                                                                             │    ║
║   │    ┌─────────────────────────────────────────────────────────┐              │    ║
║   │    │  WebSearchTool (tool/websearch.ts)                      │              │    ║
║   │    │                                                         │              │    ║
║   │    │  Zod Schema:                                            │              │    ║
║   │    │    z.object({                                           │              │    ║
║   │    │      query: z.string(),                                 │              │    ║
║   │    │      numResults: z.number().optional(),                 │              │    ║
║   │    │      ...                                                │              │    ║
║   │    │    })                                                   │              │    ║
║   │    │           │                                             │              │    ║
║   │    │           │  z.toJSONSchema()                           │              │    ║
║   │    │           ▼                                             │              │    ║
║   │    │  JSON Schema:                                           │              │    ║
║   │    │    {                                                    │              │    ║
║   │    │      type: "object",                                    │              │    ║
║   │    │      properties: {                                      │              │    ║
║   │    │        query: {                                         │              │    ║
║   │    │          type: "string",                                │              │    ║
║   │    │          description: "Websearch query"                 │              │    ║
║   │    │        },                                               │              │    ║
║   │    │        numResults: {                                    │              │    ║
║   │    │          type: "number",                                │              │    ║
║   │    │          description: "Number of search results..."     │              │    ║
║   │    │        }                                                │              │    ║
║   │    │      },                                                 │              │    ║
║   │    │      required: ["query"]                                │              │    ║
║   │    │    }                                                    │              │    ║
║   │    │           │                                             │              │    ║
║   │    │           │  ProviderTransform.schema()                 │              │    ║
║   │    │           │  (fix quirks for Gemini, etc.)              │              │    ║
║   │    │           ▼                                             │              │    ║
║   │    │  Vercel AI SDK tool():                                  │              │    ║
║   │    │    {                                                    │              │    ║
║   │    │      id: "websearch",                                   │              │    ║
║   │    │      description: "Search the web using Exa AI...",     │              │    ║
║   │    │      inputSchema: jsonSchema({...}),                    │              │    ║
║   │    │      execute: async (args, opts) => { ... }             │              │    ║
║   │    │    }                                                    │              │    ║
║   │    └─────────────────────────────────────────────────────────┘              │    ║
║   │                                                                             │    ║
║   │  Result: tools = {                                                          │    ║
║   │    "websearch": { id, description, inputSchema, execute },                  │    ║
║   │    "bash":      { id, description, inputSchema, execute },                  │    ║
║   │    "read":      { id, description, inputSchema, execute },                  │    ║
║   │    "edit":      { id, description, inputSchema, execute },                  │    ║
║   │    "glob":      { id, description, inputSchema, execute },                  │    ║
║   │    "grep":      { id, description, inputSchema, execute },                  │    ║
║   │    "write":     { id, description, inputSchema, execute },                  │    ║
║   │    "task":      { id, description, inputSchema, execute },                  │    ║
║   │    "webfetch":  { id, description, inputSchema, execute },                  │    ║
║   │    "todowrite": { id, description, inputSchema, execute },                  │    ║
║   │    "skill":     { id, description, inputSchema, execute },                  │    ║
║   │    "question":  { id, description, inputSchema, execute },                  │    ║
║   │    ...                                                                      │    ║
║   │  }                                                                          │    ║
║   └─────────────────────────────────────────────────────────────────────────────┘    ║
║                                        │                                            ║
║                                        ▼                                            ║
║   ┌─────────────────────────────────────────────────────────────────────────────┐    ║
║   │  PHASE 4: CONVERT MESSAGES TO AI SDK FORMAT                                 │    ║
║   │                                                                             │    ║
║   │  MessageV2.toModelMessages(msgs, model)   →   message-v2.ts:496            │    ║
║   │                                                                             │    ║
║   │  Internal format:                        AI SDK format:                     │    ║
║   │  ─────────────────                       ──────────────                     │    ║
║   │  { info: { role: "user" },       →       { role: "user",                   │    ║
║   │    parts: [                                content: [{                      │    ║
║   │      { type: "text",                         type: "text",                  │    ║
║   │        text: "search me..." }                text: "search me..."           │    ║
║   │    ] }                                     }] }                             │    ║
║   │                                                                             │    ║
║   │  (On iteration 2, also includes:)                                           │    ║
║   │                                                                             │    ║
║   │  { info: { role: "assistant" },  →       { role: "assistant",              │    ║
║   │    parts: [                                content: [                       │    ║
║   │      { type: "text" },                       { type: "text", text: "..." }, │    ║
║   │      { type: "tool",                         { type: "tool-call",           │    ║
║   │        tool: "websearch",                      toolCallId: "toolu_01X",     │    ║
║   │        state: {                                toolName: "websearch",       │    ║
║   │          status: "completed",                  input: { query: "..." } }    │    ║
║   │          input: {...},                     ] }                              │    ║
║   │          output: "..." } }               { role: "tool",                    │    ║
║   │    ] }                                     content: [{                      │    ║
║   │                                              type: "tool-result",           │    ║
║   │                ──────────────▶               toolCallId: "toolu_01X",       │    ║
║   │              convertToModelMessages()        output: "1. Example.com..."    │    ║
║   │                                            }] }                             │    ║
║   └─────────────────────────────────────────────────────────────────────────────┘    ║
║                                        │                                            ║
║                                        ▼                                            ║
║   ┌─────────────────────────────────────────────────────────────────────────────┐    ║
║   │  PHASE 5: CALL THE LLM                                                     │    ║
║   │                                                                             │    ║
║   │  processor.process(streamInput)   →   processor.ts:45                       │    ║
║   │    └→ LLM.stream(streamInput)     →   llm.ts:172                            │    ║
║   │         └→ streamText({                                                     │    ║
║   │              model: anthropicLanguageModel,                                 │    ║
║   │              messages: [                                                    │    ║
║   │                { role: "system", content: "You are claude-sonnet-4-..." },  │    ║
║   │                { role: "system", content: "CLAUDE.md contents..." },        │    ║
║   │                { role: "user", content: [{ type: "text",                    │    ║
║   │                    text: "search me something" }] },                        │    ║
║   │              ],                                                             │    ║
║   │              tools: { websearch: {...}, bash: {...}, read: {...}, ... },     │    ║
║   │            })                                                               │    ║
║   │                                                                             │    ║
║   │  Vercel SDK translates this into HTTP POST to Anthropic:                    │    ║
║   │                                                                             │    ║
║   │    POST https://api.anthropic.com/v1/messages                               │    ║
║   │    {                                                                        │    ║
║   │      "model": "claude-sonnet-4-20250514",                                   │    ║
║   │      "stream": true,                                                        │    ║
║   │      "system": "You are claude-sonnet-4-...\n...",                           │    ║
║   │      "messages": [                                                          │    ║
║   │        { "role": "user", "content": "search me something" }                 │    ║
║   │      ],                                                                     │    ║
║   │      "tools": [                                                             │    ║
║   │        {                                                                    │    ║
║   │          "name": "websearch",                                               │    ║
║   │          "description": "Search the web using Exa AI - performs...",         │    ║
║   │          "input_schema": {                                                  │    ║
║   │            "type": "object",                                                │    ║
║   │            "properties": {                                                  │    ║
║   │              "query": { "type": "string", "description": "..." }            │    ║
║   │            },                                                               │    ║
║   │            "required": ["query"]                                            │    ║
║   │          }                                                                  │    ║
║   │        },                                                                   │    ║
║   │        { "name": "bash", ... },                                             │    ║
║   │        { "name": "read", ... },                                             │    ║
║   │        ...15 more tools...                                                  │    ║
║   │      ]                                                                      │    ║
║   │    }                                                                        │    ║
║   └─────────────────────────────────────────────────────────────────────────────┘    ║
║                                        │                                            ║
║                              Claude API streams back SSE                            ║
║                                        │                                            ║
║                                        ▼                                            ║
║   ┌─────────────────────────────────────────────────────────────────────────────┐    ║
║   │  PHASE 6: PROCESS STREAM EVENTS                                             │    ║
║   │                                                                             │    ║
║   │  Vercel SDK parses Claude's SSE stream into normalized events.              │    ║
║   │  processor.ts consumes them:                                                │    ║
║   │                                                                             │    ║
║   │  for await (const value of stream.fullStream) {                             │    ║
║   │    switch (value.type) { ... }                                              │    ║
║   │  }                                                                          │    ║
║   │                                                                             │    ║
║   │  ┌─────────────────────────────────────────────────────────────────────┐    │    ║
║   │  │  EVENT: text-start                                                  │    │    ║
║   │  │                                                                     │    │    ║
║   │  │  → Creates TextPart in DB:                                          │    │    ║
║   │  │    { id: "part_010", type: "text", text: "",                        │    │    ║
║   │  │      messageID: "msg_002", sessionID: "sess_abc" }                  │    │    ║
║   │  │                                                                     │    │    ║
║   │  │  UI: empty text block appears                                       │    │    ║
║   │  └─────────────────────────────────────────────────────────────────────┘    │    ║
║   │                          │                                                  │    ║
║   │                          ▼                                                  │    ║
║   │  ┌─────────────────────────────────────────────────────────────────────┐    │    ║
║   │  │  EVENT: text-delta  (repeated per token)                            │    │    ║
║   │  │                                                                     │    │    ║
║   │  │  value = { text: "I'll " }                                          │    │    ║
║   │  │  value = { text: "search " }                                        │    │    ║
║   │  │  value = { text: "that " }                                          │    │    ║
║   │  │  value = { text: "for you." }                                       │    │    ║
║   │  │                                                                     │    │    ║
║   │  │  → Session.updatePartDelta({ delta: "I'll " })                      │    │    ║
║   │  │    Appends to part_010.text                                         │    │    ║
║   │  │                                                                     │    │    ║
║   │  │  UI: text appears character by character                            │    │    ║
║   │  └─────────────────────────────────────────────────────────────────────┘    │    ║
║   │                          │                                                  │    ║
║   │                          ▼                                                  │    ║
║   │  ┌─────────────────────────────────────────────────────────────────────┐    │    ║
║   │  │  EVENT: text-end                                                    │    │    ║
║   │  │                                                                     │    │    ║
║   │  │  → Trims trailing whitespace                                        │    │    ║
║   │  │  → Runs Plugin.trigger("experimental.text.complete")                │    │    ║
║   │  │  → Final state: part_010.text = "I'll search that for you."         │    │    ║
║   │  └─────────────────────────────────────────────────────────────────────┘    │    ║
║   │                          │                                                  │    ║
║   │                          ▼                                                  │    ║
║   │  ┌─────────────────────────────────────────────────────────────────────┐    │    ║
║   │  │  EVENT: tool-input-start                                            │    │    ║
║   │  │                                                                     │    │    ║
║   │  │  value = { id: "toolu_01X", toolName: "websearch" }                 │    │    ║
║   │  │                                                                     │    │    ║
║   │  │  → Creates ToolPart in DB:                                          │    │    ║
║   │  │    { id: "part_011", type: "tool", tool: "websearch",               │    │    ║
║   │  │      callID: "toolu_01X",                                           │    │    ║
║   │  │      state: { status: "pending", input: {}, raw: "" } }             │    │    ║
║   │  │                                                                     │    │    ║
║   │  │  UI: tool card appears with spinner, label "websearch"              │    │    ║
║   │  └─────────────────────────────────────────────────────────────────────┘    │    ║
║   │                          │                                                  │    ║
║   │                          ▼                                                  │    ║
║   │  ┌─────────────────────────────────────────────────────────────────────┐    │    ║
║   │  │  EVENT: tool-input-delta  (streamed JSON chunks, ignored)           │    │    ║
║   │  │                                                                     │    │    ║
║   │  │  value = { text: '{"query":' }                                      │    │    ║
║   │  │  value = { text: '"something"}' }                                   │    │    ║
║   │  │                                                                     │    │    ║
║   │  │  → No action (processor ignores these)                              │    │    ║
║   │  └─────────────────────────────────────────────────────────────────────┘    │    ║
║   │                          │                                                  │    ║
║   │                          ▼                                                  │    ║
║   │  ┌─────────────────────────────────────────────────────────────────────┐    │    ║
║   │  │  EVENT: tool-call                                                   │    │    ║
║   │  │                                                                     │    │    ║
║   │  │  value = {                                                          │    │    ║
║   │  │    toolCallId: "toolu_01X",                                         │    │    ║
║   │  │    toolName: "websearch",                                           │    │    ║
║   │  │    input: { query: "something" }    ← fully parsed args             │    │    ║
║   │  │  }                                                                  │    │    ║
║   │  │                                                                     │    │    ║
║   │  │  → Updates ToolPart in DB:                                          │    │    ║
║   │  │    state: {                                                         │    │    ║
║   │  │      status: "running",             ← was "pending"                 │    │    ║
║   │  │      input: { query: "something" },                                 │    │    ║
║   │  │      time: { start: 1709467202000 }                                 │    │    ║
║   │  │    }                                                                │    │    ║
║   │  │                                                                     │    │    ║
║   │  │  → Doom loop check:                                                 │    │    ║
║   │  │    Last 3 tool parts same tool + same args? → ask permission        │    │    ║
║   │  │                                                                     │    │    ║
║   │  │  UI: tool card updates to "running"                                 │    │    ║
║   │  └─────────────────────────────────────────────────────────────────────┘    │    ║
║   │                          │                                                  │    ║
║   │       Vercel SDK now calls execute() on the tool object                     │    ║
║   │       (this happens INSIDE the stream, synchronously blocking it)           │    ║
║   │                          │                                                  │    ║
║   │                          ▼                                                  │    ║
║   │  ┌─────────────────────────────────────────────────────────────────────┐    │    ║
║   │  │  TOOL EXECUTION (3 layers deep)                                     │    │    ║
║   │  │                                                                     │    │    ║
║   │  │  ┌─── Layer 1: prompt.ts:792 wrapper ────────────────────────┐     │    │    ║
║   │  │  │                                                            │     │    │    ║
║   │  │  │  args = { query: "something" }                             │     │    │    ║
║   │  │  │  options = { toolCallId: "toolu_01X", abortSignal }        │     │    │    ║
║   │  │  │                                                            │     │    │    ║
║   │  │  │  1. Build Tool.Context:                                    │     │    │    ║
║   │  │  │     ctx = {                                                │     │    │    ║
║   │  │  │       sessionID: "sess_abc",                               │     │    │    ║
║   │  │  │       messageID: "msg_002",                                │     │    │    ║
║   │  │  │       agent: "coder",                                      │     │    │    ║
║   │  │  │       abort: AbortSignal,                                  │     │    │    ║
║   │  │  │       callID: "toolu_01X",                                 │     │    │    ║
║   │  │  │       messages: [...all session messages...],              │     │    │    ║
║   │  │  │       metadata: fn → streams progress to UI,               │     │    │    ║
║   │  │  │       ask: fn → permission system,                         │     │    │    ║
║   │  │  │     }                                                      │     │    │    ║
║   │  │  │                                                            │     │    │    ║
║   │  │  │  2. Plugin.trigger("tool.execute.before")                  │     │    │    ║
║   │  │  │                                                            │     │    │    ║
║   │  │  │  3. Call item.execute(args, ctx) ──────────────────┐       │     │    │    ║
║   │  │  │                                                    │       │     │    │    ║
║   │  │  │  4. Plugin.trigger("tool.execute.after")    ◄──────┤       │     │    │    ║
║   │  │  │                                                    │       │     │    │    ║
║   │  │  │  5. Return result                                  │       │     │    │    ║
║   │  │  └────────────────────────────────────────────────────┼───────┘     │    │    ║
║   │  │                                                       │             │    │    ║
║   │  │  ┌─── Layer 2: tool.ts:54 Tool.define wrapper ───────▼────────┐    │    │    ║
║   │  │  │                                                             │    │    │    ║
║   │  │  │  1. Zod validation:                                         │    │    │    ║
║   │  │  │     toolInfo.parameters.parse({ query: "something" })       │    │    │    ║
║   │  │  │                                                             │    │    ║
║   │  │  │     ✓ passes → continue                                     │    │    │    ║
║   │  │  │     ✗ fails  → throw "The websearch tool was called         │    │    │    ║
║   │  │  │                with invalid arguments: ...                   │    │    │    ║
║   │  │  │                Please rewrite the input so it satisfies      │    │    │    ║
║   │  │  │                the expected schema."                         │    │    │    ║
║   │  │  │                (LLM sees this error and retries)             │    │    │    ║
║   │  │  │                                                             │    │    │    ║
║   │  │  │  2. Call actual execute(args, ctx) ──────────┐              │    │    │    ║
║   │  │  │                                              │              │    │    │    ║
║   │  │  │  3. Truncate.output(result)           ◄──────┤              │    │    │    ║
║   │  │  │     If output > MAX_LINES/MAX_BYTES:         │              │    │    │    ║
║   │  │  │       truncate + set metadata.truncated      │              │    │    │    ║
║   │  │  │                                              │              │    │    │    ║
║   │  │  │  4. Return result                            │              │    │    │    ║
║   │  │  └──────────────────────────────────────────────┼──────────────┘    │    │    ║
║   │  │                                                 │                   │    │    ║
║   │  │  ┌─── Layer 3: websearch.ts:65 actual tool ─────▼──────────────┐   │    │    ║
║   │  │  │                                                              │   │    │    ║
║   │  │  │  params = { query: "something" }                             │   │    │    ║
║   │  │  │                                                              │   │    │    ║
║   │  │  │  1. PERMISSION CHECK                                         │   │    │    ║
║   │  │  │     ctx.ask({                                                │   │    │    ║
║   │  │  │       permission: "websearch",                               │   │    │    ║
║   │  │  │       patterns: ["something"],                               │   │    │    ║
║   │  │  │       always: ["*"],               ← auto-allow everything   │   │    │    ║
║   │  │  │     })                                                       │   │    │    ║
║   │  │  │     → Checks against agent's permission ruleset              │   │    │    ║
║   │  │  │     → "websearch" + always:["*"] = auto-allowed, no prompt   │   │    │    ║
║   │  │  │                                                              │   │    │    ║
║   │  │  │  2. BUILD HTTP REQUEST                                       │   │    │    ║
║   │  │  │     {                                                        │   │    │    ║
║   │  │  │       jsonrpc: "2.0",                                        │   │    │    ║
║   │  │  │       method: "tools/call",                                  │   │    │    ║
║   │  │  │       params: {                                              │   │    │    ║
║   │  │  │         name: "web_search_exa",                              │   │    │    ║
║   │  │  │         arguments: {                                         │   │    │    ║
║   │  │  │           query: "something",                                │   │    │    ║
║   │  │  │           type: "auto",                                      │   │    │    ║
║   │  │  │           numResults: 8,                                     │   │    │    ║
║   │  │  │           livecrawl: "fallback"                              │   │    │    ║
║   │  │  │         }                                                    │   │    │    ║
║   │  │  │       }                                                      │   │    │    ║
║   │  │  │     }                                                        │   │    │    ║
║   │  │  │                                                              │   │    │    ║
║   │  │  │  3. HTTP CALL (25s timeout)                                  │   │    │    ║
║   │  │  │     fetch("https://mcp.exa.ai/mcp", {                       │   │    │    ║
║   │  │  │       method: "POST",                                        │   │    │    ║
║   │  │  │       body: JSON.stringify(searchRequest)                    │   │    │    ║
║   │  │  │     })                                                       │   │    │    ║
║   │  │  │              │                                               │   │    │    ║
║   │  │  │              ▼                                               │   │    │    ║
║   │  │  │     Exa API responds with SSE:                               │   │    │    ║
║   │  │  │     data: {"result":{"content":[{"text":"1. Example..."}]}}  │   │    │    ║
║   │  │  │              │                                               │   │    │    ║
║   │  │  │              ▼                                               │   │    │    ║
║   │  │  │  4. PARSE & RETURN                                           │   │    │    ║
║   │  │  │     return {                                                 │   │    │    ║
║   │  │  │       output: "1. Example.com - Something interesting...",    │   │    │    ║
║   │  │  │       title: "Web search: something",                        │   │    │    ║
║   │  │  │       metadata: {}                                           │   │    │    ║
║   │  │  │     }                                                        │   │    │    ║
║   │  │  └──────────────────────────────────────────────────────────────┘   │    │    ║
║   │  │                                                                     │    │    ║
║   │  │  Return value bubbles back through all 3 layers:                    │    │    ║
║   │  │  {                                                                  │    │    ║
║   │  │    output: "1. Example.com - Something interesting...",             │    │    ║
║   │  │    title: "Web search: something",                                  │    │    ║
║   │  │    metadata: { truncated: false }                                   │    │    ║
║   │  │  }                                                                  │    │    ║
║   │  └─────────────────────────────────────────────────────────────────────┘    │    ║
║   │                          │                                                  │    ║
║   │       Vercel SDK receives the return, emits more events                     │    ║
║   │                          │                                                  │    ║
║   │                          ▼                                                  │    ║
║   │  ┌─────────────────────────────────────────────────────────────────────┐    │    ║
║   │  │  EVENT: tool-result                                                 │    │    ║
║   │  │                                                                     │    │    ║
║   │  │  value = {                                                          │    │    ║
║   │  │    toolCallId: "toolu_01X",                                         │    │    ║
║   │  │    output: {                                                        │    │    ║
║   │  │      output: "1. Example.com - Something interesting...",           │    │    ║
║   │  │      title: "Web search: something",                                │    │    ║
║   │  │      metadata: { truncated: false }                                 │    │    ║
║   │  │    }                                                                │    │    ║
║   │  │  }                                                                  │    │    ║
║   │  │                                                                     │    │    ║
║   │  │  → Updates ToolPart in DB:                                          │    │    ║
║   │  │    state: {                                                         │    │    ║
║   │  │      status: "completed",           ← was "running"                 │    │    ║
║   │  │      input: { query: "something" },                                 │    │    ║
║   │  │      output: "1. Example.com - Something interesting...",           │    │    ║
║   │  │      title: "Web search: something",                                │    │    ║
║   │  │      metadata: { truncated: false },                                │    │    ║
║   │  │      time: { start: 1709467202000, end: 1709467205000 }            │    │    ║
║   │  │    }                                                                │    │    ║
║   │  │                                                                     │    │    ║
║   │  │  UI: tool card turns green, shows output                            │    │    ║
║   │  └─────────────────────────────────────────────────────────────────────┘    │    ║
║   │                          │                                                  │    ║
║   │                          ▼                                                  │    ║
║   │  ┌─────────────────────────────────────────────────────────────────────┐    │    ║
║   │  │  EVENT: finish-step                                                 │    │    ║
║   │  │                                                                     │    │    ║
║   │  │  value = {                                                          │    │    ║
║   │  │    finishReason: "tool-calls",      ← Claude stopped to use tool    │    │    ║
║   │  │    usage: { promptTokens: 1200, completionTokens: 89 }             │    │    ║
║   │  │  }                                                                  │    │    ║
║   │  │                                                                     │    │    ║
║   │  │  → assistantMessage.finish = "tool-calls"                           │    │    ║
║   │  │  → assistantMessage.tokens = { input: 1200, output: 89 }           │    │    ║
║   │  │  → assistantMessage.cost += calculated cost                         │    │    ║
║   │  │  → Session.updateMessage(assistantMessage)                          │    │    ║
║   │  └─────────────────────────────────────────────────────────────────────┘    │    ║
║   │                                                                             │    ║
║   │  Stream ends. for-await loop exits.                                         │    ║
║   │  processor.process() returns "continue"                                     │    ║
║   └─────────────────────────────────────────────────────────────────────────────┘    ║
║                                        │                                            ║
║                                        ▼                                            ║
║   ┌─────────────────────────────────────────────────────────────────────────────┐    ║
║   │  LOOP DECISION                                                              │    ║
║   │                                                                             │    ║
║   │  processor.message.finish = "tool-calls"                                    │    ║
║   │  Is it in ["tool-calls", "unknown"]?  →  YES  →  continue while loop       │    ║
║   │                                                                             │    ║
║   │  ════════════════════ ITERATION 2 BEGINS ══════════════════════             │    ║
║   │                                                                             │    ║
║   │  Goes back to PHASE 1: loads messages (now includes tool result)            │    ║
║   │  PHASE 2-3: same system prompt, same tools                                  │    ║
║   │  PHASE 4: toModelMessages() now produces:                                   │    ║
║   │    [                                                                        │    ║
║   │      { role: "user", content: "search me something" },                      │    ║
║   │      { role: "assistant", content: [                                        │    ║
║   │          { type: "text", text: "I'll search that for you." },               │    ║
║   │          { type: "tool-call", toolName: "websearch",                        │    ║
║   │            toolCallId: "toolu_01X", input: { query: "something" } }         │    ║
║   │      ] },                                                                   │    ║
║   │      { role: "tool", content: [                                             │    ║
║   │          { type: "tool-result", toolCallId: "toolu_01X",                    │    ║
║   │            output: "1. Example.com - Something interesting..." }             │    ║
║   │      ] }                                                                    │    ║
║   │    ]                                                                        │    ║
║   │                                                                             │    ║
║   │  PHASE 5: streamText() with full history including tool result              │    ║
║   │           Claude sees the search results, writes final answer               │    ║
║   │                                                                             │    ║
║   │  PHASE 6: events:                                                           │    ║
║   │    text-start → text-delta ("Here's what I found...") → text-end            │    ║
║   │    finish-step: finishReason = "end_turn"                                   │    ║
║   │                                                                             │    ║
║   │  processor.process() returns "continue"                                     │    ║
║   └─────────────────────────────────────────────────────────────────────────────┘    ║
║                                        │                                            ║
║                                        ▼                                            ║
║   ┌─────────────────────────────────────────────────────────────────────────────┐    ║
║   │  LOOP DECISION                                                              │    ║
║   │                                                                             │    ║
║   │  processor.message.finish = "end_turn"                                      │    ║
║   │  Is it in ["tool-calls", "unknown"]?  →  NO  →  BREAK                      │    ║
║   └─────────────────────────────────────────────────────────────────────────────┘    ║
║                                                                                     ║
║   } // end while(true)                                                              ║
║                                                                                     ║
╚═════════════════════════════════════════════════════════════════════════════════════╝
                                        │
                                        ▼
                    ┌───────────────────────────────────────┐
                    │     DONE                               │
                    │                                        │
                    │  User sees:                            │
                    │    "I'll search that for you."          │
                    │    [websearch: completed ✓]             │
                    │    "Here's what I found: ..."           │
                    └───────────────────────────────────────┘
```

---

## Key Files

| File | Role |
|------|------|
| `cli/cmd/tui/component/prompt/index.tsx` | User input capture |
| `server/routes/session.ts` | HTTP route, calls SessionPrompt.prompt() |
| `session/prompt.ts:158` | `prompt()` — creates user message, starts loop |
| `session/prompt.ts:274` | `loop()` — the while(true) orchestrator |
| `session/prompt.ts:736` | `resolveTools()` — builds tools map with execute closures |
| `session/processor.ts` | Consumes stream events, updates DB parts |
| `session/llm.ts:172` | `LLM.stream()` — calls Vercel's streamText() |
| `session/message-v2.ts:496` | `toModelMessages()` — internal format → AI SDK format |
| `tool/tool.ts:54` | `Tool.define()` — Zod validation + truncation wrapper |
| `tool/registry.ts` | Tool registration, init, Zod→JSON Schema conversion |
| `tool/*.ts` | Individual tool implementations |

---

## All Built-in Tools and Their APIs

### bash
```
command:     string    — the shell command to execute
description: string    — 5-10 word description
timeout?:    number    — ms (default 120000)
workdir?:    string    — working directory
```
Returns: `{ output: stdout+stderr, exit: number, description }`

### read
```
filePath:  string    — absolute path to file or directory
offset?:   number    — start line (1-indexed)
limit?:    number    — max lines (default 2000)
```
Returns: `{ preview: first 20 lines, truncated, loaded: instruction files[] }`

### write
```
filePath:  string    — absolute path
content:   string    — full file content
```
Returns: `{ diagnostics: LSP diagnostics, filepath, exists: bool }`

### edit
```
filePath:    string  — absolute path
oldString:   string  — text to find
newString:   string  — replacement
replaceAll?: boolean — replace all (default false)
```
Returns: `{ diagnostics, diff, filediff: { file, before, after, additions, deletions } }`

### glob
```
pattern:  string    — glob pattern (e.g. "**/*.ts")
path?:    string    — directory to search in
```
Returns: `{ count, truncated }`

### grep
```
pattern:  string    — regex pattern
path?:    string    — directory to search in
include?: string    — file filter (e.g. "*.ts")
```
Returns: `{ matches: number, truncated }`

### task
```
description:    string  — 3-5 word summary
prompt:         string  — full task prompt
subagent_type:  string  — agent type
task_id?:       string  — resume previous
```
Returns: `{ sessionId, model: { modelID, providerID } }`

### webfetch
```
url:      string                        — URL to fetch
format?:  "text" | "markdown" | "html"  — default "markdown"
timeout?: number                        — seconds (max 120)
```
Returns: `{}`

### websearch
```
query:                 string
numResults?:           number                    — default 8
livecrawl?:            "fallback" | "preferred"
type?:                 "auto" | "fast" | "deep"
contextMaxCharacters?: number                    — default 10000
```
Returns: `{}`

### codesearch
```
query:      string  — search for APIs/libraries/SDKs
tokensNum?: number  — 1000-50000, default 5000
```
Returns: `{}`

### todowrite
```
todos: Array<{
  content:  string
  status:   "pending" | "in_progress" | "completed" | "cancelled"
  priority: "high" | "medium" | "low"
}>
```
Returns: `{ todos }`

### question
```
questions: Array<{
  question: string
  header:   string     — max 30 chars
  options:  Array<{ label, description }>
  multiple?: boolean
}>
```
Returns: `{ answers: Array<string[]> }`

### skill
```
name: string  — skill name
```
Returns: `{ name, dir }`

### lsp (experimental)
```
operation:  "goToDefinition" | "findReferences" | "hover" | ...
filePath:   string
line:       number    — 1-based
character:  number    — 1-based
```
Returns: `{ result: unknown[] }`

### batch (experimental)
```
tool_calls: Array<{
  tool:       string
  parameters: object
}>
```
Returns: `{ totalCalls, successful, failed, tools, details }`

### apply_patch (GPT models only)
```
patchText: string  — unified diff
```
Returns: `{ diff, files: Array<{ filePath, type, additions, deletions, ... }>, diagnostics }`
