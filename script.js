"use strict";

/*
    DEAD MAN SWITCH
    Local frontend prototype.

    Default credentials:
        Username: admin
        Password: admin123

    Everything is stored in localStorage.
*/


/* =========================================
   CONFIGURATION
========================================= */

const DEFAULT_CONFIG = {

    username: "admin",

    password: "admin123",

    deadline: getDefaultDeadline(),

    gracePeriod: 30,

    armed: true,

    lastConfirmation: null,

    triggered: false,

    telegramRecipients: [],

    activity: []

};


/* =========================================
   STATE
========================================= */

let state = loadState();
let telegramUsers = [];
const mediaStore = new Map();

async function loadSavedSwitchConfig() {
    try {
        const response = await fetch("/api/switch/config");
        const data = await response.json();

        if (!response.ok || !data.success) {
            return;
        }

        if (!Array.isArray(data.config?.recipients)) {
            return;
        }

        state.telegramRecipients = data.config.recipients.map(recipient => ({
            chatId: String(recipient.chatId),
            message: recipient.message || "",
            hasMedia: Boolean(recipient.mediaFiles?.length),
            mediaItems: Array.isArray(recipient.mediaFiles)
                ? recipient.mediaFiles.map(file => ({
                    mediaName: file.name || file.fileName || "Media file",
                    mediaType: file.mimeType || "",
                    mediaData: file.url || ""
                }))
                : [],
            mediaName: recipient.mediaFiles?.[0]?.name || recipient.mediaFiles?.[0]?.fileName || "",
            mediaType: recipient.mediaFiles?.[0]?.mimeType || "",
            mediaData: recipient.mediaFiles?.[0]?.url || ""
        }));

        data.config.recipients.forEach(recipient => {
            if (Array.isArray(recipient.mediaFiles)) {
                mediaStore.set(String(recipient.chatId), recipient.mediaFiles.map(file => ({
                    mediaName: file.name || file.fileName || "Media file",
                    mediaType: file.mimeType || "",
                    mediaData: file.url || ""
                })));
            }
        });

        if (typeof renderTelegramSettings === "function") {
            renderTelegramSettings();
        }

    } catch (error) {
        console.error("Failed to load saved trigger config:", error);
    }
}


/* =========================================
   DOM
========================================= */

const loginPage = document.getElementById("loginPage");
const dashboardPage = document.getElementById("dashboardPage");

const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");

const logoutButton = document.getElementById("logoutButton");

const aliveButton = document.getElementById("aliveButton");

const countdownElement = document.getElementById("countdown");
const deadlineText = document.getElementById("deadlineText");

const statusTitle = document.getElementById("statusTitle");
const statusDescription = document.getElementById("statusDescription");

const systemBadge = document.getElementById("systemBadge");

const lastConfirmation = document.getElementById("lastConfirmation");

const settingsDeadline = document.getElementById("settingsDeadline");
const gracePeriodElement = document.getElementById("gracePeriod");
const switchState = document.getElementById("switchState");

const toggleSwitch = document.getElementById("toggleSwitch");

const activityLog = document.getElementById("activityLog");

const currentTime = document.getElementById("currentTime");

const clearLogButton = document.getElementById("clearLog");

const deadlineModal = document.getElementById("deadlineModal");
const graceModal = document.getElementById("graceModal");
const confirmModal = document.getElementById("confirmModal");

const modalDeadlineInput = document.getElementById("modalDeadlineInput");
const graceInput = document.getElementById("graceInput");

const saveDeadlineButton = document.getElementById("saveDeadline");
const saveGraceButton = document.getElementById("saveGrace");

const confirmDisarmButton = document.getElementById("confirmDisarm");

const editDeadlineButton = document.getElementById("editDeadline");
const editGraceButton = document.getElementById("editGrace");


/* =========================================
   INITIALIZATION
========================================= */

document.addEventListener("DOMContentLoaded", async () => {

    setupEvents();

    await loadSavedSwitchConfig();

    if (sessionStorage.getItem("authenticated") === "true") {

        showDashboard();

    } else {

        showLogin();

    }

    render();

    setInterval(updateCountdown, 1000);

    setInterval(updateCurrentTime, 1000);

});


/* =========================================
   DEFAULT DEADLINE
========================================= */

