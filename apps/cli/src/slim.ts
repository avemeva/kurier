/**
 * Shaping functions that reduce TDLib objects to semantically useful fields.
 * Applied before strip() — slim selects fields, strip handles serialization.
 */

import type * as Td from 'tdlib-types';

// --- Helpers ---

/** Remove keys whose value is undefined so they don't appear in `in` checks or JSON. */
function clean<T extends Record<string, unknown>>(obj: T): T {
  for (const key in obj) {
    if (obj[key] === undefined) delete obj[key];
  }
  return obj;
}

// --- Entity → Markdown (adapted from GramJS MarkdownParser.unparse) ---

const DELIMITERS: Record<string, string> = {
  textEntityTypeBold: '**',
  textEntityTypeItalic: '__',
  textEntityTypeStrikethrough: '~~',
  textEntityTypeCode: '`',
  textEntityTypePre: '```',
};

function unparse(text: string, entities: Td.textEntity[]): string {
  if (!entities.length) return text;

  let insertAt: [number, string][] = [];

  for (const entity of entities) {
    const s = entity.offset;
    const e = entity.offset + entity.length;
    const t = entity.type;

    if (t._ === 'textEntityTypeTextUrl') {
      insertAt.push([s, '[']);
      insertAt.push([e, `](${t.url})`]);
    } else if (t._ === 'textEntityTypePreCode') {
      insertAt.push([s, `\`\`\`${t.language}\n`]);
      insertAt.push([e, '\n```']);
    } else {
      const delimiter = DELIMITERS[t._];
      if (delimiter) {
        insertAt.push([s, delimiter]);
        insertAt.push([e, delimiter]);
      }
    }
  }

  insertAt = insertAt.sort((a, b) => a[0] - b[0]);
  while (insertAt.length) {
    const pair = insertAt.pop();
    if (!pair) break;
    const [at, what] = pair;
    text = text.slice(0, at) + what + text.slice(at);
  }
  return text;
}

// --- File flattening ---

type SlimFile = { id: number; size: number; downloaded: boolean; local_path?: string };

function slimFile(f: Td.file): SlimFile {
  const done = f.local.is_downloading_completed;
  return clean({
    id: f.id,
    size: f.size || f.expected_size,
    downloaded: done,
    local_path: done ? f.local.path : undefined,
  }) as SlimFile;
}

// --- Chat type flattening ---

function flattenChatType(t: Td.ChatType): 'user' | 'group' | 'channel' {
  switch (t._) {
    case 'chatTypePrivate':
      return 'user';
    case 'chatTypeBasicGroup':
      return 'group';
    case 'chatTypeSupergroup':
      return t.is_channel ? 'channel' : 'group';
    case 'chatTypeSecret':
      return 'user';
  }
}

// --- Extract preview ---

export function extractPreview(m: Td.message, maxLength = 150): string | undefined {
  const c = m.content;
  let text: string | undefined;

  switch (c._) {
    case 'messageText':
      text = c.text.text;
      break;
    case 'messagePhoto':
      text = c.caption.text || undefined;
      break;
    case 'messageDocument':
      text = c.caption.text || undefined;
      break;
    case 'messageVideo':
      text = c.caption.text || undefined;
      break;
    case 'messageAudio':
      text = c.caption.text || undefined;
      break;
    case 'messageAnimation':
      text = c.caption.text || undefined;
      break;
    case 'messageVoiceNote':
      text =
        c.caption.text ||
        (c.voice_note.speech_recognition_result?._ === 'speechRecognitionResultText'
          ? c.voice_note.speech_recognition_result.text
          : undefined);
      break;
    case 'messageSticker':
      text = c.sticker.emoji;
      break;
    default:
      text = undefined;
  }

  if (!text) return undefined;
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

// --- Slim types ---

type SlimUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username: string | null;
  phone_number: string;
  type: 'regular' | 'bot' | 'deleted' | 'unknown';
  is_contact: boolean;
  is_verified: boolean;
  is_premium: boolean;
  is_scam: boolean;
  is_fake: boolean;
};

type SlimChat = {
  id: number;
  type: 'user' | 'group' | 'channel';
  title: string;
  unread_count: number;
  last_read_inbox_message_id: number;
  unread_mention_count?: number;
  last_message?: { id: number; date: number; text?: string };
};

export type SlimMessage = {
  id: number;
  sender_type: 'user' | 'chat';
  sender_id: number;
  sender_name?: string;
  chat_id: number;
  is_outgoing: boolean;
  date: number;
  edit_date?: number;
  reply_to_message_id?: number;
  reply_in_chat_id?: number;
  forward_info?: Td.messageForwardInfo;
  media_album_id?: string;
  content: SlimContent;
};

