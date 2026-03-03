/**
 * Markdown formatters for --markdown output mode.
 *
 * Pure functions: FlatMessage/FlatChat in → markdown string out.
 * All content flattening, album grouping, and name resolution
 * is handled upstream by flatten.ts — this is just presentation.
 */

import type { FlatChat, FlatMessage } from './flatten';
import type { PaginationMeta } from './output';

// --- Content formatting ---

function formatContentLine(msg: FlatMessage): string {
  if (!msg.content) return msg.text || '';

  let tag: string;

  switch (msg.content) {
    case 'photo':
      if (msg.photos) {
        tag = msg.photos
          .map((p) => (typeof p === 'string' ? `[photo → ${p}]` : '[photo]'))
          .join('\n');
      } else {
        tag = typeof msg.photo === 'string' ? `[photo → ${msg.photo}]` : '[photo]';
      }
      break;

    case 'video':
      if (msg.videos) {
        tag = msg.videos
          .map((v) =>
            typeof v === 'string' ? `[video, ${msg.duration} → ${v}]` : `[video, ${msg.duration}]`,
          )
          .join('\n');
      } else {
        tag =
          typeof msg.video === 'string'
            ? `[video, ${msg.duration} → ${msg.video}]`
            : `[video, ${msg.duration}]`;
      }
      break;

    case 'doc':
      tag =
        typeof msg.doc === 'string' && msg.doc.startsWith('/')
          ? `[document: ${msg.doc.split('/').pop()} → ${msg.doc}]`
          : `[document: ${msg.doc}]`;
      break;

    case 'audio':
      tag = `[audio: "${msg.audio}", ${msg.duration}]`;
      break;

    case 'gif':
      tag =
        typeof msg.gif === 'string'
          ? `[gif, ${msg.duration} → ${msg.gif}]`
          : `[gif, ${msg.duration}]`;
      break;

    case 'voice':
      tag = msg.voice ? `[voice ${msg.duration} → ${msg.voice}]` : `[voice ${msg.duration}]`;
      if (msg.transcript) tag += ` "${msg.transcript}"`;
      break;

    case 'videonote':
      tag = `[video note ${msg.duration}]`;
      if (msg.transcript) tag += ` "${msg.transcript}"`;
      break;

    case 'sticker':
      tag = msg.sticker || '';
      break;

    case 'location':
      tag = `[location: ${msg.location}]`;
      break;

    case 'contact':
      tag = `[contact: ${msg.contact}]`;
      break;

    case 'poll':
      tag = `[poll: ${msg.poll}]`;
      if (msg.options) tag += `\n${msg.options.map((o) => `- ${o}`).join('\n')}`;
      break;

    case 'call':
    case 'videocall':
      tag =
        msg.duration === '0:00'
          ? msg.content === 'videocall'
            ? '[missed video call]'
            : '[missed call]'
          : msg.content === 'videocall'
            ? `[video call ${msg.duration}]`
            : `[call ${msg.duration}]`;
      break;

    case 'pin':
      tag = `[pinned #msg:${msg.pinned}]`;
      break;

    case 'join':
      tag = '[joined the group]';
      break;

    case 'title':
      tag = `[changed title to "${msg.text}"]`;
      return tag;

    default:
      tag = `[${msg.content}]`;
  }

  if (msg.text && msg.content !== 'title') return `${tag}\n${msg.text}`;
  return tag;
}

// --- Buttons ---

function formatButtons(buttons: FlatMessage['buttons']): string {
  if (!buttons?.length) return '';
  const lines = buttons.map((row) =>
    row.map((btn) => (btn.url ? `[${btn.text} ↗](${btn.url})` : `[${btn.text}]`)).join(' '),
  );
  return `\n${lines.join('\n')}`;
}

// --- Single message ---

function formatMessage(msg: FlatMessage): string {
  const ref = msg.ids ? `#msg:${msg.ids.join(', #msg:')}` : `#msg:${msg.id}`;

  const mods: string[] = [];
  if (msg.edited) mods.push('(edited)');
  if (msg.re !== undefined) {
    const replyRef =
      msg.re_chat !== undefined ? `↩ #msg:${msg.re} in #chat:${msg.re_chat}` : `↩ #msg:${msg.re}`;
    mods.push(replyRef);
  }
  if (msg.fwd) mods.push(`↪ fwd from ${msg.fwd}`);

  const modStr = mods.length ? ` ${mods.join(' ')}` : '';
  const content = formatContentLine(msg);
  const buttons = formatButtons(msg.buttons);

  return `[${msg.date}] ${msg.name} (${ref})${modStr}:\n${content}${buttons}`;
}

// --- Pagination footer ---

function paginationFooter(meta?: PaginationMeta): string {
  if (meta?.hasMore && meta.nextOffset !== undefined) {
    return `\n\nhasMore | nextOffset: ${meta.nextOffset}`;
  }
  return '';
}

// --- Public API ---

export function formatMessages(messages: FlatMessage[], meta?: PaginationMeta): string {
  const lines = messages.map(formatMessage);
  return lines.join('\n\n') + paginationFooter(meta);
}

export function formatDialogs(chats: FlatChat[], meta?: PaginationMeta): string {
  if (chats.length === 0) return '(no chats)';

  const sanitize = (text: string) => text.replace(/\n/g, ' ').replace(/\|/g, '\\|');

  const rows = chats.map((chat, i) => {
    const num = i + 1;
    const chatRef = `${sanitize(chat.title)} (#chat:${chat.id})`;
    const unread = chat.unread > 0 ? String(chat.unread) : '-';
    const last = chat.last ? `"${sanitize(chat.last.slice(0, 50))}" (${chat.last_date})` : '-';
    return `| ${num} | ${chatRef} | ${chat.type} | ${unread} | ${last} |`;
  });

  const header = '| # | Chat | Type | Unread | Last |';
  const sep = '|---|------|------|--------|------|';
  return [header, sep, ...rows].join('\n') + paginationFooter(meta);
}
