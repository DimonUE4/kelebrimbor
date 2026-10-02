const express = require("express");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

dotenv.config();

const app = express();

const PORT = process.env.PORT || 3000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

const USERS_FILE = path.join(__dirname, "telegram-users.json");
const SWITCH_FILE = path.join(__dirname, "switch-config.json");

function loadTelegramUsers() {
    if (!fs.existsSync(USERS_FILE)) {
        return [];
    }

    try {
        return JSON.parse(
            fs.readFileSync(USERS_FILE, "utf8")
        );
    } catch {
        return [];
    }
}

function saveTelegramUsers(users) {
    fs.writeFileSync(
        USERS_FILE,
        JSON.stringify(users, null, 2),
        "utf8"
    );
}

function normalizeTelegramUser(chat) {
    if (!chat || chat.type !== "private") {
        return null;
    }

    const firstName = chat.first_name || "";
    const lastName = chat.last_name || "";
    const username = chat.username || "";

    return {
        chatId: String(chat.id),
        firstName,
        lastName,
        username,
        connectedAt: new Date().toISOString()
    };
}

function mergeTelegramUsers(existingUsers, discoveredUsers) {
    const users = [...(Array.isArray(existingUsers) ? existingUsers : [])];

    for (const discovered of discoveredUsers) {
        if (!discovered || !discovered.chatId) {
            continue;
        }

        const index = users.findIndex(
            user => String(user.chatId) === String(discovered.chatId)
        );

        if (index >= 0) {
            users[index] = {
                ...users[index],
                ...discovered,
                chatId: String(discovered.chatId),
                connectedAt: users[index].connectedAt || discovered.connectedAt || new Date().toISOString()
            };
            continue;
        }

        users.push({
            ...discovered,
            chatId: String(discovered.chatId)
        });
    }

    return users;
}

function loadSwitchConfig() {
    if (!fs.existsSync(SWITCH_FILE)) {
        return {
            deadline: null,
            recipients: []
        };
    }

    try {
        return JSON.parse(
            fs.readFileSync(SWITCH_FILE, "utf8")
        );
    } catch {
        return {
            deadline: null,
            recipients: []
        };
    }
}

function saveSwitchConfig(config) {
    fs.writeFileSync(
        SWITCH_FILE,
        JSON.stringify(config, null, 2),
        "utf8"
    );
}

console.log(
    "Telegram token loaded:",
    TELEGRAM_BOT_TOKEN ? "YES" : "NO"
);

if (!TELEGRAM_BOT_TOKEN) {
    console.error("TELEGRAM_BOT_TOKEN is missing");
    process.exit(1);
}

app.use(express.json());


/*
    Serve frontend
*/

app.use(express.static(__dirname));


/*
    Telegram API helper
*/

