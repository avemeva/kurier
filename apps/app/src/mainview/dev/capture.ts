/**
 * Dev-only fixture capture tool.
 * Cmd+Shift+C enters capture mode — hover to highlight messages, click to capture.
 * Captured fixtures are written to public/dev/fixtures/ via the Vite middleware.
 */

import { selectChatMessages, selectSelectedChat, useChatStore } from '@/data';
import type { TGContent, TGMessage } from '@/data/types/tg';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Find the closest message wrapper element (div with id="msg-<id>"). */
function findMessageElement(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  const el = target.closest<HTMLElement>('[id^="msg-"]');
  return el ?? null;
}

/** Extract the numeric message ID from "msg-123" format. */
function parseMessageId(el: HTMLElement): number {
  const id = el.id.replace('msg-', '');
  return Number.parseInt(id, 10) || 0;
}

/** Collect all media URLs referenced in a TGMessage. */
function collectMediaUrls(msg: TGMessage): string[] {
  if (msg.kind !== 'message') return [];
  const urls: string[] = [];

  // Sender avatar
  if (msg.sender.photoUrl) urls.push(msg.sender.photoUrl);
  // Forward avatar
  if (msg.forward?.photoUrl) urls.push(msg.forward.photoUrl);
  // Reply thumbnail
  if (msg.replyTo?.thumbUrl) urls.push(msg.replyTo.thumbUrl);

  // Content media
  collectContentMediaUrls(msg.content, urls);

  return urls;
}

function collectContentMediaUrls(content: TGContent, urls: string[]): void {
  switch (content.kind) {
    case 'photo':
    case 'video':
    case 'animation':
    case 'videoNote':
      if (content.media.url) urls.push(content.media.url);
      break;
    case 'sticker':
      if (content.url) urls.push(content.url);
      break;
    case 'voice':
      if (content.url) urls.push(content.url);
      break;
    case 'album':
      for (const item of content.items) {
        if (item.url) urls.push(item.url);
      }
      break;
    case 'text':
      if (content.webPreview?.thumbUrl) urls.push(content.webPreview.thumbUrl);
      break;
  }
}

/** Fetch a URL as a base64 data URL. */
async function fetchAsBase64(url: string): Promise<{ filename: string; dataUrl: string } | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    const ext = guessExtension(blob.type, url);
    const filename = slugifyUrl(url) + ext;
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve({ filename, dataUrl: reader.result as string });
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function guessExtension(mimeType: string, url: string): string {
  const mimeMap: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'audio/ogg': '.ogg',
    'application/json': '.json',
    'video/webm': '.webm',
  };
  if (mimeMap[mimeType]) return mimeMap[mimeType] as string;
  // Try from URL
  const match = url.match(/\.(\w{2,4})(?:\?|$)/);
  if (match) return `.${match[1]}`;
  return '.bin';
}

function slugifyUrl(url: string): string {
  // Extract just the last path segment or a hash of the URL
  const lastSegment = url.split('/').pop()?.split('?')[0] ?? '';
  const name = lastSegment.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
  return name || `media_${Date.now()}`;
}

/** Rewrite media URLs in TGMessage to point to local fixture media paths. */
function rewriteMediaUrls(
  msg: TGMessage,
  urlToFilename: Map<string, string>,
  fixtureName: string,
): TGMessage {
  if (msg.kind !== 'message') return msg;

  const rewrite = (url: string | undefined): string | undefined => {
    if (!url) return url;
    const filename = urlToFilename.get(url);
    return filename ? `/dev/fixtures/${fixtureName}/media/${filename}` : url;
  };

  const sender = msg.sender.photoUrl
    ? { ...msg.sender, photoUrl: rewrite(msg.sender.photoUrl) }
    : msg.sender;

  const forward = msg.forward?.photoUrl
    ? { ...msg.forward, photoUrl: rewrite(msg.forward.photoUrl) }
    : msg.forward;

  const replyTo = msg.replyTo?.thumbUrl
    ? { ...msg.replyTo, thumbUrl: rewrite(msg.replyTo.thumbUrl) }
    : msg.replyTo;

  const content = rewriteContentUrls(msg.content, rewrite);

  return { ...msg, sender, forward, replyTo, content };
}

