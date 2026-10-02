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

    activity: []

};


/* =========================================
   STATE
========================================= */

let state = loadState();
let telegramUsers = [];


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

document.addEventListener("DOMContentLoaded", () => {

    setupEvents();

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


function saveState(newState = state) {

    localStorage.setItem(
        "deadManSwitch",
        JSON.stringify(newState)
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

    element.innerHTML = `
        <label>
            <input
                type="checkbox"
                value="${user.chatId}"
                class="telegram-user"
            >

            ${name || "Unknown user"}

            ${
                user.username
                    ? `(@${user.username})`
                    : ""
            }
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

const testTriggerBtn =
    document.getElementById("testTriggerBtn");

const switchDeadlineInput =
    document.getElementById("switchDeadlineInput");

const switchStatus =
    document.getElementById("switchStatus");


function updateMessageFields() {

    const checkboxes =
        document.querySelectorAll(
            ".telegram-user:checked"
        );

    selectedMessages.innerHTML = "";

    checkboxes.forEach(checkbox => {

        const chatId = checkbox.value;

        const user =
            telegramUsers.find(
                user =>
                    String(user.chatId) ===
                    String(chatId)
            );

        if (!user) {
            return;
        }

        const name = [
            user.firstName,
            user.lastName
        ]
            .filter(Boolean)
            .join(" ");

        const container =
            document.createElement("div");

        container.className =
            "telegram-message";

        container.innerHTML = `
            <h4>
                Message for ${escapeHtml(
                    name || "Unknown user"
                )}
            </h4>

            <textarea
                class="telegram-message-input"
                data-chat-id="${chatId}"
                rows="5"
                placeholder="Message for this person..."
            ></textarea>

            <div class="telegram-media-field">

                <label>
                    Media
                </label>

                <input
                    type="file"
                    class="telegram-media-input"
                    data-chat-id="${chatId}"
                    accept="image/*,video/*"
                >

                <div
                    class="telegram-media-name"
                    data-chat-id="${chatId}"
                >
                    No media selected
                </div>

            </div>
        `;

        selectedMessages.appendChild(
            container
        );

        const mediaInput =
            container.querySelector(
                ".telegram-media-input"
            );

        const mediaName =
            container.querySelector(
                ".telegram-media-name"
            );

        mediaInput.addEventListener(
            "change",
            () => {

                if (
                    mediaInput.files &&
                    mediaInput.files.length > 0
                ) {

                    mediaName.textContent =
                        mediaInput.files[0].name;

                } else {

                    mediaName.textContent =
                        "No media selected";

                }
            }
        );
    });
}

if (saveSwitchBtn) {

    saveSwitchBtn.addEventListener(
        "click",
        async () => {

            try {

                const deadline =
                    switchDeadlineInput.value;

                if (!deadline) {
                    throw new Error(
                        "Select a deadline."
                    );
                }

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

                checkboxes.forEach(
                    checkbox => {

                        const messageInput =
                            document.querySelector(
                                `.telegram-message-input[data-chat-id="${checkbox.value}"]`
                            );

                        const mediaInput =
    document.querySelector(
        `.telegram-media-input[data-chat-id="${checkbox.value}"]`
    );

const media =
    mediaInput?.files?.[0] || null;

recipients.push({
    chatId: checkbox.value,

    message:
        messageInput?.value || "",

    hasMedia:
        Boolean(media)
});
                    }
                );

                for (const recipient of recipients) {

                    if (!recipient.message.trim()) {
                        throw new Error(
                            "Every recipient must have a message."
                        );
                    }
                }

                const response =
                    await fetch(
                        "/api/switch/save",
                        {
                            method: "POST",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body: JSON.stringify({
                                deadline,
                                recipients
                            })
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
                    "✓ Dead Man Switch saved.";

            } catch (error) {

                console.error(error);

                switchStatus.textContent =
                    `✕ ${error.message}`;
            }
        }
    );
}
