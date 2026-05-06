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
    sendMs: null,
    commandsVisible: false,
    notesVisible: false,
    alarm60Played: false,
    alarm30Played: false
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

  function getDestinationKey() {
    const form = document.getElementById("command-data-form");
    if (!form) return "unknown_target";
  
    const villageAnchor = form.querySelector(".village_anchor");
    const villageId =
      villageAnchor && villageAnchor.getAttribute("data-id")
        ? villageAnchor.getAttribute("data-id")
        : getTargetVillageId();
  
    const villageText = villageAnchor ? cleanText(villageAnchor.textContent) : "";
    const coordsMatch = villageText.match(/\((\d+\|\d+)\)/);
    const coords = coordsMatch ? coordsMatch[1] : "";
  
    return "target_" + (villageId || coords || cleanText(villageText) || "unknown");
  }
  
  function getStoredTargets(settings) {
    if (!settings || !settings.targets || typeof settings.targets !== "object") {
      return {};
    }
  
    return settings.targets;
  }
  
  function getRememberedTarget(settings) {
    const targets = getStoredTargets(settings);
    return targets[getDestinationKey()] || null;
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
      const oldSettings = loadSettings() || {};
      const targets = getStoredTargets(oldSettings);
      const remember = ui.remember.checked;
      const destinationKey = getDestinationKey();
  
      const data = {
        remember: remember,
        offsetEnabled: ui.offsetEnabled.checked,
        offsetMs: clampNumber(ui.offsetMs.value, -9999, 9999, 0),
        targets: targets
      };
  
      if (remember && app.targetMs !== null && !isNaN(app.targetMs)) {
        targets[destinationKey] = {
          date: ui.targetDate.value,
          hour: clampNumber(ui.targetHour.value, 0, 23, 0),
          minute: clampNumber(ui.targetMinute.value, 0, 59, 0),
          second: clampNumber(ui.targetSecond.value, 0, 59, 0),
          ms: clampNumber(ui.targetMs.value, 0, 999, 0)
        };
      } else {
        delete targets[destinationKey];
      }
  
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      console.warn(SCRIPT_NAME + " could not save settings:", err);
    }
  }

  function getActiveOffsetMs() {
    if (!ui.offsetEnabled || !ui.offsetEnabled.checked) {
      return 0;
    }
  
    return clampNumber(ui.offsetMs.value, -9999, 9999, 0);
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
  
      if (ui.sendTimeSmall) {
        ui.sendTimeSmall.textContent = "Send time: --";
      }
  
      ui.countdown.textContent = "--:--:--";
      ui.countdown.className = "twsh-countdown-value";
      document.title = app.originalTitle;
  
      if (shouldSave) saveSettings();
      return;
    }
  
    const activeOffsetMs = getActiveOffsetMs();
    const effectiveTargetMs = targetMs + activeOffsetMs;
  
    app.sendMs = effectiveTargetMs - app.duration;
    resetAlarms();
  
    ui.sendTime.textContent = formatDateTime(app.sendMs, true);
  
    if (ui.sendTimeSmall) {
      ui.sendTimeSmall.textContent = "Send time: " + formatDateTime(app.sendMs, true);
    }
  
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
    setInputsFromMs(ms);
    updateFromInputs(shouldSave);
  }

  function updateLoop() {
    const now = getServerNowMs();
    const currentMs = ((now % 1000) + 1000) % 1000;
    
    const goalMs =
      app.sendMs !== null && !isNaN(app.sendMs)
        ? ((Math.round(app.sendMs) % 1000) + 1000) % 1000
        : clampNumber(ui.targetMs.value, 0, 999, 0);
    
    const distanceToGoal = (goalMs - currentMs + 1000) % 1000;
    const percentage = 100 - distanceToGoal / 10;

    ui.bar.style.width = Math.max(0, Math.min(100, percentage)) + "%";
    ui.currentTime.textContent = formatTime(now, true, 10);

    if (app.sendMs !== null && !isNaN(app.sendMs)) {
      const remaining = app.sendMs - now;
      checkAlarms(remaining);
      const remainingText = formatDuration(remaining);
    
      ui.countdown.textContent = remainingText;
      ui.countdown.className = remaining > 0 ? "twsh-countdown-value" : "twsh-countdown-value twsh-countdown-late";
    
      if (remaining > 0) {
        document.title = "Send in: " + remainingText;
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
  
    ui.status.style.display = message ? "" : "none";
  }

  function getCommandDuration() {
    const duration = $("#date_arrival span").data("duration");

    if (duration !== undefined && !isNaN(parseFloat(duration))) {
      return parseFloat(duration) * 1000;
    }

    return 0;
  }

  function makeCommandSummaryTableResponsive() {
    const form = document.getElementById("command-data-form");
    if (!form) return;
  
    const commandSummaryTable = form.querySelector("div > table.vis:first-child");
    if (!commandSummaryTable) return;
  
    const isMobile = window.matchMedia("(max-width: 700px)").matches;
    const wantedWidth = isMobile ? "90%" : "60%";
  
    commandSummaryTable.setAttribute("width", wantedWidth);
    commandSummaryTable.style.width = wantedWidth;
    commandSummaryTable.style.maxWidth = wantedWidth;
    commandSummaryTable.style.boxSizing = "border-box";
  
    const dateArrival = document.getElementById("date_arrival");
    if (dateArrival) {
      dateArrival.style.width = "100%";
      dateArrival.style.maxWidth = "100%";
      dateArrival.style.boxSizing = "border-box";
    }
  
    form.style.minWidth = "0";
    form.style.width = "100%";
    form.style.maxWidth = "100%";
    form.style.boxSizing = "border-box";
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
    if (app.commandsVisible) {
      hideTargetCommands();
      return;
    }
  
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
        app.commandsVisible = true;
  
        if (ui.loadCommandsButton) {
          ui.loadCommandsButton.textContent = "Hide commands";
        }
      })
      .fail(function () {
        setStatus("Could not load target village commands.", "error");
      });
  }
  
  function hideTargetCommands() {
    const externalBox = document.getElementById("twactics-snipe-helper-commands");
  
    if (externalBox) {
      externalBox.style.display = "none";
    }
  
    app.commandsVisible = false;
  
    if (ui.loadCommandsButton) {
      ui.loadCommandsButton.textContent = "Show commands";
    }
  
    setStatus("Target commands hidden.", "success");
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
      box.style.display = "";
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
      const effectiveArrivalMs = arrivalMs + getActiveOffsetMs();
      const sendMs = effectiveArrivalMs - app.duration;
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
    if (app.notesVisible) {
      hideVillageNotes();
      return;
    }
  
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
        app.notesVisible = true;
  
        if (ui.loadNotesButton) {
          ui.loadNotesButton.textContent = "Hide notes";
        }
      })
      .fail(function () {
        setStatus("Could not load village notes.", "error");
      });
  }
  
  function hideVillageNotes() {
    if (ui.notes) {
      ui.notes.style.display = "none";
    }
  
    app.notesVisible = false;
  
    if (ui.loadNotesButton) {
      ui.loadNotesButton.textContent = "Show notes";
    }
  
    setStatus("Village notes hidden.", "success");
  }

  function extractVillageNoteFromHtml(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
  
    function getText(el) {
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
      if (value.length > 2000) return false;
  
      const blockedExact = [
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
  
      if (blockedExact.includes(lower)) return false;
  
      const blockedIncludes = [
        "bbcodes.init",
        "ajax_unit_url",
        "ajax_building_url",
        "very small",
        "small normal large",
        "normal large very large",
        "close text",
        "document.ready",
        "<![cdata"
      ];
  
      for (let i = 0; i < blockedIncludes.length; i++) {
        if (lower.includes(blockedIncludes[i])) {
          return false;
        }
      }
  
      return true;
    }
  
    // 1. First: only trust actual textarea values.
    // If the textarea exists but is empty, that usually means "no note".
    const textareaSelectors = [
      "textarea[name='note']",
      "textarea[name='village_note']",
      "textarea[name='village_notes']",
      "#village_note textarea",
      "#village_notes textarea"
    ];
  
    for (let i = 0; i < textareaSelectors.length; i++) {
      const textarea = doc.querySelector(textareaSelectors[i]);
  
      if (textarea) {
        const text = getText(textarea);
        return isUsefulNoteText(text) ? text : "";
      }
    }
  
    // 2. Then try known display containers, but remove scripts/toolbars first.
    const displaySelectors = [
      "#village_note_body",
      ".village-note-body",
      ".village_note_body",
      ".quickedit-village-note .quickedit-label",
      ".quickedit-village-notes .quickedit-label"
    ];
  
    for (let i = 0; i < displaySelectors.length; i++) {
      const el = doc.querySelector(displaySelectors[i]);
  
      if (!el) continue;
  
      const clone = el.cloneNode(true);
  
      Array.from(clone.querySelectorAll("script, style, textarea, input, button, select, option")).forEach(node => {
        node.remove();
      });
  
      const text = getText(clone);
  
      if (isUsefulNoteText(text)) {
        return text;
      }
    }
  
    return "";
  }

  function getMonthNumber(monthName) {
    const months = {
      jan: 1,
      january: 1,
      feb: 2,
      february: 2,
      mar: 3,
      march: 3,
      apr: 4,
      april: 4,
      may: 5,
      jun: 6,
      june: 6,
      jul: 7,
      july: 7,
      aug: 8,
      august: 8,
      sep: 9,
      sept: 9,
      september: 9,
      oct: 10,
      october: 10,
      nov: 11,
      november: 11,
      dec: 12,
      december: 12
    };
  
    return months[String(monthName || "").toLowerCase()] || null;
  }
  
  function normalizeParsedDate(year, month, day, hour, minute, second, ms) {
    year = parseInt(year, 10);
    month = parseInt(month, 10);
    day = parseInt(day, 10);
    hour = parseInt(hour, 10);
    minute = parseInt(minute, 10);
    second = parseInt(second, 10);
    ms = parseInt(ms || "0", 10);
  
    if (year < 100) {
      const currentYearPrefix = String(new Date(getServerNowMs()).getFullYear()).slice(0, 2);
      year = parseInt(currentYearPrefix + pad(year), 10);
    }
  
    if (
      isNaN(year) ||
      isNaN(month) ||
      isNaN(day) ||
      isNaN(hour) ||
      isNaN(minute) ||
      isNaN(second) ||
      isNaN(ms)
    ) {
      return null;
    }
  
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;
    if (hour < 0 || hour > 23) return null;
    if (minute < 0 || minute > 59) return null;
    if (second < 0 || second > 59) return null;
    if (ms < 0 || ms > 999) return null;
  
    return new Date(year, month - 1, day, hour, minute, second, ms).getTime();
  }
  
  function extractDateTimeSuggestionsFromText(text) {
    const suggestions = [];
    const seen = new Set();
    const raw = String(text || "");
  
    function addSuggestion(ms, sourceText) {
      if (!ms || isNaN(ms)) return;
  
      const key = String(ms);
      if (seen.has(key)) return;
  
      seen.add(key);
  
      suggestions.push({
        ms: ms,
        label: formatDateTime(ms, true),
        source: cleanText(sourceText).slice(0, 160)
      });
    }
  
    const patterns = [
      // May 01, 2026 12:12:12:844
      {
        regex: /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2}),?\s+(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})(?:[.:](\d{1,3}))?\b/gi,
        parse: function (match) {
          const month = getMonthNumber(match[1]);
          return normalizeParsedDate(match[3], month, match[2], match[4], match[5], match[6], match[7]);
        }
      },
  
      // 2026-05-01 12:12:12:844
      // 2026/05/01 12:12:12.844
      {
        regex: /\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{2}):(\d{2})(?:[.:](\d{1,3}))?\b/g,
        parse: function (match) {
          return normalizeParsedDate(match[1], match[2], match[3], match[4], match[5], match[6], match[7]);
        }
      },
  
      // 01/05/2026 12:12:12:844
      // 01.05.2026 12:12:12.844
      {
        regex: /\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})(?:[.:](\d{1,3}))?\b/g,
        parse: function (match) {
          return normalizeParsedDate(match[3], match[2], match[1], match[4], match[5], match[6], match[7]);
        }
      }
    ];
  
    patterns.forEach(pattern => {
      let match;
  
      while ((match = pattern.regex.exec(raw)) !== null) {
        const ms = pattern.parse(match);
        addSuggestion(ms, match[0]);
      }
    });
  
    suggestions.sort((a, b) => a.ms - b.ms);
  
    return suggestions;
  }

  function renderVillageNotes(noteText) {
    ui.notes.style.display = "";
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
  
    if (noteText) {
      const suggestions = extractDateTimeSuggestionsFromText(noteText);
  
      if (suggestions.length) {
        const suggestionBox = document.createElement("div");
        suggestionBox.className = "twsh-note-suggestions";
  
        const suggestionTitle = document.createElement("div");
        suggestionTitle.className = "twsh-notes-title";
        suggestionTitle.textContent = "Suggested landing times";
  
        const suggestionHelp = document.createElement("div");
        suggestionHelp.className = "twsh-note-suggestions-help";
        suggestionHelp.textContent =
          "The script found possible arrival times in the village note. Click Use to set one as the target landing time.";
  
        const table = document.createElement("table");
        table.className = "twsh-command-table";
  
        const thead = document.createElement("thead");
        const headRow = document.createElement("tr");
  
        ["#", "Detected time", "Action"].forEach(label => {
          const th = document.createElement("th");
          th.textContent = label;
          headRow.appendChild(th);
        });
  
        thead.appendChild(headRow);
        table.appendChild(thead);
  
        const tbody = document.createElement("tbody");
  
        suggestions.forEach((suggestion, index) => {
          const tr = document.createElement("tr");
  
          const numberCell = document.createElement("td");
          numberCell.textContent = String(index + 1);
  
          const timeCell = document.createElement("td");
          timeCell.textContent = suggestion.label;
          timeCell.title = suggestion.source;
  
          const actionCell = document.createElement("td");
  
          const useButton = document.createElement("button");
          useButton.type = "button";
          useButton.className = "btn";
          useButton.textContent = "Use";
  
          useButton.addEventListener("click", function () {
            fillTargetFromMs(suggestion.ms, true);
            hideVillageNotes();
            setStatus("Note time loaded as arrival landing time.", "success");
          });
  
          actionCell.appendChild(useButton);
  
          tr.appendChild(numberCell);
          tr.appendChild(timeCell);
          tr.appendChild(actionCell);
  
          tbody.appendChild(tr);
        });
  
        table.appendChild(tbody);
  
        suggestionBox.appendChild(suggestionTitle);
        suggestionBox.appendChild(suggestionHelp);
        suggestionBox.appendChild(table);
  
        box.appendChild(suggestionBox);
      }
    }
  
    ui.notes.appendChild(box);
  }

  function addStyles() {
    if (document.getElementById("twactics-snipe-helper-style")) return;

    const style = document.createElement("style");
    style.id = "twactics-snipe-helper-style";

    style.textContent = `
      #twactics-snipe-helper {
        display: block;
        width: 100%;
        max-width: 100%;
        box-sizing: border-box;
        margin: 8px 0 0 0;
        padding: 8px;
        border: 1px solid #7d510f;
        background: #f4e4bc;
        color: #2f1b00;
        font-family: Verdana, Arial, sans-serif;
        font-size: 12px;
      }
      
      #twactics-snipe-helper,
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
        grid-template-columns: 104px 44px 44px 44px 44px auto;
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

      .twsh-grid label {
        display: inline-flex;
        font-weight: bold;
        margin-bottom: 2px;
      }

      .twsh-input {
        width: 100%;
        padding: 4px;
        border: 1px solid #7d510f;
        background: #fffaf0;
        height: 24px;
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

      .twsh-note-suggestions {
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid #bd9c5a;
      }
      
      .twsh-note-suggestions-help {
        font-size: 11px;
        line-height: 1.35;
        margin-bottom: 6px;
        opacity: 0.8;
      }

      .twsh-offset-label {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }

      .twsh-field-remember {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      
      .twsh-field-remember label {
        margin: 0;
      }
      
      .twsh-field-remember input[type="checkbox"] {
        margin: 0;
      }
      
      .twsh-offset-toggle,
      .twsh-offset-label {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      
      .twsh-offset-wrap {
        display: inline-flex;
        align-items: center;
      }
      
      .twsh-countdown-value {
        font-weight: bold;
      }
      
      .twsh-countdown-late {
        color: red;
      }

      .twsh-send-time-small {
        font-size: 10px;
        opacity: 0.8;
        margin: -4px 0 6px 0;
        text-align: right;
      }

      #command-data-form > div > table.vis:first-child {
        width: 60% !important;
        max-width: 60% !important;
      }
      
      #date_arrival {
        width: 100% !important;
        max-width: 100% !important;
      }

      @media (max-width: 700px) {
        #twactics-snipe-helper {
          display: block;
          width: 100% !important;
          max-width: 100% !important;
          box-sizing: border-box !important;
          overflow: visible !important;
          font-size: 10px;
          padding: 5px;
          margin: 5px 0 0 0 !important;
        }

        #twactics-snipe-helper .twsh-grid,
        #twactics-snipe-helper .twsh-options,
        #twactics-snipe-helper .twsh-result,
        #twactics-snipe-helper .twsh-buttons,
        #twactics-snipe-helper .twsh-footer,
        #twactics-snipe-helper .twsh-notes-wrap,
        #twactics-snipe-helper .twsh-notes-box,
        #twactics-snipe-helper .twsh-note-suggestions {
          width: 100%;
          max-width: 100%;
          min-width: 0;
        }
        
        #twactics-snipe-helper input,
        #twactics-snipe-helper button,
        #twactics-snipe-helper select,
        #twactics-snipe-helper textarea {
          max-width: 100%;
          min-width: 0;
        }
      
        .twsh-title {
          font-size: 12px;
          margin-bottom: 4px;
          line-height: 1.1;
        }
      
        .twsh-progress {
          height: 18px;
          margin-bottom: 5px;
        }
      
        .twsh-current-time {
          line-height: 18px;
          font-size: 11px;
        }
      
        /* ---- INPUT-DELEN ---- */
        .twsh-grid {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 5px 7px;
          margin-bottom: 4px;
        }
      
        .twsh-field {
          min-width: 0;
          margin: 0;
        }
      
        .twsh-field-date {
          width: 100%;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          margin-bottom: 2px;
        }
      
        .twsh-field-date label {
          display: inline;
          font-size: 10px;
          margin: 0;
          line-height: 1;
          white-space: nowrap;
        }
      
        .twsh-field-date .twsh-input {
          width: 110px;
          height: 20px;
          font-size: 10px;
          padding: 1px 3px;
        }
      
        .twsh-field-hh,
        .twsh-field-mm,
        .twsh-field-ss,
        .twsh-field-ms,
        .twsh-field-remember {
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }
      
        .twsh-field-hh label,
        .twsh-field-mm label,
        .twsh-field-ss label,
        .twsh-field-ms label,
        .twsh-field-remember label {
          font-size: 10px;
          margin: 0;
          line-height: 1;
          white-space: nowrap;
        }
      
        /* MS lite mindre */
        .twsh-field-hh .twsh-input,
        .twsh-field-mm .twsh-input,
        .twsh-field-ss .twsh-input,
        .twsh-field-ms .twsh-input {
          width: 32px;
          height: 20px;
          font-size: 10px;
          padding: 1px 2px;
        }
      
        .twsh-field-remember input[type="checkbox"] {
          width: 18px;
          height: 18px;
          margin: 0;
        }
      
        /* ---- OFFSET ---- */
        .twsh-options {
          display: flex;
          align-items: center;
          gap: 5px;
          margin: 2px 0 8px 0;
          width: 100%;
        }
      
        .twsh-options label {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 10px;
          margin: 0;
          white-space: nowrap;
        }
      
        .twsh-options input[type="number"] {
          width: 40px;
          height: 22px;
          font-size: 10px;
          padding: 1px 2px;
          margin: 0;
        }

        .twsh-offset-toggle input[type="checkbox"] {
          width: 18px !important;
          height: 18px !important;
          margin: 0 !important;
        }
      
        /* ---- RESULT ---- */
        .twsh-result {
          padding: 4px 5px;
          font-size: 10px;
          margin-top: 4px;
        }
      
        .twsh-result-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 6px;
          margin: 0;
          line-height: 1.2;
        }
      
        .twsh-result-row strong {
          display: inline;
          margin: 0;
          font-size: 10px;
          white-space: nowrap;
        }
      
        .twsh-result-row span {
          display: inline;
          text-align: right;
          font-size: 10px;
          line-height: 1.2;
        }
      
        /* ---- STATUS / SEND IN ---- */
        .twsh-status {
          font-size: 10px;
          padding: 4px 5px;
          margin-top: 4px;
          margin-bottom: 4px;
          line-height: 1.2;
        }
      
        .twsh-status strong {
          font-weight: bold;
        }
      
        /* ---- KNAPPAR ---- */    
        .twsh-buttons {
          display: flex;
          flex-direction: row;
          flex-wrap: nowrap;
          gap: 4px;
          margin-top: 6px;
          width: 100%;
          max-width: 100%;
          min-width: 0;
        }
        
        .twsh-buttons .twsh-action-btn {
          flex: 1 1 0;
          width: auto !important;
          min-width: 0 !important;
          max-width: none !important;
          margin: 0 !important;
          box-sizing: border-box !important;
          font-size: 11px !important;
          padding: 3px 3px !important;
          line-height: 1 !important;
          white-space: nowrap !important;
        }
      
        /* ---- FOOTER ---- */
        .twsh-footer {
          font-size: 8px;
          margin-top: 4px;
          padding-top: 3px;
          line-height: 1.1;
        }
      
        .twsh-notes-wrap {
          margin-top: 4px;
        }
      
        .twsh-notes-box {
          padding: 4px;
        }
      
        .twsh-notes-title {
          font-size: 10px;
          margin-bottom: 2px;
        }
      
        .twsh-notes-content {
          font-size: 10px;
          line-height: 1.25;
          max-height: 90px;
          padding: 4px;
        }
      
        /* ---- EXTERNAL COMMAND TABLE ---- */
        .twsh-external-commands {
          max-width: 100%;
          overflow-x: auto;
          font-size: 9px;
          padding: 5px;
        }
      
        .twsh-external-header {
          font-size: 11px;
          margin-bottom: 4px;
        }
      
        .twsh-external-body {
          max-height: 260px;
          overflow-y: auto;
          overflow-x: auto;
        }
      
        .twsh-command-table {
          width: 100%;
          min-width: 0;
          font-size: 9px;
        }
      
        .twsh-command-table th,
        .twsh-command-table td {
          padding: 2px 1px;
          word-break: break-word;
          white-space: normal;
          line-height: 1.15;
        }
      
        .twsh-command-table th:nth-child(1),
        .twsh-command-table td:nth-child(1) {
          width: 24%;
        }
      
        .twsh-command-table th:nth-child(2),
        .twsh-command-table td:nth-child(2) {
          width: 34%;
        }
      
        .twsh-command-table th:nth-child(3),
        .twsh-command-table td:nth-child(3) {
          width: 25%;
        }
      
        .twsh-command-table th:nth-child(4),
        .twsh-command-table td:nth-child(4) {
          width: 17%;
        }
      
        .twsh-command-table .btn {
          font-size: 11px !important;
          padding: 2px 4px;
          line-height: 1.1;
        }
      
        .twsh-note-suggestions {
          margin-top: 4px;
          padding-top: 4px;
        }
      
        .twsh-note-suggestions-help {
          font-size: 9px;
          margin-bottom: 4px;
          line-height: 1.2;
        }
      
        .twsh-note-suggestions .twsh-command-table {
          font-size: 9px;
        }
      
        .twsh-note-suggestions .twsh-command-table th,
        .twsh-note-suggestions .twsh-command-table td {
          padding: 2px 1px;
        }
      
        /* ---- TRIBALWARS EGNA COMMAND-TABLE LITE BRED/RYMLIGARE ---- */
        .vis {
        width: 90% !important;
        }
        
        #command-data-form {
          min-width: 0 !important;
          width: 100% !important;
        }
      
        #command-data-form > div > table.vis:first-child {
          width: 90% !important;
          max-width: 90% !important;
        }
      
        #command-data-form > div > table.vis:first-child > tbody > tr > td:first-child {
          width: 24% !important;
          white-space: nowrap;
        }
      
        #command-data-form > div > table.vis:first-child > tbody > tr > td:last-child {
          width: 76% !important;
        }
      
        #date_arrival {
          width: 100% !important;
        }
        
        #twactics-snipe-helper .twsh-action-btn {
          font-size: 11px !important;
          padding: 3px 3px !important;
          line-height: 1 !important;
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

  function setupSmartTimeInput(input, nextInput, maxLength) {
    input.addEventListener("focus", function () {
      setTimeout(function () {
        input.select();
      }, 0);
    });
  
    input.addEventListener("click", function () {
      input.select();
    });
  
    input.addEventListener("input", function () {
      const value = String(input.value || "").replace(/\D/g, "");
  
      if (value !== input.value) {
        input.value = value;
      }
  
      if (nextInput && value.length >= maxLength) {
        nextInput.focus();
  
        setTimeout(function () {
          nextInput.select();
        }, 0);
      }
  
      updateFromInputs(true);
    });
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

    const sendTimeSmall = document.createElement("div");
    sendTimeSmall.className = "twsh-send-time-small";
    sendTimeSmall.textContent = "Send time: --";
    
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

    const remember = document.createElement("input");
    remember.type = "checkbox";
    remember.id = "twsh-remember";
    
    const rememberField = document.createElement("div");
    rememberField.className = "twsh-field twsh-field-remember";
    
    const rememberLabel = document.createElement("label");
    rememberLabel.textContent = "Remember";
    rememberLabel.htmlFor = "twsh-remember";
    
    rememberField.appendChild(rememberLabel);
    rememberField.appendChild(remember);
    
    grid.appendChild(createField("Date", targetDate, "twsh-field-date"));
    grid.appendChild(createField("HH", targetHour, "twsh-field-hh"));
    grid.appendChild(createField("MM", targetMinute, "twsh-field-mm"));
    grid.appendChild(createField("SS", targetSecond, "twsh-field-ss"));
    grid.appendChild(createField("MS", targetMs, "twsh-field-ms"));
    
    const options = document.createElement("div");
    options.className = "twsh-options";
    
    const offsetToggleLabel = document.createElement("label");
    offsetToggleLabel.className = "twsh-offset-toggle";
    
    const offsetEnabled = document.createElement("input");
    offsetEnabled.type = "checkbox";
    offsetEnabled.id = "twsh-offset-enabled";
    
    offsetToggleLabel.appendChild(document.createTextNode("Offset? "));
    offsetToggleLabel.appendChild(offsetEnabled);
    
    const offsetWrap = document.createElement("div");
    offsetWrap.className = "twsh-offset-wrap";
    offsetWrap.style.display = "none";
    
    const offsetLabel = document.createElement("label");
    offsetLabel.className = "twsh-offset-label";
    offsetLabel.textContent = "Target offset ms";
    
    const offsetMs = createNumberInput("twsh-offset-ms", -9999, 9999, 0, "0");
    
    offsetLabel.appendChild(offsetMs);
    offsetWrap.appendChild(offsetLabel);
    
    options.appendChild(offsetToggleLabel);
    options.appendChild(offsetWrap);
    
    offsetEnabled.addEventListener("change", function () {
      offsetWrap.style.display = offsetEnabled.checked ? "" : "none";
      updateFromInputs(true);
    });

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

    result.appendChild(countdownRow);

    const buttons = document.createElement("div");
    buttons.className = "twsh-buttons";

    const loadCommandsButton = document.createElement("button");
    loadCommandsButton.type = "button";
    loadCommandsButton.className = "btn twsh-action-btn";
    loadCommandsButton.textContent = "Show commands";
    loadCommandsButton.addEventListener("click", loadTargetCommands);

    const loadNotesButton = document.createElement("button");
    loadNotesButton.type = "button";
    loadNotesButton.className = "btn twsh-action-btn";
    loadNotesButton.textContent = "Show notes";
    loadNotesButton.addEventListener("click", loadVillageNotes);

    buttons.appendChild(loadCommandsButton);
    buttons.appendChild(loadNotesButton);

    const status = document.createElement("div");
    status.className = "twsh-status";
    status.textContent = "";
    status.style.display = "none";

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
    root.appendChild(sendTimeSmall);
    root.appendChild(grid);
    root.appendChild(rememberField);
    root.appendChild(options);
    root.appendChild(result);
    root.appendChild(buttons);
    root.appendChild(status);
    root.appendChild(notes);
    root.appendChild(footer);

    dateArrival.appendChild(root);

    ui.root = root;
    ui.bar = bar;
    ui.sendTimeSmall = sendTimeSmall;
    ui.currentTime = currentTime;
    ui.targetDate = targetDate;
    ui.targetHour = targetHour;
    ui.targetMinute = targetMinute;
    ui.targetSecond = targetSecond;
    ui.targetMs = targetMs;
    ui.remember = remember;
    ui.offsetEnabled = offsetEnabled;
    ui.offsetWrap = offsetWrap;
    ui.offsetMs = offsetMs;
    ui.sendTime = sendTime;
    ui.countdown = countdown;
    ui.status = status;
    ui.notes = notes;
    ui.loadCommandsButton = loadCommandsButton;
    ui.loadNotesButton = loadNotesButton;

    targetDate.addEventListener("input", function () {
      updateFromInputs(true);
    });
    
    setupSmartTimeInput(targetHour, targetMinute, 2);
    setupSmartTimeInput(targetMinute, targetSecond, 2);
    setupSmartTimeInput(targetSecond, targetMs, 2);
    setupSmartTimeInput(targetMs, null, 3);
    
    offsetMs.addEventListener("input", function () {
      updateFromInputs(true);
    });

    remember.addEventListener("change", function () {
      saveSettings();
    });
  }

  function applyInitialValues() {
    const settings = loadSettings();
    const currentArrivalMs = parseArrivalTextToMs(document.getElementById("date_arrival").textContent);

    ui.offsetMs.value = settings && typeof settings.offsetMs !== "undefined" ? String(settings.offsetMs) : "0";
    ui.offsetEnabled.checked = !!(settings && settings.offsetEnabled);
    ui.offsetWrap.style.display = ui.offsetEnabled.checked ? "" : "none";

    const rememberedTarget = getRememberedTarget(settings);

    if (rememberedTarget) {
      ui.remember.checked = true;
      ui.targetDate.value = rememberedTarget.date;
      ui.targetHour.value = pad(rememberedTarget.hour || 0);
      ui.targetMinute.value = pad(rememberedTarget.minute || 0);
      ui.targetSecond.value = pad(rememberedTarget.second || 0);
      ui.targetMs.value = String(rememberedTarget.ms || 0);
    
      updateFromInputs(false);
      setStatus("Remembered target time loaded for this destination.", "success");
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

  function playBeepSequence(count) {
  let audioContext;

  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {
    console.warn(SCRIPT_NAME + " could not create audio context:", e);
    return;
  }

  for (let i = 0; i < count; i++) {
    const start = audioContext.currentTime + i * 0.14;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, start);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.18, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.09);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    oscillator.start(start);
    oscillator.stop(start + 0.1);
  }
}

  function checkAlarms(remaining) {
    if (remaining <= 0 || !isFinite(remaining)) return;
  
    if (remaining <= 60000 && !app.alarm60Played) {
      app.alarm60Played = true;
      playBeepSequence(3);
    }
  
    if (remaining <= 30000 && !app.alarm30Played) {
      app.alarm30Played = true;
      playBeepSequence(5);
    }
  }
  
  function resetAlarms() {
    app.alarm60Played = false;
    app.alarm30Played = false;
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
    makeCommandSummaryTableResponsive();

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

    setStatus("", "");
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

    app.commandsVisible = false;
    app.notesVisible = false;
    resetAlarms();

    app.started = false;
  }

  waitForCommandConfirm();
})();
