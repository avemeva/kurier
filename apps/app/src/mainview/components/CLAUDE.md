## UI Components

Components have no knowledge of external data sources or transport protocols. They consume clean, pre-computed state through props and selectors — all domain logic and data transformation belongs in the store layer.

## Component Types

| Type | Responsibilities |
|---|---|
| **Pure** (`Pure*` prefix) | Props only. No state, no hooks, no store, no side effects. Reusable anywhere. All components below ChatView are pure. |
| **Bubble** | Visual container for a message. Background, padding, border-radius, avatar. Accepts children. Knows nothing about what's inside it. |
| **ChatView** (was MessagePanel) | The single store boundary. Reads all store state, triggers media loading for visible messages via IntersectionObserver, resolves per-message data via inline map lookups, passes fully resolved props to PureMessageRow. |
| **ScrollContainer** | Generic scrollable container. Stick-to-bottom, infinite scroll, scroll-to-message. Knows nothing about Telegram or messages. |
| **PureMessageRow** (was Message) | Pure rendering switch wrapped in React.memo. Receives fully resolved props, calls `computeMessageState()`, picks the right layout. Zero store access. |

## Skills

When working on components, use these skills (mandatory — not optional):
- `components-build` — composable component patterns, accessibility, styling, TypeScript props
- `frontend-design` — high-quality, production-grade UI design
- `web-design-guidelines` — Web Interface Guidelines compliance
- `vercel-react-best-practices` — React performance optimization
- `vercel-composition-patterns` — React composition patterns that scale
