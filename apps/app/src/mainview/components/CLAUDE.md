## UI Components

Components have no knowledge of external data sources or transport protocols. They consume clean, pre-computed state through props and selectors — all domain logic and data transformation belongs in the store layer.

## Component Types

| Type | Responsibilities |
|---|---|
| **Pure** | Single visual element. Props only. No state, no hooks, no store, no side effects. Reusable anywhere. |
| **Bubble** | Visual container for a message. Background, padding, border-radius, avatar. Accepts children. Knows nothing about what's inside it. |
| **Message** | The integration point. Connects data (hooks, store) to UI. Decides what content goes inside the Bubble. Only component that touches business logic. |
| **Panel** | The list. Scroll, fetch, grouping. Passes data down to Messages. Knows nothing about how a message looks. |