function rewriteContentUrls(
  content: TGContent,
  rewrite: (url: string | undefined) => string | undefined,
): TGContent {
  switch (content.kind) {
    case 'photo':
    case 'video':
    case 'animation':
    case 'videoNote':
      return { ...content, media: { ...content.media, url: rewrite(content.media.url) } };
    case 'sticker':
      return { ...content, url: rewrite(content.url) };
    case 'voice':
      return { ...content, url: rewrite(content.url) };
    case 'album':
      return {
        ...content,
        items: content.items.map((item) => ({ ...item, url: rewrite(item.url) })),
      };
    case 'text':
      if (content.webPreview?.thumbUrl) {
        return {
          ...content,
          webPreview: { ...content.webPreview, thumbUrl: rewrite(content.webPreview.thumbUrl) },
        };
      }
      return content;
    default:
      return content;
  }
}

// ---------------------------------------------------------------------------
// Capture mode UI
// ---------------------------------------------------------------------------

let captureActive = false;
let overlayEl: HTMLDivElement | null = null;
let highlightEl: HTMLDivElement | null = null;
let currentHighlighted: HTMLElement | null = null;

function createOverlay(): HTMLDivElement {
  const el = document.createElement('div');
  el.id = 'capture-overlay';
  el.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0;
    z-index: 99999; pointer-events: none;
    background: rgba(59, 130, 246, 0.08);
    height: 32px; display: flex; align-items: center;
    justify-content: center; font-size: 12px;
    color: rgb(59, 130, 246); font-family: system-ui;
  `;
  el.textContent = 'Capture Mode — click a message to capture, Escape to cancel';
  document.body.appendChild(el);
  return el;
}

function createHighlight(): HTMLDivElement {
  const el = document.createElement('div');
  el.id = 'capture-highlight';
  el.style.cssText = `
    position: fixed; z-index: 99998; pointer-events: none;
    border: 2px solid rgb(59, 130, 246);
    border-radius: 8px; display: none;
    transition: all 0.1s ease;
  `;
  document.body.appendChild(el);
  return el;
}

function showHighlight(target: HTMLElement) {
  if (!highlightEl) return;
  const rect = target.getBoundingClientRect();
  highlightEl.style.display = 'block';
  highlightEl.style.top = `${rect.top}px`;
  highlightEl.style.left = `${rect.left}px`;
  highlightEl.style.width = `${rect.width}px`;
  highlightEl.style.height = `${rect.height}px`;
}

function hideHighlight() {
  if (highlightEl) highlightEl.style.display = 'none';
  currentHighlighted = null;
}

function cleanup() {
  captureActive = false;
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
  }
  if (highlightEl) {
    highlightEl.remove();
    highlightEl = null;
  }
  currentHighlighted = null;
  document.removeEventListener('mouseover', handleMouseOver, true);
  document.removeEventListener('click', handleClick, true);
  document.removeEventListener('keydown', handleEscape, true);
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

function handleMouseOver(e: MouseEvent) {
  const msgEl = findMessageElement(e.target);
  if (msgEl && msgEl !== currentHighlighted) {
    currentHighlighted = msgEl;
    showHighlight(msgEl);
  } else if (!msgEl) {
    hideHighlight();
  }
}

async function handleClick(e: MouseEvent) {
  e.preventDefault();
  e.stopPropagation();

  const msgEl = findMessageElement(e.target);
  if (!msgEl) return;

  const messageId = parseMessageId(msgEl);
  if (!messageId) {
    console.warn('[capture] Could not parse message ID from element:', msgEl.id);
    return;
  }

  try {
    await captureMessage(messageId);
  } catch (err) {
    console.error('[capture] Failed:', err);
    alert(`Capture failed: ${err}`);
  } finally {
    cleanup();
  }
}

function handleEscape(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault();
    cleanup();
  }
}

// ---------------------------------------------------------------------------
// Core capture logic
// ---------------------------------------------------------------------------

async function captureMessage(messageId: number) {
  const state = useChatStore.getState();

  // Read from the same selector the app uses — already converted, grouped (albums), hydrated
  const messages = selectChatMessages(state);
  const tgMsg = messages.find((m) => m.kind !== 'pending' && m.id === messageId);
  if (!tgMsg) throw new Error(`Message ${messageId} not found in selector output`);

  const selectedChat = selectSelectedChat(state);
  if (!selectedChat) throw new Error('No chat selected');

  // Log the full TGMessage state for debugging
  console.log('[capture] TGMessage state:', JSON.stringify(tgMsg, null, 2));

  // Prompt for fixture name
  const ts = new Date().toISOString().replace(/[:T]/g, '-').replace(/\..+/, '');
  const defaultName = `captured-${messageId}-${ts}`;
  const name = window.prompt('Fixture name:', defaultName);
  if (!name) return; // User cancelled

  // Fetch all media as base64
  const mediaUrls = collectMediaUrls(tgMsg);
  const mediaEntries: Record<string, string>[] = [];
  const urlToFilename = new Map<string, string>();

  for (const url of mediaUrls) {
    const result = await fetchAsBase64(url);
    if (result) {
      mediaEntries.push({ [result.filename]: result.dataUrl });
      urlToFilename.set(url, result.filename);
    }
  }

  // Rewrite URLs in TGMessage to point to local fixture media
  const rewrittenMsg = rewriteMediaUrls(tgMsg, urlToFilename, name);

  // Build fixture payload
  const fixture = {
    messages: [rewrittenMsg],
    chatKind: selectedChat.kind,
  };

  // POST to Vite middleware
  const resp = await fetch('/api/dev/fixture', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, fixture, media: mediaEntries }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Server responded ${resp.status}: ${errText}`);
  }

  const fixtureUrl = `${window.location.origin}/dev/fixture/${name}`;
  console.log(`[capture] Fixture "${name}" saved successfully`);
  console.log(`[capture] View: ${fixtureUrl}`);
  console.log('[capture] Fixture JSON:');
  console.dir(fixture, { depth: null });

  // Show a toast with clickable link instead of alert
  showCaptureToast(name, fixtureUrl);
}

