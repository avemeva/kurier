/**
 * Markdown formatters for --markdown mode.
 *
 * Pure functions: slim data in → string out.
 * Separate layer — no coupling to commands, output protocol, or TDLib.
 */

import type { PaginationMeta } from './output';
import type { SlimMessage } from './slim';

// --- Helpers ---

function formatTime(unix: number): string {
  const d = new Date(unix * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

// --- Forward info ---

type ForwardOrigin = {
  sender_user_id?: number;
  sender_name?: string;
  chat_id?: number;
  sender_chat_id?: number;
  message_id?: number;
  author_signature?: string;
};

function formatForwardInfo(info: { origin?: ForwardOrigin } | undefined): string {
  if (!info?.origin) return '';
  const o = info.origin;
  if (o.sender_user_id) return ` ↪ fwd from user #${o.sender_user_id}`;
  if (o.chat_id) {
    const parts = [` ↪ fwd from #chat:${o.chat_id}`];
    if (o.message_id) parts.push(`#msg:${o.message_id}`);
    return parts.join(' ');
  }
  if (o.sender_chat_id) return ` ↪ fwd from #chat:${o.sender_chat_id}`;
  if (o.sender_name) return ` ↪ fwd from "${o.sender_name}"`;
  return '';
}

// --- Reply markup ---

type InlineButton = { text: string; type: string; url?: string };
type ReplyMarkup = { rows: InlineButton[][] };

function formatReplyMarkup(rm: ReplyMarkup | undefined): string {
  if (!rm?.rows?.length) return '';
  const lines = rm.rows.map((row) =>
    row
      .map((btn) => {
        if (btn.url) return `[${btn.text} ↗](${btn.url})`;
        return `[${btn.text}]`;
      })
      .join(' '),
  );
  return `\n${lines.join('\n')}`;
}

// --- Content formatting ---

type ContentAny = { type: string; [key: string]: unknown };

function formatContent(c: ContentAny): string {
  switch (c.type) {
    case 'messageText':
      return c.text as string;

    case 'messagePhoto': {
      const photo = c.photo as { width: number; height: number; file: FileInfo };
      const tag = photo.file.local_path
        ? `[photo ${photo.width}×${photo.height} → ${photo.file.local_path}]`
        : `[photo ${photo.width}×${photo.height}]`;
      return appendCaption(tag, c.caption as string | undefined);
    }

    case 'messageVideo': {
      const file = c.file as FileInfo;
      const dur = formatDuration(c.duration as number);
      const size = formatSize(file.size);
      const name = (c.file_name as string) || 'video';
      const tag = file.local_path
        ? `[video: ${name}, ${dur} → ${file.local_path}]`
        : `[video: ${name}, ${dur}, ${size}]`;
      return appendCaption(tag, c.caption as string | undefined);
    }

    case 'messageDocument': {
      const file = c.file as FileInfo;
      const name = (c.file_name as string) || 'document';
      const tag = file.local_path
        ? `[document: ${name} → ${file.local_path}]`
        : `[document: ${name}, ${formatSize(file.size)}]`;
      return appendCaption(tag, c.caption as string | undefined);
    }

    case 'messageAudio': {
      const file = c.file as FileInfo;
      const dur = formatDuration(c.duration as number);
      const title = c.title as string;
      const performer = c.performer as string;
      let tag: string;
      if (title) {
        const byArtist = performer ? ` by ${performer}` : '';
        tag = file.local_path
          ? `[audio: "${title}"${byArtist}, ${dur} → ${file.local_path}]`
          : `[audio: "${title}"${byArtist}, ${dur}]`;
      } else {
        const name = (c.file_name as string) || 'audio';
        tag = file.local_path
          ? `[audio: ${name}, ${dur} → ${file.local_path}]`
          : `[audio: ${name}, ${dur}]`;
      }
      return appendCaption(tag, c.caption as string | undefined);
    }

    case 'messageAnimation': {
      const file = c.file as FileInfo;
      const dur = formatDuration(c.duration as number);
      const name = (c.file_name as string) || 'gif';
      const tag = file.local_path
        ? `[gif: ${name}, ${dur} → ${file.local_path}]`
        : `[gif: ${name}, ${dur}]`;
      return appendCaption(tag, c.caption as string | undefined);
    }

    case 'messageVoiceNote': {
      const file = c.file as FileInfo;
      const dur = formatDuration(c.duration as number);
      const transcript = c.transcript as string | undefined;
      const pathPart = file?.local_path ? ` → ${file.local_path}` : '';
      const transcriptPart = transcript ? ` "${transcript}"` : '';
      const tag = `[voice ${dur}${pathPart}]${transcriptPart}`;
      return appendCaption(tag, c.caption as string | undefined);
    }

    case 'messageVideoNote': {
      const file = c.file as FileInfo;
      const dur = formatDuration(c.duration as number);
      const transcript = c.transcript as string | undefined;
      const pathPart = file?.local_path ? ` → ${file.local_path}` : '';
      const transcriptPart = transcript ? ` "${transcript}"` : '';
      return `[video note ${dur}${pathPart}]${transcriptPart}`;
    }

    case 'messageSticker':
      return c.emoji as string;

    case 'messageLocation': {
      const loc = c.location as { latitude: number; longitude: number };
      return `[location: ${loc.latitude}, ${loc.longitude}]`;
    }

    case 'messageContact': {
      const ct = c.contact as {
        first_name: string;
        last_name?: string;
        phone_number: string;
        user_id?: number;
      };
      const name = [ct.first_name, ct.last_name].filter(Boolean).join(' ');
      const userId = ct.user_id ? `, #user:${ct.user_id}` : '';
      return `[contact: ${name}, ${ct.phone_number}${userId}]`;
    }

    case 'messagePoll': {
      const poll = c.poll as {
        question: { text: string };
        options: { text: { text: string }; voter_count: number; vote_percentage: number }[];
        total_voter_count: number;
        is_closed: boolean;
      };
      const status = poll.is_closed ? 'poll closed' : 'poll';
      const header = `[${status}: "${poll.question.text}" (${poll.total_voter_count} votes)]`;
      const options = poll.options
        .map((o) => `- ${o.text.text}: ${o.voter_count} (${o.vote_percentage}%)`)
        .join('\n');
      return `${header}\n${options}`;
    }

    case 'messageCall': {
      const isVideo = c.is_video as boolean;
      const duration = c.duration as number;
      if (duration === 0) return isVideo ? '[missed video call]' : '[missed call]';
      return isVideo
        ? `[video call ${formatDuration(duration)}]`
        : `[call ${formatDuration(duration)}]`;
    }

    case 'messagePinMessage':
      return `[pinned #msg:${c.message_id}]`;

    case 'messageChatAddMembers': {
      const ids = c.member_user_ids as number[];
      return `[added members: ${ids.map((id) => `#user:${id}`).join(', ')}]`;
    }

    case 'messageChatDeleteMember':
      return `[removed #user:${c.user_id}]`;

    case 'messageChatChangeTitle':
      return `[changed title to "${c.title}"]`;

    case 'messageChatJoinByLink':
    case 'messageChatJoinByRequest':
      return '[joined the group]';

    // Other service messages — just the type
    default:
      return `[${c.type}]`;
  }
}

type FileInfo = { size: number; local_path?: string };

function appendCaption(tag: string, caption: string | undefined): string {
  if (!caption) return tag;
  return `${tag}\n${caption}`;
}

// --- Single message ---

function formatMessage(msg: SlimMessage): string {
  const time = formatTime(msg.date);
  const sender = msg.is_outgoing ? '**You**' : `**${msg.sender_name || `user:${msg.sender_id}`}**`;
  const ref = `#msg:${msg.id}`;

  // Modifiers
  const mods: string[] = [];
  if (msg.edit_date) mods.push('(edited)');
  if (msg.reply_to_message_id) {
    const replyRef = msg.reply_in_chat_id
      ? `↩ #msg:${msg.reply_to_message_id} in #chat:${msg.reply_in_chat_id}`
      : `↩ #msg:${msg.reply_to_message_id}`;
    mods.push(replyRef);
  }

  const fwd = formatForwardInfo(msg.forward_info as { origin?: ForwardOrigin } | undefined);
  if (fwd) mods.push(fwd.trim());

  const modStr = mods.length ? ` ${mods.join(' ')}` : '';
  const content = formatContent(msg.content as ContentAny);
  const buttons = formatReplyMarkup(msg.reply_markup as ReplyMarkup | undefined);

  return `[${time}] ${sender} (${ref})${modStr}:\n${content}${buttons}`;
}

// --- Public API ---

export function formatMessages(messages: SlimMessage[], meta?: PaginationMeta): string {
  const lines = messages.map(formatMessage);
  const body = lines.join('\n\n');

  if (meta?.hasMore && meta.nextOffset !== undefined) {
    return `${body}\n\nhasMore | nextOffset: ${meta.nextOffset}`;
  }
  return body;
}