// TDLib types are outdated — runtime uses reply_to object instead of reply_to_message_id
type MessageReplyTo =
  | {
      _: 'messageReplyToMessage';
      chat_id: number;
      message_id: number;
    }
  | {
      _: 'messageReplyToStory';
      story_sender_chat_id: number;
      story_id: number;
    };

type SlimContent =
  | { type: 'messageText'; text: string }
  | {
      type: 'messagePhoto';
      caption?: string;
      photo: { width: number; height: number; file: SlimFile };
    }
  | {
      type: 'messageVideo';
      caption?: string;
      file_name: string;
      mime_type: string;
      duration: number;
      width: number;
      height: number;
      file: SlimFile;
    }
  | {
      type: 'messageDocument';
      caption?: string;
      file_name: string;
      mime_type: string;
      file: SlimFile;
    }
  | {
      type: 'messageAudio';
      caption?: string;
      file_name: string;
      mime_type: string;
      duration: number;
      title: string;
      performer: string;
      file: SlimFile;
    }
  | {
      type: 'messageAnimation';
      caption?: string;
      file_name: string;
      mime_type: string;
      duration: number;
      width: number;
      height: number;
      file: SlimFile;
    }
  | {
      type: 'messageVoiceNote';
      caption?: string;
      transcript?: string;
      duration: number;
      mime_type: string;
      file: SlimFile;
    }
  | {
      type: 'messageVideoNote';
      transcript?: string;
      duration: number;
      width: number;
      height: number;
      file: SlimFile;
    }
  | { type: 'messageSticker'; emoji: string }
  | { type: 'messageLocation'; location: Td.location }
  | { type: 'messageContact'; contact: Td.contact }
  | { type: 'messagePoll'; poll: Td.poll }
  | {
      type: 'messageCall';
      is_video: boolean;
      duration: number;
      discard_reason: Td.CallDiscardReason;
    }
  | { type: string; [key: string]: unknown };

type SlimChatMember = {
  user_id: number;
  sender_type: 'user' | 'chat';
  joined_date?: number;
  status: 'creator' | 'admin' | 'member' | 'restricted' | 'banned' | 'left';
  custom_title?: string;
};

// --- Helper: flatten caption ---

function slimCaption(caption: Td.formattedText): { caption?: string } {
  return clean({ caption: unparse(caption.text, caption.entities) || undefined });
}

// --- Shaping functions ---

function flattenUserType(t: Td.UserType): SlimUser['type'] {
  switch (t._) {
    case 'userTypeRegular':
      return 'regular';
    case 'userTypeBot':
      return 'bot';
    case 'userTypeDeleted':
      return 'deleted';
    default:
      return 'unknown';
  }
}

export function slimUser(u: Td.user): SlimUser {
  return clean({
    id: u.id,
    first_name: u.first_name,
    last_name: u.last_name || undefined,
    username: u.usernames?.active_usernames?.[0] ?? null,
    phone_number: u.phone_number,
    type: flattenUserType(u.type),
    is_contact: u.is_contact,
    is_verified: u.is_verified ?? false,
    is_premium: u.is_premium,
    is_scam: u.is_scam ?? false,
    is_fake: u.is_fake ?? false,
  });
}

export function slimChat(c: Td.chat): SlimChat {
  const m = c.last_message;
  return clean({
    id: c.id,
    type: flattenChatType(c.type),
    title: c.title,
    unread_count: c.unread_count,
    last_read_inbox_message_id: c.last_read_inbox_message_id,
    unread_mention_count: c.unread_mention_count || undefined,
    last_message: m ? clean({ id: m.id, date: m.date, text: extractPreview(m, 150) }) : undefined,
  });
}

export function slimMessage(m: Td.message): SlimMessage {
  const sender = m.sender_id;
  const senderType: 'user' | 'chat' = sender._ === 'messageSenderUser' ? 'user' : 'chat';
  const senderId = sender._ === 'messageSenderUser' ? sender.user_id : sender.chat_id;

  // TDLib runtime uses reply_to object; typedef still has reply_to_message_id
  const replyTo = (m as unknown as { reply_to?: MessageReplyTo }).reply_to;
  let replyToMessageId: number | undefined;
  let replyInChatId: number | undefined;
  if (replyTo?._ === 'messageReplyToMessage') {
    replyToMessageId = replyTo.message_id || undefined;
    replyInChatId = replyTo.chat_id !== m.chat_id ? replyTo.chat_id : undefined;
  }

  return clean({
    id: m.id,
    sender_type: senderType,
    sender_id: senderId,
    chat_id: m.chat_id,
    is_outgoing: m.is_outgoing,
    date: m.date,
    edit_date: m.edit_date || undefined,
    reply_to_message_id: replyToMessageId,
    reply_in_chat_id: replyInChatId,
    forward_info: m.forward_info,
    media_album_id:
      m.media_album_id && m.media_album_id !== '0' && m.media_album_id !== 0
        ? String(m.media_album_id)
        : undefined,
    content: slimContent(m.content),
  });
}