function getDefaultDeadline() {

    const date = new Date();

    date.setDate(date.getDate() + 3);

    date.setHours(20, 0, 0, 0);

    return date.toISOString();

}


/* =========================================
   LOCAL STORAGE
========================================= */

function loadState() {

    const stored = localStorage.getItem("deadManSwitch");

    if (!stored) {

        const initialState = {
            ...DEFAULT_CONFIG
        };

        saveState(initialState);

        return initialState;
    }

    try {

        return {
            ...DEFAULT_CONFIG,
            ...JSON.parse(stored)
        };

    } catch (error) {

        console.error("Failed to load state:", error);

        return {
            ...DEFAULT_CONFIG
        };

    }

}


function sanitizeRecipientForStorage(recipient) {

    if (!recipient) {
        return recipient;
    }

    const mediaItems = Array.isArray(recipient.mediaItems)
        ? recipient.mediaItems.map(item => ({
            mediaName: item?.mediaName || "Media file",
            mediaType: item?.mediaType || "",
            mediaData: ""
        }))
        : [];

    return {
        ...recipient,
        mediaItems,
        mediaData: "",
        mediaName: recipient.mediaName || "",
        mediaType: recipient.mediaType || "",
        hasMedia: mediaItems.length > 0 || Boolean(recipient.hasMedia)
    };
}

function saveState(newState = state) {

    const safeState = {
        ...newState,
        telegramRecipients: Array.isArray(newState.telegramRecipients)
            ? newState.telegramRecipients.map(sanitizeRecipientForStorage)
            : []
    };

    localStorage.setItem(
        "deadManSwitch",
        JSON.stringify(safeState)
    );

}


/* =========================================
   EVENTS
========================================= */

function setupEvents() {

    loginForm.addEventListener(
        "submit",
        handleLogin
    );


    logoutButton.addEventListener(
        "click",
        handleLogout
    );


    aliveButton.addEventListener(
        "click",
        handleAlive
    );


    editDeadlineButton.addEventListener(
        "click",
        openDeadlineModal
    );


    editGraceButton.addEventListener(
        "click",
        openGraceModal
    );


    toggleSwitch.addEventListener(
        "click",
        openConfirmModal
    );


    confirmDisarmButton.addEventListener(
        "click",
        toggleArmedState
    );


    saveDeadlineButton.addEventListener(
        "click",
        saveDeadline
    );


    saveGraceButton.addEventListener(
        "click",
        saveGrace
    );


    clearLogButton.addEventListener(
        "click",
        clearActivity
    );


    document.querySelectorAll("[data-close-modal]")
        .forEach(button => {

            button.addEventListener(
                "click",
                closeAllModals
            );

        });


    document.querySelectorAll(".modal-overlay")
        .forEach(overlay => {

            overlay.addEventListener(
                "click",
                closeAllModals
            );

        });

}


/* =========================================
   LOGIN
========================================= */

function handleLogin(event) {

    event.preventDefault();

    const username =
        document.getElementById("username").value.trim();

    const password =
        document.getElementById("password").value;


    if (
        username === state.username &&
        password === state.password
    ) {

        sessionStorage.setItem(
            "authenticated",
            "true"
        );

        loginError.textContent = "";

        addActivity("Successful authentication", "success");

        showDashboard();

    } else {

        loginError.textContent =
            "Invalid username or password.";

    }

}


function handleLogout() {

    sessionStorage.removeItem("authenticated");

    showLogin();

}


/* =========================================
   PAGE SWITCHING
========================================= */

function showLogin() {

    loginPage.classList.remove("hidden");

    dashboardPage.classList.add("hidden");

}


function showDashboard() {

    loginPage.classList.add("hidden");

    dashboardPage.classList.remove("hidden");

    render();

}


/* =========================================
   I'M ALIVE
========================================= */

