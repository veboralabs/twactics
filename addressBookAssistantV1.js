/*
 * Address Book Assistant
 *
 * Helps players prepare and add names to the Address Book.
 * No automation queue, no Add All, no external files.
 * Each Add button performs one direct player action.
 */

(function () {
  if (window.twAddressBookAssistantLoaded) {
    console.log("Address Book Assistant already loaded");
    return;
  }

  window.twAddressBookAssistantLoaded = true;

  const SCRIPT_NAME = "Address Book Assistant";
  const SCRIPT_VERSION = "v1.0.0";

  const state = {
    players: [],
    unparsed: [],
    warnings: [],
    ambiguousText: "",
    source: "",
    addingLocked: false
  };

  const ui = {};

  function getParam(name, url) {
    try {
      return new URL(url || window.location.href, window.location.origin).searchParams.get(name);
    } catch (e) {
      return null;
    }
  }

  function isAddressBookPage() {
    return getParam("screen") === "mail" && getParam("mode") === "address";
  }

  function buildGameUrl(screen, extraParams) {
    if (window.game_data && game_data.link_base_pure) {
      return game_data.link_base_pure + screen + (extraParams ? "&" + extraParams : "");
    }

    const villageId = window.game_data && game_data.village ? game_data.village.id : "";
    return "/game.php?village=" + villageId + "&screen=" + screen + (extraParams ? "&" + extraParams : "");
  }

  function cleanText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r/g, "")
      .replace(/[ ]+/g, " ")
      .trim();
  }

  function cleanName(value) {
    return cleanText(value)
      .replace(/\s+(Delete entry|Request sent|Withdraw|Add)$/i, "")
      .trim();
  }

  function isInteger(value) {
    return /^\d+$/.test(cleanText(value));
  }

  function isNumberLike(value) {
    const text = cleanText(value).replace(/\s/g, "");
    return /^-?\d+$/.test(text) || /^-?\d{1,3}([.,]\d{3})+$/.test(text);
  }

  function isHeaderText(value) {
    const text = cleanText(value).toLowerCase();
    return (
      text.includes("name") &&
      text.includes("rank") &&
      (text.includes("points") || text.includes("villages"))
    );
  }

  function isIgnoredValue(value) {
    const text = cleanText(value).toLowerCase();

    const ignoredExact = [
      "rank",
      "name",
      "player",
      "players",
      "online status",
      "features",
      "points",
      "villages",
      "global rank",
      "achievements",
      "tribe",
      "action",
      "actions",
      "delete entry",
      "add",
      "request sent",
      "withdraw",
      "empty"
    ];

    return ignoredExact.includes(text);
  }

  function isValidPlayerNameCandidate(value) {
    const name = cleanName(value);

    if (!name) return false;
    if (name.length > 40) return false;
    if (isIgnoredValue(name)) return false;
    if (isNumberLike(name)) return false;
    if (/^[?.\s]+$/.test(name)) return false;
    if (/^https?:\/\//i.test(name)) return false;
    if (/game\.php/i.test(name)) return false;
    if (/\d{1,3}\|\d{1,3}/.test(name)) return false;

    return true;
  }

  function addUnique(list, name) {
    const cleaned = cleanName(name);
    if (!isValidPlayerNameCandidate(cleaned)) return;

    const exists = list.some(existing => existing.toLowerCase() === cleaned.toLowerCase());
    if (!exists) list.push(cleaned);
  }

  function getHeaderNameIndex(parts) {
    const lowerParts = parts.map(part => cleanText(part).toLowerCase());

    if (
      lowerParts.includes("name") &&
      (lowerParts.includes("rank") || lowerParts.includes("points") || lowerParts.includes("villages"))
    ) {
      return lowerParts.indexOf("name");
    }

    return null;
  }

  function extractCandidateFromStatLine(line) {
    const text = cleanName(line);
    const numberPattern = "(?:\\d{1,3}(?:[\\.,]\\d{3})+|\\d+)";

    let match = text.match(
      new RegExp(
        "^\\d+\\s+(.+?)\\s+" +
          numberPattern +
          "\\s+\\d+\\s+\\d+(?:\\s+\\d+)?(?:\\s+\\S+)?\\s*$",
        "i"
      )
    );

    if (match && isValidPlayerNameCandidate(match[1])) {
      return cleanName(match[1]);
    }

    match = text.match(
      new RegExp(
        "^(.+?)\\s+\\d+\\s+" +
          numberPattern +
          "\\s+\\d+\\s+\\d+(?:\\s+.*)?$",
        "i"
      )
    );

    if (match && isValidPlayerNameCandidate(match[1])) {
      return cleanName(match[1]);
    }

    return null;
  }

  function extractCandidateFromParts(parts, headerNameIndex) {
    if (!parts || !parts.length) return null;

    if (headerNameIndex !== null && parts[headerNameIndex]) {
      return cleanName(parts[headerNameIndex]);
    }

    if (parts.length === 1) {
      return cleanName(parts[0]);
    }

    if (parts.length >= 2 && isInteger(parts[0]) && !isNumberLike(parts[1])) {
      return cleanName(parts[1]);
    }

    if (parts.length >= 2 && isInteger(parts[1]) && !isNumberLike(parts[0])) {
      return cleanName(parts[0]);
    }

    const joined = parts.join(" ");
    return extractCandidateFromStatLine(joined);
  }

  function parsePastedText(rawInput) {
    const players = [];
    const unparsed = [];
    const warnings = [];
    let ambiguousText = "";

    const raw = String(rawInput || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r/g, "")
      .trim();

    if (!raw) {
      return {
        players,
        unparsed,
        warnings: ["No input found."],
        ambiguousText
      };
    }

    const rawLines = raw
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean);

    const isSingleAmbiguousLine =
      rawLines.length === 1 &&
      !raw.includes("\t") &&
      !/[;,]/.test(raw) &&
      !extractCandidateFromStatLine(raw) &&
      raw.split(/\s+/).length > 1;

    if (isSingleAmbiguousLine) {
      ambiguousText = cleanText(raw);
      unparsed.push(ambiguousText);
      warnings.push(
        "This looks like one single line with several names. Because some player names can contain spaces, the script will not guess. Put each name on a new line, use commas, or use the world-data resolver button."
      );

      return {
        players,
        unparsed,
        warnings,
        ambiguousText
      };
    }

    let headerNameIndex = null;

    rawLines.forEach(line => {
      const cleanedLine = cleanText(line);

      if (!cleanedLine) return;
      if (isHeaderText(cleanedLine)) return;
      if (isIgnoredValue(cleanedLine)) return;

      let foundAny = false;

      const statCandidate = extractCandidateFromStatLine(cleanedLine);
      if (statCandidate) {
        addUnique(players, statCandidate);
        return;
      }

      if (cleanedLine.includes("\t")) {
        const parts = cleanedLine
          .split("\t")
          .map(part => cleanText(part))
          .filter(Boolean);

        const detectedHeaderIndex = getHeaderNameIndex(parts);
        if (detectedHeaderIndex !== null) {
          headerNameIndex = detectedHeaderIndex;
          return;
        }

        const candidate = extractCandidateFromParts(parts, headerNameIndex);
        if (candidate && isValidPlayerNameCandidate(candidate)) {
          addUnique(players, candidate);
          return;
        }

        unparsed.push(cleanedLine);
        return;
      }

      if (/[;,]/.test(cleanedLine)) {
        const parts = cleanedLine
          .split(/[;,]+/)
          .map(part => cleanName(part))
          .filter(Boolean);

        parts.forEach(part => {
          if (isValidPlayerNameCandidate(part)) {
            addUnique(players, part);
            foundAny = true;
          }
        });

        if (!foundAny) unparsed.push(cleanedLine);
        return;
      }

      if (isValidPlayerNameCandidate(cleanedLine)) {
        addUnique(players, cleanedLine);
        return;
      }

      unparsed.push(cleanedLine);
    });

    return {
      players,
      unparsed,
      warnings,
      ambiguousText
    };
  }

  function findTableAfterHeading(headingText, rootSelector) {
    const root = document.querySelector(rootSelector) || document.body;
    const headings = Array.from(root.querySelectorAll("h2, h3, h4"));

    const heading = headings.find(el => cleanText(el.textContent).toLowerCase() === headingText.toLowerCase());
    if (!heading) return null;

    let node = heading.nextElementSibling;

    while (node) {
      if (node.tagName && node.tagName.toLowerCase() === "table") {
        return node;
      }
      node = node.nextElementSibling;
    }

    return null;
  }

  function uniqueNamesFromLinks(links) {
    const names = [];
    const seen = new Set();
    const currentPlayerId = window.game_data && game_data.player ? String(game_data.player.id) : "";

    Array.from(links).forEach(link => {
      const href = link.getAttribute("href") || "";

      if (!href.includes("screen=info_player")) return;

      const id = getParam("id", href);
      if (id && currentPlayerId && String(id) === currentPlayerId) return;

      const name = cleanName(link.textContent);

      if (!isValidPlayerNameCandidate(name)) return;

      const key = name.toLowerCase();
      if (seen.has(key)) return;

      seen.add(key);
      names.push(name);
    });

    return names;
  }

  function extractPlayersFromCurrentPage() {
    const screen = getParam("screen");
    const mode = getParam("mode");

    let links = [];
    let source = "current page";

    if (screen === "buddies") {
      const friendsTable = findTableAfterHeading("My friends", "#content_value");

      if (friendsTable) {
        links = friendsTable.querySelectorAll('a[href*="screen=info_player"][href*="id="]');
        source = "My friends table";
      }
    } else if (screen === "ally" && mode === "members") {
      const allyContent = document.getElementById("ally_content") || document.getElementById("content_value") || document.body;
      links = allyContent.querySelectorAll('a[href*="screen=info_player"][href*="id="]');
      source = "tribe members table";
    } else if (screen === "info_ally") {
      const content = document.getElementById("content_value") || document.body;
      links = content.querySelectorAll('table.vis a[href*="screen=info_player"][href*="id="]');
      source = "tribe profile member table";
    } else {
      const content = document.getElementById("content_value") || document.body;
      links = content.querySelectorAll('a[href*="screen=info_player"][href*="id="]');
      source = "visible player links on current page";
    }

    const players = uniqueNamesFromLinks(links);

    return {
      players,
      source
    };
  }

  function findAddressBookForm() {
    return document.querySelector('form[action*="action=add_address_name"]');
  }

  function canAddContacts() {
    return isAddressBookPage() && !!findAddressBookForm();
  }

  function setStatus(message, type) {
    if (!ui.status) return;

    ui.status.textContent = message || "";
    ui.status.className = "twaba-status";

    if (type) {
      ui.status.classList.add("twaba-status-" + type);
    }
  }

  function setAllAddButtonsDisabled(disabled) {
    const buttons = document.querySelectorAll("#tw-address-book-assistant .twaba-add-btn");

    buttons.forEach(button => {
      if (button.dataset.done === "1") return;
      button.disabled = disabled || !canAddContacts();
    });
  }

  function postForm(action, data) {
    const body = new URLSearchParams();

    Object.keys(data).forEach(key => {
      body.append(key, data[key]);
    });

    return fetch(action, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
      },
      body: body.toString()
    }).then(response => {
      if (!response.ok) {
        throw new Error("Request failed: " + response.status);
      }
      return response.text();
    });
  }

  function addContact(name, button, statusCell) {
    if (state.addingLocked) {
      setStatus("Please wait a moment before adding another contact.", "warn");
      return;
    }

    const form = findAddressBookForm();

    if (!form) {
      statusCell.textContent = "Address Book form not found";
      setStatus("Go to Mail → Address book before adding contacts.", "error");
      return;
    }

    const hInput = form.querySelector('input[name="h"]');
    const hash = hInput ? hInput.value : (window.game_data ? game_data.csrf : "");

    if (!hash) {
      statusCell.textContent = "Missing token";
      setStatus("Could not find the required form token.", "error");
      return;
    }

    state.addingLocked = true;
    setAllAddButtonsDisabled(true);

    button.textContent = "Adding...";
    statusCell.textContent = "Submitting...";

    postForm(form.action, {
      name: name,
      h: hash
    })
      .then(() => {
        button.textContent = "Added";
        button.dataset.done = "1";
        button.disabled = true;
        statusCell.textContent = "Submitted";
        setStatus("Contact submitted: " + name, "success");
      })
      .catch(error => {
        console.error("Address Book Assistant add error:", error);
        button.textContent = "Retry";
        button.disabled = false;
        statusCell.textContent = "Failed";
        setStatus("Could not add: " + name, "error");
      })
      .finally(() => {
        setTimeout(() => {
          state.addingLocked = false;
          setAllAddButtonsDisabled(false);
        }, 700);
      });
  }

  function decodeWorldName(value) {
    try {
      return decodeURIComponent(String(value || "").replace(/\+/g, " "));
    } catch (e) {
      return String(value || "").replace(/\+/g, " ");
    }
  }

  function loadWorldPlayerNames() {
    const world = window.game_data ? game_data.world : "unknown";
    const cacheKey = "twaba_world_players_" + world;
    const timeKey = "twaba_world_players_time_" + world;
    const oneHour = 60 * 60 * 1000;

    try {
      const cachedAt = parseInt(localStorage.getItem(timeKey), 10) || 0;
      const cached = localStorage.getItem(cacheKey);

      if (cached && Date.now() - cachedAt < oneHour) {
        return Promise.resolve(JSON.parse(cached));
      }
    } catch (e) {
      console.warn("Address Book Assistant cache read failed:", e);
    }

    return fetch("/map/player.txt", {
      credentials: "same-origin"
    })
      .then(response => {
        if (!response.ok) {
          throw new Error("Could not load /map/player.txt");
        }
        return response.text();
      })
      .then(text => {
        const names = text
          .split("\n")
          .map(line => line.trim())
          .filter(Boolean)
          .map(line => {
            const parts = line.split(",");
            return parts[1] ? cleanName(decodeWorldName(parts[1])) : "";
          })
          .filter(name => isValidPlayerNameCandidate(name));

        try {
          localStorage.setItem(cacheKey, JSON.stringify(names));
          localStorage.setItem(timeKey, String(Date.now()));
        } catch (e) {
          console.warn("Address Book Assistant cache write failed:", e);
        }

        return names;
      });
  }

  function resolveSingleLineWithWorldData(text, worldNames) {
    const cleanedText = cleanText(text);
    const tokens = cleanedText.split(/\s+/).filter(Boolean);

    if (!tokens.length) {
      return {
        status: "empty",
        players: []
      };
    }

    const nameMap = new Map();
    let maxTokens = 1;

    worldNames.forEach(name => {
      const cleanedName = cleanName(name);
      if (!isValidPlayerNameCandidate(cleanedName)) return;

      const key = cleanedName.toLowerCase();
      if (!nameMap.has(key)) {
        nameMap.set(key, cleanedName);
      }

      maxTokens = Math.max(maxTokens, cleanedName.split(/\s+/).length);
    });

    const memo = new Map();

    function helper(index) {
      if (index === tokens.length) return [[]];
      if (memo.has(index)) return memo.get(index);

      const results = [];
      const maxEnd = Math.min(tokens.length, index + maxTokens);

      for (let end = maxEnd; end > index; end--) {
        const key = tokens.slice(index, end).join(" ").toLowerCase();

        if (!nameMap.has(key)) continue;

        const tails = helper(end);

        tails.forEach(tail => {
          results.push([nameMap.get(key)].concat(tail));
        });

        if (results.length > 1) {
          memo.set(index, results);
          return results;
        }
      }

      memo.set(index, results);
      return results;
    }

    const results = helper(0);

    if (results.length === 1) {
      return {
        status: "success",
        players: results[0]
      };
    }

    if (results.length > 1) {
      return {
        status: "ambiguous",
        players: []
      };
    }

    return {
      status: "failed",
      players: []
    };
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }

    const temp = document.createElement("textarea");
    temp.value = text;
    document.body.appendChild(temp);
    temp.select();
    document.execCommand("copy");
    temp.remove();

    return Promise.resolve();
  }

  function parseAndRenderFromTextarea() {
    const result = parsePastedText(ui.textarea.value);

    state.players = result.players;
    state.unparsed = result.unparsed;
    state.warnings = result.warnings;
    state.ambiguousText = result.ambiguousText;
    state.source = "pasted input";

    renderResults();

    if (state.players.length) {
      setStatus("Parsed " + state.players.length + " player(s).", "success");
    } else if (state.ambiguousText) {
      setStatus("Input is ambiguous. Use new lines, commas, or the resolver button.", "warn");
    } else {
      setStatus("No player names could be parsed.", "error");
    }
  }

  function resolveAmbiguousText() {
    if (!state.ambiguousText) {
      setStatus("No ambiguous single-line input found.", "warn");
      return;
    }

    setStatus("Loading world player names. This is cached for one hour.", "warn");

    loadWorldPlayerNames()
      .then(worldNames => {
        const result = resolveSingleLineWithWorldData(state.ambiguousText, worldNames);

        if (result.status === "success") {
          ui.textarea.value = result.players.join("\n");
          parseAndRenderFromTextarea();
          setStatus("Resolved " + result.players.length + " player(s) using world data.", "success");
          return;
        }

        if (result.status === "ambiguous") {
          setStatus("World data found more than one possible match. Please split names manually.", "error");
          return;
        }

        setStatus("Could not safely resolve the input. Please put each player name on a new line.", "error");
      })
      .catch(error => {
        console.error("Address Book Assistant world data error:", error);
        setStatus("Could not load world player data.", "error");
      });
  }

  function renderResults() {
    ui.results.innerHTML = "";

    if (state.warnings.length) {
      const warningBox = document.createElement("div");
      warningBox.className = "twaba-warning-box";

      state.warnings.forEach(warning => {
        const line = document.createElement("div");
        line.textContent = warning;
        warningBox.appendChild(line);
      });

      ui.results.appendChild(warningBox);
    }

    if (state.ambiguousText) {
      ui.resolveWorldBtn.style.display = "";
    } else {
      ui.resolveWorldBtn.style.display = "none";
    }

    if (!state.players.length && !state.unparsed.length) {
      return;
    }

    if (state.players.length) {
      const summary = document.createElement("div");
      summary.className = "twaba-summary";

      if (canAddContacts()) {
        summary.textContent = "Parsed players. Click Add next to each player to submit one Address Book request.";
      } else {
        summary.textContent = "Parsed players. Add buttons are enabled only on Mail → Address book.";
      }

      ui.results.appendChild(summary);

      const tableWrap = document.createElement("div");
      tableWrap.className = "twaba-table-wrap";

      const table = document.createElement("table");
      table.className = "twaba-table";
      table.width = "100%";

      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");

      ["#", "Player", "Status", "Action"].forEach(label => {
        const th = document.createElement("th");
        th.textContent = label;
        headRow.appendChild(th);
      });

      thead.appendChild(headRow);
      table.appendChild(thead);

      const tbody = document.createElement("tbody");

      state.players.forEach((name, index) => {
        const row = document.createElement("tr");

        const numberCell = document.createElement("td");
        numberCell.textContent = String(index + 1);

        const nameCell = document.createElement("td");
        nameCell.className = "twaba-left";
        nameCell.textContent = name;

        const statusCell = document.createElement("td");
        statusCell.textContent = "Ready";

        const actionCell = document.createElement("td");

        const addBtn = document.createElement("button");
        addBtn.type = "button";
        addBtn.className = "btn twaba-add-btn";
        addBtn.textContent = "Add";
        addBtn.disabled = !canAddContacts();

        if (!canAddContacts()) {
          addBtn.title = "Go to Mail → Address book to add contacts.";
        }

        addBtn.addEventListener("click", function () {
          addContact(name, addBtn, statusCell);
        });

        actionCell.appendChild(addBtn);

        row.appendChild(numberCell);
        row.appendChild(nameCell);
        row.appendChild(statusCell);
        row.appendChild(actionCell);

        tbody.appendChild(row);
      });

      table.appendChild(tbody);
      tableWrap.appendChild(table);
      ui.results.appendChild(tableWrap);
    }

    if (state.unparsed.length) {
      const unparsedBox = document.createElement("div");
      unparsedBox.className = "twaba-unparsed";

      const title = document.createElement("strong");
      title.textContent = "Could not parse:";
      unparsedBox.appendChild(title);

      const list = document.createElement("ul");

      state.unparsed.forEach(line => {
        const li = document.createElement("li");
        li.textContent = line;
        list.appendChild(li);
      });

      unparsedBox.appendChild(list);
      ui.results.appendChild(unparsedBox);
    }
  }

  function addStyles() {
    if (document.getElementById("tw-address-book-assistant-style")) return;

    const style = document.createElement("style");
    style.id = "tw-address-book-assistant-style";
    style.textContent = `
      #tw-address-book-assistant {
        position: fixed;
        top: 110px;
        right: 40px;
        width: 620px;
        max-width: 95vw;
        max-height: 80vh;
        z-index: 999999;
        border: 2px solid #7d510f;
        border-radius: 6px;
        background: #f4e4bc;
        box-shadow: 0 8px 24px rgba(0,0,0,0.35);
        color: #2f1b00;
        font-family: Verdana, Arial, sans-serif;
        font-size: 12px;
        overflow: hidden;
      }

      #tw-address-book-assistant * {
        box-sizing: border-box;
      }

      .twaba-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 9px 11px;
        background: #cfa95e;
        border-bottom: 1px solid #7d510f;
        cursor: move;
      }

      .twaba-header-title {
        font-weight: bold;
        font-size: 15px;
      }

      .twaba-close {
        width: 18px;
        height: 18px;
        line-height: 15px;
        border: 1px solid #7d510f;
        background: #f4e4bc;
        color: #2f1b00;
        border-radius: 3px;
        cursor: pointer;
        font-weight: bold;
      }

      .twaba-body {
        padding: 10px;
        max-height: calc(80vh - 42px);
        overflow-y: auto;
      }

      .twaba-help {
        margin-bottom: 8px;
        line-height: 1.35;
      }

      .twaba-label {
        display: block;
        font-weight: bold;
        margin-bottom: 4px;
      }

      .twaba-small {
        font-size: 11px;
        opacity: 0.75;
        line-height: 1.35;
        margin-top: 4px;
        margin-bottom: 8px;
      }

      .twaba-textarea {
        width: 100%;
        height: 110px;
        resize: vertical;
        padding: 6px;
        border: 1px solid #7d510f;
        border-radius: 4px;
        background: #fffaf0;
        color: #2f1b00;
        font-family: Verdana, Arial, sans-serif;
        font-size: 12px;
      }

      .twaba-buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 8px;
        margin-bottom: 8px;
      }

      .twaba-buttons .btn,
      .twaba-add-btn {
        cursor: pointer;
      }

      .twaba-status {
        padding: 6px;
        margin: 8px 0;
        border: 1px solid #bd9c5a;
        background: #fff4d5;
        border-radius: 4px;
      }

      .twaba-status-success {
        background: #dff0d8;
      }

      .twaba-status-warn {
        background: #fff4d5;
      }

      .twaba-status-error {
        background: #f2dede;
      }

      .twaba-warning-box {
        padding: 6px;
        margin-bottom: 8px;
        background: #fff4d5;
        border: 1px solid #bd9c5a;
        border-radius: 4px;
        line-height: 1.35;
      }

      .twaba-summary {
        margin: 8px 0;
        font-weight: bold;
      }

      .twaba-table-wrap {
        max-height: 320px;
        overflow-y: auto;
        border: 1px solid #bd9c5a;
      }

      .twaba-table {
        border-collapse: collapse;
        width: 100%;
      }

      .twaba-table th {
        background: #cfa95e;
        border: 1px solid #bd9c5a;
        padding: 5px;
        text-align: center;
      }

      .twaba-table td {
        border: 1px solid #bd9c5a;
        padding: 5px;
        text-align: center;
        background: #fff5da;
      }

      .twaba-table tr:nth-child(even) td {
        background: #f0e2be;
      }

      .twaba-left {
        text-align: left !important;
      }

      .twaba-unparsed {
        margin-top: 10px;
        padding: 7px;
        background: #f2dede;
        border: 1px solid #b94a48;
        border-radius: 4px;
      }

      .twaba-unparsed ul {
        margin: 5px 0 0 18px;
        padding: 0;
      }

      .twaba-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 10px;
        padding-top: 8px;
        border-top: 1px solid #bd9c5a;
        font-size: 11px;
        opacity: 0.8;
      }

      .twaba-footer a {
        color: #2f1b00;
        text-decoration: underline;
      }
    `;

    document.head.appendChild(style);
  }

  function makeDraggable(box, handle) {
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    handle.addEventListener("mousedown", function (event) {
      if (event.target.classList.contains("twaba-close")) return;

      isDragging = true;

      const rect = box.getBoundingClientRect();
      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;

      box.style.left = rect.left + "px";
      box.style.top = rect.top + "px";
      box.style.right = "auto";

      document.body.style.userSelect = "none";
    });

    document.addEventListener("mousemove", function (event) {
      if (!isDragging) return;

      box.style.left = event.clientX - offsetX + "px";
      box.style.top = event.clientY - offsetY + "px";
    });

    document.addEventListener("mouseup", function () {
      isDragging = false;
      document.body.style.userSelect = "";
    });
  }

  function closeDialog() {
    const box = document.getElementById("tw-address-book-assistant");
    if (box) box.remove();

    window.twAddressBookAssistantLoaded = false;
    console.log("Address Book Assistant closed");
  }

  function createDialog() {
    addStyles();

    const old = document.getElementById("tw-address-book-assistant");
    if (old) old.remove();

    const box = document.createElement("div");
    box.id = "tw-address-book-assistant";

    const header = document.createElement("div");
    header.className = "twaba-header";

    const title = document.createElement("div");
    title.className = "twaba-header-title";
    title.textContent = SCRIPT_NAME;

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "twaba-close";
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", closeDialog);

    header.appendChild(title);
    header.appendChild(closeBtn);

    const body = document.createElement("div");
    body.className = "twaba-body";

    const help = document.createElement("div");
    help.className = "twaba-help";
    help.textContent =
      "Paste player names or copied table rows below. The script only extracts names when it can do so safely.";

    const label = document.createElement("label");
    label.className = "twaba-label";
    label.textContent = "Player input";

    const textarea = document.createElement("textarea");
    textarea.className = "twaba-textarea";
    textarea.placeholder =
      "Paste player names here. Tables copied from Friends, Tribe members, or Tribe profiles are supported.";

    const small = document.createElement("div");
    small.className = "twaba-small";
    small.textContent =
      "For plain name lists, use one name per line or separate names with commas. Single-line lists with spaces are ambiguous because player names can contain spaces.";

    const buttons = document.createElement("div");
    buttons.className = "twaba-buttons";

    const extractBtn = document.createElement("button");
    extractBtn.type = "button";
    extractBtn.className = "btn";
    extractBtn.textContent = "Extract players";
    extractBtn.title = "Extract visible player names from the current page.";
    extractBtn.addEventListener("click", function () {
      const result = extractPlayersFromCurrentPage();

      if (!result.players.length) {
        setStatus("No player names could be extracted from this page.", "error");
        return;
      }

      ui.textarea.value = result.players.join("\n");

      state.players = result.players;
      state.unparsed = [];
      state.warnings = [];
      state.ambiguousText = "";
      state.source = result.source;

      renderResults();
      setStatus("Extracted " + result.players.length + " player(s) from " + result.source + ".", "success");
    });

    const parseBtn = document.createElement("button");
    parseBtn.type = "button";
    parseBtn.className = "btn";
    parseBtn.textContent = "Parse list";
    parseBtn.addEventListener("click", parseAndRenderFromTextarea);

    const resolveWorldBtn = document.createElement("button");
    resolveWorldBtn.type = "button";
    resolveWorldBtn.className = "btn";
    resolveWorldBtn.textContent = "Resolve with world data";
    resolveWorldBtn.style.display = "none";
    resolveWorldBtn.title = "Loads /map/player.txt once per hour to resolve ambiguous single-line player lists.";
    resolveWorldBtn.addEventListener("click", resolveAmbiguousText);

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "btn";
    copyBtn.textContent = "Copy names";
    copyBtn.addEventListener("click", function () {
      const text = state.players.length ? state.players.join("\n") : ui.textarea.value.trim();

      if (!text) {
        setStatus("Nothing to copy.", "warn");
        return;
      }

      copyText(text)
        .then(() => setStatus("Copied to clipboard.", "success"))
        .catch(() => setStatus("Could not copy to clipboard.", "error"));
    });

    const openAddressBtn = document.createElement("button");
    openAddressBtn.type = "button";
    openAddressBtn.className = "btn";
    openAddressBtn.textContent = "Open Address Book";
    openAddressBtn.addEventListener("click", function () {
      window.location.href = buildGameUrl("mail", "mode=address");
    });

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "btn";
    clearBtn.textContent = "Clear";
    clearBtn.addEventListener("click", function () {
      ui.textarea.value = "";
      state.players = [];
      state.unparsed = [];
      state.warnings = [];
      state.ambiguousText = "";
      state.source = "";
      renderResults();
      setStatus("Cleared.", "success");
    });

    buttons.appendChild(extractBtn);
    buttons.appendChild(parseBtn);
    buttons.appendChild(resolveWorldBtn);
    buttons.appendChild(copyBtn);

    if (!isAddressBookPage()) {
      buttons.appendChild(openAddressBtn);
    }

    buttons.appendChild(clearBtn);

    const status = document.createElement("div");
    status.className = "twaba-status";

    if (canAddContacts()) {
      status.textContent = "Ready. You are on the Address Book page, so Add buttons will be enabled.";
    } else {
      status.textContent = "Add buttons are enabled only on Mail → Address book. You can still extract, parse, and copy names here.";
    }

    const results = document.createElement("div");

    const footer = document.createElement("div");
    footer.className = "twaba-footer";

    const feedbackLink = document.createElement("a");
    feedbackLink.href = "https://twactics.com/scripts/address-book";
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

    body.appendChild(help);
    body.appendChild(label);
    body.appendChild(textarea);
    body.appendChild(small);
    body.appendChild(buttons);
    body.appendChild(status);
    body.appendChild(results);
    body.appendChild(footer);

    box.appendChild(header);
    box.appendChild(body);

    document.body.appendChild(box);

    ui.textarea = textarea;
    ui.status = status;
    ui.results = results;
    ui.resolveWorldBtn = resolveWorldBtn;

    makeDraggable(box, header);
  }

  createDialog();

  console.log(SCRIPT_NAME + " " + SCRIPT_VERSION + " loaded");
})();
