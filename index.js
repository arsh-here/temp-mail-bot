const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// 🔑 PUT YOUR BOT TOKEN HERE
const token = "8774672546:AAE8rJwLI8aGTpt8OwxBZdCLRqXXjCY2Sn8";

const bot = new TelegramBot(token, { polling: true });

// Store multiple emails
bot.userData = {};

console.log("🤖 Bot is running...");

// ================= FUNCTIONS =================

// Generate Email
async function generateMail(msg) {
    try {
        const domainRes = await axios.get("https://api.mail.tm/domains");
        const domain = domainRes.data["hydra:member"][0].domain;

        const random = Math.random().toString(36).substring(2, 10);
        const email = `${random}@${domain}`;
        const password = "12345678";

        await axios.post("https://api.mail.tm/accounts", {
            address: email,
            password: password
        });

        if (!bot.userData[msg.chat.id]) {
            bot.userData[msg.chat.id] = [];
        }

        bot.userData[msg.chat.id].push({
            email,
            password,
            lastCount: 0
        });

        bot.sendMessage(
            msg.chat.id,
            `✅ New Email Created:\n📧 ${email}`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "📄 List Emails", callback_data: "list_emails" }],
                        [{ text: "📥 Inbox", callback_data: "check_inbox" }]
                    ]
                }
            }
        );

    } catch (error) {
        console.log("MAIL ERROR:", error.response?.data || error.message);
        bot.sendMessage(msg.chat.id, "❌ Error creating email");
    }
}

// List Emails
function listEmails(msg) {
    const users = bot.userData[msg.chat.id];

    if (!users || users.length === 0) {
        return bot.sendMessage(msg.chat.id, "❌ No emails created");
    }

    let reply = "📧 Your Emails:\n\n";

    users.forEach((u, i) => {
        reply += `${i + 1}. ${u.email}\n`;
    });

    bot.sendMessage(msg.chat.id, reply);
}

// Check Inbox
async function checkInbox(msg) {
    const users = bot.userData[msg.chat.id];

    if (!users || users.length === 0) {
        return bot.sendMessage(msg.chat.id, "❌ No emails created");
    }

    let reply = "📥 Inbox:\n\n";

    for (let acc of users) {
        try {
            const loginRes = await axios.post("https://api.mail.tm/token", {
                address: acc.email,
                password: acc.password
            });

            const token = loginRes.data.token;

            const msgRes = await axios.get("https://api.mail.tm/messages", {
                headers: { Authorization: `Bearer ${token}` }
            });

            const messages = msgRes.data["hydra:member"];

            if (messages.length === 0) continue;

            reply += `📧 ${acc.email}\n`;

            for (let m of messages) {
                const full = await axios.get(
                    `https://api.mail.tm/messages/${m.id}`,
                    {
                        headers: { Authorization: `Bearer ${token}` }
                    }
                );

                const content = full.data.text || "No content";

                reply += `From: ${m.from.address}\nSubject: ${m.subject}\nMessage: ${content}\n\n`;
            }

        } catch (err) {
            console.log("Inbox error:", err.message);
        }
    }

    bot.sendMessage(msg.chat.id, reply || "📭 No emails found");
}

// ================= COMMANDS =================

// START
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(
        msg.chat.id,
        "👋 Temp Mail Bot 😈\n\nChoose an option:",
        {
            reply_markup: {
                keyboard: [
                    ["📧 Generate Email"],
                    ["📥 Inbox"],
                    ["📄 List Emails"],
                    ["🗑 Delete Email"]
                ],
                resize_keyboard: true
            }
        }
    );
});

// ================= BUTTON HANDLER =================

bot.on("message", (msg) => {
    const text = msg.text;

    if (text === "📧 Generate Email") generateMail(msg);
    if (text === "📥 Inbox") checkInbox(msg);
    if (text === "📄 List Emails") listEmails(msg);

    // DELETE BUTTON
    if (text === "🗑 Delete Email") {
        const users = bot.userData[msg.chat.id];

        if (!users || users.length === 0) {
            return bot.sendMessage(msg.chat.id, "❌ No emails to delete");
        }

        const buttons = users.map((u, i) => ([
            { text: `🗑 ${u.email}`, callback_data: `delete_${i}` }
        ]));

        bot.sendMessage(msg.chat.id, "Select email to delete:", {
            reply_markup: {
                inline_keyboard: buttons
            }
        });
    }
});

// ================= CALLBACK HANDLER =================

bot.on("callback_query", async (query) => {
    const msg = query.message;
    const data = query.data;
    const chatId = msg.chat.id;

    // INLINE BUTTONS
    if (data === "list_emails") {
        listEmails(msg);
    }

    if (data === "check_inbox") {
        checkInbox(msg);
    }

    // SELECT DELETE
    if (data.startsWith("delete_")) {
        const index = parseInt(data.split("_")[1]);
        const user = bot.userData[chatId][index];

        bot.sendMessage(chatId,
            `⚠️ Delete this email?\n\n${user.email}`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "✅ Yes", callback_data: `confirm_delete_${index}` },
                            { text: "❌ No", callback_data: "cancel_delete" }
                        ]
                    ]
                }
            }
        );
    }

    // CONFIRM DELETE
    if (data.startsWith("confirm_delete_")) {
        const index = parseInt(data.split("_")[2]);
        const users = bot.userData[chatId];

        const removed = users.splice(index, 1);

        bot.sendMessage(chatId, `🗑 Deleted: ${removed[0].email}`);
    }

    // CANCEL DELETE
    if (data === "cancel_delete") {
        bot.sendMessage(chatId, "❌ Delete cancelled");
    }

    bot.answerCallbackQuery(query.id);
});

// ================= NOTIFICATION SYSTEM =================

setInterval(async () => {
    for (let chatId in bot.userData) {
        const accounts = bot.userData[chatId];

        for (let acc of accounts) {
            try {
                const loginRes = await axios.post("https://api.mail.tm/token", {
                    address: acc.email,
                    password: acc.password
                });

                const token = loginRes.data.token;

                const msgRes = await axios.get("https://api.mail.tm/messages", {
                    headers: { Authorization: `Bearer ${token}` }
                });

                const messages = msgRes.data["hydra:member"];

                if (messages.length > acc.lastCount) {
                    acc.lastCount = messages.length;

                    bot.sendMessage(
                        chatId,
                        `🔔 New Email on:\n${acc.email}`
                    );
                }

            } catch (err) {
                console.log("Notify error:", err.message);
            }
        }
    }
}, 15000);