function handleAlive() {

    if (!state.armed) {

        addActivity(
            "Confirmation rejected — system is disarmed",
            "warning"
        );

        return;
    }


    if (state.triggered) {

        addActivity(
            "Confirmation rejected — switch already triggered",
            "warning"
        );

        return;
    }


    const now = new Date();


    state.lastConfirmation =
        now.toISOString();


    /*
        For this local prototype,
        I'M ALIVE resets the deadline
        by the same amount of time that
        was configured originally.

        Here we use 3 days.
    */

    const currentDeadline =
        new Date(state.deadline);

    const previousConfirmation =
        state.lastConfirmation
            ? new Date(state.lastConfirmation)
            : new Date();


    /*
        Default heartbeat interval.
    */

    const interval =
        3 * 24 * 60 * 60 * 1000;


    state.deadline =
        new Date(
            now.getTime() + interval
        ).toISOString();


    addActivity(
        "I'M ALIVE confirmation received",
        "success"
    );


    saveState();

    render();

    animateAliveButton();

}


/* =========================================
   ALIVE ANIMATION
========================================= */

function animateAliveButton() {

    aliveButton.style.transform =
        "scale(0.985)";

    setTimeout(() => {

        aliveButton.style.transform =
            "";

    }, 120);

}


/* =========================================
   COUNTDOWN
========================================= */

function updateCountdown() {

    updateCurrentTime();

    if (!state.armed || state.triggered) {

        countdownElement.textContent =
            "--:--:--";

        return;
    }


    const deadline =
        new Date(state.deadline);

    const now =
        new Date();


    let difference =
        deadline.getTime() -
        now.getTime();


    /*
        Deadline reached.
    */

    if (difference <= 0) {

        difference = 0;

        countdownElement.textContent =
            "00:00:00";

        handleDeadlineReached();

        return;

    }


    const totalSeconds =
        Math.floor(
            difference / 1000
        );


    const days =
        Math.floor(
            totalSeconds / 86400
        );

    const hours =
        Math.floor(
            (totalSeconds % 86400) / 3600
        );

    const minutes =
        Math.floor(
            (totalSeconds % 3600) / 60
        );

    const seconds =
        totalSeconds % 60;


    if (days > 0) {

        countdownElement.textContent =
            `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

    } else {

        countdownElement.textContent =
            `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

    }

}


function pad(number) {

    return String(number).padStart(2, "0");

}


/* =========================================
   DEADLINE TRIGGER
========================================= */

function handleDeadlineReached() {

    if (
        state.triggered ||
        !state.armed
    ) {

        return;

    }


    /*
        Local prototype only.

        In the real version this function
        will send the trigger to the server.
    */

    state.triggered = true;

    addActivity(
        "DEADLINE REACHED — TRIGGER ACTIVATED",
        "warning"
    );

    saveState();

    render();

    sendSavedTriggerMessages();

}


/* =========================================
   DEADLINE
========================================= */

function openDeadlineModal() {

    const date =
        new Date(state.deadline);


    const local =
        new Date(
            date.getTime() -
            date.getTimezoneOffset() * 60000
        )
        .toISOString()
        .slice(0, 16);


    modalDeadlineInput.value = local;

    deadlineModal.classList.remove("hidden");

}


function saveDeadline() {

    if (!modalDeadlineInput.value) {

        return;
    }


    const date =
        new Date(
            modalDeadlineInput.value
        );


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return;
    }


    state.deadline =
        date.toISOString();

    state.triggered = false;


    addActivity(
        "Deadline changed",
        "success"
    );


    saveState();

    closeAllModals();

    render();

}


/* =========================================
   GRACE PERIOD
========================================= */

function openGraceModal() {

    graceInput.value =
        state.gracePeriod;

    graceModal.classList.remove("hidden");

}


function saveGrace() {

    const value =
        Number(graceInput.value);


    if (
        Number.isNaN(value) ||
        value < 0
    ) {

        return;
    }


    state.gracePeriod =
        Math.floor(value);


    addActivity(
        `Grace period changed to ${state.gracePeriod} minutes`,
        "success"
    );


    saveState();

    closeAllModals();

    render();

}


/* =========================================
   ARM / DISARM
========================================= */

function openConfirmModal() {

    if (state.armed) {

        confirmModal.classList.remove(
            "hidden"
        );

    } else {

        state.armed = true;

        state.triggered = false;

        addActivity(
            "System armed",
            "success"
        );

        saveState();

        render();

    }

}


function toggleArmedState() {

    state.armed = false;

    addActivity(
        "System disarmed",
        "warning"
    );

    saveState();

    closeAllModals();

    render();

}


/* =========================================
   ACTIVITY LOG
========================================= */

