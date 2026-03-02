import {
  AssistantRuntimeProvider,
  makeAssistantToolUI,
  type ThreadMessageLike,
  useExternalStoreRuntime,
} from '@assistant-ui/react';
import { AlertTriangle, Cloud, Droplets, Thermometer, Wind } from 'lucide-react';
import type { FC } from 'react';
import { Thread } from '@/components/assistant-ui/thread';

// ═══════════════════════════════════════════════════════
// Custom Tool UIs (via makeAssistantToolUI)
// ═══════════════════════════════════════════════════════

type WeatherArgs = { location: string; unit?: string };
type WeatherResult = {
  temperature: number;
  condition: string;
  humidity: number;
  wind_speed: number;
};

const WeatherToolUI = makeAssistantToolUI<WeatherArgs, WeatherResult>({
  toolName: 'get_weather',
  render: ({ args, result, status }) => {
    if (status.type === 'running') {
      return (
        <div className="my-2 animate-pulse rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Fetching weather for {args.location}...</p>
        </div>
      );
    }
    if (!result) return null;
    return (
      <div className="my-2 rounded-xl border bg-gradient-to-br from-blue-2 to-blue-3 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Cloud className="size-5 text-blue-9" />
          <span className="font-semibold text-sm">{args.location}</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2">
            <Thermometer className="size-4 text-red-9" />
            <span className="text-sm">
              {result.temperature}&deg;
              {args.unit === 'fahrenheit' ? 'F' : 'C'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Cloud className="size-4 text-blue-9" />
            <span className="text-sm">{result.condition}</span>
          </div>
          <div className="flex items-center gap-2">
            <Droplets className="size-4 text-blue-9" />
            <span className="text-sm">{result.humidity}%</span>
          </div>
          <div className="flex items-center gap-2">
            <Wind className="size-4 text-blue-9" />
            <span className="text-sm">{result.wind_speed} km/h</span>
          </div>
        </div>
      </div>
    );
  },
});

type StockArgs = { symbol: string };
type StockResult = string;

const StockToolUI = makeAssistantToolUI<StockArgs, StockResult>({
  toolName: 'get_stock_price',
  render: ({ args, result, status, isError }) => {
    if (status.type === 'running') {
      return (
        <div className="my-2 animate-pulse rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Looking up {args.symbol}...</p>
        </div>
      );
    }
    if (isError) {
      return (
        <div className="my-2 rounded-xl border border-red-6 bg-red-2 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-red-9" />
            <span className="text-sm font-medium text-red-11">Failed to fetch {args.symbol}</span>
          </div>
          <p className="mt-1 text-xs text-red-10">{result}</p>
        </div>
      );
    }
    return null;
  },
});

// ═══════════════════════════════════════════════════════
// Dummy Messages — showcases all available UI elements
// ═══════════════════════════════════════════════════════

const demoMessages: ThreadMessageLike[] = [
  // ── 1. User greeting ──────────────────────────────
  {
    id: 'msg-1',
    role: 'user',
    content: 'Hello! Show me all your formatting capabilities.',
    createdAt: new Date('2026-02-22T10:00:00'),
  },

  // ── 2. Rich markdown response ─────────────────────
  {
    id: 'msg-2',
    role: 'assistant',
    content: [
      {
        type: 'text',
        text: `# Welcome! Here's What I Can Do

I'm an AI assistant with **rich formatting** capabilities. Let me demonstrate *everything*:

## Text Formatting

You can use **bold**, *italic*, ~~strikethrough~~, and \`inline code\`. Here's a [link to docs](https://assistant-ui.com).

> "The best way to predict the future is to invent it." — Alan Kay

## Lists

### Unordered
- First item with **bold text**
- Second item with \`code\`
- Third item
  - Nested item A
  - Nested item B

### Ordered
1. Install dependencies
2. Configure the runtime
3. Build your UI

## Code Blocks

\`\`\`typescript
import { useExternalStoreRuntime } from "@assistant-ui/react";

const runtime = useExternalStoreRuntime({
  messages: myMessages,
  isRunning: false,
  onNew: async (msg) => {
    // handle new message
  },
});
\`\`\`

\`\`\`python
def fibonacci(n: int) -> list[int]:
    """Generate fibonacci sequence."""
    seq = [0, 1]
    for _ in range(n - 2):
        seq.append(seq[-1] + seq[-2])
    return seq
\`\`\`

## Table

| Feature | Status | Notes |
|---------|--------|-------|
| Markdown | Done | Full GFM support |
| Tool UI | Done | Custom & fallback |
| Streaming | Done | Real-time updates |
| Attachments | Done | Images & files |

---

That covers the main formatting options! Ask me anything.`,
      },
    ],
    createdAt: new Date('2026-02-22T10:00:05'),
  },

  // ── 3. User triggers multiple tools ───────────────
  {
    id: 'msg-3',
    role: 'user',
    content: "What's the weather in Tokyo? Also search for nearby restaurants.",
    createdAt: new Date('2026-02-22T10:01:00'),
  },

  // ── 4. Custom tool UI + fallback tool UI ──────────
  {
    id: 'msg-4',
    role: 'assistant',
    content: [
      {
        type: 'tool-call',
        toolCallId: 'tc-weather-1',
        toolName: 'get_weather',
        args: { location: 'Tokyo, Japan', unit: 'celsius' },
        result: {
          temperature: 22,
          condition: 'Partly Cloudy',
          humidity: 65,
          wind_speed: 12,
        },
      },
      {
        type: 'tool-call',
        toolCallId: 'tc-search-1',
        toolName: 'search_restaurants',
        args: {
          query: 'best restaurants near Tokyo',
          limit: 3,
          cuisine: 'japanese',
        },
        result: {
          results: [
            { name: 'Sukiyabashi Jiro', rating: 4.9, cuisine: 'Sushi' },
            { name: 'Narisawa', rating: 4.8, cuisine: 'Innovative' },
            { name: 'Den', rating: 4.7, cuisine: 'Japanese' },
          ],
        },
      },
      {
        type: 'text',
        text: "Here's what I found! Tokyo is **22°C** and **Partly Cloudy** today — perfect weather for dining out. I've found 3 top-rated restaurants for you above.",
      },
    ],
    createdAt: new Date('2026-02-22T10:01:10'),
  },

  // ── 5. User asks for data analysis ────────────────
  {
    id: 'msg-5',
    role: 'user',
    content: 'Can you analyze some sales data and run a SQL query for the top products?',
    createdAt: new Date('2026-02-22T10:02:00'),
  },

  // ── 6. Multiple fallback tool calls + code block ──
  {
    id: 'msg-6',
    role: 'assistant',
    content: [
      {
        type: 'tool-call',
        toolCallId: 'tc-analyze-1',
        toolName: 'analyze_data',
        args: {
          dataset: 'sales_2026_q1',
          metrics: ['revenue', 'units_sold', 'avg_price'],
          group_by: 'product_category',
        },
        result: {
          total_revenue: '$2.4M',
          top_category: 'Electronics',
          growth_rate: '+18.5%',
          records_analyzed: 15420,
        },
      },
      {
        type: 'tool-call',
        toolCallId: 'tc-query-1',
        toolName: 'run_sql_query',
        args: {
          query:
            'SELECT product_name, SUM(revenue) as total FROM sales GROUP BY product_name ORDER BY total DESC LIMIT 5',
          database: 'analytics_prod',
        },
        result: {
          columns: ['product_name', 'total'],
          rows: [
            ['MacBook Pro 16"', '$485,200'],
            ['iPhone 16 Pro', '$392,100'],
            ['AirPods Max', '$215,800'],
            ['iPad Air', '$189,300'],
            ['Apple Watch Ultra', '$156,700'],
          ],
        },
      },
      {
        type: 'text',
        text: `## Analysis Results

The Q1 2026 sales data shows strong performance:

- **Total Revenue**: $2.4M (+18.5% YoY)
- **Top Category**: Electronics
- **Records Analyzed**: 15,420

The top 5 products by revenue are shown in the query results above. The \`MacBook Pro 16"\` leads with **$485,200** in total revenue.

\`\`\`sql
-- Query used:
SELECT product_name, SUM(revenue) as total
FROM sales
GROUP BY product_name
ORDER BY total DESC
LIMIT 5;
\`\`\``,
      },
    ],
    createdAt: new Date('2026-02-22T10:02:15'),
  },

  // ── 7. User asks about stocks ─────────────────────
  {
    id: 'msg-7',
    role: 'user',
    content: 'What about stock prices for AAPL?',
    createdAt: new Date('2026-02-22T10:03:00'),
  },

  // ── 8. Tool call with error (custom UI) ───────────
  {
    id: 'msg-8',
    role: 'assistant',
    content: [
      {
        type: 'tool-call',
        toolCallId: 'tc-stock-1',
        toolName: 'get_stock_price',
        args: { symbol: 'AAPL' },
        result: 'API rate limit exceeded. Please try again in 60 seconds.',
        isError: true,
      },
      {
        type: 'text',
        text: "I wasn't able to fetch the stock price for **AAPL** right now due to an API rate limit. Please try again in about a minute.",
      },
    ],
    createdAt: new Date('2026-02-22T10:03:10'),
  },

  // ── 9. User asks to try something else ────────────
  {
    id: 'msg-9',
    role: 'user',
    content: 'Try fetching cryptocurrency prices instead.',
    createdAt: new Date('2026-02-22T10:04:00'),
  },

  // ── 10. Cancelled tool call ───────────────────────
  {
    id: 'msg-10',
    role: 'assistant',
    content: [
      {
        type: 'tool-call',
        toolCallId: 'tc-crypto-1',
        toolName: 'fetch_crypto_prices',
        args: {
          symbols: ['BTC', 'ETH', 'SOL'],
          currency: 'USD',
        },
      },
    ],
    status: { type: 'incomplete', reason: 'cancelled' },
    createdAt: new Date('2026-02-22T10:04:05'),
  },
];

// ═══════════════════════════════════════════════════════
// Demo Chat Component
// ═══════════════════════════════════════════════════════

export const DemoChat: FC = () => {
  const runtime = useExternalStoreRuntime({
    messages: demoMessages,
    convertMessage: (msg) => msg,
    isRunning: false,
    onNew: async () => {},
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <WeatherToolUI />
      <StockToolUI />
      <div className="h-screen">
        <Thread />
      </div>
    </AssistantRuntimeProvider>
  );
};
