# DevPage Refactoring — Component Showcase

## Goal

A developer navigates to `/dev` and sees every visual state of Message and ChatSidebar rendered exactly as they appear in the real messenger. The page uses the same entry-point components the app uses (`Message` for chat bubbles, a new `PureChatRow` for sidebar rows), fed with crafted fixture data covering all 227 message variations and ~80 sidebar row variations. The layout follows shadcn/ui's documentation page structure: sticky header, left sidebar navigation, centered content area (max-w-[40rem]), right-side table of contents.

### Success criteria

```
bun run typecheck                          # exits 0
bun run dev:hmr                            # dev server starts
# navigate to http://<worktree>.localhost:1355/dev
# Page renders without console errors
# All sections visible in sidebar navigation
# Messages render with proper bubble alignment (left for incoming, right for outgoing)
# ChatSidebar rows render with all badge/avatar/preview combinations
# Each section has ≥1 example
# Resizable preview containers allow width testing
```

## Architecture

```
DevPage.tsx (route: /dev)
├── Header (sticky, logo + ThemeSwitcher)
├── Sidebar (sticky, anchor nav, IntersectionObserver active tracking)
├── Content (max-w-[40rem], scrollable)
│   ├── Messages section
│   │   ├── MessagePanel-like container (proper chat background + alignment)
│   │   │   └── <Message input={fixture} /> for each variation
│   │   └── Resizable wrapper per group
│   └── ChatSidebar section
│       └── <PureChatRow {...props} /> for each variation
└── TOC (sticky, xl+ only, "On This Page")

Data flow:
  dev-data.ts (UIMessage[] fixtures)  →  Message component  →  useMessage hook  →  layout selection  →  Pure* components
  dev-data.ts (PureChatRowProps[])    →  PureChatRow         →  visual output
```

### Constraints