function addActivity(
    message,
    type = ""
) {

    const entry = {

        time:
            new Date().toISOString(),

        message,

        type

    };


    state.activity.unshift(entry);


    /*
        Keep only latest 50 entries.
    */

    state.activity =
        state.activity.slice(0, 50);


    saveState();

    renderActivity();

}


function renderActivity() {

    if (
        !state.activity ||
        state.activity.length === 0
    ) {

        activityLog.innerHTML = `
            <div class="activity-entry">
                <div class="activity-event">
                    No activity yet.
                </div>
            </div>
        `;

        return;

    }


    activityLog.innerHTML =
        state.activity
            .map(entry => {

                const time =
                    formatDateTime(
                        entry.time
                    );


                return `
                    <div class="activity-entry">

                        <div class="activity-time">
                            ${escapeHtml(time)}
                        </div>

                        <div class="activity-event ${escapeHtml(entry.type)}">
                            ${escapeHtml(entry.message)}
                        </div>

                    </div>
                `;

            })
            .join("");

}


function clearActivity() {

    if (
        !confirm(
            "Clear activity log?"
        )
    ) {

        return;
    }


    state.activity = [];

    saveState();

    renderActivity();

}


/* =========================================
   RENDER
========================================= */

function render() {

    renderStatus();

    renderConfiguration();

    renderActivity();

    updateCountdown();

    updateCurrentTime();

}


function renderStatus() {

    if (state.triggered) {

        systemBadge.className =
            "system-badge disarmed";

        systemBadge.innerHTML =
            `<span class="status-dot"></span> TRIGGERED`;


        statusTitle.textContent =
            "SYSTEM TRIGGERED";


        statusDescription.textContent =
            "The configured deadline has been reached.";


        aliveButton.disabled = true;

        aliveButton.style.opacity = "0.4";

        return;

    }


    if (!state.armed) {

        systemBadge.className =
            "system-badge disarmed";

        systemBadge.innerHTML =
            `<span class="status-dot"></span> DISARMED`;


        statusTitle.textContent =
            "SYSTEM DISARMED";


        statusDescription.textContent =
            "The Dead Man Switch is currently inactive.";


        aliveButton.disabled = true;

        aliveButton.style.opacity = "0.4";

        return;

    }


    systemBadge.className =
        "system-badge armed";

    systemBadge.innerHTML =
        `<span class="status-dot"></span> ARMED`;


    statusTitle.textContent =
        "SYSTEM ARMED";


    statusDescription.textContent =
        "The switch is active and waiting for your next confirmation.";


    aliveButton.disabled = false;

    aliveButton.style.opacity = "1";

}


function renderConfiguration() {

    const deadline =
        new Date(state.deadline);


    settingsDeadline.textContent =
        formatDateTime(
            state.deadline
        );


    deadlineText.textContent =
        `Deadline: ${formatDateTime(state.deadline)}`;


    gracePeriodElement.textContent =
        `${state.gracePeriod} minutes`;


    if (state.armed) {

        switchState.textContent =
            "ACTIVE";

        switchState.className =
            "setting-value active";

        toggleSwitch.textContent =
            "DISARM";

    } else {

        switchState.textContent =
            "DISABLED";

        switchState.className =
            "setting-value";

        toggleSwitch.textContent =
            "ARM";

    }


    if (state.lastConfirmation) {

        lastConfirmation.textContent =
            `Last confirmation: ${formatDateTime(state.lastConfirmation)}`;

    } else {

        lastConfirmation.textContent =
            "Last confirmation: No confirmation yet";

    }

}


/* =========================================
   CURRENT TIME
========================================= */

function updateCurrentTime() {

    currentTime.textContent =
        formatDateTime(
            new Date().toISOString()
        );

}


/* =========================================
   DATE FORMATTING
========================================= */

function formatDateTime(
    isoDate
) {

    const date =
        new Date(isoDate);


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return "—";

    }


    return new Intl.DateTimeFormat(
        undefined,
        {
            year: "numeric",
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        }
    ).format(date);

}


/* =========================================
   MODALS
========================================= */

function closeAllModals() {

    deadlineModal.classList.add(
        "hidden"
    );

    graceModal.classList.add(
        "hidden"
    );

    confirmModal.classList.add(
        "hidden"
    );

}


/* =========================================
   SECURITY
========================================= */