async function telegramRequest(method, body = {}) {

    const url =
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`;

    console.log("Telegram request:", method);

    console.log(
        "URL:",
        url.replace(TELEGRAM_BOT_TOKEN, "***")
    );

    try {

        const response = await fetch(url, {
            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify(body)
        });

        const text = await response.text();

        console.log(
            "Telegram response status:",
            response.status
        );

        console.log(
            "Telegram response:",
            text
        );

        let data;

        try {

            data = JSON.parse(text);

        } catch {

            throw new Error(
                `Telegram returned invalid JSON: ${text}`
            );

        }

        if (!response.ok || !data.ok) {

            throw new Error(
                data.description ||
                `Telegram API error: HTTP ${response.status}`
            );

        }

        return data;

    } catch (error) {

        console.error(
            "Telegram request failed:"
        );

        console.error(error);

        throw error;

    }

}


/*
    Telegram status
*/

app.get("/api/telegram/status", async (req, res) => {

    try {

        const result =
            await telegramRequest("getMe");

        res.json({

            connected: true,

            bot: result.result

        });

    } catch (error) {

        res.status(500).json({

            connected: false,

            error: error.message

        });

    }

});


/*
    Get Telegram chats
*/

app.get("/api/telegram/updates", async (req, res) => {

    try {

        const result =
            await telegramRequest("getUpdates");

        const chats = [];

        for (const update of result.result) {

            const message =
                update.message ||
                update.channel_post;

            if (
                !message ||
                !message.chat
            ) {
                continue;
            }

            const chat = message.chat;

            const exists =
                chats.some(
                    item => item.id === chat.id
                );

            if (!exists) {

                chats.push({

                    id: chat.id,

                    type: chat.type,

                    title:
                        chat.title ||
                        [
                            chat.first_name,
                            chat.last_name
                        ]
                            .filter(Boolean)
                            .join(" ") ||
                        chat.username ||
                        String(chat.id)

                });

            }

        }

        res.json({

            chats

        });

    } catch (error) {

        res.status(500).json({

            error: error.message

        });

    }

});


/*
    Send Telegram message
*/

app.post("/api/telegram/send", async (req, res) => {

    try {

        const {
            chatIds,
            message
        } = req.body;


        if (
            !Array.isArray(chatIds) ||
            chatIds.length === 0
        ) {

            return res.status(400).json({

                error: "No chats selected"

            });

        }


        if (
            typeof message !== "string" ||
            !message.trim()
        ) {

            return res.status(400).json({

                error: "Message is empty"

            });

        }


        const results = [];


        for (const chatId of chatIds) {

            try {

                const result =
                    await telegramRequest(
                        "sendMessage",
                        {
                            chat_id: chatId,
                            text: message
                        }
                    );


                results.push({

                    chatId,

                    success: true,

                    messageId:
                        result.result.message_id

                });


            } catch (error) {

                results.push({

                    chatId,

                    success: false,

                    error: error.message

                });

            }

        }


        res.json({

            success: true,

            results

        });


    } catch (error) {

        res.status(500).json({

            error: error.message

        });

    }

});


app.get("/api/telegram/connect", async (req, res) => {
    try {
        const result = await telegramRequest("getUpdates");
        const currentUsers = loadTelegramUsers();
        const discoveredUsers = [];

        for (const update of result.result) {
            const message = update.message || update.channel_post;

            if (!message || !message.chat) {
                continue;
            }

            const normalizedUser = normalizeTelegramUser(message.chat);

            if (normalizedUser) {
                discoveredUsers.push(normalizedUser);
            }
        }

        const mergedUsers = mergeTelegramUsers(currentUsers, discoveredUsers);

        saveTelegramUsers(mergedUsers);

        res.json({
            success: true,
            users: mergedUsers
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

function syncTelegramUsers() {
    const currentUsers = loadTelegramUsers();

    if (!currentUsers.length) {
        return currentUsers;
    }

    return currentUsers;
}

app.use((req, res, next) => {
    try {
        const users = loadTelegramUsers();
        const cleanedUsers = users.map(user => ({
            ...user,
            chatId: String(user.chatId)
        }));

        saveTelegramUsers(cleanedUsers);
        syncTelegramUsers();
    } catch (error) {
        console.error("Telegram sync cleanup failed:", error);
    }

    next();
});


app.get("/api/telegram/users", (req, res) => {
    const users = loadTelegramUsers();

    res.json({
        success: true,
        users
    });
});

app.get("/api/switch/config", (req, res) => {
    const config = loadSwitchConfig();

    res.json({
        success: true,
        config
    });
});

app.post("/api/switch/save", (req, res) => {
    try {
        const { deadline, recipients } = req.body || {};

        if (!deadline) {
            return res.status(400).json({
                success: false,
                error: "Deadline is required."
            });
        }

        if (!Array.isArray(recipients) || recipients.length === 0) {
            return res.status(400).json({
                success: false,
                error: "At least one recipient is required."
            });
        }

        const normalizedRecipients = recipients.map((recipient) => {
            const chatId = String(recipient.chatId || "").trim();
            const message = String(recipient.message || "").trim();

            if (!chatId) {
                throw new Error("Every recipient must have a chatId.");
            }

            if (!message && !recipient.hasMedia) {
                throw new Error("Every recipient must have a message or media.");
            }

            return {
                chatId,
                message,
                hasMedia: Boolean(recipient.hasMedia)
            };
        });

        const config = {
            deadline,
            recipients: normalizedRecipients,
            updatedAt: new Date().toISOString()
        };

        saveSwitchConfig(config);

        res.json({
            success: true,
            config
        });

    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

/*
    Frontend
*/

app.get("/", (req, res) => {

    res.sendFile(
        path.join(__dirname, "index.html")
    );

});


/*
    Start server
*/

app.listen(PORT, () => {

    console.log("");

    console.log("================================");
    console.log(" DEAD MAN SWITCH");
    console.log("================================");

    console.log("");

    console.log(
        `Server: http://localhost:${PORT}`
    );

    console.log("");

    console.log(
        "Telegram integration: READY"
    );

    console.log("");

});

const upload = multer({
    dest: path.join(__dirname, "uploads")
});

app.post(
    "/api/telegram/send-custom",
    upload.any(),
    async (req, res) => {

        try {

            const chatIds =
                Array.isArray(req.body.chatIds)
                    ? req.body.chatIds
                    : req.body.chatIds
                        ? [req.body.chatIds]
                        : [];

            const messages =
                Array.isArray(req.body.messages)
                    ? req.body.messages
                    : req.body.messages
                        ? [req.body.messages]
                        : [];

            const results = [];

            for (
                let i = 0;
                i < chatIds.length;
                i++
            ) {

                const chatId =
                    chatIds[i];

                const message =
                    messages[i] || "";

                const media =
                    req.files.find(
                        file =>
                            file.fieldname ===
                            `media_${chatId}`
                    );

                try {

                    /*
                     * TEXT
                     */

                    if (message.trim()) {

                        await telegramRequest(
                            "sendMessage",
                            {
                                chat_id:
                                    chatId,

                                text:
                                    message
                            }
                        );
                    }


                    /*
                     * MEDIA
                     */

                    if (media) {

                        await sendTelegramMedia(
                            chatId,
                            media
                        );
                    }


                    results.push({
                        chatId,
                        success: true
                    });

                } catch (error) {

                    results.push({
                        chatId,
                        success: false,
                        error:
                            error.message
                    });
                }
            }

            res.json({
                success: true,
                results
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                error:
                    error.message
            });
        }
    }
);


async function sendTelegramMedia(
    chatId,
    file
) {

    const fs = require("fs");

    const formData =
        new FormData();

    const fileBuffer =
        fs.readFileSync(
            file.path
        );

    const blob =
        new Blob(
            [
                fileBuffer
            ],
            {
                type:
                    file.mimetype
            }
        );

    formData.append(
        "chat_id",
        String(chatId)
    );

    formData.append(
        "caption",
        ""
    );

    formData.append(
        "document",
        blob,
        file.originalname
    );

    const response =
        await fetch(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`,
            {
                method: "POST",
                body: formData
            }
        );

    const data =
        await response.json();

    if (
        !response.ok ||
        !data.ok
    ) {

        throw new Error(
            data.description ||
            "Telegram media upload failed"
        );
    }

    return data;
}