function showCaptureToast(name: string, url: string) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed; bottom: 24px; right: 24px; z-index: 99999;
    background: #1a1a1a; color: #fff; border-radius: 12px;
    padding: 16px 20px; font-family: system-ui; font-size: 13px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.3); max-width: 400px;
    animation: slideUp 0.2s ease;
  `;
  toast.innerHTML = `
    <style>@keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }</style>
    <div style="font-weight:600; margin-bottom:8px;">Captured: ${name}</div>
    <a href="${url}" target="_blank" style="color:#60a5fa; text-decoration:underline; word-break:break-all;">${url}</a>
    <div style="margin-top:8px; color:#888; font-size:11px;">JSON logged to console</div>
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 8000);
  toast.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).tagName !== 'A') toast.remove();
  });
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

function enterCaptureMode() {
  if (captureActive) return;
  captureActive = true;
  overlayEl = createOverlay();
  highlightEl = createHighlight();
  document.addEventListener('mouseover', handleMouseOver, true);
  document.addEventListener('click', handleClick, true);
  document.addEventListener('keydown', handleEscape, true);
}

/** Set up the Ctrl+Shift+C keyboard shortcut for capture mode. */
export function initCapture() {
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'C') {
      e.preventDefault();
      enterCaptureMode();
    }
  });
  // Expose store for dev inspection (agent-browser eval, console debugging)
  (window as any).__DEV_STORE__ = useChatStore;
  (window as any).__DEV_SELECTORS__ = { selectChatMessages, selectSelectedChat };

  console.log('[capture] Fixture capture ready — press Ctrl+Shift+C to capture a message');
  console.log('[capture] Dev store exposed: __DEV_STORE__.getState(), __DEV_SELECTORS__');
}