function escapeHtml(value) {

    return String(value)

        .replaceAll("&", "&amp;")

        .replaceAll("<", "&lt;")

        .replaceAll(">", "&gt;")

        .replaceAll('"', "&quot;")

        .replaceAll("'", "&#039;");

}

const sendTelegramBtn = document.getElementById("sendTelegramBtn");
const telegramStatus = document.getElementById("telegramStatus");

if (sendTelegramBtn) {

    sendTelegramBtn.addEventListener(
        "click",
        async () => {

            sendTelegramBtn.disabled = true;

            telegramStatus.textContent =
                "Sending...";

            try {

                const selectedUsers =
                    document.querySelectorAll(
                        ".telegram-user:checked"
                    );

                if (
                    selectedUsers.length === 0
                ) {
                    throw new Error(
                        "Select at least one Telegram recipient."
                    );
                }

                const formData =
                    new FormData();

                selectedUsers.forEach(
                    checkbox => {

                        const chatId =
                            checkbox.value;

                        const messageInput =
                            document.querySelector(
                                `.telegram-message-input[data-chat-id="${chatId}"]`
                            );

                        const mediaInput =
                            document.querySelector(
                                `.telegram-media-input[data-chat-id="${chatId}"]`
                            );

                        const message =
                            messageInput?.value || "";

                        const media =
                            mediaInput?.files?.[0];

                        if (
                            !message.trim() &&
                            !media
                        ) {
                            throw new Error(
                                "Every recipient must have a message or media."
                            );
                        }

                        formData.append(
                            "chatIds",
                            chatId
                        );

                        formData.append(
                            "messages",
                            message
                        );

                        if (media) {

                            formData.append(
                                `media_${chatId}`,
                                media
                            );

                        }
                    }
                );

                const response =
                    await fetch(
                        "/api/telegram/send-custom",
                        {
                            method: "POST",
                            body: formData
                        }
                    );

                const data =
                    await response.json();

                if (!response.ok) {

                    throw new Error(
                        data.error ||
                        "Failed to send Telegram messages"
                    );
                }

                const successful =
                    data.results.filter(
                        result =>
                            result.success
                    );

                const failed =
                    data.results.filter(
                        result =>
                            !result.success
                    );

                if (
                    failed.length === 0
                ) {

                    telegramStatus.textContent =
                        `✓ Sent to ${successful.length} recipient(s)`;

                } else {

                    telegramStatus.textContent =
                        `✓ Sent: ${successful.length}, Failed: ${failed.length}`;

                    console.error(
                        "Telegram errors:",
                        failed
                    );
                }

            } catch (error) {

                console.error(error);

                telegramStatus.textContent =
                    `✕ ${error.message}`;

            } finally {

                sendTelegramBtn.disabled =
                    false;

            }
        }
    );
}


const connectTelegramBtn =
    document.getElementById("connectTelegramBtn");

const telegramUsersList =
    document.getElementById("telegramUsersList");


async function loadTelegramUsers() {
    
    try {
        const response =
            await fetch("/api/telegram/users");

       const data =
    await response.json();

if (!data.success) {
    throw new Error(
        data.error || "Failed to load users"
    );
}

telegramUsers = data.users;

        telegramUsersList.innerHTML = "";

        if (data.users.length === 0) {
            telegramUsersList.innerHTML =
                "<p>No Telegram users connected.</p>";

            return;
        }

        data.users.forEach(user => {

    const element =
        document.createElement("div");

    const name = [
        user.firstName,
        user.lastName
    ]
        .filter(Boolean)
        .join(" ");

    element.className = "telegram-user-card";

    element.innerHTML = `
        <label>
            <input
                type="checkbox"
                value="${user.chatId}"
                class="telegram-user"
            >

            <span class="telegram-user-name">
                <span>${escapeHtml(name || "Unknown user")}</span>
                <small>${escapeHtml(user.username ? `@${user.username}` : `Chat ID: ${user.chatId}`)}</small>
            </span>
        </label>
    `;

    telegramUsersList.appendChild(
        element
    );

    const checkbox =
        element.querySelector(
            ".telegram-user"
        );

    checkbox.addEventListener(
        "change",
        updateMessageFields
    );
});

renderTelegramSettings();

    } catch (error) {
        console.error(error);

        telegramUsersList.innerHTML =
            `<p>✕ ${error.message}</p>`;
    }
}


