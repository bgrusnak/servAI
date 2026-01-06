# Telegram Bot Setup Guide 🤖

## Overview

servAI uses Telegram as the primary interface for residents and workers. This guide explains how to set up and configure the bot.

---

## 1. Create Telegram Bot

### Step 1: Talk to BotFather

1. Open Telegram and search for `@BotFather`
2. Start chat and send `/newbot`
3. Follow instructions:
   - Choose bot name (e.g., "servAI Assistant")
   - Choose username (e.g., "servai_bot")
4. Save the **bot token** - you'll need it!

### Step 2: Configure Bot

```bash
# Set bot description
/setdescription
# Choose your bot
# Enter: "Smart assistant for residential complex management"

# Set bot about text
/setabouttext
# Choose your bot  
# Enter: "servAI - AI-powered property management assistant"

# Set bot commands (optional)
/setcommands
# Choose your bot
# Enter:
start - Start the bot and register
help - Get help
```

---

## 2. Get Perplexity API Key

1. Go to https://www.perplexity.ai/
2. Sign up / Log in
3. Navigate to API settings
4. Create new API key
5. Save the key

---

## 3. Configure Environment

### Development (.env)

```env
# Telegram Bot
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_USE_WEBHOOK=false
# TELEGRAM_WEBHOOK_URL not needed for polling
# TELEGRAM_WEBHOOK_SECRET not needed for polling

# Perplexity AI
PERPLEXITY_API_KEY=pplx-xxxxxxxxxxxxxxxxxxxx
```

### Production (.env.production)

```env
# Telegram Bot (WEBHOOK MODE)
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_USE_WEBHOOK=true
TELEGRAM_WEBHOOK_URL=https://api.servai.app
TELEGRAM_WEBHOOK_SECRET=random_secret_min_32_chars

# Perplexity AI
PERPLEXITY_API_KEY=pplx-xxxxxxxxxxxxxxxxxxxx
```

---

## 4. Webhook vs Polling

### Polling Mode (Development)

**Pros:**
- Easy setup
- Works on localhost
- No SSL required

**Cons:**
- Higher latency
- More server load
- Not recommended for production

**Config:**
```env
TELEGRAM_USE_WEBHOOK=false
```

### Webhook Mode (Production)

**Pros:**
- Real-time updates
- Lower server load
- Production-ready

**Cons:**
- Requires public HTTPS URL
- Requires SSL certificate
- More complex setup

**Config:**
```env
TELEGRAM_USE_WEBHOOK=true
TELEGRAM_WEBHOOK_URL=https://api.servai.app
TELEGRAM_WEBHOOK_SECRET=your_secret
```

**Nginx config:**
```nginx
location /api/v1/telegram/webhook {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

---

## 5. Testing

### Test Bot Connection

```bash
# Start server
npm run dev

# Check logs for:
# "Telegram bot initialized in polling mode"
# or
# "Telegram bot initialized in webhook mode"
```

### Test Bot Interaction

1. Open Telegram
2. Search for your bot username
3. Send `/start`
4. Bot should respond with welcome message

### Test with Invite Link

1. Create invite via API or admin panel
2. Get invite token
3. Send to bot: `/start INVITE_TOKEN`
4. Bot should register user

---

## 6. Invite Link Format

### Generate Invite

Invite tokens are created via API:

```bash
POST /api/v1/invites
Authorization: Bearer <admin_token>
{
  "unit_id": "uuid",
  "role": "owner",
  "expires_in_days": 7
}
```

Response:
```json
{
  "id": "uuid",
  "token": "abc123xyz789",
  "invite_link": "https://t.me/servai_bot?start=abc123xyz789"
}
```

### Send to Resident

Share the `invite_link` with resident:
- Via email
- Via SMS  
- Via admin panel
- Via QR code

---

## 7. Bot Features

### Current Features ✅

- **Registration:** `/start` with invite token
- **Natural Language:** Understands user intent
- **Context:** Remembers conversation
- **Multi-language:** Auto-detects user language
- **Photo Recognition:** OCR for meter readings

### Coming Soon 🚧

- Meter readings (text & photo)
- Ticket creation
- Bill viewing
- Poll voting
- Car access management

---

## 8. Rate Limits

### Telegram Limits

- **Messages:** ~30 per second per bot
- **Same user:** 1 message per second
- **Group messages:** 20 per minute

### Handling

- Bot uses BullMQ queue for mass notifications
- Respects rate limits automatically
- Retries on errors

---

## 9. Troubleshooting

### Bot Not Starting

```bash
# Check token
echo $TELEGRAM_BOT_TOKEN

# Test token manually
curl https://api.telegram.org/bot<TOKEN>/getMe
```

### Webhook Not Working

```bash
# Check webhook status
curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo

# Delete webhook (reset)
curl https://api.telegram.org/bot<TOKEN>/deleteWebhook

# Set webhook manually
curl -X POST https://api.telegram.org/bot<TOKEN>/setWebhook \
  -d url=https://api.servai.app/api/v1/telegram/webhook \
  -d secret_token=your_secret
```

### Messages Not Received

1. Check bot logs: `npm run dev`
2. Check database: `SELECT * FROM telegram_users`
3. Check Telegram: Send `/start` again
4. Check Perplexity: Verify API key

---

## 10. Security

### Best Practices

✅ **Use webhook in production**  
✅ **Set webhook secret**  
✅ **Validate webhook requests**  
✅ **Use HTTPS only**  
✅ **Rotate bot token periodically**  
✅ **Don't commit tokens to git**  
✅ **Use environment variables**  

### Webhook Validation

The bot automatically validates:
- Webhook secret token (if set)
- Request signature
- Rate limits

---

## 11. Monitoring

### Metrics

```bash
# Check Prometheus metrics
curl http://localhost:3000/metrics | grep telegram

# Metrics available:
# - telegram_messages_total
# - telegram_messages_errors_total  
# - telegram_intent_recognition_duration
# - telegram_active_users
```

### Logs

```bash
# View bot logs
tail -f logs/app.log | grep telegram

# Common log entries:
# - "Telegram bot initialized"
# - "Processing message from user X"
# - "Intent recognized: meter_reading"
# - "Error processing message"
```

---

## 12. Development Tips

### Test with Multiple Users

Create multiple Telegram accounts or use:
- Your personal account
- Telegram Desktop (different account)
- Telegram Web (different account)
- Ask team members

### Debug AI Responses

```typescript
// In perplexity.service.ts
logger.debug('Perplexity request:', { prompt, history });
logger.debug('Perplexity response:', { response });
```

### Simulate Webhooks Locally

```bash
# Use ngrok for local webhook testing
ngrok http 3000

# Update webhook URL
curl -X POST https://api.telegram.org/bot<TOKEN>/setWebhook \
  -d url=https://your-ngrok-url.ngrok.io/api/v1/telegram/webhook
```

---

## 13. Resources

- **Telegram Bot API:** https://core.telegram.org/bots/api
- **BotFather:** https://t.me/botfather
- **Perplexity Docs:** https://docs.perplexity.ai/
- **node-telegram-bot-api:** https://github.com/yagop/node-telegram-bot-api

---

**Setup Complete!** 🎉

Your Telegram bot is now ready to serve residents!
