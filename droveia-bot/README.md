# Droveia Discord Bot

Manages Droveia tool inventory directly from Discord.

## Setup

### 1. Create Discord Bot
1. Go to https://discord.com/developers/applications
2. Click **New Application** → name it "Droveia"
3. Go to **Bot** tab → click **Add Bot**
4. Copy the **Token** → paste into `.env` as `DISCORD_TOKEN`
5. Under **Privileged Gateway Intents** — enable **Server Members Intent**
6. Go to **OAuth2 → URL Generator** → check `bot` + `applications.commands`
7. Check bot permissions: `Send Messages`, `Embed Links`, `Read Message History`
8. Copy the generated URL → open in browser → add bot to your server

### 2. Get IDs
- **CLIENT_ID**: Discord Developer Portal → your app → General Information → Application ID
- **GUILD_ID**: Right-click your Discord server → Copy Server ID (enable Developer Mode in Discord settings first)
- **Channel IDs**: Right-click any channel → Copy Channel ID

### 3. Firebase Admin SDK
1. Firebase Console → Project Settings → Service Accounts
2. Click **Generate new private key** → download JSON
3. Copy `project_id`, `client_email`, `private_key` into `.env`

### 4. Install & Run
```bash
cd bot
cp .env.example .env
# Fill in all values in .env
npm install
node deploy-commands.js   # Register slash commands (run once)
node bot.js               # Start the bot
```

### 5. Keep it running with PM2
```bash
npm install -g pm2
pm2 start bot.js --name droveia-bot
pm2 save
pm2 startup   # Auto-start on server reboot
```

## Commands

| Command | Description |
|---|---|
| `/inventory` | List all tools with availability |
| `/addtool` | Add a new tool |
| `/removetool id:5` | Delete a tool |
| `/edittool id:2 field:retail value:90` | Edit any field |
| `/available id:3` | Mark tool as available |
| `/unavailable id:3` | Mark tool as unavailable |
| `/tool id:1` | View tool details |
| `/orders` | See active in-flight orders |

## Auto-updates
The bot watches Firestore inventory in real-time and posts to `#inventory-updates` whenever:
- A tool gets rented (unavailable)
- A tool is marked available again