if (connectTelegramBtn) {
    connectTelegramBtn.addEventListener(
        "click",
        async () => {

            connectTelegramBtn.disabled = true;
            connectTelegramBtn.textContent =
                "CHECKING...";

            try {
                const response =
                    await fetch(
                        "/api/telegram/connect"
                    );

                const data =
                    await response.json();

                if (!data.success) {
                    throw new Error(
                        data.error ||
                        "Failed to connect Telegram users"
                    );
                }

                await loadTelegramUsers();

            } catch (error) {
                console.error(error);

                telegramUsersList.innerHTML =
                    `<p>✕ ${error.message}</p>`;

            } finally {
                connectTelegramBtn.disabled = false;
                connectTelegramBtn.textContent =
                    "CHECK FOR NEW USERS";
            }
        }
    );
}


loadTelegramUsers();

const selectedMessages =
    document.getElementById("selectedMessages");

const saveSwitchBtn =
    document.getElementById("saveSwitchBtn");

const switchStatus =
    document.getElementById("switchStatus");


function getTelegramRecipient(chatId) {

    return state.telegramRecipients.find(
        recipient =>
            String(recipient.chatId) ===
            String(chatId)
    );
}

function getSavedMediaForChat(chatId) {

    const inState = getTelegramRecipient(chatId);

    if (inState?.mediaItems?.length) {
        return inState.mediaItems;
    }

    if (inState?.mediaData) {
        return [{
            mediaData: inState.mediaData,
            mediaName: inState.mediaName || "Media file",
            mediaType: inState.mediaType || ""
        }];
    }

    return mediaStore.get(String(chatId)) || [];
}

function getMediaPreviewMarkup(items = []) {

    if (!Array.isArray(items) || items.length === 0) {
        return `
            <div class="telegram-media-chip empty">
                <span class="telegram-media-icon">📎</span>
                <span>No media selected</span>
            </div>
        `;
    }

    return items.map(item => {
        const mediaData = item?.mediaData || "";
        const mediaName = item?.mediaName || "Media file";
        const mediaType = item?.mediaType || "";

        const isImage =
            mediaType.startsWith("image/") ||
            mediaData.startsWith("data:image/");

        if (isImage) {
            return `
                <div class="telegram-media-chip image">
                    <img src="${mediaData}" alt="${escapeHtml(mediaName || "media preview")}" />
                    <span>${escapeHtml(mediaName || "Image")}</span>
                </div>
            `;
        }

        return `
            <div class="telegram-media-chip file">
                <span class="telegram-media-icon">📎</span>
                <span>${escapeHtml(mediaName || "Media file")}</span>
            </div>
        `;
    }).join("");
}

