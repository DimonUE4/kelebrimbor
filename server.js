const express = require("express");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config();

const app = express();

const PORT = process.env.PORT || 3000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

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