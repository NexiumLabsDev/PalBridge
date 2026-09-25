# 🔗 PalBridge

### A modern Discord bridge and administration suite for Palworld dedicated servers.

**Nexium PalBridge** connects your Palworld server directly to Discord with a lightweight **UE4SS server-side mod** and a powerful companion **Discord bot**.

Built by **Nexium Labs**, PalBridge is designed to keep your community connected while giving server staff fast, clean access to important server controls from Discord.

---

## ✨ Features

### 💬 Two-Way Discord Chat

- **Palworld → Discord** player chat relay
- **Discord → Palworld** message relay
- Clean Discord embeds for in-game messages
- Ignores `/` and `!` command messages by default
- Prevents bot loops

### 👥 Player Activity

- Player join notifications
- Player leave notifications
- Online player list
- Player levels
- Player ping display

### 📊 Live Server Status

Use `/pal status` to view:

- Server name
- Palworld version
- Online / maximum players
- Server FPS
- Frame time
- Server uptime
- World day
- Base camp count

### 🛡️ Discord Administration

Authorized staff can manage the Palworld server without opening the game:

| Command | Description |
|---|---|
| `/pal announce` | Broadcast a message to the server |
| `/pal kick` | Kick an online player |
| `/pal ban` | Ban an online player |
| `/pal unban` | Unban a player by user ID |
| `/pal save` | Force-save the world |
| `/pal shutdown` | Save and gracefully shut down the server |

Public commands include:

| Command | Description |
|---|---|
| `/pal help` | Show PalBridge commands |
| `/pal status` | View live server status |
| `/pal players` | View online players |

---

## 🔐 Built With Security in Mind

Nexium PalBridge separates Discord from the game process instead of storing your Discord bot token inside a UE4SS Lua script.

- Discord token stays inside the companion bot
- UE4SS bridge uses a shared secret
- Admin commands support a configurable Discord staff role
- Discord `Administrator` and `Manage Server` permissions are recognized
- Administrative actions can be logged to a dedicated Discord channel
- Public player commands do not expose player IP addresses
- Graceful shutdown automatically requests a world save first

> **Important:** Palworld's REST API should remain private and should not be directly exposed to the public Internet.

---

## 🧩 How It Works

```text
Palworld Dedicated Server
        │
        ├── UE4SS NexiumPalBridge
        │       └── In-game chat events
        │
        ├── Palworld REST API
        │       └── Players / status / administration
        │
        ▼
Nexium PalBridge Discord Bot
        │
        ▼
      Discord
```

The UE4SS mod handles the game-side chat hook while Palworld's official REST API handles server information and administrative actions.

This split keeps the UE4SS portion small and makes the Discord side easier to configure, update and troubleshoot.

---

## 📦 Requirements

- Palworld Dedicated Server
- A compatible UE4SS build
- Node.js 22+
- Discord bot/application
- `curl` available to the Palworld server process
- Palworld REST API enabled

---

## 🛠️ Installation

### 1. Install the UE4SS Mod

Place `NexiumPalBridge` inside your UE4SS mods folder.

Typical UE4SS 3.x layout:

```text
Pal/Binaries/Win64/ue4ss/Mods/NexiumPalBridge/
├── enabled.txt
└── scripts/
    ├── config.lua
    └── main.lua
```

If your UE4SS build uses `mods.txt`, enable it with:

```text
NexiumPalBridge : 1
```

### 2. Enable Palworld's REST API

Configure your active `PalWorldSettings.ini`:

```ini
RESTAPIEnabled=True
RESTAPIPort=8212
AdminPassword=YOUR_STRONG_ADMIN_PASSWORD
```

Restart the server after changing these settings.

### 3. Configure the Bridge

Edit:

```text
NexiumPalBridge/scripts/config.lua
```

Set your bridge address, secret and server name.

### 4. Configure the Discord Bot

Inside the included `discord-bot` folder:

```bash
npm install
```

Copy `.env.example` to `.env`, enter your Discord and Palworld settings, then run:

```bash
npm start
```

Full configuration and troubleshooting instructions are included in the download's `README.md`.

---

## 🖥️ Hosting Support

PalBridge can be used with dedicated-server environments including normal Windows/Linux installations and panel-based hosting such as Pterodactyl, provided UE4SS, `curl`, the Palworld REST API and network access between the two PalBridge components are available.

If the Discord bot and Palworld server run in separate containers, remember that `127.0.0.1` refers to each individual container. Use a private/restricted network address between them instead.

---

## ⚠️ Compatibility Notice

Palworld game updates can change Unreal Engine functions used by UE4SS mods. If a future update changes Palworld's chat broadcast function, the chat relay hook may require an update.

The Discord administration portion is intentionally built around Palworld's documented REST API so it is isolated from the UE4SS chat hook as much as possible.

---

## ❤️ Author

### **Nexium Labs**

Clean server tooling. Better community management. One bridge between Palworld and Discord.

If you enjoy **Nexium PalBridge**, consider leaving feedback and reporting any compatibility issues so future versions can continue improving.