function renderTelegramSettings() {

    if (!selectedMessages) {
        return;
    }

    selectedMessages.innerHTML = "";

    if (telegramUsers.length === 0) {
        selectedMessages.innerHTML =
            "<p>No Telegram users connected.</p>";
        return;
    }

    telegramUsers.forEach(user => {

        const chatId = String(user.chatId);
        const existing = getTelegramRecipient(chatId);
        const name = [
            user.firstName,
            user.lastName
        ].filter(Boolean).join(" ");

        const mediaItems = getSavedMediaForChat(chatId);

        const container = document.createElement("div");
        container.className = "telegram-message";

        container.innerHTML = `
            <div class="telegram-user-header">
                <label>
                    <input
                        type="checkbox"
                        value="${chatId}"
                        class="telegram-user"
                        ${existing ? "checked" : ""}
                    >
                    <span>${escapeHtml(name || "Unknown user")}</span>
                </label>
            </div>

            <h4>Message</h4>

            <textarea
                class="telegram-message-input"
                data-chat-id="${chatId}"
                rows="5"
                placeholder="Message for this person...">${escapeHtml(existing?.message || "")}</textarea>

            <div class="telegram-media-field">
                <label>Media</label>

                <input
                    type="file"
                    class="telegram-media-input"
                    data-chat-id="${chatId}"
                    accept="image/*,video/*"
                    multiple
                >

                <div class="telegram-media-preview" data-chat-id="${chatId}">
                    ${getMediaPreviewMarkup(mediaItems)}
                </div>
            </div>

            <button class="telegram-save-button" data-chat-id="${chatId}">
                Save user
            </button>
        `;

        selectedMessages.appendChild(container);

        const checkbox = container.querySelector(".telegram-user");
        checkbox.addEventListener("change", updateMessageFields);

        const mediaInput = container.querySelector(".telegram-media-input");
        const mediaPreview = container.querySelector(".telegram-media-preview");

        mediaInput.addEventListener("change", async () => {
            const files = Array.from(mediaInput.files || []);

            if (files.length === 0) {
                mediaPreview.innerHTML = getMediaPreviewMarkup(mediaItems);
                return;
            }

            const prepared = [];

            for (const file of files) {
                prepared.push({
                    mediaData: await fileToDataUrl(file),
                    mediaName: file.name,
                    mediaType: file.type
                });
            }

            mediaPreview.innerHTML = getMediaPreviewMarkup(prepared);
        });

        const saveButton = container.querySelector(".telegram-save-button");
        saveButton.addEventListener("click", async () => {
            const messageInput = container.querySelector(".telegram-message-input");
            const currentMessage = messageInput.value.trim();
            const files = Array.from(mediaInput.files || []);
            const preparedMedia = [];

            for (const file of files) {
                preparedMedia.push({
                    mediaData: await fileToDataUrl(file),
                    mediaName: file.name,
                    mediaType: file.type
                });
            }

            const mergedMedia =
                preparedMedia.length > 0
                    ? preparedMedia
                    : mediaItems;

            const recipient = {
                chatId,
                message: currentMessage,
                hasMedia: mergedMedia.length > 0,
                mediaItems: mergedMedia,
                mediaName: mergedMedia[0]?.mediaName || existing?.mediaName || "",
                mediaType: mergedMedia[0]?.mediaType || existing?.mediaType || "",
                mediaData: mergedMedia[0]?.mediaData || existing?.mediaData || ""
            };

            mediaStore.set(String(chatId), mergedMedia);

            const index = state.telegramRecipients.findIndex(
                item => String(item.chatId) === String(chatId)
            );

            if (index >= 0) {
                state.telegramRecipients[index] = recipient;
            } else {
                state.telegramRecipients.push(recipient);
            }

            saveState();
            renderTelegramSettings();
            switchStatus.textContent = `✓ Saved message for ${name || "user"}.`;
            addActivity(`Saved Telegram message for ${name || "user"}`, "success");
        });
    });
}

function updateMessageFields() {

    const checkboxes =
        document.querySelectorAll(
            ".telegram-user:checked"
        );

    const selected = Array.from(checkboxes).map(
        checkbox => checkbox.value
    );

    document.querySelectorAll(".telegram-user").forEach(checkbox => {
        const card = checkbox.closest(".telegram-message");
        if (!card) {
            return;
        }

        if (selected.includes(checkbox.value)) {
            card.classList.add("selected");
        } else {
            card.classList.remove("selected");
        }
    });
}

