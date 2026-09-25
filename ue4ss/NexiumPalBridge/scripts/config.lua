return {
    enabled = true,

    -- URL exposed by the Nexium PalBridge Discord bot.
    -- Keep this private. If both run on the same machine, 127.0.0.1 is recommended.
    bridge_url = "http://127.0.0.1:3009/bridge/event",

    -- Must exactly match BRIDGE_SECRET in the Discord bot .env file.
    -- For easiest shell compatibility, use a long hexadecimal/alphanumeric value.
    bridge_secret = "CHANGE_ME_TO_A_LONG_RANDOM_SECRET",

    server_name = "Palworld Server",
    forward_chat = true,

    -- Messages beginning with any of these prefixes are not relayed to Discord.
    -- Useful for keeping in-game admin/chat commands private.
    ignored_prefixes = { "/", "!" },

    request_timeout_seconds = 4,

    -- Leave as "auto" unless curl is installed under a custom path.
    -- Windows normally has curl.exe; Linux uses curl.
    curl_binary = "auto",

    debug = false,
}
