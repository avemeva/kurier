/**
 * Generate all seed fixtures for the dev test harness.
 *
 * Run: bun apps/app/scripts/generate-fixtures.ts
 *
 * Constructs TGMessage objects directly (no TDLib conversion).
 * Writes fixture.json per folder + manifest.json at the root.
 */

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const FIXTURES_DIR = join(import.meta.dir, '../src/mainview/public/dev/fixtures');

// ---------------------------------------------------------------------------
// Reusable senders
// ---------------------------------------------------------------------------

const senderAlice = { userId: 6098406782, name: 'Alice', photoUrl: '/dev/photos/6098406782.jpg' };
const senderBob = { userId: 91754006, name: 'Bob', photoUrl: '/dev/photos/91754006.jpg' };
const senderCharlie = { userId: 346928206, name: 'Charlie', photoUrl: '/dev/photos/346928206.jpg' };
const senderBot = { userId: 226578990, name: 'QuizBot', photoUrl: '/dev/photos/226578990.jpg' };
const senderChannel = {
  userId: 1042690371,
  name: 'Tech News',
  photoUrl: '/dev/photos/1042690371.jpg',
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRIVATE_CHAT_ID = 6098406782;
const GROUP_CHAT_ID = -1001234567890;
const CHANNEL_CHAT_ID = -1001987654321;
const BASE_DATE = 1772464607; // realistic unix timestamp
const WAVEFORM_B64 =
  'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJygpKissLS4vMDEyMzQ1Njc4OTo7PD0+Pw==';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ChatKind = 'private' | 'supergroup' | 'channel';

type Fixture = {
  name: string;
  description: string;
  contentKind: string;
  chatKind: ChatKind;
  message: Record<string, unknown>;
  showSender: boolean;
  groupPosition: 'single' | 'first' | 'middle' | 'last';
};

function baseMessage(overrides: Record<string, unknown>) {
  return {
    kind: 'message',
    id: 718802,
    chatId: PRIVATE_CHAT_ID,
    date: BASE_DATE,
    isOutgoing: false,
    isRead: true,
    editDate: 0,
    sender: senderAlice,
    reactions: [],
    viewCount: 0,
    forward: null,
    replyTo: null,
    inlineKeyboard: null,
    ...overrides,
  };
}

function textContent(text: string, extras: Record<string, unknown> = {}) {
  return {
    kind: 'text',
    text,
    entities: [],
    customEmojiUrls: {},
    webPreview: null,
    ...extras,
  };
}

function caption(text: string, extras: Record<string, unknown> = {}) {
  return {
    text,
    entities: [],
    customEmojiUrls: {},
    ...extras,
  };
}

function photoMedia(url = '/dev/media/sunset-mountain.jpg', w = 800, h = 533) {
  return { url, width: w, height: h, minithumbnail: null };
}

function videoMedia(url = '/dev/media/sample-video-landscape.mp4', w = 640, h = 360) {
  return { url, width: w, height: h, minithumbnail: null };
}

let nextId = 718800;
function id() {
  return nextId++;
}

// ---------------------------------------------------------------------------
// Fixture definitions
// ---------------------------------------------------------------------------

const fixtures: Fixture[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE CHAT — Basic Text
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'text-incoming',
    description: 'Incoming text in private chat',
    contentKind: 'private-text',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    message: baseMessage({
      id: id(),
      content: textContent('Hey, are you free for lunch today?'),
    }),
  },
  {
    name: 'text-outgoing',
    description: 'Outgoing text, read double checkmark',
    contentKind: 'private-text',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    message: baseMessage({
      id: id(),
      isOutgoing: true,
      sender: senderBob,
      content: textContent('Sure! How about that new Thai place?'),
    }),
  },
  {
    name: 'text-outgoing-unread',
    description: 'Outgoing text, sent but unread (single check)',
    contentKind: 'private-text',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    message: baseMessage({
      id: id(),
      isOutgoing: true,
      isRead: false,
      sender: senderBob,
      content: textContent('I\u2019ll be there at noon'),
    }),
  },
  {
    name: 'text-outgoing-edited',
    description: 'Outgoing text, edited label',
    contentKind: 'private-text',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    message: baseMessage({
      id: id(),
      isOutgoing: true,
      editDate: BASE_DATE + 120,
      sender: senderBob,
      content: textContent('Actually, let\u2019s do 12:30 instead'),
    }),
  },
  {
    name: 'text-long',
    description: 'Multi-paragraph long text with line breaks',
    contentKind: 'private-text',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    message: baseMessage({
      id: id(),
      content: textContent(
        'So about this weekend \u2014 I was thinking we could finally do that day trip to the coast. The weather forecast looks perfect, sunny with a light breeze.\n\nWe could leave around 8am, grab breakfast on the way, and be at the beach by 10. There\u2019s a seafood place right on the pier that does amazing fish tacos.\n\nLet me know if Saturday or Sunday works better for you. I\u2019m flexible either day.',
      ),
    }),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TEXT FORMATTING
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'text-with-bold-italic',
    description: 'Text with bold and italic entities',
    contentKind: 'text-formatting',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    // "The reservation is at La Piazza on Main Street"
    // bold: "La Piazza" offset 22, length 9
    // italic: "Main Street" offset 35, length 11
    message: baseMessage({
      id: id(),
      content: textContent('The reservation is at La Piazza on Main Street', {
        entities: [
          { offset: 22, length: 9, type: 'bold' },
          { offset: 35, length: 11, type: 'italic' },
        ],
      }),
    }),
  },
  {
    name: 'text-with-code',
    description: 'Text with inline code entity',
    contentKind: 'text-formatting',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    // "Run docker compose up to start"
    // code: "docker compose up" offset 4, length 18
    message: baseMessage({
      id: id(),
      content: textContent('Run docker compose up to start', {
        entities: [{ offset: 4, length: 18, type: 'code' }],
      }),
    }),
  },
  {
    name: 'text-with-url',
    description: 'Text with clickable URL',
    contentKind: 'text-formatting',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    // "Found the menu: https://example.com/menu"
    // url: offset 16, length 25
    message: baseMessage({
      id: id(),
      content: textContent('Found the menu: https://example.com/menu', {
        entities: [{ offset: 16, length: 25, type: 'url' }],
      }),
    }),
  },
  {
    name: 'text-with-spoiler',
    description: 'Text with spoiler entity',
    contentKind: 'text-formatting',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    // "The surprise is a trip to Paris!"
    // spoiler: "a trip to Paris" offset 16, length 15
    message: baseMessage({
      id: id(),
      content: textContent('The surprise is a trip to Paris!', {
        entities: [{ offset: 16, length: 15, type: 'spoiler' }],
      }),
    }),
  },
  {
    name: 'text-with-link-preview',
    description: 'Text with a link preview card',
    contentKind: 'text-formatting',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    // "Check this out: https://github.com/nicolo-ribaudo/tc39-proposal-structs"
    // url: offset 16, length 56
    message: baseMessage({
      id: id(),
      content: textContent(
        'Check this out: https://github.com/nicolo-ribaudo/tc39-proposal-structs',
        {
          entities: [{ offset: 16, length: 56, type: 'url' }],
          webPreview: {
            url: 'https://github.com/nicolo-ribaudo/tc39-proposal-structs',
            siteName: 'GitHub',
            title: 'TC39 Structs Proposal',
            description: 'Shared memory structs for JavaScript',
            minithumbnail: null,
            thumbUrl: '/dev/media/sunset-mountain.jpg',
            showLargeMedia: false,
            showMediaAboveDescription: false,
          },
        },
      ),
    }),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // REPLIES
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'reply-to-text',
    description: 'Replying to a text message',
    contentKind: 'replies',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    message: baseMessage({
      id: id(),
      replyTo: {
        messageId: 718790,
        senderName: 'Alice',
        text: 'Are you free this weekend?',
        mediaLabel: undefined,
        thumbUrl: undefined,
        quoteText: '',
      },
      content: textContent('Yeah, Saturday works! What did you have in mind?'),
    }),
  },
  {
    name: 'reply-to-photo',
    description: 'Replying to a photo (thumbnail in reply header)',
    contentKind: 'replies',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    message: baseMessage({
      id: id(),
      replyTo: {
        messageId: 718788,
        senderName: 'Alice',
        text: undefined,
        mediaLabel: 'Photo',
        thumbUrl: '/dev/media/sunset-mountain.jpg',
        quoteText: '',
      },
      content: textContent('That sunset shot is incredible, where was this taken?'),
    }),
  },
  {
    name: 'reply-to-voice',
    description: 'Replying to a voice message',
    contentKind: 'replies',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    message: baseMessage({
      id: id(),
      replyTo: {
        messageId: 718786,
        senderName: 'Alice',
        text: undefined,
        mediaLabel: 'Voice message',
        thumbUrl: undefined,
        quoteText: '',
      },
      content: textContent('Sorry, I can\u2019t listen right now. Can you type it out?'),
    }),
  },
  {
    name: 'reply-to-video',
    description: 'Replying to a video',
    contentKind: 'replies',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    message: baseMessage({
      id: id(),
      replyTo: {
        messageId: 718784,
        senderName: 'Alice',
        text: undefined,
        mediaLabel: 'Video',
        thumbUrl: undefined,
        quoteText: '',
      },
      content: textContent('Wow, the waves look amazing! Is that from today?'),
    }),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FORWARD
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'text-with-forward',
    description: 'Forwarded from Tech News Channel',
    contentKind: 'forward',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    message: baseMessage({
      id: id(),
      forward: {
        fromName: 'Tech News Channel',
        photoId: 1042690371,
        photoUrl: '/dev/photos/1042690371.jpg',
        date: BASE_DATE - 3600,
      },
      content: textContent('Breaking: TypeScript 6.0 announced with full dependent types support'),
    }),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // REACTIONS — every content type with reactions to see layout differences
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'reaction-text',
    description: 'Text message with reactions',
    contentKind: 'reactions',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    message: baseMessage({
      id: id(),
      reactions: [
        { emoji: '\ud83d\udc4d', count: 5, chosen: false },
        { emoji: '\u2764\ufe0f', count: 3, chosen: false },
        { emoji: '\ud83d\udd25', count: 2, chosen: false },
      ],
      content: textContent('Just shipped the new release! Everything passed CI on the first try.'),
    }),
  },
  {
    name: 'reaction-text-chosen',
    description: 'Text with reactions user has chosen',
    contentKind: 'reactions',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    message: baseMessage({
      id: id(),
      reactions: [
        { emoji: '\ud83d\udc4d', count: 8, chosen: true },
        { emoji: '\ud83c\udf89', count: 4, chosen: false },
        { emoji: '\ud83d\udcaf', count: 2, chosen: true },
      ],
      content: textContent('We hit 10,000 daily active users today!'),
    }),
  },
  {
    name: 'reaction-photo',
    description: 'Photo with reactions',
    contentKind: 'reactions',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    message: baseMessage({
      id: id(),
      reactions: [
        { emoji: '\ud83d\ude0d', count: 12, chosen: false },
        { emoji: '\ud83d\udd25', count: 7, chosen: true },
      ],
      content: {
        kind: 'photo',
        media: photoMedia('/dev/media/sunset-mountain.jpg', 800, 533),
        caption: null,
      },
    }),
  },
  {
    name: 'reaction-photo-caption',
    description: 'Photo with caption and reactions',
    contentKind: 'reactions',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    message: baseMessage({
      id: id(),
      reactions: [
        { emoji: '\ud83c\udf5d', count: 3, chosen: false },
        { emoji: '\ud83d\ude0b', count: 5, chosen: true },
      ],
      content: {
        kind: 'photo',
        media: photoMedia('/dev/media/food-plate.jpg', 800, 533),
        caption: caption('The pasta was incredible'),
      },
    }),
  },
  {
    name: 'reaction-video',
    description: 'Video with reactions',
    contentKind: 'reactions',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    message: baseMessage({
      id: id(),
      reactions: [
        { emoji: '\ud83c\udf0a', count: 4, chosen: false },
        { emoji: '\ud83d\ude0d', count: 6, chosen: true },
      ],
      content: {
        kind: 'video',
        media: videoMedia('/dev/media/sample-video-landscape.mp4', 640, 360),
        isGif: false,
        caption: null,
      },
    }),
  },
  {
    name: 'reaction-voice',
    description: 'Voice message with reactions',
    contentKind: 'reactions',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    message: baseMessage({
      id: id(),
      reactions: [
        { emoji: '\ud83d\udc4d', count: 2, chosen: false },
        { emoji: '\u2764\ufe0f', count: 1, chosen: true },
      ],
      content: {
        kind: 'voice',
        url: '/dev/media/sample-voice-short.ogg',
        waveform: WAVEFORM_B64,
        duration: 2,
        fileSize: 16000,
        speechStatus: 'none',
        speechText: '',
      },
    }),
  },
  {
    name: 'reaction-sticker',
    description: 'Sticker with reactions',
    contentKind: 'reactions',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    message: baseMessage({
      id: id(),
      reactions: [
        { emoji: '\ud83d\ude02', count: 3, chosen: false },
        { emoji: '\u2764\ufe0f', count: 1, chosen: true },
      ],
      content: {
        kind: 'sticker',
        url: '/dev/media/719117.webp',
        format: 'webp',
        emoji: '\ud83d\ude0e',
        width: 512,
        height: 512,
      },
    }),
  },
  {
    name: 'reaction-animation',
    description: 'GIF/animation with reactions',
    contentKind: 'reactions',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    message: baseMessage({
      id: id(),
      reactions: [
        { emoji: '\ud83d\ude02', count: 9, chosen: true },
        { emoji: '\ud83d\udc4d', count: 3, chosen: false },
      ],
      content: {
        kind: 'animation',
        media: videoMedia('/dev/media/sample-animation.mp4', 320, 320),
        caption: null,
      },
    }),
  },
  {
    name: 'reaction-album',
    description: 'Album with reactions',
    contentKind: 'reactions',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    message: baseMessage({
      id: id(),
      reactions: [
        { emoji: '\ud83d\ude0d', count: 15, chosen: true },
        { emoji: '\u2764\ufe0f', count: 8, chosen: false },
        { emoji: '\ud83d\udd25', count: 4, chosen: false },
      ],
      content: {
        kind: 'album',
        items: [
          {
            messageId: 719100,
            contentKind: 'photo',
            url: '/dev/media/sunset-mountain.jpg',
            width: 800,
            height: 533,
            minithumbnail: null,
          },
          {
            messageId: 719101,
            contentKind: 'photo',
            url: '/dev/media/city-street.jpg',
            width: 800,
            height: 1035,
            minithumbnail: null,
          },
        ],
        caption: null,
      },
    }),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PHOTOS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'photo-single',
    description: 'Sunset photo, no caption',
    contentKind: 'photo',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    message: baseMessage({
      id: id(),
      content: {
        kind: 'photo',
        media: photoMedia('/dev/media/sunset-mountain.jpg', 800, 533),
        caption: null,
      },
    }),
  },
  {
    name: 'photo-with-caption',
    description: 'Food photo with caption',
    contentKind: 'photo',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    message: baseMessage({
      id: id(),
      content: {
        kind: 'photo',
        media: photoMedia('/dev/media/food-plate.jpg', 800, 533),
        caption: caption('Homemade pasta tonight \ud83c\udf5d'),
      },
    }),
  },
  {
    name: 'photo-outgoing',
    description: 'Outgoing cat photo',
    contentKind: 'photo',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    message: baseMessage({
      id: id(),
      isOutgoing: true,
      sender: senderBob,
      content: {
        kind: 'photo',
        media: photoMedia('/dev/media/cat-sleeping.jpg', 800, 836),
        caption: null,
      },
    }),
  },
  {
    name: 'photo-with-reply',
    description: 'Photo replying to "How\u2019s the show?"',
    contentKind: 'photo',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    message: baseMessage({
      id: id(),
      replyTo: {
        messageId: 718770,
        senderName: 'Alice',
        text: 'How\u2019s the show?',
        mediaLabel: undefined,
        thumbUrl: undefined,
        quoteText: '',
      },
      content: {
        kind: 'photo',
        media: photoMedia('/dev/media/concert-crowd.jpg', 800, 533),
        caption: null,
      },
    }),
  },
  {
    name: 'photo-with-forward',
    description: 'Photo forwarded from Travel Photography',
    contentKind: 'photo',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    message: baseMessage({
      id: id(),
      forward: {
        fromName: 'Travel Photography',
        photoId: 0,
        photoUrl: undefined,
        date: BASE_DATE - 7200,
      },
      content: {
        kind: 'photo',
        media: photoMedia('/dev/media/sunset-mountain.jpg', 800, 533),
        caption: null,
      },
    }),
  },
  {
    name: 'photo-with-caption-entities',
    description: 'Photo with formatted caption',
    contentKind: 'photo',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    // "Downtown at golden hour — love this city"
    // bold: "Downtown" offset 0, length 8
    message: baseMessage({
      id: id(),
      content: {
        kind: 'photo',
        media: photoMedia('/dev/media/city-street.jpg', 800, 1035),
        caption: caption('Downtown at golden hour \u2014 love this city', {
          entities: [{ offset: 0, length: 8, type: 'bold' as const }],
        }),
      },
    }),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // VIDEOS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'video-single',
    description: 'Landscape video, no caption',
    contentKind: 'video',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    message: baseMessage({
      id: id(),
      content: {
        kind: 'video',
        media: videoMedia('/dev/media/sample-video-landscape.mp4', 640, 360),
        isGif: false,
        caption: null,
      },
    }),
  },
  {
    name: 'video-with-caption',
    description: 'City video with caption',
    contentKind: 'video',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    message: baseMessage({
      id: id(),
      content: {
        kind: 'video',
        media: videoMedia('/dev/media/sample-video-portrait.mp4', 360, 640),
        isGif: false,
        caption: caption('Evening walk downtown'),
      },
    }),
  },
  {
    name: 'video-outgoing',
    description: 'Outgoing video',
    contentKind: 'video',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    message: baseMessage({
      id: id(),
      isOutgoing: true,
      sender: senderBob,
      content: {
        kind: 'video',
        media: videoMedia('/dev/media/sample-video-landscape.mp4', 640, 360),
        isGif: false,
        caption: null,
      },
    }),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // VOICE
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'voice-incoming',
    description: 'Incoming voice with waveform',
    contentKind: 'voice',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    message: baseMessage({
      id: id(),
      content: {
        kind: 'voice',
        url: '/dev/media/sample-voice-short.ogg',
        waveform: WAVEFORM_B64,
        duration: 2,
        fileSize: 16736,
        speechStatus: 'none',
        speechText: '',
      },
    }),
  },
  {
    name: 'voice-outgoing',
    description: 'Outgoing voice',
    contentKind: 'voice',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    message: baseMessage({
      id: id(),
      isOutgoing: true,
      sender: senderBob,
      content: {
        kind: 'voice',
        url: '/dev/media/sample-voice-long.ogg',
        waveform: WAVEFORM_B64,
        duration: 7,
        fileSize: 47474,
        speechStatus: 'none',
        speechText: '',
      },
    }),
  },
  {
    name: 'voice-with-speech',
    description: 'Voice with transcription',
    contentKind: 'voice',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    message: baseMessage({
      id: id(),
      content: {
        kind: 'voice',
        url: '/dev/media/sample-voice-long.ogg',
        waveform: WAVEFORM_B64,
        duration: 7,
        fileSize: 47474,
        speechStatus: 'done',
        speechText:
          'Hey, I just wanted to check if you got my email about the project deadline. Let me know when you have a chance to look at it.',
      },
    }),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ANIMATION (GIF)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'animation-gif',
    description: 'Looping animation, no caption',
    contentKind: 'animation',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    message: baseMessage({
      id: id(),
      content: {
        kind: 'animation',
        media: videoMedia('/dev/media/sample-animation.mp4', 320, 320),
        caption: null,
      },
    }),
  },
  {
    name: 'animation-with-caption',
    description: 'Animation with caption',
    contentKind: 'animation',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    message: baseMessage({
      id: id(),
      content: {
        kind: 'animation',
        media: videoMedia('/dev/media/sample-animation.mp4', 320, 320),
        caption: caption('This is so mesmerizing'),
      },
    }),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // VIDEO NOTE
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'video-note-incoming',
    description: 'Round video incoming',
    contentKind: 'videoNote',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    message: baseMessage({
      id: id(),
      content: {
        kind: 'videoNote',
        media: {
          url: '/dev/media/sample-videonote.mp4',
          width: 384,
          height: 384,
          minithumbnail: null,
        },
      },
    }),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // STICKERS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'sticker-webp',
    description: 'Static webp sticker',
    contentKind: 'sticker',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    message: baseMessage({
      id: id(),
      content: {
        kind: 'sticker',
        url: '/dev/media/719117.webp',
        format: 'webp',
        emoji: '\ud83d\ude0a',
        width: 512,
        height: 512,
      },
    }),
  },
  {
    name: 'sticker-tgs',
    description: 'Animated Lottie sticker (no url, shows fallback)',
    contentKind: 'sticker',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    message: baseMessage({
      id: id(),
      content: {
        kind: 'sticker',
        url: undefined,
        format: 'tgs',
        emoji: '\ud83c\udf89',
        width: 512,
        height: 512,
      },
    }),
  },
  {
    name: 'sticker-webm',
    description: 'Video sticker (no url, shows fallback)',
    contentKind: 'sticker',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    message: baseMessage({
      id: id(),
      content: {
        kind: 'sticker',
        url: undefined,
        format: 'webm',
        emoji: '\ud83d\udc4b',
        width: 512,
        height: 512,
      },
    }),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ALBUMS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'album-photos',
    description: '3 travel photos (sunset, city, food)',
    contentKind: 'album',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    message: baseMessage({
      id: id(),
      content: {
        kind: 'album',
        items: [
          {
            messageId: 718900,
            contentKind: 'photo',
            url: '/dev/media/sunset-mountain.jpg',
            width: 800,
            height: 533,
            minithumbnail: null,
          },
          {
            messageId: 718901,
            contentKind: 'photo',
            url: '/dev/media/city-street.jpg',
            width: 800,
            height: 1035,
            minithumbnail: null,
          },
          {
            messageId: 718902,
            contentKind: 'photo',
            url: '/dev/media/food-plate.jpg',
            width: 800,
            height: 533,
            minithumbnail: null,
          },
        ],
        caption: caption('Our Barcelona trip \ud83c\uddea\ud83c\uddf8'),
      },
    }),
  },
  {
    name: 'album-with-caption',
    description: '2 food photos with caption',
    contentKind: 'album',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    message: baseMessage({
      id: id(),
      content: {
        kind: 'album',
        items: [
          {
            messageId: 718910,
            contentKind: 'photo',
            url: '/dev/media/food-plate.jpg',
            width: 800,
            height: 533,
            minithumbnail: null,
          },
          {
            messageId: 718911,
            contentKind: 'photo',
            url: '/dev/media/food-dessert.jpg',
            width: 800,
            height: 674,
            minithumbnail: null,
          },
        ],
        caption: caption('Dinner was incredible'),
      },
    }),
  },
  {
    name: 'album-mixed',
    description: 'Sunset photo + sunset video in one album',
    contentKind: 'album',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    message: baseMessage({
      id: id(),
      content: {
        kind: 'album',
        items: [
          {
            messageId: 718920,
            contentKind: 'photo',
            url: '/dev/media/sunset-mountain.jpg',
            width: 800,
            height: 533,
            minithumbnail: null,
          },
          {
            messageId: 718921,
            contentKind: 'video',
            url: '/dev/media/sample-video-landscape.mp4',
            width: 640,
            height: 360,
            minithumbnail: null,
          },
        ],
        caption: null,
      },
    }),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DOCUMENT
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'document-file',
    description: 'Document file attachment',
    contentKind: 'document',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    message: baseMessage({
      id: id(),
      content: {
        kind: 'document',
        label: 'quarterly-report-2024.pdf',
      },
    }),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GROUP CHAT (chatKind: 'supergroup')
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'text-with-sender-name',
    description: 'Group message with sender name and avatar',
    contentKind: 'group-chat',
    chatKind: 'supergroup',
    showSender: true,
    groupPosition: 'single',
    message: baseMessage({
      id: id(),
      chatId: GROUP_CHAT_ID,
      sender: senderCharlie,
      content: textContent('Has anyone tried the new coffee place?'),
    }),
  },
  {
    name: 'text-with-mention',
    description: 'Group message with @mention and hashtag',
    contentKind: 'group-chat',
    chatKind: 'supergroup',
    showSender: true,
    groupPosition: 'single',
    // "@bob check this out #design"
    // mention: offset 0, length 4 ("@bob")
    // hashtag: offset 20, length 7 ("#design")
    message: baseMessage({
      id: id(),
      chatId: GROUP_CHAT_ID,
      sender: senderAlice,
      content: textContent('@bob check this out #design', {
        entities: [
          { offset: 0, length: 4, type: 'mention' },
          { offset: 20, length: 7, type: 'hashtag' },
        ],
      }),
    }),
  },
  {
    name: 'text-with-inline-keyboard',
    description: 'Bot message with inline keyboard buttons',
    contentKind: 'group-chat',
    chatKind: 'supergroup',
    showSender: true,
    groupPosition: 'single',
    message: baseMessage({
      id: id(),
      chatId: GROUP_CHAT_ID,
      sender: senderBot,
      inlineKeyboard: [
        [
          { text: 'Python', url: undefined },
          { text: 'TypeScript', url: undefined },
          { text: 'Rust', url: undefined },
        ],
      ],
      content: textContent('What language do you prefer?'),
    }),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CHANNEL
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'text-channel-post',
    description: 'Channel post with view count',
    contentKind: 'channel',
    chatKind: 'channel',
    showSender: false,
    groupPosition: 'single',
    message: baseMessage({
      id: id(),
      chatId: CHANNEL_CHAT_ID,
      sender: senderChannel,
      viewCount: 14832,
      content: textContent(
        '\ud83d\udce2 Version 2.4 available. Update your apps for the latest improvements.',
      ),
    }),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SERVICE MESSAGES — different service event types
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'service-pin-text',
    description: 'Pinned a text message',
    contentKind: 'service',
    chatKind: 'supergroup',
    showSender: false,
    groupPosition: 'single',
    message: {
      kind: 'service',
      id: id(),
      chatId: GROUP_CHAT_ID,
      date: BASE_DATE,
      sender: senderAlice,
      text: 'Alice pinned "Meeting moved to Thursday at 3pm"',
      pinnedMessageId: 718750,
    },
  },
  {
    name: 'service-pin-photo',
    description: 'Pinned a photo',
    contentKind: 'service',
    chatKind: 'supergroup',
    showSender: false,
    groupPosition: 'single',
    message: {
      kind: 'service',
      id: id(),
      chatId: GROUP_CHAT_ID,
      date: BASE_DATE + 60,
      sender: senderCharlie,
      text: 'Charlie pinned a photo',
      pinnedMessageId: 718751,
    },
  },
  {
    name: 'service-pin-video',
    description: 'Pinned a video',
    contentKind: 'service',
    chatKind: 'supergroup',
    showSender: false,
    groupPosition: 'single',
    message: {
      kind: 'service',
      id: id(),
      chatId: GROUP_CHAT_ID,
      date: BASE_DATE + 120,
      sender: senderAlice,
      text: 'Alice pinned a video',
      pinnedMessageId: 718752,
    },
  },
  {
    name: 'service-pin-voice',
    description: 'Pinned a voice message',
    contentKind: 'service',
    chatKind: 'supergroup',
    showSender: false,
    groupPosition: 'single',
    message: {
      kind: 'service',
      id: id(),
      chatId: GROUP_CHAT_ID,
      date: BASE_DATE + 180,
      sender: senderCharlie,
      text: 'Charlie pinned a voice message',
      pinnedMessageId: 718753,
    },
  },
  {
    name: 'service-join',
    description: 'User joined the group',
    contentKind: 'service',
    chatKind: 'supergroup',
    showSender: false,
    groupPosition: 'single',
    message: {
      kind: 'service',
      id: id(),
      chatId: GROUP_CHAT_ID,
      date: BASE_DATE + 240,
      sender: senderBot,
      text: 'QuizBot joined the group',
      pinnedMessageId: 0,
    },
  },
  {
    name: 'service-left',
    description: 'User left the group',
    contentKind: 'service',
    chatKind: 'supergroup',
    showSender: false,
    groupPosition: 'single',
    message: {
      kind: 'service',
      id: id(),
      chatId: GROUP_CHAT_ID,
      date: BASE_DATE + 300,
      sender: senderBot,
      text: 'QuizBot left the group',
      pinnedMessageId: 0,
    },
  },
  {
    name: 'service-title-change',
    description: 'Group title changed',
    contentKind: 'service',
    chatKind: 'supergroup',
    showSender: false,
    groupPosition: 'single',
    message: {
      kind: 'service',
      id: id(),
      chatId: GROUP_CHAT_ID,
      date: BASE_DATE + 360,
      sender: senderAlice,
      text: 'Alice changed the group name to "Weekend Trip Planning"',
      pinnedMessageId: 0,
    },
  },
  {
    name: 'service-photo-change',
    description: 'Group photo changed',
    contentKind: 'service',
    chatKind: 'supergroup',
    showSender: false,
    groupPosition: 'single',
    message: {
      kind: 'service',
      id: id(),
      chatId: GROUP_CHAT_ID,
      date: BASE_DATE + 420,
      sender: senderCharlie,
      text: 'Charlie changed the group photo',
      pinnedMessageId: 0,
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TEXT GROUPING (consecutive messages from same sender)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'text-group-first',
    description: 'First in sequence',
    contentKind: 'grouping',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'first',
    message: baseMessage({
      id: id(),
      date: BASE_DATE,
      content: textContent('Hey, are you free tonight?'),
    }),
  },
  {
    name: 'text-group-middle',
    description: 'Middle in sequence',
    contentKind: 'grouping',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'middle',
    message: baseMessage({
      id: id(),
      date: BASE_DATE + 5,
      content: textContent('We could grab dinner at that new Italian place'),
    }),
  },
  {
    name: 'text-group-last',
    description: 'Last in sequence',
    contentKind: 'grouping',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'last',
    message: baseMessage({
      id: id(),
      date: BASE_DATE + 10,
      content: textContent('Let me know!'),
    }),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PENDING
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'pending-sending',
    description: 'Message being sent',
    contentKind: 'pending',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    message: {
      kind: 'pending',
      localId: 'pending-001',
      chatId: PRIVATE_CHAT_ID,
      text: "I'll send you the files once the upload finishes, should be a few more minutes.",
      date: BASE_DATE,
      status: 'sending',
    },
  },
  {
    name: 'pending-failed',
    description: 'Message failed to send',
    contentKind: 'pending',
    chatKind: 'private',
    showSender: false,
    groupPosition: 'single',
    message: {
      kind: 'pending',
      localId: 'pending-002',
      chatId: PRIVATE_CHAT_ID,
      text: 'This message failed to send due to a network error. Please try again later.',
      date: BASE_DATE,
      status: 'failed',
    },
  },
];

// ---------------------------------------------------------------------------
// Generate
// ---------------------------------------------------------------------------

// Clear existing fixture folders (preserve media/ and photos/)
const preserve = new Set(['media', 'photos']);
try {
  for (const entry of readdirSync(FIXTURES_DIR)) {
    if (!preserve.has(entry)) {
      rmSync(join(FIXTURES_DIR, entry), { recursive: true, force: true });
    }
  }
} catch {
  // Directory doesn't exist yet — fine
}

// Ensure the fixtures root exists
mkdirSync(FIXTURES_DIR, { recursive: true });

// Write each fixture
for (const fixture of fixtures) {
  const dir = join(FIXTURES_DIR, fixture.name);
  mkdirSync(dir, { recursive: true });

  const fixtureJson = {
    messages: [fixture.message],
    chatKind: fixture.chatKind,
  };

  writeFileSync(join(dir, 'fixture.json'), `${JSON.stringify(fixtureJson, null, 2)}\n`);
}

// Write manifest
const manifest = fixtures.map((f) => ({
  name: f.name,
  description: f.description,
  contentKind: f.contentKind,
}));

writeFileSync(join(FIXTURES_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Generated ${fixtures.length} fixtures + manifest.json in ${FIXTURES_DIR}`);