- `html, body { overflow: hidden }` in index.css — DevPage root must use `position: fixed; inset: 0; overflow: auto` to break out
- Media URLs must be seeded into Zustand store via `useChatStore.getState().seedMedia()` before Message renders
- No MDX/fumadocs — everything is JSX (we're a Vite+React Router app, not Next.js)
- highlight.js already installed (not Shiki) — use for any code display later
- Pure component convention: files in `components/ui/chat/`, prefixed `Pure*`, no hooks, no store access, props only

## What's been done

- DevPage.tsx exists with shadcn-like 3-column layout (header, sidebar, content, TOC)
- dev-data.ts has ~28 UIMessage fixtures + 7 UIChat objects + media URLs + profile photos
- ComponentPreview.tsx exists (bordered card with label)
- Routing: `/dev` → lazy-loaded DevPage in main.tsx
- 227 message variations cataloged (from code analysis)
- ~80 sidebar row variations cataloged (from code analysis)
- PureChatRow extraction plan designed with 30-prop interface

## TODO

### Step 1: Extract PureChatRow from ChatSidebar

Extract the inline chat row JSX from `ChatSidebar.tsx` into a standalone pure component.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 1.1 | Create `PureChatRow` at `components/ui/chat/ChatRow.tsx` with props interface (30 primitive props, no store, no hooks) | `grep -c 'useChatStore\|useStore\|useEffect\|useState' apps/app/src/mainview/components/ui/chat/ChatRow.tsx` returns 0 | TODO |
| 1.2 | Move `ChatPreviewLine` and `SavedMessagesAvatar` into ChatRow.tsx as private helpers | `grep 'ChatPreviewLine\|SavedMessagesAvatar' apps/app/src/mainview/components/ui/chat/ChatRow.tsx` finds both | TODO |
| 1.3 | Extract `computeTypingText()` utility (resolves user names + action labels for group typing) | Function exists and is importable from ChatSidebar or a utility file | TODO |
| 1.4 | Replace inline row JSX in ChatSidebar.tsx with `<PureChatRow>` | `grep 'PureChatRow' apps/app/src/mainview/components/chat/ChatSidebar.tsx` finds usage | TODO |
| 1.5 | Wrap PureChatRow in React.memo | `grep 'memo' apps/app/src/mainview/components/ui/chat/ChatRow.tsx` finds it | TODO |
| 1.6 | App still works | `bun run typecheck` exits 0, existing e2e tests pass | TODO |

**PureChatRow props interface:**

```typescript
type PureChatRowProps = {
  chatId: number;
  title: string;
  kind: ChatKind; // 'private' | 'basicGroup' | 'supergroup' | 'channel'
  photoUrl?: string;
  isSavedMessages: boolean;
  isOnline: boolean;
  isBot: boolean;
  isPremium: boolean;
  emojiStatusId: string | null;
  lastMessageDate: number;
  lastMessageStatus: 'none' | 'sent' | 'read';
  typingText: string | null;          // non-null → show PureTypingIndicator
  draftText: string | null;
  lastMessagePreview: string;
  lastMessageSenderName: string | null;
  lastMessageContentKind: string | null;
  lastMessageIsForwarded: boolean;
  thumbUrl: string | null;
  isPinned: boolean;
  unreadCount: number;
  unreadMentionCount: number;
  unreadReactionCount: number;
  isSelected: boolean;
  onClick: () => void;
};
```

### Step 2: Build comprehensive UIMessage fixtures

Expand dev-data.ts from ~28 messages to ~100+ covering every content kind and overlay combination.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 2.1 | Text messages: incoming/outgoing × single/first/middle/last group position × plain/edited/with-views | Count text fixtures ≥ 12 | TODO |
| 2.2 | Entity messages: one message per entity type (bold, italic, code, pre, url, email, textUrl, strikethrough, underline, mention, hashtag, botCommand, spoiler, customEmoji) + one with all mixed | Count entity fixtures ≥ 15 | TODO |
| 2.3 | Photo messages: standalone landscape/portrait/no-dimensions, with caption, with reply, with forward, with sender name, outgoing sent/read, with reactions, with views | Count photo fixtures ≥ 10 | TODO |
| 2.4 | Video messages: standalone, with caption, outgoing | Count video fixtures ≥ 3 | TODO |
| 2.5 | GIF messages: standalone, with caption | Count GIF fixtures ≥ 2 | TODO |
| 2.6 | Sticker messages: incoming, outgoing, with reactions | Count sticker fixtures ≥ 3 | TODO |
| 2.7 | Voice messages: incoming/outgoing, short/long duration, with waveform data | Count voice fixtures ≥ 4 | TODO |
| 2.8 | VideoNote messages: incoming/outgoing | Count videoNote fixtures ≥ 2 | TODO |
| 2.9 | Link preview messages: small mode, large mode (showLargeMedia), with/without thumb | Count link preview fixtures ≥ 4 | TODO |
| 2.10 | Reply messages: text reply, reply with photo thumb, reply with video thumb, reply to voice | Count reply fixtures ≥ 4 | TODO |
| 2.11 | Forward messages: from user, from channel, from hidden user | Count forward fixtures ≥ 3 | TODO |
| 2.12 | Reaction messages: single chosen, single not chosen, multiple mixed | Count reaction fixtures ≥ 3 | TODO |
| 2.13 | Bot keyboard messages: text buttons, URL buttons, multi-row | Count bot keyboard fixtures ≥ 3 | TODO |
| 2.14 | Service messages: every type (join, leave, title change, photo change, pin, etc.) | Count service fixtures ≥ 8 | TODO |
| 2.15 | Pending messages: sending status, failed status | Count pending fixtures ≥ 2 | TODO |
| 2.16 | Fallback content kinds: document, audio, poll, contact, location, venue, dice, unsupported | Count fallback fixtures ≥ 8 | TODO |
| 2.17 | Album groups: 2-photo, 3-photo, 4-photo, mixed photo+video, with caption, outgoing | Count album groups ≥ 4 | TODO |
| 2.18 | Combo messages: text + reply + forward + reactions + bot keyboard (max overlay) | At least 1 fixture with all overlays | TODO |
| 2.19 | All media URLs registered in MEDIA_URLS for new fixtures | Every fixture with media has a corresponding dev asset or placeholder | TODO |

### Step 3: Build PureChatRow fixtures

Create fixture data for sidebar row variations.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 3.1 | Private chat: basic (photo, name, text preview, time) | Fixture exists | TODO |
| 3.2 | Private chat: online (green dot on avatar) | Fixture with `isOnline: true` | TODO |
| 3.3 | Private chat: premium (star badge) | Fixture with `isPremium: true` | TODO |
| 3.4 | Private chat: custom emoji status | Fixture with `emojiStatusId` set | TODO |
| 3.5 | Saved Messages (bookmark avatar, title override) | Fixture with `isSavedMessages: true` | TODO |
| 3.6 | Bot chat (bot icon) | Fixture with `isBot: true` | TODO |
| 3.7 | Group chat (users icon, sender prefix "Alice:") | Fixture with `kind: 'supergroup'`, `lastMessageSenderName` set | TODO |
| 3.8 | Channel (megaphone icon) | Fixture with `kind: 'channel'` | TODO |
| 3.9 | Outgoing: sent (single check) | Fixture with `lastMessageStatus: 'sent'` | TODO |
| 3.10 | Outgoing: read (double check blue) | Fixture with `lastMessageStatus: 'read'` | TODO |
| 3.11 | My message in group ("You: text") | Group fixture with outgoing last message | TODO |
| 3.12 | Photo preview (camera icon + thumbnail) | Fixture with `lastMessageContentKind: 'photo'`, `thumbUrl` set | TODO |
| 3.13 | Video preview (film icon) | Fixture with `lastMessageContentKind: 'video'` | TODO |
| 3.14 | Voice preview (mic icon) | Fixture with `lastMessageContentKind: 'voice'` | TODO |
| 3.15 | Document preview (file icon) | Fixture with `lastMessageContentKind: 'document'` | TODO |
| 3.16 | Sticker preview (emoji text) | Fixture with sticker content kind | TODO |
| 3.17 | Forwarded message (forward arrow icon) | Fixture with `lastMessageIsForwarded: true` | TODO |
| 3.18 | Draft (red "Draft:" prefix) | Fixture with `draftText` set | TODO |
| 3.19 | Typing indicator (replaces preview) | Fixture with `typingText: 'typing'` | TODO |
| 3.20 | Group typing ("Alice is typing") | Fixture with `typingText: 'Alice is typing'` | TODO |
| 3.21 | Unread count badge (number in circle) | Fixture with `unreadCount: 5` | TODO |
| 3.22 | Mention badge (@ in blue circle) | Fixture with `unreadMentionCount: 1` | TODO |
| 3.23 | Reaction badge (heart in red circle) | Fixture with `unreadReactionCount: 1` | TODO |
| 3.24 | All badges combined (@ + count + heart) | Fixture with all three > 0 | TODO |
| 3.25 | Pinned (pin icon, no unreads) | Fixture with `isPinned: true`, all counts 0 | TODO |
| 3.26 | Selected state (highlighted background) | Fixture with `isSelected: true` | TODO |
| 3.27 | Initials avatar (no photo, 2-letter) | Fixture without `photoUrl` | TODO |
| 3.28 | Time formats: HH:MM, weekday, date | Three fixtures with different `lastMessageDate` values | TODO |
| 3.29 | No last message (empty row) | Fixture with `lastMessageDate: 0`, empty preview | TODO |
| 3.30 | Typing: recording voice / sending photo / choosing sticker | Fixtures with different `typingText` values | TODO |

### Step 4: Rebuild DevPage with shadcn layout + real messenger appearance

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 4.1 | Page layout: sticky header + sidebar (18rem, lg+) + content (max-w-[40rem]) + TOC (18rem, xl+) | Visual inspection via browser screenshot | TODO |
| 4.2 | Sidebar: anchor links for each section, IntersectionObserver active tracking | Clicking sidebar link scrolls to section | TODO |
| 4.3 | TOC: "On This Page" with active heading highlight | Active heading updates on scroll | TODO |
| 4.4 | Messages render inside a MessagePanel-like container: proper chat background, left/right alignment, max-width constraints matching real messenger | Messages look identical to real chat view | TODO |
| 4.5 | Each message group wrapped in resizable container (resize-x, shows width in px) | Drag handle visible, width label updates | TODO |
| 4.6 | ChatSidebar rows render in a sidebar-width container (~320px) matching real sidebar appearance | Rows look identical to real sidebar | TODO |
| 4.7 | Store seeded with media URLs on mount | Photos/videos render with actual images | TODO |
| 4.8 | `overflow: hidden` on body is bypassed | Page scrolls | TODO |
| 4.9 | No console errors on page load | `page.on('console', ...)` in e2e test captures 0 errors | TODO |

### Step 5: Section structure for messages

Each section groups related variations. Within each section, messages render in a chat-like vertical flow (not isolated cards).

| # | Section | Fixture count | Status |
|---|---------|---------------|--------|
| 5.1 | Text Messages (incoming/outgoing, plain/edited/views, all group positions) | ~12 | TODO |
| 5.2 | Entities (one per entity type + mixed) | ~15 | TODO |
| 5.3 | Photos (standalone, caption, portrait, reply, forward, sender, outgoing, reactions) | ~10 | TODO |
| 5.4 | Videos (standalone, caption, outgoing) | ~3 | TODO |
| 5.5 | GIFs (standalone, caption) | ~2 | TODO |
| 5.6 | Stickers (incoming, outgoing, reactions) | ~3 | TODO |
| 5.7 | Voice Messages (incoming/outgoing, short/long, with waveform) | ~4 | TODO |
| 5.8 | Video Notes (incoming, outgoing) | ~2 | TODO |
| 5.9 | Link Previews (small, large, with/without thumb) | ~4 | TODO |
| 5.10 | Replies (text, photo thumb, video thumb, voice) | ~4 | TODO |
| 5.11 | Forwards (user, channel, hidden user) | ~3 | TODO |
| 5.12 | Reactions (chosen, not chosen, multiple) | ~3 | TODO |
| 5.13 | Bot Keyboards (text, URL, multi-row) | ~3 | TODO |
| 5.14 | Albums (2/3/4 photos, mixed, caption, outgoing) | ~4 | TODO |
| 5.15 | Service Messages (all types) | ~8 | TODO |
| 5.16 | Pending Messages (sending, failed) | ~2 | TODO |
| 5.17 | Fallback Content (document, audio, poll, contact, location, venue, dice, unsupported) | ~8 | TODO |
| 5.18 | Max Overlay Combo (text + reply + forward + reactions + keyboard) | ~1 | TODO |
| 5.19 | Group Positions (consecutive messages showing first/middle/last rounding) | ~4 | TODO |
| 5.20 | ChatSidebar Rows (all 30 variations from Step 3) | ~30 | TODO |

### Step 6: Update e2e tests

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 6.1 | Update dev-page.test.ts selectors to match new page structure | `bun run test -- dev-page` passes | TODO |
| 6.2 | Add test: all sidebar nav sections visible | Test checks section count matches expected | TODO |
| 6.3 | Add test: no console errors | Filter network errors, assert empty | TODO |
| 6.4 | Add test: photos load with valid dimensions | `naturalWidth > 0` for photo sections | TODO |
| 6.5 | Add test: ChatSidebar rows render | At least 10 `PureChatRow` elements visible | TODO |

## Context for future agents

### Instructions for agents
- Do not ask questions — figure it out yourself
- Run `bun run scripts/symbols.ts .` before any coding task to orient
- Check for `CLAUDE.md` in any directory before editing files in it
- Use `bun run typecheck` and `bun run lint` after every significant change
- The app has `overflow: hidden` on body — DevPage must use fixed positioning to scroll
- Media fixtures need both a UIMessage entry AND a MEDIA_URLS entry to render
- Use `bun run dev:hmr` with `run_in_background` to test (never pipe through head/tail)
- Worktree URL: `http://<worktree-name>.localhost:1355/dev`
- Do not stop until all TODOs are done
- Output COMPLETE when ALL steps are finished

### Key files

| File | Why |
|------|-----|
| `apps/app/src/mainview/pages/DevPage.tsx` | The dev page entry point (route: `/dev`) |
| `apps/app/src/mainview/pages/dev-data.ts` | UIMessage/UIChat fixture data + media URLs |
| `apps/app/src/mainview/pages/dev/ComponentPreview.tsx` | Preview card wrapper |
| `apps/app/src/mainview/components/chat/Message.tsx` | Message component — the primary entry point for rendering messages |
| `apps/app/src/mainview/hooks/useMessage.ts` | Hook that routes messages to layouts (service/pending/sticker/media/bubble/album) |
| `apps/app/src/mainview/components/chat/ChatSidebar.tsx` | Sidebar with inline row rendering (to be refactored) |
| `apps/app/src/mainview/components/ui/chat/Bubble.tsx` | PureBubble — 3 variants (filled/media/framed) × 4 group positions |
| `apps/app/src/mainview/components/ui/chat/ChatRow.tsx` | PureChatRow (TO BE CREATED in Step 1) |
| `apps/app/src/mainview/components/chat/FormattedText.tsx` | Entity rendering (14 types + spoiler toggle) |
| `apps/app/src/mainview/components/ui/chat/LinkPreviewCard.tsx` | Small/large link preview modes |
| `apps/app/src/mainview/components/ui/chat/ReplyHeader.tsx` | Reply previews with 10 media type icons |
| `apps/app/src/mainview/components/ui/chat/VoiceView.tsx` | Voice messages with waveform + transcription states |
| `apps/app/src/mainview/components/ui/chat/MessageTime.tsx` | Timestamp — 3 display types × status icons |
| `apps/app/src/mainview/components/ui/chat/ReactionBar.tsx` | Reaction pills (chosen/not-chosen) + picker |
| `apps/app/src/mainview/components/chat/AlbumGrid.tsx` | Album layouts (2-10 items) |
| `apps/app/src/mainview/lib/types/ui.ts` | UIMessage, UIChat, ChatKind type definitions |
| `apps/app/src/mainview/lib/types/convert.ts` | TDLib → UI type conversion, service message text extraction |
| `apps/app/src/mainview/main.tsx` | Route registration (DevPage at `/dev`) |
| `apps/app/src/mainview/index.css` | Global `overflow: hidden` that blocks DevPage scrolling |
| `apps/app/tests/e2e/dev-page.test.ts` | Playwright e2e tests for the dev page |

### Reference implementations

| Source | What to take |
|--------|-------------|
| `~/Projects/shadcn-ui/apps/v4/app/(app)/docs/[[...slug]]/page.tsx` | 3-column layout: sidebar + max-w-[40rem] content + TOC |
| `~/Projects/shadcn-ui/apps/v4/components/component-preview-tabs.tsx` | Preview card with rounded-xl border, centered content, code toggle pattern |
| `~/Projects/shadcn-ui/apps/v4/components/docs-sidebar.tsx` | Sticky sidebar with gradient blur top/bottom, gradient border line, active state |
| `~/Projects/shadcn-ui/apps/v4/components/docs-toc.tsx` | IntersectionObserver active heading tracking, sticky TOC |
| `~/Projects/shadcn-ui/apps/v4/components/copy-button.tsx` | Clipboard copy with checkmark feedback |

### Lessons learned

1. `/dev` route was previously hijacked by the registry-based DevLayout system — must ensure main.tsx routes `/dev` directly to DevPage.tsx
2. `overflow: hidden` on `html, body` (index.css line 292) blocks all scrolling — DevPage needs `position: fixed; inset: 0; overflow: auto` on its root
3. The sidebar row in ChatSidebar.tsx is NOT a pure component — it reads from store inline. Must extract to PureChatRow before it can be used on DevPage
4. UIMessage fixtures need matching entries in MEDIA_URLS map (keyed as `chatId_messageId`) for media to render
5. `groupUIMessages()` from `@/lib/types` groups consecutive messages with same non-zero `mediaAlbumId` into albums
6. Bubble `groupPosition` is not stored on UIMessage — it's computed by the MessagePanel from consecutive same-sender messages. DevPage must set it explicitly via the `groupPosition` prop on Message or render consecutive messages to trigger it naturally
7. `bun run test` uses vitest (not bare `bun test`), `bun run typecheck` for type checking
8. Color tokens: `sand-2`..`sand-12`, `text-text-primary/secondary/tertiary/quaternary`, `blue-11`, `bg-background`, `bg-message-own`, `bg-message-peer`
9. The `Message` component reads `groupPosition` from... actually it doesn't take groupPosition as a prop — it's passed through `MessageInput`. Need to verify how group positions propagate. The `useMessage` hook receives it from the parent `MessagePanel` which computes groups. For DevPage, we may need to either: (a) render messages in a list that auto-computes positions, or (b) add explicit position overrides