function slimContent(c: Td.MessageContent): SlimContent {
  switch (c._) {
    case 'messageText':
      return { type: 'messageText', text: unparse(c.text.text, c.text.entities) };
    case 'messagePhoto': {
      const largest = c.photo.sizes[c.photo.sizes.length - 1] as Td.photoSize;
      return {
        type: 'messagePhoto',
        ...slimCaption(c.caption),
        photo: {
          width: largest.width,
          height: largest.height,
          file: slimFile(largest.photo),
        },
      };
    }
    case 'messageVideo':
      return {
        type: 'messageVideo',
        ...slimCaption(c.caption),
        file_name: c.video.file_name,
        mime_type: c.video.mime_type,
        duration: c.video.duration,
        width: c.video.width,
        height: c.video.height,
        file: slimFile(c.video.video),
      };
    case 'messageDocument':
      return {
        type: 'messageDocument',
        ...slimCaption(c.caption),
        file_name: c.document.file_name,
        mime_type: c.document.mime_type,
        file: slimFile(c.document.document),
      };
    case 'messageAudio':
      return {
        type: 'messageAudio',
        ...slimCaption(c.caption),
        file_name: c.audio.file_name,
        mime_type: c.audio.mime_type,
        duration: c.audio.duration,
        title: c.audio.title,
        performer: c.audio.performer,
        file: slimFile(c.audio.audio),
      };
    case 'messageAnimation':
      return {
        type: 'messageAnimation',
        ...slimCaption(c.caption),
        file_name: c.animation.file_name,
        mime_type: c.animation.mime_type,
        duration: c.animation.duration,
        width: c.animation.width,
        height: c.animation.height,
        file: slimFile(c.animation.animation),
      };
    case 'messageVoiceNote': {
      const vnTranscript = c.voice_note.speech_recognition_result;
      return {
        type: 'messageVoiceNote',
        ...slimCaption(c.caption),
        ...(vnTranscript?._ === 'speechRecognitionResultText'
          ? { transcript: vnTranscript.text }
          : {}),
        duration: c.voice_note.duration,
        mime_type: c.voice_note.mime_type,
        file: slimFile(c.voice_note.voice),
      };
    }
    case 'messageVideoNote': {
      const vidTranscript = c.video_note.speech_recognition_result;
      return {
        type: 'messageVideoNote',
        ...(vidTranscript?._ === 'speechRecognitionResultText'
          ? { transcript: vidTranscript.text }
          : {}),
        duration: c.video_note.duration,
        width: c.video_note.length,
        height: c.video_note.length,
        file: slimFile(c.video_note.video),
      };
    }
    case 'messageSticker':
      return { type: 'messageSticker', emoji: c.sticker.emoji };
    case 'messageLocation':
      return { type: 'messageLocation', location: c.location };
    case 'messageContact':
      return { type: 'messageContact', contact: c.contact };
    case 'messagePoll':
      return { type: 'messagePoll', poll: c.poll };
    case 'messageCall':
      return {
        type: 'messageCall',
        is_video: c.is_video,
        duration: c.duration,
        discard_reason: c.discard_reason,
      };
    default: {
      const { _: type, ...rest } = c as { _: string; [key: string]: unknown };
      return { type, ...rest } as SlimContent;
    }
  }
}

const STATUS_MAP: Record<string, SlimChatMember['status']> = {
  chatMemberStatusCreator: 'creator',
  chatMemberStatusAdministrator: 'admin',
  chatMemberStatusMember: 'member',
  chatMemberStatusRestricted: 'restricted',
  chatMemberStatusBanned: 'banned',
  chatMemberStatusLeft: 'left',
};

export function slimMember(m: Td.chatMember): SlimChatMember {
  const sender = m.member_id;
  const senderType: 'user' | 'chat' = sender._ === 'messageSenderUser' ? 'user' : 'chat';
  const userId = sender._ === 'messageSenderUser' ? sender.user_id : sender.chat_id;
  const customTitle =
    m.status._ === 'chatMemberStatusCreator' || m.status._ === 'chatMemberStatusAdministrator'
      ? m.status.custom_title || undefined
      : undefined;

  return clean({
    user_id: userId,
    sender_type: senderType,
    joined_date: m.joined_chat_date || undefined,
    status: STATUS_MAP[m.status._] ?? 'member',
    custom_title: customTitle,
  });
}

// --- Array wrappers ---

export function slimUsers(users: Td.user[]): SlimUser[] {
  return users.map(slimUser);
}

export function slimChats(chats: Td.chat[]): SlimChat[] {
  return chats.map(slimChat);
}

export function slimMessages(messages: Td.message[]): SlimMessage[] {
  return messages.map(slimMessage);
}

export function slimMembers(members: Td.chatMember[]): SlimChatMember[] {
  return members.map(slimMember);
}
