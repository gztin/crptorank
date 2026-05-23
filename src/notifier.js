const TG_API = token => `https://api.telegram.org/bot${token}`;

export async function sendTelegramMessage(text) {
  const token = process.env.TG_TOKEN || '';
  const chatId = process.env.TG_RANK_CLIMBER_CHANNEL_ID || '';
  if (!token || !chatId) return;

  const body = {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown'
  };
  await fetch(`${TG_API(token)}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

export async function sendDiscordMessage(text) {
  const webhookUrl = process.env.DISCORD_RANK_PUSH_WEBHOOK || '';
  if (!webhookUrl) return;

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: text })
  });
}
