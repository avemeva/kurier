import { TelegramClient } from '@tg/protocol';

const PROXY_URL = process.env.TG_PROXY_URL ?? 'http://localhost:7312';
const client = new TelegramClient(PROXY_URL);

const [command, ...args] = process.argv.slice(2);

async function main() {
  // Check proxy is reachable
  try {
    const res = await fetch(`${PROXY_URL}/health`);
    if (!res.ok) throw new Error();
  } catch {
    console.error(`Cannot reach proxy at ${PROXY_URL}`);
    console.error('Start the daemon first: bun run dev:daemon');
    process.exit(1);
  }

  switch (command) {
    case 'me':
      return cmdMe();
    case 'chats':
      return cmdChats();
    case 'messages':
      return cmdMessages();
    case 'send':
      return cmdSend();
    case 'listen':
      return cmdListen();
    default:
      printUsage();
      process.exit(command ? 1 : 0);
  }
}

async function cmdMe() {
  const me = await client.invoke({ _: 'getMe' });
  console.log(JSON.stringify(me, null, 2));
}

async function cmdChats() {
  const limit = Number(args[0]) || 20;
  // First ensure chat list is loaded
  const chatList = await client.invoke({
    _: 'getChats',
    chat_list: { _: 'chatListMain' },
    limit,
  });

  // Fetch full chat objects
  for (const chatId of chatList.chat_ids) {
    const chat = await client.invoke({ _: 'getChat', chat_id: chatId });
    const lastMsg = chat.last_message;
    const preview =
      lastMsg?.content?._ === 'messageText'
        ? lastMsg.content.text.text.slice(0, 60)
        : (lastMsg?.content?._ ?? '');
    console.log(`${chat.id}  ${chat.title}  ${preview}`);
  }
}

async function cmdMessages() {
  const chatId = Number(args[0]);
  if (!chatId) {
    console.error('Usage: messages <chat_id> [limit]');
    process.exit(1);
  }
  const limit = Number(args[1]) || 20;

  const messages = await client.invoke({
    _: 'getChatHistory',
    chat_id: chatId,
    from_message_id: 0,
    offset: 0,
    limit,
    only_local: false,
  });

  for (const msg of messages.messages ?? []) {
    if (!msg) continue;
    const text = msg.content?._ === 'messageText' ? msg.content.text.text : `[${msg.content?._}]`;
    const date = new Date(msg.date * 1000).toLocaleString();
    console.log(
      `[${date}] ${msg.sender_id?._}:${JSON.stringify(msg.sender_id).replace(/[{}"_:]/g, '')} ${text}`,
    );
  }
}

async function cmdSend() {
  const chatId = Number(args[0]);
  const text = args.slice(1).join(' ');
  if (!chatId || !text) {
    console.error('Usage: send <chat_id> <text>');
    process.exit(1);
  }

  const msg = await client.invoke({
    _: 'sendMessage',
    chat_id: chatId,
    input_message_content: {
      _: 'inputMessageText',
      text: { _: 'formattedText', text, entities: [] },
    },
  });

  console.log(`Sent message ${msg.id} to chat ${chatId}`);
}

function cmdListen() {
  console.log('Listening for updates... (Ctrl+C to stop)');
  client.on('update', (update) => {
    // Only show interesting updates, not the firehose
    switch (update._) {
      case 'updateNewMessage': {
        const msg = update.message;
        const text =
          msg.content?._ === 'messageText'
            ? msg.content.text.text.slice(0, 80)
            : `[${msg.content?._}]`;
        console.log(`[new] chat:${msg.chat_id} ${text}`);
        break;
      }
      case 'updateMessageEdited':
        console.log(`[edit] chat:${update.chat_id} msg:${update.message_id}`);
        break;
      case 'updateDeleteMessages':
        if (update.is_permanent) {
          console.log(`[delete] chat:${update.chat_id} msgs:${update.message_ids.join(',')}`);
        }
        break;
      case 'updateChatLastMessage':
        // Skip — too noisy
        break;
      default:
        // Log update type only for other updates
        if (
          update._.startsWith('updateNew') ||
          update._.startsWith('updateMessage') ||
          update._.startsWith('updateDelete')
        ) {
          console.log(`[${update._}]`);
        }
    }
  });

  // Keep process alive
  return new Promise<void>(() => {
    process.on('SIGINT', () => {
      client.close();
      process.exit(0);
    });
  });
}

function printUsage() {
  console.log(`Usage: bun run apps/cli/src/index.ts <command> [args]

Commands:
  me                      Get current user info
  chats [limit]           List chats (default: 20)
  messages <chat_id> [n]  Get message history
  send <chat_id> <text>   Send a text message
  listen                  Stream live updates`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
