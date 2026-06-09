/*
 * Copyright (c) 2026 Twactics
 * License: MIT
 *
 * Twactics Support Counter
 *
 * Calculates incoming support before a selected time or before a selected incoming attack.
 *
 * This script:
 * - Reads visible incoming commands on the current village page
 * - Fetches command details only after a manual user click
 * - Summarizes incoming support units and population
 *
 * This script does NOT:
 * - Auto-send commands
 * - Auto-click buttons
 * - Automatically move troops
 * - Perform troop actions without user interaction
 * - Use external servers or external files
 *
 * MIT License:
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this script, to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the script, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the script.
 *
 * THE SCRIPT IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
 */

(function () {
  if (window.twacticsSupportCounter && typeof window.twacticsSupportCounter.destroy === "function") {
    window.twacticsSupportCounter.destroy();
  }

  const SCRIPT_NAME = "Twactics Support Counter";
  const SCRIPT_VERSION = "v0.1.0";
  const BOX_ID = "twactics-support-counter";
  const STYLE_ID = "twactics-support-counter-style";

  const UNIT_ORDER = [
    "spear",
    "sword",
    "axe",
    "archer",
    "spy",
    "light",
    "marcher",
    "heavy",
    "ram",
    "catapult",
    "knight",
    "snob"
  ];

  const UNIT_LABELS = {
    spear: "Spear",
    sword: "Sword",
    axe: "Axe",
    archer: "Archer",
    spy: "Scout",
    light: "Light",
    marcher: "Mounted Archer",
    heavy: "Heavy",
    ram: "Ram",
    catapult: "Catapult",
    knight: "Paladin",
    snob: "Noble"
  };

  const POP = {
    spear: 1,
    sword: 1,
    axe: 1,
    archer: 1,
    spy: 2,
    light: 4,
    marcher: 5,
    heavy: 4, // Custom rule: heavy counts as 4 here
    ram: 5,
    catapult: 8,
    knight: 10,
    snob: 100
  };

  const state = {
    commands: [],
    supports: [],
    attacks: [],
    selectedAttack: null,
    cutoffMs: null,
    cutoffLabel: "",
    boundIncomingContainer: null
  };

  const ui = {};

  window.twacticsSupportCounter = {
    destroy: destroy
  };

  function destroy() {
    if (state.boundIncomingContainer) {
      state.boundIncomingContainer.removeEventListener("click", handleIncomingRowClick, true);
      state.boundIncomingContainer = null;
    }
  
    document.querySelectorAll(".twsc-selected-attack").forEach(function (row) {
      row.classList.remove("twsc-selected-attack");
    });
  
    const box = document.getElementById(BOX_ID);
    if (box) box.remove();
  
    const style = document.getElementById(STYLE_ID);
    if (style) style.remove();
  
    delete window.twacticsSupportCounter;
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

  function getParam(name, url) {
    try {
      return new URL(url || window.location.href, window.location.origin).searchParams.get(name);
    } catch (e) {
      return null;
    }
  }

  function getCurrentVillageId() {
    if (
      typeof game_data !== "undefined" &&
      game_data.village &&
      game_data.village.id
    ) {
      return String(game_data.village.id);
    }

    return getParam("village") || "";
  }

  function formatDateTime(ms) {
    const date = new Date(ms);

    return (
      pad(date.getDate()) +
      "/" +
      pad(date.getMonth() + 1) +
      " " +
      pad(date.getHours()) +
      ":" +
      pad(date.getMinutes()) +
      ":" +
      pad(date.getSeconds()) +
      "." +
      pad(date.getMilliseconds(), 3)
    );
  }

  function getServerDateParts() {
    const serverDate = document.getElementById("serverDate");

    if (serverDate) {
      const parts = cleanText(serverDate.textContent).match(/\d+/g);

      if (parts && parts.length >= 3) {
        return {
          day: parseInt(parts[0], 10),
          month: parseInt(parts[1], 10),
          year: parseInt(parts[2], 10)
        };
      }
    }

    const now = new Date();

    return {
      day: now.getDate(),
      month: now.getMonth() + 1,
      year: now.getFullYear()
    };
  }

  function fillManualInputsFromMs(ms) {
    const date = new Date(ms);

    ui.cutoffDate.value =
      date.getFullYear() +
      "-" +
      pad(date.getMonth() + 1) +
      "-" +
      pad(date.getDate());

    ui.cutoffHour.value = pad(date.getHours());
    ui.cutoffMinute.value = pad(date.getMinutes());
    ui.cutoffSecond.value = pad(date.getSeconds());
    ui.cutoffMs.value = pad(date.getMilliseconds(), 3);
  }

  function getManualCutoffMs() {
    if (!ui.cutoffDate.value) return null;

    const dateParts = ui.cutoffDate.value.match(/\d+/g);
    if (!dateParts || dateParts.length < 3) return null;

    const year = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10);
    const day = parseInt(dateParts[2], 10);

    const hour = clamp(parseInt(ui.cutoffHour.value, 10), 0, 23, 0);
    const minute = clamp(parseInt(ui.cutoffMinute.value, 10), 0, 59, 0);
    const second = clamp(parseInt(ui.cutoffSecond.value, 10), 0, 59, 0);
    const millis = clamp(parseInt(ui.cutoffMs.value, 10), 0, 999, 0);

    return new Date(year, month - 1, day, hour, minute, second, millis).getTime();
  }

  function clamp(value, min, max, fallback) {
    if (isNaN(value)) return fallback;
    if (value < min) return min;
    if (value > max) return max;
    return value;
  }

  function setStatus(message, type) {
    ui.status.textContent = message || "";
    ui.status.className = "twsc-status";

    if (type) {
      ui.status.classList.add("twsc-status-" + type);
    }
  }

  function getCommandId(row) {
    const idEl = row.querySelector("[data-command-id]");
    if (idEl && idEl.getAttribute("data-command-id")) {
      return idEl.getAttribute("data-command-id");
    }

    const quickedit = row.querySelector(".quickedit[data-id]");
    if (quickedit && quickedit.getAttribute("data-id")) {
      return quickedit.getAttribute("data-id");
    }

    const input = row.querySelector("input[name^='id_']");
    if (input) {
      const match = input.name.match(/id_(\d+)/);
      if (match) return match[1];
    }

    const link = row.querySelector("a[href*='screen=info_command'][href*='id=']");
    if (link) {
      return getParam("id", link.getAttribute("href"));
    }

    return "";
  }

  function getCommandType(row) {
    const typeEls = Array.from(row.querySelectorAll("[data-command-type]"));
    const types = typeEls.map(el => cleanText(el.getAttribute("data-command-type")).toLowerCase());

    if (types.includes("support")) {
      return "support";
    }

    if (types.some(type => type.includes("attack"))) {
      return "attack";
    }

    const dataTitleAttack = row.querySelector("[data-title='Attack']");
    if (dataTitleAttack) {
      return "attack";
    }

    const reqdefLink = row.querySelector("a[href*='screen=reqdef']");
    if (reqdefLink) {
      return "attack";
    }

    const images = Array.from(row.querySelectorAll("img"));
    const srcs = images.map(img => img.getAttribute("src") || "");

    if (srcs.some(src => src.includes("/command/support"))) {
      return "support";
    }

    if (srcs.some(src => src.includes("/command/attack"))) {
      return "attack";
    }

    return "unknown";
  }

  function getCommandLabel(row) {
    const label = row.querySelector(".quickedit-label");
    if (label) return cleanText(label.textContent);

    const firstCell = row.querySelector("td");
    if (firstCell) return cleanText(firstCell.textContent);

    return "Command";
  }

  function getArrivalMsFromRow(row) {
    const endEl = row.querySelector("[data-endtime]");
    if (!endEl) return null;

    const seconds = parseInt(endEl.getAttribute("data-endtime"), 10);
    if (isNaN(seconds)) return null;

    const cells = Array.from(row.querySelectorAll("td"));
    const arrivalCell = cells[1] || null;
    const arrivalText = arrivalCell ? cleanText(arrivalCell.textContent) : "";

    let millis = 0;

    const millisMatch = arrivalText.match(/[:.](\d{1,3})\s*$/);
    if (millisMatch) {
      millis = parseInt(millisMatch[1].padEnd(3, "0").slice(0, 3), 10);
    }

    return seconds * 1000 + millis;
  }

  function scanIncomingCommands() {
    const container = document.getElementById("commands_incomings");

    if (!container) {
      state.commands = [];
      state.supports = [];
      state.attacks = [];
      setStatus("Could not find incoming commands on this page.", "error");
      renderAttackList();
      return;
    }

    const rows = Array.from(container.querySelectorAll("tr.command-row"));

    const commands = rows
      .map(row => {
        const id = getCommandId(row);
        const type = getCommandType(row);
        const arrivalMs = getArrivalMsFromRow(row);
        const label = getCommandLabel(row);

        if (!id || !arrivalMs || type === "unknown") {
          return null;
        }

        return {
          id: id,
          type: type,
          arrivalMs: arrivalMs,
          label: label,
          row: row
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.arrivalMs - b.arrivalMs);

    state.commands = commands;
    state.supports = commands.filter(command => command.type === "support");
    state.attacks = commands.filter(command => command.type === "attack");
    
    bindIncomingRowSelection();
    
    setStatus(
      "Found " +
        state.supports.length +
        " support command(s) and " +
        state.attacks.length +
        " attack command(s). Click an attack row in the Tribal Wars table to select cutoff.",
      "success"
    );
    
    if (state.attacks.length) {
      fillManualInputsFromMs(state.attacks[0].arrivalMs);
    } else {
      const dateParts = getServerDateParts();
      const now = new Date();
    
      fillManualInputsFromMs(
        new Date(
          dateParts.year,
          dateParts.month - 1,
          dateParts.day,
          now.getHours(),
          now.getMinutes(),
          now.getSeconds(),
          0
        ).getTime()
      );
    }
    
    renderAttackList();
    clearResults();
  }

  function bindIncomingRowSelection() {
    const container = document.getElementById("commands_incomings");
  
    if (!container) return;
  
    if (state.boundIncomingContainer === container) return;
  
    if (state.boundIncomingContainer) {
      state.boundIncomingContainer.removeEventListener("click", handleIncomingRowClick, true);
    }
  
    state.boundIncomingContainer = container;
    container.addEventListener("click", handleIncomingRowClick, true);
  }
  
  function handleIncomingRowClick(event) {
    const row = event.target.closest("tr.command-row");
  
    if (!row) return;
  
    const container = document.getElementById("commands_incomings");
    if (!container || !container.contains(row)) return;
  
    const type = getCommandType(row);
  
    if (type !== "attack") return;
  
    event.preventDefault();
    event.stopPropagation();
  
    const id = getCommandId(row);
    const attack =
      state.attacks.find(function (item) {
        return item.id === id;
      }) || {
        id: id,
        type: "attack",
        arrivalMs: getArrivalMsFromRow(row),
        label: getCommandLabel(row),
        row: row
      };
  
    selectAttackCutoff(attack);
  }
  
  function selectAttackCutoff(attack) {
    if (!attack || !attack.arrivalMs) {
      setStatus("Could not read selected attack time.", "error");
      return;
    }
  
    document.querySelectorAll(".twsc-selected-attack").forEach(function (row) {
      row.classList.remove("twsc-selected-attack");
    });
  
    if (attack.row) {
      attack.row.classList.add("twsc-selected-attack");
    }
  
    state.selectedAttack = attack;
    state.cutoffMs = attack.arrivalMs;
    state.cutoffLabel = "Selected attack";
  
    fillManualInputsFromMs(attack.arrivalMs);
    updateSelectedCutoffText();
    clearResults();
    
    setStatus("Selected attack as cutoff. Click Calculate selected attack to load support.", "success");
  }
  
  function calculateSelectedAttackCutoff() {
    if (!state.selectedAttack || !state.selectedAttack.arrivalMs) {
      setStatus("Click an incoming attack row first.", "warn");
      return;
    }
  
    calculateSupportBeforeCutoff(state.selectedAttack.arrivalMs, "Selected attack");
  }

  function updateSelectedCutoffText() {
    if (!state.cutoffMs) {
      ui.selectedCutoff.textContent = "No cutoff selected.";
      return;
    }

    ui.selectedCutoff.textContent =
      "Selected cutoff: " +
      formatDateTime(state.cutoffMs) +
      (state.cutoffLabel ? " (" + state.cutoffLabel + ")" : "");
  }

  function buildCommandDetailsUrl(commandId) {
    const encodedId = encodeURIComponent(commandId);

    if (
      typeof game_data !== "undefined" &&
      typeof game_data.link_base_pure === "string"
    ) {
      return game_data.link_base_pure + "info_command&ajax=details&id=" + encodedId;
    }

    const villageId = getCurrentVillageId();

    return (
      "/game.php?village=" +
      encodeURIComponent(villageId) +
      "&screen=info_command&ajax=details&id=" +
      encodedId
    );
  }

  async function fetchCommandDetails(commandId) {
      const url = buildCommandDetailsUrl(commandId);
  
      const response = await fetch(url, {
        method: "GET",
        credentials: "same-origin",
        headers: {
          "Accept": "application/json, text/javascript, */*; q=0.01"
        }
      });
  
      if (!response.ok) {
        throw new Error("HTTP " + response.status);
      }
  
      const text = await response.text();
  
      try {
        return JSON.parse(text);
      } catch (err) {
        throw new Error("Could not parse JSON response");
      }
    }
  
    function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  async function fetchCommandDetailsWithRetry(commandId) {
    let lastError = null;
  
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        if (attempt > 1) {
          await sleep(250 * attempt);
        }
  
        return await fetchCommandDetails(commandId);
      } catch (err) {
        lastError = err;
  
        console.warn(
          SCRIPT_NAME + " command detail attempt failed:",
          {
            id: commandId,
            attempt: attempt,
            reason: err && err.message ? err.message : String(err),
            url: buildCommandDetailsUrl(commandId)
          }
        );
      }
    }
  
    throw lastError;
  }

  function getArrivalMsFromDetails(details) {
    if (!details || !details.time_arrival) return null;

    const seconds = parseInt(details.time_arrival.date, 10);
    const millis = parseInt(details.time_arrival.millis || "0", 10);

    if (isNaN(seconds)) return null;

    return seconds * 1000 + (isNaN(millis) ? 0 : millis);
  }

  function createEmptyTotals() {
    const totals = {};

    UNIT_ORDER.forEach(unit => {
      totals[unit] = 0;
    });

    return totals;
  }

  function addUnitsToTotals(totals, units) {
    if (!units) return;

    Object.keys(units).forEach(unitName => {
      const unit = units[unitName];
      const count = parseInt(unit && unit.count ? unit.count : "0", 10);

      if (isNaN(count) || count <= 0) return;

      if (totals[unitName] === undefined) {
        totals[unitName] = 0;
      }

      totals[unitName] += count;
    });
  }

  function calculatePopulation(totals) {
    let total = 0;

    Object.keys(totals).forEach(unitName => {
      const count = parseInt(totals[unitName] || 0, 10);
      const pop = POP[unitName] || 0;

      total += count * pop;
    });

    return total;
  }

  async function calculateSupportBeforeCutoff(cutoffMs, cutoffLabel) {
    if (!cutoffMs || isNaN(cutoffMs)) {
      setStatus("Invalid cutoff time.", "error");
      return;
    }

    if (!state.commands.length) {
      scanIncomingCommands();
    }

    state.cutoffMs = cutoffMs;
    state.cutoffLabel = cutoffLabel || "";
    updateSelectedCutoffText();

    const matchingSupports = state.supports.filter(command => command.arrivalMs < cutoffMs);

    if (!matchingSupports.length) {
      renderResults({
        cutoffMs: cutoffMs,
        cutoffLabel: cutoffLabel,
        scannedSupports: 0,
        countedSupports: 0,
        failed: 0,
        skipped: 0,
        totals: createEmptyTotals(),
        rows: []
      });

      setStatus("No visible support arrives before this cutoff.", "warn");
      return;
    }

    const totals = createEmptyTotals();
    const rows = [];
    let failed = 0;
    let skipped = 0;
    let countedSupports = 0;
    const failedDetails = [];

    ui.calculateManualButton.disabled = true;
    ui.scanButton.disabled = true;

    if (ui.calculateSelectedAttackButton) {
      ui.calculateSelectedAttackButton.disabled = true;
    }

    try {
      for (let i = 0; i < matchingSupports.length; i++) {
        const command = matchingSupports[i];

        setStatus(
          "Loading support details " +
            (i + 1) +
            " / " +
            matchingSupports.length +
            "...",
          "warn"
        );

        try {
          const details = await fetchCommandDetailsWithRetry(command.id);

          const detailArrivalMs = getArrivalMsFromDetails(details) || command.arrivalMs;

          if (details.type !== "support" || detailArrivalMs >= cutoffMs) {
            skipped++;
            continue;
          }

          addUnitsToTotals(totals, details.units);

          rows.push({
            id: command.id,
            label: command.label,
            arrivalMs: detailArrivalMs,
            units: details.units || {}
          });

          countedSupports++;
        } catch (err) {
          failed++;
        
          const failedInfo = {
            id: command.id,
            label: command.label,
            arrival: formatDateTime(command.arrivalMs),
            url: buildCommandDetailsUrl(command.id),
            reason: err && err.message ? err.message : String(err)
          };
        
          failedDetails.push(failedInfo);
        
          console.warn(SCRIPT_NAME + " failed to load support details:", failedInfo, err);
        }
      }
        } finally {
          ui.calculateManualButton.disabled = false;
          ui.scanButton.disabled = false;
    
          if (ui.calculateSelectedAttackButton) {
            ui.calculateSelectedAttackButton.disabled = false;
          }
        }
    
        if (failedDetails.length) {
          console.groupCollapsed(
            SCRIPT_NAME + " failed support details (" + failedDetails.length + ")"
          );
          console.table(failedDetails);
          failedDetails.forEach(function (item) {
            console.warn(item);
          });
          console.groupEnd();
        }
    
        renderResults({
          cutoffMs: cutoffMs,
          cutoffLabel: cutoffLabel,
          scannedSupports: matchingSupports.length,
          countedSupports: countedSupports,
          failed: failed,
          skipped: skipped,
          totals: totals,
          rows: rows
        });
    
        setStatus(
          "Done. Counted " +
            countedSupports +
            " support command(s). Failed: " +
            failed +
            ".",
          failed ? "warn" : "success"
        );
      }

  function clearResults() {
    ui.results.innerHTML = "";
  }

  function renderResults(result) {
    clearResults();

    const totalPop = calculatePopulation(result.totals);

    const summary = document.createElement("div");
    summary.className = "twsc-summary";

    summary.innerHTML =
      "<strong>Support before cutoff</strong><br>" +
      "Cutoff: " +
      escapeHtml(formatDateTime(result.cutoffMs)) +
      (result.cutoffLabel ? " (" + escapeHtml(result.cutoffLabel) + ")" : "") +
      "<br>" +
      "Visible support before cutoff: " +
      result.scannedSupports +
      "<br>" +
      "Counted support commands: " +
      result.countedSupports +
      "<br>" +
      "Failed details: " +
      result.failed +
      "<br>" +
      "Skipped: " +
      result.skipped +
      "<br>" +
      "<strong>Total population: " +
      totalPop.toLocaleString() +
      "</strong>" +
      "<br>" +
      "<span class='twsc-small'>Heavy is counted as 4 population in this script.</span>";

    ui.results.appendChild(summary);

    renderUnitTable(result.totals, ui.results);
    renderDetailsTable(result.rows, ui.results);
  }

  function renderUnitTable(totals, container) {
    const title = document.createElement("div");
    title.className = "twsc-section-title";
    title.textContent = "Unit summary";
    container.appendChild(title);

    const table = document.createElement("table");
    table.className = "twsc-table";

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");

    ["Unit", "Count", "Population"].forEach(text => {
      const th = document.createElement("th");
      th.textContent = text;
      headRow.appendChild(th);
    });

    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    UNIT_ORDER.forEach(unitName => {
      const count = totals[unitName] || 0;
      const pop = POP[unitName] || 0;

      const row = document.createElement("tr");

      const unitCell = document.createElement("td");
      unitCell.textContent = UNIT_LABELS[unitName] || unitName;

      const countCell = document.createElement("td");
      countCell.textContent = count.toLocaleString();

      const popCell = document.createElement("td");
      popCell.textContent = (count * pop).toLocaleString();

      row.appendChild(unitCell);
      row.appendChild(countCell);
      row.appendChild(popCell);

      tbody.appendChild(row);
    });

    table.appendChild(tbody);
    container.appendChild(table);
  }

  function renderDetailsTable(rows, container) {
    if (!rows.length) return;
  
    const details = document.createElement("details");
    details.className = "twsc-details-collapsed";
  
    const summary = document.createElement("summary");
    summary.textContent = "Show counted support commands (" + rows.length + ")";
    details.appendChild(summary);
  
    const wrap = document.createElement("div");
    wrap.className = "twsc-table-wrap";
  
    const table = document.createElement("table");
    table.className = "twsc-table";
  
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
  
    ["Arrival", "Command", "Main units"].forEach(text => {
      const th = document.createElement("th");
      th.textContent = text;
      headRow.appendChild(th);
    });
  
    thead.appendChild(headRow);
    table.appendChild(thead);
  
    const tbody = document.createElement("tbody");
  
    rows.forEach(item => {
      const row = document.createElement("tr");
  
      const arrivalCell = document.createElement("td");
      arrivalCell.textContent = formatDateTime(item.arrivalMs);
  
      const labelCell = document.createElement("td");
      labelCell.className = "twsc-left";
      labelCell.textContent = item.label;
  
      const unitsCell = document.createElement("td");
      unitsCell.className = "twsc-left";
      unitsCell.textContent = formatMainUnits(item.units);
  
      row.appendChild(arrivalCell);
      row.appendChild(labelCell);
      row.appendChild(unitsCell);
  
      tbody.appendChild(row);
    });
  
    table.appendChild(tbody);
    wrap.appendChild(table);
    details.appendChild(wrap);
  
    container.appendChild(details);
  }

  function formatMainUnits(units) {
    const parts = [];

    UNIT_ORDER.forEach(unitName => {
      const unit = units && units[unitName] ? units[unitName] : null;
      const count = unit ? parseInt(unit.count || "0", 10) : 0;

      if (count > 0) {
        parts.push((UNIT_LABELS[unitName] || unitName) + ": " + count.toLocaleString());
      }
    });

    return parts.length ? parts.join(", ") : "-";
  }

  function renderAttackList() {
    ui.attackList.innerHTML = "";
  
    const info = document.createElement("div");
    info.className = "twsc-small";
  
    if (!state.attacks.length) {
      info.textContent = "No visible incoming attacks found.";
    } else {
      info.textContent =
        "Click an attack row directly in the Tribal Wars incoming table to select it as cutoff. The selected attack will be highlighted yellow.";
    }
  
    ui.attackList.appendChild(info);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;

    style.textContent = `
      #${BOX_ID} {
        position: fixed;
        top: 95px;
        right: 35px;
        width: 760px;
        max-width: 96vw;
        max-height: 84vh;
        z-index: 999999;
        border: 2px solid #7d510f;
        border-radius: 6px;
        background: #f4e4bc;
        color: #2f1b00;
        font-family: Verdana, Arial, sans-serif;
        font-size: 12px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.35);
        overflow: hidden;
      }

      #${BOX_ID} * {
        box-sizing: border-box;
      }

      .twsc-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 10px;
        background: #cfa95e;
        border-bottom: 1px solid #7d510f;
        cursor: move;
      }

      .twsc-title {
        font-weight: bold;
        font-size: 14px;
      }

      .twsc-close {
        width: 20px;
        height: 20px;
        border: 1px solid #7d510f;
        background: #f4e4bc;
        cursor: pointer;
        font-weight: bold;
      }

      .twsc-body {
        padding: 10px;
        max-height: calc(84vh - 40px);
        overflow-y: auto;
      }

      .twsc-controls {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        margin-bottom: 8px;
      }

      .twsc-panel {
        border: 1px solid #bd9c5a;
        background: #fff4d5;
        border-radius: 4px;
        padding: 8px;
      }

      .twsc-label {
        display: block;
        font-weight: bold;
        margin-bottom: 4px;
      }

      .twsc-time-grid {
        display: grid;
        grid-template-columns: 1fr 42px 42px 42px 52px;
        gap: 4px;
        align-items: end;
      }

      .twsc-input {
        width: 100%;
        padding: 4px;
        border: 1px solid #7d510f;
        background: #fffaf0;
      }

      .twsc-buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 8px;
      }

      .twsc-status {
        padding: 6px;
        margin: 8px 0;
        border: 1px solid #bd9c5a;
        background: #fff4d5;
        border-radius: 4px;
      }

      .twsc-status-success {
        background: #dff0d8;
      }

      .twsc-status-warn {
        background: #fff4d5;
      }

      .twsc-status-error {
        background: #f2dede;
      }

      .twsc-selected {
        margin: 8px 0;
        padding: 6px;
        background: #fffaf0;
        border: 1px solid #bd9c5a;
        border-radius: 4px;
        font-weight: bold;
      }

      .twsc-selected-attack td {
        background: #ffe563 !important;
      }
      
      .twsc-details-collapsed {
        margin-top: 12px;
      }
      
      .twsc-details-collapsed summary {
        cursor: pointer;
        font-weight: bold;
        padding: 6px;
        background: #fff4d5;
        border: 1px solid #bd9c5a;
        border-radius: 4px;
      }

      .twsc-section-title {
        margin-top: 12px;
        margin-bottom: 5px;
        font-weight: bold;
        font-size: 13px;
      }

      .twsc-summary {
        padding: 8px;
        margin: 8px 0;
        background: #dff0d8;
        border: 1px solid #8bbf7f;
        border-radius: 4px;
        line-height: 1.5;
      }

      .twsc-table-wrap {
        max-height: 280px;
        overflow-y: auto;
        border: 1px solid #bd9c5a;
      }

      .twsc-table {
        width: 100%;
        border-collapse: collapse;
      }

      .twsc-table th {
        background: #cfa95e;
        border: 1px solid #bd9c5a;
        padding: 5px;
        text-align: center;
      }

      .twsc-table td {
        border: 1px solid #bd9c5a;
        padding: 5px;
        text-align: center;
        background: #fff5da;
        vertical-align: top;
      }

      .twsc-table tr:nth-child(even) td {
        background: #f0e2be;
      }

      .twsc-left {
        text-align: left !important;
      }

      .twsc-small {
        font-size: 11px;
        opacity: 0.8;
        line-height: 1.35;
      }

      @media (max-width: 800px) {
        #${BOX_ID} {
          top: 60px;
          right: 5px;
          left: 5px;
          width: auto;
        }

        .twsc-controls {
          grid-template-columns: 1fr;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function makeDraggable(box, handle) {
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    handle.addEventListener("mousedown", function (event) {
      if (event.target.classList.contains("twsc-close")) return;

      dragging = true;

      const rect = box.getBoundingClientRect();

      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;

      box.style.left = rect.left + "px";
      box.style.top = rect.top + "px";
      box.style.right = "auto";

      document.body.style.userSelect = "none";
    });

    document.addEventListener("mousemove", function (event) {
      if (!dragging) return;

      box.style.left = event.clientX - offsetX + "px";
      box.style.top = event.clientY - offsetY + "px";
    });

    document.addEventListener("mouseup", function () {
      dragging = false;
      document.body.style.userSelect = "";
    });
  }

  function createDialog() {
    addStyles();

    const old = document.getElementById(BOX_ID);
    if (old) old.remove();

    const box = document.createElement("div");
    box.id = BOX_ID;

    const header = document.createElement("div");
    header.className = "twsc-header";

    const title = document.createElement("div");
    title.className = "twsc-title";
    title.textContent = SCRIPT_NAME + " " + SCRIPT_VERSION;

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "twsc-close";
    closeButton.textContent = "x";
    closeButton.addEventListener("click", destroy);

    header.appendChild(title);
    header.appendChild(closeButton);

    const body = document.createElement("div");
    body.className = "twsc-body";

    const help = document.createElement("div");
    help.className = "twsc-small";
    help.textContent =
      "Reads visible incoming commands and calculates how much support arrives before a selected time or before a selected attack. Details are only loaded after you click calculate.";

    const controls = document.createElement("div");
    controls.className = "twsc-controls";

    const manualPanel = document.createElement("div");
    manualPanel.className = "twsc-panel";

    const manualTitle = document.createElement("div");
    manualTitle.className = "twsc-section-title";
    manualTitle.textContent = "Manual cutoff time";

    const timeGrid = document.createElement("div");
    timeGrid.className = "twsc-time-grid";

    const cutoffDate = document.createElement("input");
    cutoffDate.type = "date";
    cutoffDate.className = "twsc-input";

    const cutoffHour = document.createElement("input");
    cutoffHour.type = "number";
    cutoffHour.min = "0";
    cutoffHour.max = "23";
    cutoffHour.className = "twsc-input";

    const cutoffMinute = document.createElement("input");
    cutoffMinute.type = "number";
    cutoffMinute.min = "0";
    cutoffMinute.max = "59";
    cutoffMinute.className = "twsc-input";

    const cutoffSecond = document.createElement("input");
    cutoffSecond.type = "number";
    cutoffSecond.min = "0";
    cutoffSecond.max = "59";
    cutoffSecond.className = "twsc-input";

    const cutoffMs = document.createElement("input");
    cutoffMs.type = "number";
    cutoffMs.min = "0";
    cutoffMs.max = "999";
    cutoffMs.className = "twsc-input";

    timeGrid.appendChild(cutoffDate);
    timeGrid.appendChild(cutoffHour);
    timeGrid.appendChild(cutoffMinute);
    timeGrid.appendChild(cutoffSecond);
    timeGrid.appendChild(cutoffMs);

    const manualHelp = document.createElement("div");
    manualHelp.className = "twsc-small";
    manualHelp.textContent = "Date, HH, MM, SS, MS. Counts support strictly before this time.";

    const calculateManualButton = document.createElement("button");
    calculateManualButton.type = "button";
    calculateManualButton.className = "btn";
    calculateManualButton.textContent = "Calculate manual cutoff";
    calculateManualButton.addEventListener("click", function () {
      const cutoffMsValue = getManualCutoffMs();
      calculateSupportBeforeCutoff(cutoffMsValue, "Manual cutoff");
    });

    manualPanel.appendChild(manualTitle);
    manualPanel.appendChild(timeGrid);
    manualPanel.appendChild(manualHelp);

    const manualButtons = document.createElement("div");
    manualButtons.className = "twsc-buttons";
    manualButtons.appendChild(calculateManualButton);
    manualPanel.appendChild(manualButtons);

    const scanPanel = document.createElement("div");
    scanPanel.className = "twsc-panel";

    const scanTitle = document.createElement("div");
    scanTitle.className = "twsc-section-title";
    scanTitle.textContent = "Visible incomings";

    const scanHelp = document.createElement("div");
    scanHelp.className = "twsc-small";
    scanHelp.textContent = "Works on village overview and place screens when incoming commands are visible.";

    const scanButton = document.createElement("button");
    scanButton.type = "button";
    scanButton.className = "btn";
    scanButton.textContent = "Rescan incomings";
    scanButton.addEventListener("click", scanIncomingCommands);

    const calculateSelectedAttackButton = document.createElement("button");
    calculateSelectedAttackButton.type = "button";
    calculateSelectedAttackButton.className = "btn";
    calculateSelectedAttackButton.textContent = "Calculate selected attack";
    calculateSelectedAttackButton.addEventListener("click", calculateSelectedAttackCutoff);

    const scanButtons = document.createElement("div");
    scanButtons.className = "twsc-buttons";
    scanButtons.appendChild(scanButton);
    scanButtons.appendChild(calculateSelectedAttackButton);

    scanPanel.appendChild(scanTitle);
    scanPanel.appendChild(scanHelp);
    scanPanel.appendChild(scanButtons);

    controls.appendChild(manualPanel);
    controls.appendChild(scanPanel);

    const status = document.createElement("div");
    status.className = "twsc-status";
    status.textContent = "Ready.";

    const selectedCutoff = document.createElement("div");
    selectedCutoff.className = "twsc-selected";
    selectedCutoff.textContent = "No cutoff selected.";

    const attackTitle = document.createElement("div");
    attackTitle.className = "twsc-section-title";
    attackTitle.textContent = "Use incoming attack as cutoff";

    const attackList = document.createElement("div");

    const results = document.createElement("div");

    body.appendChild(help);
    body.appendChild(controls);
    body.appendChild(status);
    body.appendChild(selectedCutoff);
    body.appendChild(attackTitle);
    body.appendChild(attackList);
    body.appendChild(results);

    box.appendChild(header);
    box.appendChild(body);

    document.body.appendChild(box);

    ui.cutoffDate = cutoffDate;
    ui.cutoffHour = cutoffHour;
    ui.cutoffMinute = cutoffMinute;
    ui.cutoffSecond = cutoffSecond;
    ui.cutoffMs = cutoffMs;
    ui.status = status;
    ui.selectedCutoff = selectedCutoff;
    ui.attackList = attackList;
    ui.results = results;
    ui.scanButton = scanButton;
    ui.calculateSelectedAttackButton = calculateSelectedAttackButton;
    ui.calculateManualButton = calculateManualButton;

    makeDraggable(box, header);

    scanIncomingCommands();
  }

  createDialog();

  console.log(SCRIPT_NAME + " " + SCRIPT_VERSION + " loaded");
})();
