/*
 * Twactics Snipe Helper
 *
 * Landing-time helper for Tribal Wars command confirmation pages.
 * No auto-send, no auto-click, no automatic troop action.
 */

(function () {
  if (window.twacticsSnipeHelper && typeof window.twacticsSnipeHelper.destroy === "function") {
    window.twacticsSnipeHelper.destroy();
  }

  const CONFIG = {
    timeColor: typeof timeColor !== "undefined" ? timeColor : "green",
    waitingColor: typeof waitingColor !== "undefined" ? waitingColor : "#ff9933",
    noDateColor: typeof noDateColor !== "undefined" ? noDateColor : "green",
    timeBarWidth: typeof timeBarWidth !== "undefined" ? timeBarWidth : false,
    fps: 50
  };

  const SCRIPT_NAME = "Twactics Snipe Helper";
  const SCRIPT_VERSION = "v1.0.0";
  const STORAGE_KEY = getStorageKey();

  const app = {
    started: false,
    interval: null,
    observer: null,
    originalTitle: document.title,
    clockOffset: 0,
    duration: 0,
    targetMs: null,
    sendMs: null
  };

  const ui = {};

  window.twacticsSnipeHelper = {
    destroy: destroy
  };

  function getStorageKey() {
    const world =
      typeof game_data !== "undefined" && game_data.world
        ? game_data.world
        : window.location.hostname;

    return world + "_twactics_snipe_helper";
  }

  function cleanText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function pad(value, length) {
    return String(value).padStart(length || 2, "0");
  }

  function clampNumber(value, min, max, fallback) {
    const parsed = parseInt(value, 10);

    if (isNaN(parsed)) return fallback;
    if (parsed < min) return min;
    if (parsed > max) return max;

    return parsed;
  }

  function getParam(name, url) {
    try {
      return new URL(url || window.location.href, window.location.origin).searchParams.get(name);
    } catch (e) {
      return null;
    }
  }

  function getSearchParamsFromUrl(url) {
    try {
      return new URL(url || "", window.location.origin).searchParams;
    } catch (e) {
      return new URLSearchParams("");
    }
  }

  function getRawServerNowMs() {
    if (typeof Timing !== "undefined" && typeof Timing.getCurrentServerTime === "function") {
      return Timing.getCurrentServerTime();
    }

    return Date.now();
  }

  function parseServerDateFromDom() {
    const serverDateEl = document.getElementById("serverDate");
    const serverTimeEl = document.getElementById("serverTime");

    if (!serverDateEl || !serverTimeEl) {
      return Date.now();
    }

    const dateParts = cleanText(serverDateEl.textContent).match(/\d+/g);
    const timeParts = cleanText(serverTimeEl.textContent).match(/\d+/g);

    if (!dateParts || dateParts.length < 3 || !timeParts || timeParts.length < 2) {
      return Date.now();
    }

    const day = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10);
    const year = parseInt(dateParts[2], 10);

    const hour = parseInt(timeParts[0], 10);
    const minute = parseInt(timeParts[1], 10);
    const second = parseInt(timeParts[2] || "0", 10);

    return new Date(year, month - 1, day, hour, minute, second, 0).getTime();
  }

  function syncClockOffset() {
    const domServerMs = parseServerDateFromDom();
    const rawNow = getRawServerNowMs();
    const rawRoundedToSecond = Math.floor(rawNow / 1000) * 1000;

    app.clockOffset = domServerMs - rawRoundedToSecond;
  }

  function getServerNowMs() {
    return getRawServerNowMs() + app.clockOffset;
  }

  function dateToInputValue(ms) {
    const date = new Date(ms);

    return (
      date.getFullYear() +
      "-" +
      pad(date.getMonth() + 1) +
      "-" +
      pad(date.getDate())
    );
  }

  function formatTime(ms, includeMs, msStep) {
    const date = new Date(ms);

    const base =
      pad(date.getHours()) +
      ":" +
      pad(date.getMinutes()) +
      ":" +
      pad(date.getSeconds());

    if (includeMs) {
      let shownMs = date.getMilliseconds();

      if (msStep && msStep > 1) {
        shownMs = Math.floor(shownMs / msStep) * msStep;
      }

      return base + "." + pad(shownMs, 3);
    }

    return base;
  }

  function formatDateTime(ms, includeMs) {
    const date = new Date(ms);

    return (
      pad(date.getDate()) +
      "/" +
      pad(date.getMonth() + 1) +
      " " +
      formatTime(ms, includeMs)
    );
  }

  function formatDuration(ms) {
    if (ms <= 0) return "Too late";

    const totalSeconds = Math.ceil(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return pad(hours) + ":" + pad(minutes) + ":" + pad(seconds);
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;

      return JSON.parse(raw);
    } catch (err) {
      console.warn(SCRIPT_NAME + " could not load settings:", err);
      return null;
    }
  }

  function saveSettings() {
    try {
      const remember = ui.remember.checked;

      const data = {
        remember: remember,
        offsetMs: clampNumber(ui.offsetMs.value, -9999, 9999, 0)
      };

      if (remember && app.targetMs !== null && !isNaN(app.targetMs)) {
        data.date = ui.targetDate.value;
        data.hour = clampNumber(ui.targetHour.value, 0, 23, 0);
        data.minute = clampNumber(ui.targetMinute.value, 0, 59, 0);
        data.second = clampNumber(ui.targetSecond.value, 0, 59, 0);
        data.ms = clampNumber(ui.targetMs.value, 0, 999, 0);
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      console.warn(SCRIPT_NAME + " could not save settings:", err);
    }
  }

  function getTargetMsFromInputs() {
    if (!ui.targetDate.value) return null;

    const dateParts = ui.targetDate.value.match(/\d+/g);
    if (!dateParts || dateParts.length < 3) return null;

    const year = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10);
    const day = parseInt(dateParts[2], 10);

    const hour = clampNumber(ui.targetHour.value, 0, 23, 0);
    const minute = clampNumber(ui.targetMinute.value, 0, 59, 0);
    const second = clampNumber(ui.targetSecond.value, 0, 59, 0);
    const ms = clampNumber(ui.targetMs.value, 0, 999, 0);

    return new Date(year, month - 1, day, hour, minute, second, ms).getTime();
  }

  function setInputsFromMs(ms) {
    const date = new Date(ms);

    ui.targetDate.value = dateToInputValue(ms);
    ui.targetHour.value = pad(date.getHours());
    ui.targetMinute.value = pad(date.getMinutes());
    ui.targetSecond.value = pad(date.getSeconds());
    ui.targetMs.value = String(date.getMilliseconds());
  }

  function updateFromInputs(shouldSave) {
    const targetMs = getTargetMsFromInputs();

    app.targetMs = targetMs;

    if (targetMs === null || isNaN(targetMs)) {
      app.sendMs = null;
      ui.sendTime.textContent = "No target time";
      ui.countdown.textContent = "--:--:--";
      document.title = app.originalTitle;

      if (shouldSave) saveSettings();
      return;
    }

    app.sendMs = targetMs - app.duration;

    ui.sendTime.textContent = formatDateTime(app.sendMs, true);
    ui.countdown.textContent = formatDuration(app.sendMs - getServerNowMs());

    if (shouldSave) saveSettings();
  }

  function parseArrivalTextToMs(text) {
    const raw = cleanText(text);
    const timeMatch = raw.match(/(\d{1,2}):(\d{2}):(\d{2})(?:[.:](\d{1,3}))?/);

    if (!timeMatch) return null;

    let serverNow = new Date(getServerNowMs());

    let day = serverNow.getDate();
    let month = serverNow.getMonth() + 1;
    let year = serverNow.getFullYear();

    const lower = raw.toLowerCase();

    if (lower.includes("tomorrow")) {
      const tomorrow = new Date(serverNow.getFullYear(), serverNow.getMonth(), serverNow.getDate() + 1);
      day = tomorrow.getDate();
      month = tomorrow.getMonth() + 1;
      year = tomorrow.getFullYear();
    }

    const explicitDate = raw.match(/(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/);

    if (explicitDate) {
      day = parseInt(explicitDate[1], 10);
      month = parseInt(explicitDate[2], 10);

      if (explicitDate[3]) {
        year = parseInt(explicitDate[3], 10);
        if (year < 100) {
          const prefix = String(serverNow.getFullYear()).slice(0, 2);
          year = parseInt(prefix + pad(year), 10);
        }
      }
    }

    const hour = parseInt(timeMatch[1], 10);
    const minute = parseInt(timeMatch[2], 10);
    const second = parseInt(timeMatch[3], 10);
    const ms = parseInt((timeMatch[4] || "0").padEnd(3, "0").slice(0, 3), 10);

    let result = new Date(year, month - 1, day, hour, minute, second, ms).getTime();

    if (!explicitDate && !lower.includes("today") && !lower.includes("tomorrow")) {
      if (result < getServerNowMs() - 60 * 1000) {
        result += 24 * 60 * 60 * 1000;
      }
    }

    return result;
  }

  function fillTargetFromMs(ms, shouldSave) {
    const offset = clampNumber(ui.offsetMs.value, -9999, 9999, 0);
    const adjusted = ms + offset;

    setInputsFromMs(adjusted);
    updateFromInputs(shouldSave);
  }

  function updateLoop() {
    const now = getServerNowMs();
    const currentMs = ((now % 1000) + 1000) % 1000;
    const goalMs = clampNumber(ui.targetMs.value, 0, 999, 0);

    const distanceToGoal = (goalMs - currentMs + 1000) % 1000;
    const percentage = 100 - distanceToGoal / 10;

    ui.bar.style.width = Math.max(0, Math.min(100, percentage)) + "%";
    ui.currentTime.textContent = formatTime(now, true, 10);

    if (app.sendMs !== null && !isNaN(app.sendMs)) {
      const remaining = app.sendMs - now;

      ui.countdown.textContent = formatDuration(remaining);

      if (remaining > 0) {
        document.title = "Send in: " + formatDuration(remaining);
      } else {
        document.title = "Too late";
      }

      if (remaining > 0 && remaining <= 1000) {
        ui.bar.style.background = CONFIG.timeColor;
      } else {
        ui.bar.style.background = CONFIG.waitingColor;
      }
    } else {
      ui.bar.style.background = CONFIG.noDateColor;
      document.title = app.originalTitle;
    }
  }

  function setStatus(message, type) {
    if (!ui.status) return;

    ui.status.textContent = message || "";
    ui.status.className = "twsh-status";

    if (type) {
      ui.status.classList.add("twsh-status-" + type);
    }
  }

  function getCommandDuration() {
    const duration = $("#date_arrival span").data("duration");

    if (duration !== undefined && !isNaN(parseFloat(duration))) {
      return parseFloat(duration) * 1000;
    }

    return 0;
  }

  function getTargetVillageId() {
    const form = document.getElementById("command-data-form");
    if (!form) return null;

    const villageAnchor = form.querySelector(".village_anchor a[href*='id=']");
    if (villageAnchor) {
      return getParam("id", villageAnchor.href);
    }

    const infoVillageLink = form.querySelector("a[href*='screen=info_village'][href*='id=']");
    if (infoVillageLink) {
      return getParam("id", infoVillageLink.href);
    }

    return null;
  }

  function loadTargetCommands() {
    const villageId = getTargetVillageId();

    if (!villageId) {
      setStatus("Could not find target village ID.", "error");
      return;
    }

    const url =
      typeof game_data !== "undefined" && game_data.link_base_pure
        ? game_data.link_base_pure + "info_village&id=" + villageId
        : "/game.php?screen=info_village&id=" + villageId;

    setStatus("Loading target village commands...", "warn");

    $.get(url)
      .done(function (html) {
        renderTargetCommands(html);
      })
      .fail(function () {
        setStatus("Could not load target village commands.", "error");
      });
  }

  function findArrivalColumnIndex(table) {
    const firstRow = table.querySelector("tr");
    if (!firstRow) return 1;

    const headers = Array.from(firstRow.querySelectorAll("th"));

    for (let i = 0; i < headers.length; i++) {
      const text = cleanText(headers[i].textContent).toLowerCase();

      if (
        text.includes("arrival") ||
        text.includes("aankomst") ||
        text.includes("ankunft") ||
        text.includes("arrivée")
      ) {
        return i;
      }
    }

    return 1;
  }

  function getExternalCommandsAnchor() {
    const form = document.getElementById("command-data-form");

    const tables = Array.from(document.querySelectorAll("table.vis, table"));
    const unitTables = tables.filter(table => {
      const text = cleanText(table.textContent).toLowerCase();
      const hasUnitImages = !!table.querySelector('img[src*="/unit/"], img[src*="unit_"]');
      const hasUnitsText = /\bunits\b/.test(text);

      return hasUnitImages || hasUnitsText;
    });

    if (unitTables.length) {
      const unitTable = unitTables[unitTables.length - 1];

      return {
        parent: unitTable.parentNode,
        after: unitTable
      };
    }

    if (form) {
      return {
        parent: form.parentNode,
        after: form
      };
    }

    return {
      parent: document.body,
      after: null
    };
  }

  function ensureExternalCommandsHost() {
    let box = document.getElementById("twactics-snipe-helper-commands");

    if (box) {
      return box.querySelector(".twsh-external-body");
    }

    const anchor = getExternalCommandsAnchor();

    box = document.createElement("div");
    box.id = "twactics-snipe-helper-commands";
    box.className = "twsh-external-commands";

    const header = document.createElement("div");
    header.className = "twsh-external-header";
    header.textContent = "Target commands";

    const body = document.createElement("div");
    body.className = "twsh-external-body";

    box.appendChild(header);
    box.appendChild(body);

    if (anchor.after && anchor.after.nextSibling) {
      anchor.parent.insertBefore(box, anchor.after.nextSibling);
    } else {
      anchor.parent.appendChild(box);
    }

    return body;
  }

  function renderTargetCommands(html) {
    const commandsBody = ensureExternalCommandsHost();
    commandsBody.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.innerHTML = html;

    const commandsContainer = wrapper.querySelector(".commands-container");

    if (!commandsContainer) {
      commandsBody.textContent = "No visible commands found on target village.";
      setStatus("No visible commands found on target village.", "warn");
      return;
    }

    const table = commandsContainer.querySelector("table");
    if (!table) {
      commandsBody.textContent = "No command table found.";
      setStatus("No command table found.", "warn");
      return;
    }

    const arrivalIndex = findArrivalColumnIndex(table);
    const commandRows = Array.from(table.querySelectorAll("tr.command-row"));

    if (!commandRows.length) {
      commandsBody.textContent = "No command rows found.";
      setStatus("No command rows found.", "warn");
      return;
    }

    const resultTable = document.createElement("table");
    resultTable.className = "twsh-command-table";

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");

    ["Command", "Arrival", "Send in", "Action"].forEach(label => {
      const th = document.createElement("th");
      th.textContent = label;
      headRow.appendChild(th);
    });

    thead.appendChild(headRow);
    resultTable.appendChild(thead);

    const tbody = document.createElement("tbody");

    commandRows.forEach(function (row) {
      const cells = Array.from(row.querySelectorAll("td"));
      if (!cells.length) return;

      const arrivalCell = cells[arrivalIndex] || cells[1] || cells[0];
      const arrivalText = cleanText(arrivalCell.textContent);
      const arrivalMs = parseArrivalTextToMs(arrivalText);

      if (!arrivalMs) return;

      const commandName = cleanText(cells[0] ? cells[0].textContent : "Command");
      const sendMs = arrivalMs - app.duration;
      const sendIn = sendMs - getServerNowMs();

      const tr = document.createElement("tr");

      const commandCell = document.createElement("td");
      commandCell.textContent = commandName || "Command";

      const arrivalOutCell = document.createElement("td");
      arrivalOutCell.textContent = formatDateTime(arrivalMs, true);

      const sendInCell = document.createElement("td");
      sendInCell.textContent = formatDuration(sendIn);

      const actionCell = document.createElement("td");

      const useButton = document.createElement("button");
      useButton.type = "button";
      useButton.className = "btn";
      useButton.textContent = "Use";
      useButton.addEventListener("click", function () {
        fillTargetFromMs(arrivalMs, true);
        setStatus("Command arrival loaded as target landing time.", "success");
      });

      actionCell.appendChild(useButton);

      tr.appendChild(commandCell);
      tr.appendChild(arrivalOutCell);
      tr.appendChild(sendInCell);
      tr.appendChild(actionCell);

      tbody.appendChild(tr);
    });

    resultTable.appendChild(tbody);
    commandsBody.appendChild(resultTable);

    setStatus("Loaded " + tbody.children.length + " command(s).", "success");

    const externalBox = document.getElementById("twactics-snipe-helper-commands");
    if (externalBox && externalBox.scrollIntoView) {
      externalBox.scrollIntoView({
        behavior: "smooth",
        block: "nearest"
      });
    }
  }

  function loadVillageNotes() {
    const villageId = getTargetVillageId();

    if (!villageId) {
      setStatus("Could not find target village ID.", "error");
      return;
    }

    const url =
      typeof game_data !== "undefined" && game_data.link_base_pure
        ? game_data.link_base_pure + "info_village&id=" + villageId
        : "/game.php?screen=info_village&id=" + villageId;

    setStatus("Loading village notes...", "warn");

    $.get(url)
      .done(function (html) {
        const noteText = extractVillageNoteFromHtml(html);
        renderVillageNotes(noteText);
      })
      .fail(function () {
        setStatus("Could not load village notes.", "error");
      });
  }

  function extractVillageNoteFromHtml(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const selectors = [
      "textarea[name='note']",
      "textarea[name='village_note']",
      "textarea[name='village_notes']",
      "#village_note textarea",
      "#village_notes textarea",
      "#village_note",
      "#village_notes",
      "#village_note_body",
      ".village_note",
      ".village_notes",
      ".village-note",
      ".village-notes",
      ".village-note-body",
      ".quickedit-village-note .quickedit-label",
      ".quickedit-village-notes .quickedit-label"
    ];

    function getElementText(el) {
      if (!el) return "";

      if (typeof el.value === "string") {
        return cleanText(el.value);
      }

      return cleanText(el.textContent);
    }

    function isUsefulNoteText(text) {
      const value = cleanText(text);
      const lower = value.toLowerCase();

      if (!value) return false;
      if (value.length > 2500) return false;

      const blocked = [
        "note",
        "notes",
        "village note",
        "village notes",
        "edit",
        "save",
        "delete",
        "empty",
        "no note",
        "no notes"
      ];

      if (blocked.includes(lower)) return false;

      return true;
    }

    for (let i = 0; i < selectors.length; i++) {
      const el = doc.querySelector(selectors[i]);
      const text = getElementText(el);

      if (isUsefulNoteText(text)) {
        return text;
      }
    }

    const fallbackElements = Array.from(doc.querySelectorAll("[id], [class], textarea"));

    for (let i = 0; i < fallbackElements.length; i++) {
      const el = fallbackElements[i];
      const id = String(el.id || "").toLowerCase();
      const className = String(el.className || "").toLowerCase();
      const marker = id + " " + className;

      if (!marker.includes("note")) continue;
      if (marker.includes("notebook")) continue;

      const text = getElementText(el);

      if (isUsefulNoteText(text)) {
        return text;
      }
    }

    return "";
  }

  function renderVillageNotes(noteText) {
    ui.notes.innerHTML = "";

    const box = document.createElement("div");
    box.className = "twsh-notes-box";

    const title = document.createElement("div");
    title.className = "twsh-notes-title";
    title.textContent = "Village notes";

    const content = document.createElement("div");
    content.className = "twsh-notes-content";

    if (noteText) {
      content.textContent = noteText;
      setStatus("Village notes loaded.", "success");
    } else {
      content.textContent = "No village note found, or the note could not be read from this page.";
      setStatus("No village note found.", "warn");
    }

    box.appendChild(title);
    box.appendChild(content);

    ui.notes.appendChild(box);
  }

  function addStyles() {
    if (document.getElementById("twactics-snipe-helper-style")) return;

    const style = document.createElement("style");
    style.id = "twactics-snipe-helper-style";

    style.textContent = `
      #twactics-snipe-helper {
        margin-top: 8px;
        padding: 8px;
        border: 1px solid #7d510f;
        background: #f4e4bc;
        color: #2f1b00;
        font-family: Verdana, Arial, sans-serif;
        font-size: 12px;
      }

      #twactics-snipe-helper * {
        box-sizing: border-box;
      }

      .twsh-title {
        font-weight: bold;
        margin-bottom: 6px;
      }

      .twsh-progress {
        position: relative;
        width: 100%;
        height: 22px;
        background: #777;
        overflow: hidden;
        border: 1px solid #4f310a;
        margin-bottom: 8px;
      }

      .twsh-bar {
        height: 100%;
        width: 0%;
        background: green;
      }

      .twsh-current-time {
        position: absolute;
        inset: 0;
        text-align: center;
        line-height: 22px;
        color: #fff;
        font-weight: bold;
        text-shadow: 1px 1px 2px #000;
      }

      .twsh-grid {
        display: grid;
        grid-template-columns: 104px 44px 44px 44px 44px;
        gap: 5px;
        align-items: end;
        margin-bottom: 6px;
      }
      
      .twsh-field-date {
        min-width: 104px;
      }

      .twsh-field {
        min-width: 0;
      }

      .twsh-grid label,
      .twsh-options label {
        display: block;
        font-weight: bold;
        margin-bottom: 2px;
      }

      .twsh-input {
        width: 100%;
        padding: 4px;
        border: 1px solid #7d510f;
        background: #fffaf0;
      }

      .twsh-options {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        margin: 6px 0;
      }

      .twsh-options input[type="number"] {
        width: 90px;
      }

      .twsh-result {
        margin-top: 6px;
        padding: 6px;
        background: #fff4d5;
        border: 1px solid #bd9c5a;
      }

      .twsh-result-row {
        display: flex;
        justify-content: space-between;
        gap: 8px;
      }

      .twsh-result-row strong {
        white-space: nowrap;
      }

      .twsh-buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 8px;
      }

      .twsh-status {
        margin-top: 8px;
        padding: 5px;
        border: 1px solid #bd9c5a;
        background: #fff4d5;
      }

      .twsh-status-success {
        background: #dff0d8;
      }

      .twsh-status-warn {
        background: #fff4d5;
      }

      .twsh-status-error {
        background: #f2dede;
      }

      .twsh-notes-wrap {
        margin-top: 8px;
      }

      .twsh-notes-box {
        padding: 6px;
        background: #fff4d5;
        border: 1px solid #bd9c5a;
      }

      .twsh-notes-title {
        font-weight: bold;
        margin-bottom: 4px;
      }

      .twsh-notes-content {
        white-space: pre-wrap;
        line-height: 1.35;
        max-height: 160px;
        overflow-y: auto;
        background: #fffaf0;
        border: 1px solid #bd9c5a;
        padding: 6px;
      }

      .twsh-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 8px;
        padding-top: 6px;
        border-top: 1px solid #bd9c5a;
        font-size: 10px;
        opacity: 0.8;
      }

      .twsh-footer a {
        color: #2f1b00;
        text-decoration: underline;
      }

      .twsh-external-commands {
        margin-top: 8px;
        padding: 8px;
        border: 1px solid #7d510f;
        background: #f4e4bc;
        color: #2f1b00;
        font-family: Verdana, Arial, sans-serif;
        font-size: 12px;
      }

      .twsh-external-header {
        font-weight: bold;
        margin-bottom: 6px;
      }

      .twsh-external-body {
        max-height: 360px;
        overflow-y: auto;
        overflow-x: auto;
      }

      .twsh-command-table {
        width: 100%;
        border-collapse: collapse;
      }

      .twsh-command-table th {
        background: #cfa95e;
        border: 1px solid #bd9c5a;
        padding: 4px;
      }

      .twsh-command-table td {
        border: 1px solid #bd9c5a;
        padding: 4px;
        background: #fff5da;
        text-align: center;
      }

      .twsh-command-table tr:nth-child(even) td {
        background: #f0e2be;
      }

      @media (max-width: 700px) {
      #twactics-snipe-helper {
        max-width: 100%;
        overflow: hidden;
        font-size: 11px;
        padding: 7px;
      }
    
      .twsh-title {
        font-size: 14px;
        margin-bottom: 5px;
      }
    
      .twsh-progress {
        height: 20px;
        margin-bottom: 7px;
      }
    
      .twsh-current-time {
        line-height: 20px;
        font-size: 12px;
      }
    
      .twsh-grid {
        display: grid;
        grid-template-columns: 70px 70px 70px;
        grid-template-areas:
          "date date ."
          "hh mm ss"
          "ms ms .";
        gap: 6px;
        align-items: end;
      }
    
      .twsh-field-date {
        grid-area: date;
        max-width: 145px;
      }
    
      .twsh-field-hh {
        grid-area: hh;
      }
    
      .twsh-field-mm {
        grid-area: mm;
      }
    
      .twsh-field-ss {
        grid-area: ss;
      }
    
      .twsh-field-ms {
        grid-area: ms;
        max-width: 145px;
      }
    
      .twsh-grid label,
      .twsh-options label {
        font-size: 11px;
        margin-bottom: 2px;
      }
    
      .twsh-input {
        width: 100%;
        min-width: 0;
        font-size: 13px;
        padding: 4px;
        height: 29px;
      }
    
      .twsh-options {
        display: block;
        margin: 6px 0;
      }
    
      .twsh-options label {
        margin-bottom: 6px;
      }
    
      .twsh-options input[type="number"] {
        width: 145px;
        font-size: 13px;
        padding: 4px;
        height: 29px;
        margin-top: 3px;
      }
    
      .twsh-result {
        padding: 6px;
        font-size: 11px;
      }
    
      .twsh-result-row {
        display: block;
        margin-bottom: 6px;
      }
    
      .twsh-result-row:last-child {
        margin-bottom: 0;
      }
    
      .twsh-result-row strong {
        display: block;
        margin-bottom: 1px;
      }
    
      .twsh-result-row span {
        display: block;
        text-align: right;
        font-size: 12px;
        line-height: 1.25;
      }
    
      .twsh-buttons {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
    
      .twsh-buttons .btn {
        width: 100%;
        box-sizing: border-box;
        font-size: 12px;
        padding: 4px 6px;
      }
    
      .twsh-status {
        font-size: 11px;
        padding: 5px;
      }
    
      .twsh-footer {
        font-size: 9px;
      }
    
      .twsh-external-commands {
        max-width: 100%;
        overflow-x: auto;
        font-size: 10px;
        padding: 6px;
      }
    
      .twsh-external-header {
        font-size: 12px;
        margin-bottom: 5px;
      }
    
      .twsh-external-body {
        max-height: 320px;
        overflow-y: auto;
        overflow-x: auto;
      }
    
      .twsh-command-table {
        width: 100%;
        min-width: 0;
        table-layout: fixed;
        font-size: 10px;
      }
    
      .twsh-command-table th,
      .twsh-command-table td {
        padding: 3px 2px;
        word-break: break-word;
        white-space: normal;
      }
    
      .twsh-command-table th:nth-child(1),
      .twsh-command-table td:nth-child(1) {
        width: 28%;
      }
    
      .twsh-command-table th:nth-child(2),
      .twsh-command-table td:nth-child(2) {
        width: 31%;
      }
    
      .twsh-command-table th:nth-child(3),
      .twsh-command-table td:nth-child(3) {
        width: 24%;
      }
    
      .twsh-command-table th:nth-child(4),
      .twsh-command-table td:nth-child(4) {
        width: 17%;
      }
    
      .twsh-command-table .btn {
        font-size: 10px;
        padding: 2px 4px;
      }
    }
    `;

    document.head.appendChild(style);
  }

  function createNumberInput(id, min, max, value, placeholder) {
    const input = document.createElement("input");
    input.id = id;
    input.type = "number";
    input.inputMode = "numeric";
    input.min = String(min);
    input.max = String(max);
    input.value = String(value);
    input.placeholder = placeholder || "";
    input.className = "twsh-input";

    return input;
  }

  function createField(labelText, input, extraClass) {
    const wrap = document.createElement("div");
    wrap.className = "twsh-field" + (extraClass ? " " + extraClass : "");

    const label = document.createElement("label");
    label.textContent = labelText;
    label.htmlFor = input.id;

    wrap.appendChild(label);
    wrap.appendChild(input);

    return wrap;
  }

  function buildUi() {
    addStyles();

    const old = document.getElementById("twactics-snipe-helper");
    if (old) old.remove();

    const dateArrival = document.getElementById("date_arrival");

    const root = document.createElement("div");
    root.id = "twactics-snipe-helper";

    const title = document.createElement("div");
    title.className = "twsh-title";
    title.textContent = SCRIPT_NAME;

    const progress = document.createElement("div");
    progress.className = "twsh-progress";

    const bar = document.createElement("div");
    bar.className = "twsh-bar";

    const currentTime = document.createElement("div");
    currentTime.className = "twsh-current-time";
    currentTime.textContent = "--:--:--.---";

    progress.appendChild(bar);
    progress.appendChild(currentTime);

    const grid = document.createElement("div");
    grid.className = "twsh-grid";

    const targetDate = document.createElement("input");
    targetDate.id = "twsh-target-date";
    targetDate.type = "date";
    targetDate.className = "twsh-input";

    const targetHour = createNumberInput("twsh-target-hour", 0, 23, 0, "HH");
    const targetMinute = createNumberInput("twsh-target-minute", 0, 59, 0, "MM");
    const targetSecond = createNumberInput("twsh-target-second", 0, 59, 0, "SS");
    const targetMs = createNumberInput("twsh-target-ms", 0, 999, 0, "MS");

    grid.appendChild(createField("Date", targetDate, "twsh-field-date"));
    grid.appendChild(createField("HH", targetHour, "twsh-field-hh"));
    grid.appendChild(createField("MM", targetMinute, "twsh-field-mm"));
    grid.appendChild(createField("SS", targetSecond, "twsh-field-ss"));
    grid.appendChild(createField("MS", targetMs, "twsh-field-ms"));

    const options = document.createElement("div");
    options.className = "twsh-options";

    const rememberLabel = document.createElement("label");
    const remember = document.createElement("input");
    remember.type = "checkbox";
    remember.id = "twsh-remember";
    rememberLabel.appendChild(document.createTextNode("Remember "));
    rememberLabel.appendChild(remember);

    const offsetLabel = document.createElement("label");
    offsetLabel.textContent = "Target offset ms ";
    const offsetMs = createNumberInput("twsh-offset-ms", -9999, 9999, 0, "0");
    offsetLabel.appendChild(offsetMs);

    options.appendChild(rememberLabel);
    options.appendChild(offsetLabel);

    const result = document.createElement("div");
    result.className = "twsh-result";

    const sendRow = document.createElement("div");
    sendRow.className = "twsh-result-row";

    const sendLabel = document.createElement("strong");
    sendLabel.textContent = "Send time:";

    const sendTime = document.createElement("span");
    sendTime.textContent = "No target time";

    sendRow.appendChild(sendLabel);
    sendRow.appendChild(sendTime);

    const countdownRow = document.createElement("div");
    countdownRow.className = "twsh-result-row";

    const countdownLabel = document.createElement("strong");
    countdownLabel.textContent = "Send in:";

    const countdown = document.createElement("span");
    countdown.textContent = "--:--:--";

    countdownRow.appendChild(countdownLabel);
    countdownRow.appendChild(countdown);

    result.appendChild(sendRow);
    result.appendChild(countdownRow);

    const buttons = document.createElement("div");
    buttons.className = "twsh-buttons";

    const loadCommandsButton = document.createElement("button");
    loadCommandsButton.type = "button";
    loadCommandsButton.className = "btn";
    loadCommandsButton.textContent = "Load target commands";
    loadCommandsButton.addEventListener("click", loadTargetCommands);

    const loadNotesButton = document.createElement("button");
    loadNotesButton.type = "button";
    loadNotesButton.className = "btn";
    loadNotesButton.textContent = "Load village notes";
    loadNotesButton.addEventListener("click", loadVillageNotes);

    buttons.appendChild(loadCommandsButton);
    buttons.appendChild(loadNotesButton);

    const status = document.createElement("div");
    status.className = "twsh-status";
    status.textContent = "Ready. Set target landing time.";

    const notes = document.createElement("div");
    notes.className = "twsh-notes-wrap";

    const footer = document.createElement("div");
    footer.className = "twsh-footer";

    const feedbackLink = document.createElement("a");
    feedbackLink.href = "https://twactics.com/scripts/snipe-helper";
    feedbackLink.target = "_blank";
    feedbackLink.rel = "noopener noreferrer";
    feedbackLink.textContent = "Send feedback";

    const createdBy = document.createElement("div");

    const twacticsLink = document.createElement("a");
    twacticsLink.href = "https://twactics.com";
    twacticsLink.target = "_blank";
    twacticsLink.rel = "noopener noreferrer";
    twacticsLink.textContent = "Twactics";

    createdBy.appendChild(document.createTextNode("Created by "));
    createdBy.appendChild(twacticsLink);

    footer.appendChild(feedbackLink);
    footer.appendChild(createdBy);

    root.appendChild(title);
    root.appendChild(progress);
    root.appendChild(grid);
    root.appendChild(options);
    root.appendChild(result);
    root.appendChild(buttons);
    root.appendChild(status);
    root.appendChild(notes);
    root.appendChild(footer);

    dateArrival.appendChild(root);

    ui.root = root;
    ui.bar = bar;
    ui.currentTime = currentTime;
    ui.targetDate = targetDate;
    ui.targetHour = targetHour;
    ui.targetMinute = targetMinute;
    ui.targetSecond = targetSecond;
    ui.targetMs = targetMs;
    ui.remember = remember;
    ui.offsetMs = offsetMs;
    ui.sendTime = sendTime;
    ui.countdown = countdown;
    ui.status = status;
    ui.notes = notes;

    [
      targetDate,
      targetHour,
      targetMinute,
      targetSecond,
      targetMs,
      offsetMs
    ].forEach(input => {
      input.addEventListener("input", function () {
        updateFromInputs(true);
      });
    });

    remember.addEventListener("change", function () {
      saveSettings();
    });
  }

  function applyInitialValues() {
    const settings = loadSettings();
    const currentArrivalMs = parseArrivalTextToMs(document.getElementById("date_arrival").textContent);

    ui.offsetMs.value = settings && typeof settings.offsetMs !== "undefined" ? String(settings.offsetMs) : "0";

    if (settings && settings.remember && settings.date) {
      ui.remember.checked = true;
      ui.targetDate.value = settings.date;
      ui.targetHour.value = pad(settings.hour || 0);
      ui.targetMinute.value = pad(settings.minute || 0);
      ui.targetSecond.value = pad(settings.second || 0);
      ui.targetMs.value = String(settings.ms || 0);

      updateFromInputs(false);
      setStatus("Remembered target time loaded and recalculated.", "success");
      return;
    }

    const referrerParams = getSearchParamsFromUrl(document.referrer || "");
    const referrerArrival = parseInt(referrerParams.get("arrivalTimestamp"), 10);

    if (!isNaN(referrerArrival) && referrerArrival > 0) {
      fillTargetFromMs(referrerArrival, false);
      setStatus("Target time loaded from previous page.", "success");
      return;
    }

    if (currentArrivalMs) {
      setInputsFromMs(currentArrivalMs);
      updateFromInputs(false);
      setStatus("Current command arrival loaded as default.", "success");
      return;
    }

    const now = getServerNowMs();
    setInputsFromMs(now);
    updateFromInputs(false);
  }

  function startScript() {
    if (app.started) return;

    const dateArrival = document.getElementById("date_arrival");
    const form = document.getElementById("command-data-form");

    if (!dateArrival || !form) {
      return;
    }

    app.started = true;

    syncClockOffset();
    app.duration = getCommandDuration();

    buildUi();
    applyInitialValues();

    if (CONFIG.timeBarWidth) {
      $("#command-data-form .vis:first, #date_arrival").width(CONFIG.timeBarWidth);
    }

    app.interval = setInterval(updateLoop, 1000 / CONFIG.fps);

    const sendButton = document.getElementById("troop_confirm_submit");

    if (sendButton) {
      sendButton.addEventListener("click", function () {
        console.log("sent at", Math.round(getServerNowMs()) % 1000, "ms");
        saveSettings();

        if (app.interval) {
          clearInterval(app.interval);
          app.interval = null;
        }
      });
    }

    setStatus("Ready. Duration: " + formatDuration(app.duration), "success");
  }

  function waitForCommandConfirm() {
    if (document.getElementById("date_arrival") && document.getElementById("command-data-form")) {
      startScript();
      return;
    }

    const target = document.getElementById("ds_body") || document.body;

    app.observer = new MutationObserver(function () {
      if (document.getElementById("date_arrival") && document.getElementById("command-data-form")) {
        startScript();
      }
    });

    app.observer.observe(target, {
      childList: true,
      subtree: true
    });
  }

  function destroy() {
    if (app.interval) {
      clearInterval(app.interval);
      app.interval = null;
    }

    if (app.observer) {
      app.observer.disconnect();
      app.observer = null;
    }

    const root = document.getElementById("twactics-snipe-helper");
    if (root) root.remove();

    const externalCommands = document.getElementById("twactics-snipe-helper-commands");
    if (externalCommands) externalCommands.remove();

    document.title = app.originalTitle;

    app.started = false;
  }

  waitForCommandConfirm();
})();