if (saveSwitchBtn) {

    saveSwitchBtn.addEventListener(
        "click",
        async () => {

            try {

                const checkboxes =
                    document.querySelectorAll(
                        ".telegram-user:checked"
                    );

                if (checkboxes.length === 0) {
                    throw new Error(
                        "Select at least one recipient."
                    );
                }

                const recipients = [];

                for (const checkbox of checkboxes) {

                    const chatId = checkbox.value;
                    const savedRecipient = getTelegramRecipient(chatId);

                    const messageInput =
                        document.querySelector(
                            `.telegram-message-input[data-chat-id="${chatId}"]`
                        );

                    const mediaInput =
                        document.querySelector(
                            `.telegram-media-input[data-chat-id="${chatId}"]`
                        );

                    const files = Array.from(mediaInput?.files || []);
                    const message =
                        messageInput?.value || savedRecipient?.message || "";

                    const mediaItems =
                        files.length > 0
                            ? await Promise.all(files.map(async file => ({
                                mediaData: await fileToDataUrl(file),
                                mediaName: file.name,
                                mediaType: file.type
                            })))
                            : Array.isArray(savedRecipient?.mediaItems)
                                ? savedRecipient.mediaItems
                                : savedRecipient?.mediaData
                                    ? [{
                                        mediaData: savedRecipient.mediaData,
                                        mediaName: savedRecipient.mediaName || "Media file",
                                        mediaType: savedRecipient.mediaType || ""
                                    }]
                                    : [];

                    if (!message.trim() && mediaItems.length === 0) {
                        throw new Error(
                            "Every selected user needs a message or media."
                        );
                    }

                    const recipient = {
                        chatId,
                        message: message.trim(),
                        hasMedia: mediaItems.length > 0,
                        mediaItems,
                        mediaName: mediaItems[0]?.mediaName || "",
                        mediaType: mediaItems[0]?.mediaType || "",
                        mediaData: mediaItems[0]?.mediaData || ""
                    };

                    mediaStore.set(String(chatId), mediaItems);

                    recipients.push(recipient);
                    const index = state.telegramRecipients.findIndex(
                        item => String(item.chatId) === String(chatId)
                    );

                    if (index >= 0) {
                        state.telegramRecipients[index] = recipient;
                    } else {
                        state.telegramRecipients.push(recipient);
                    }
                }

                state.telegramRecipients = recipients;

                saveState();

                const formData = new FormData();
                formData.append("deadline", state.deadline);

                recipients.forEach((recipient, index) => {
                    formData.append("chatIds", recipient.chatId);
                    formData.append("messages", recipient.message || "");

                    recipient.mediaItems.forEach((item, itemIndex) => {
                        if (!item.mediaData || !item.mediaData.startsWith("data:")) {
                            return;
                        }

                        const mediaFile = dataUrlToFile(
                            item.mediaData,
                            item.mediaName || `media-${recipient.chatId}-${itemIndex}`
                        );

                        formData.append(
                            `media_${recipient.chatId}_${itemIndex}`,
                            mediaFile
                        );
                    });
                });

                const response =
                    await fetch(
                        "/api/switch/save",
                        {
                            method: "POST",
                            body: formData
                        }
                    );

                const data =
                    await response.json();

                if (!response.ok) {
                    throw new Error(
                        data.error ||
                        "Failed to save switch"
                    );
                }

                switchStatus.textContent =
                    "✓ Trigger settings saved.";

                addActivity(
                    `Telegram trigger settings saved for ${recipients.length} user(s)`,
                    "success"
                );

            } catch (error) {

                console.error(error);

                switchStatus.textContent =
                    `✕ ${error.message}`;
            }
        }
    );
}

async function sendSavedTriggerMessages() {

    if (!Array.isArray(state.telegramRecipients) || state.telegramRecipients.length === 0) {
        return;
    }

    const formData = new FormData();

    state.telegramRecipients.forEach(recipient => {

        if (!recipient?.chatId) {
            return;
        }

        const mediaItems = getSavedMediaForChat(recipient.chatId);

        formData.append(
            "chatIds",
            recipient.chatId
        );

        formData.append(
            "messages",
            recipient.message || ""
        );

        mediaItems.forEach((item, index) => {
            const mediaFile =
                dataUrlToFile(
                    item.mediaData,
                    item.mediaName || `media-${recipient.chatId}-${index}`
                );

            formData.append(
                `media_${recipient.chatId}_${index}`,
                mediaFile
            );
        });
    });

    try {

        const response =
            await fetch(
                "/api/telegram/send-custom",
                {
                    method: "POST",
                    body: formData
                }
            );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error ||
                "Failed to send saved trigger messages"
            );
        }

        const successful =
            data.results.filter(
                item => item.success
            ).length;

        addActivity(
            `Trigger sent to ${successful} recipient(s)`,
            "success"
        );

    } catch (error) {

        console.error(error);

        addActivity(
            `Trigger failed: ${error.message}`,
            "warning"
        );
    }
}

function fileToDataUrl(file) {

    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Failed to read file."));
        reader.readAsDataURL(file);
    });
}

function dataUrlToFile(dataUrl, filename) {

    const match =
        dataUrl.match(/^data:(.*?);base64,(.*)$/);

    if (!match) {
        return new File(
            [dataUrl],
            filename,
            { type: "application/octet-stream" }
        );
    }

    const mime = match[1] || "application/octet-stream";
    const base64 = match[2];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index++) {
        bytes[index] = binary.charCodeAt(index);
    }

    return new File(
        [bytes],
        filename,
        { type: mime }
    );
}
