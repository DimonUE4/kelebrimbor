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
const UPLOADS_DIR = path.join(__dirname, "uploads");

function ensureUploadsDirectory() {
    if (!fs.existsSync(UPLOADS_DIR)) {
        fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
}

ensureUploadsDirectory();

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

app.use(express.json({ limit: "100mb" }));

app.use("/uploads", express.static(UPLOADS_DIR));

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

function saveUploadedMedia(file) {
    const extension = path.extname(file.originalname || file.filename || "media");
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}${extension || ""}`;
    const chatDir = path.join(UPLOADS_DIR, "telegram");
    if (!fs.existsSync(chatDir)) {
        fs.mkdirSync(chatDir, { recursive: true });
    }

    const targetPath = path.join(chatDir, safeName);
    fs.copyFileSync(file.path, targetPath);

    try {
        fs.unlinkSync(file.path);
    } catch {}

    return {
        name: file.originalname || file.filename || safeName,
        fileName: safeName,
        mimeType: file.mimetype || "application/octet-stream",
        size: file.size || 0,
        url: `/uploads/telegram/${safeName}`
    };
}

app.post("/api/switch/save", upload.any(), (req, res) => {
    try {
        const rawDeadline = req.body.deadline || req.body["deadline"] || null;
        const deadline = rawDeadline ? String(rawDeadline) : null;

        let bodyRecipients = req.body.recipients;
        if (typeof bodyRecipients === "string") {
            try {
                bodyRecipients = JSON.parse(bodyRecipients);
            } catch {
                bodyRecipients = null;
            }
        }

        const rawChatIds = Array.isArray(req.body.chatIds)
            ? req.body.chatIds
            : req.body.chatIds
                ? [req.body.chatIds]
                : [];

        const rawMessages = Array.isArray(req.body.messages)
            ? req.body.messages
            : req.body.messages
                ? [req.body.messages]
                : [];

        const filesByChat = {};

        for (const file of req.files || []) {
            const match = file.fieldname.match(/^media_(.+?)(?:_(\d+))?$/);
            if (!match) continue;

            const chatId = match[1];
            const index = Number(match[2] || 0);
            if (!filesByChat[chatId]) filesByChat[chatId] = [];
            filesByChat[chatId][index] = file;
        }

        const recipients = [];
        const sourceRecipients = Array.isArray(bodyRecipients) && bodyRecipients.length > 0
            ? bodyRecipients
            : rawChatIds.length > 0
                ? rawChatIds.map((chatId, index) => ({
                    chatId,
                    message: rawMessages[index] || "",
                    mediaFiles: []
                }))
                : [];

        for (const recipient of sourceRecipients) {
            const chatId = String(recipient.chatId || "").trim();
            const message = String(recipient.message || "").trim();
            const mediaFiles = [];

            const files = filesByChat[chatId] || [];
            for (const file of files.filter(Boolean)) {
                const savedFile = saveUploadedMedia(file);
                mediaFiles.push(savedFile);
            }

            if (!chatId) continue;

            recipients.push({
                chatId,
                message,
                hasMedia: mediaFiles.length > 0 || Boolean(recipient.hasMedia),
                mediaFiles,
                updatedAt: new Date().toISOString()
            });
        }

        if (!deadline) {
            return res.status(400).json({
                success: false,
                error: "Deadline is required."
            });
        }

        if (!recipients.length) {
            return res.status(400).json({
                success: false,
                error: "At least one recipient is required."
            });
        }

        const config = {
            deadline,
            recipients,
            updatedAt: new Date().toISOString()
        };

        saveSwitchConfig(config);

        res.json({
            success: true,
            config
        });

    } catch (error) {
        console.error("save switch error:", error);
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
    dest: path.join(__dirname, "uploads"),
    limits: {
        fileSize: 1024 * 1024 * 1024,
        files: 50
    }
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

            const filesByChat = {};

            for (const file of req.files || []) {
                const match = file.fieldname.match(/^media_(.+?)(?:_(\d+))?$/);

                if (!match) {
                    continue;
                }

                const chatId = match[1];
                const index = match[2] || "0";

                if (!filesByChat[chatId]) {
                    filesByChat[chatId] = [];
                }

                filesByChat[chatId][Number(index)] = file;
            }

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

                const mediaFiles =
                    Object.values(filesByChat[chatId] || {})
                        .filter(Boolean);

                try {

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

                    if (mediaFiles.length > 0) {

                        await sendTelegramMedia(
                            chatId,
                            mediaFiles
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
    fileOrFiles
) {

    const fs = require("fs");
    const files = Array.isArray(fileOrFiles)
        ? fileOrFiles
        : [fileOrFiles];

    for (const file of files) {
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

        const mimeType =
            file.mimetype || "application/octet-stream";

        let method = "sendDocument";
        let fieldName = "document";

        if (mimeType.startsWith("video/")) {
            method = "sendVideo";
            fieldName = "video";
        } else if (mimeType.startsWith("image/")) {
            method = "sendPhoto";
            fieldName = "photo";
        }

        const formData =
            new FormData();

        formData.append(
            "chat_id",
            String(chatId)
        );

        formData.append(
            fieldName,
            blob,
            file.originalname || file.filename || "media"
        );

        if (method !== "sendPhoto") {
            formData.append(
                "caption",
                ""
            );
        }

        const response =
            await fetch(
                `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`,
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
    }

    return true;
}
