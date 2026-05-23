const TG_API = token => `https://api.telegram.org/bot${token}`;
const DISCORD_CONTENT_LIMIT = 2000;

function trimDiscordContent(text) {
  const s = String(text ?? '');
  if (s.length <= DISCORD_CONTENT_LIMIT) return s;
  return `${s.slice(0, DISCORD_CONTENT_LIMIT - 12)}\n\n...(truncated)`;
}

export async function sendTelegramMessage(text) {
  const token = process.env.TG_TOKEN || '';
  const chatId = process.env.TG_RANK_CLIMBER_CHANNEL_ID || '';
  if (!token || !chatId) return;

  const body = {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown'
  };
  const res = await fetch(`${TG_API(token)}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Telegram send failed: HTTP ${res.status} ${detail}`);
  }
}

export async function sendDiscordMessage(text) {
  const webhookUrl = process.env.DISCORD_RANK_PUSH_WEBHOOK || '';
  if (!webhookUrl) return;

  const content = trimDiscordContent(text);
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Discord send failed: HTTP ${res.status} ${detail}`);
  }
}
