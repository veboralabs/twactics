/*
 * Tribal Wars - Copy Scavenging Times
 *
 * Hämtar alla byars scavenging-tider från Mass Scavenging
 * och kopierar dem till urklipp.
 */

(async function () {
    "use strict";

    const SCRIPT_NAME = "Copy Scavenging Times";
    const REQUEST_DELAY = 250;

    const baseUrl = game_data.player.sitter > 0
        ? `game.php?t=${game_data.player.id}&screen=place&mode=scavenge_mass`
        : "game.php?screen=place&mode=scavenge_mass";

    function showMessage(message, type = "success") {
        if (typeof UI !== "undefined" && typeof UI[type] === "function") {
            UI[type](message);
        } else {
            alert(message);
        }
    }

    function wait(milliseconds) {
        return new Promise(resolve => setTimeout(resolve, milliseconds));
    }

    function getServerTimestamp() {
        try {
            if (
                typeof Timing !== "undefined" &&
                typeof Timing.getCurrentServerTime === "function"
            ) {
                return Timing.getCurrentServerTime();
            }
        } catch (error) {
            console.warn("Could not retrieve server time:", error);
        }

        return Date.now();
    }

    function formatRemainingTime(returnTimestamp) {
        const now = getServerTimestamp();
        const returnTime = Number(returnTimestamp) * 1000;
        const remainingSeconds = Math.max(
            0,
            Math.ceil((returnTime - now) / 1000)
        );

        const hours = Math.floor(remainingSeconds / 3600);
        const minutes = Math.floor((remainingSeconds % 3600) / 60);
        const seconds = remainingSeconds % 60;

        return [
            String(hours).padStart(2, "0"),
            String(minutes).padStart(2, "0"),
            String(seconds).padStart(2, "0")
        ].join(":");
    }

    function extractJsonObjects(html) {
        const documentObject = new DOMParser().parseFromString(
            html,
            "text/html"
        );

        const scripts = Array.from(documentObject.querySelectorAll("script"))
            .filter(script => script.textContent.includes("ScavengeMassScreen"));

        if (scripts.length === 0) {
            throw new Error(
                "Could not find ScavengeMassScreen data on the page."
            );
        }

        const source = scripts
            .map(script => script.textContent)
            .join("\n");

        const matches = source.match(/\{.*\:\{.*\:.*\}\}/g);

        if (!matches || matches.length === 0) {
            throw new Error(
                "Could not extract scavenging data from the page."
            );
        }

        return matches;
    }

    function extractVillageData(html) {
        const jsonObjects = extractJsonObjects(html);

        /*
         * I originalscriptet ligger byinformationen normalt som
         * det tredje matchande JSON-objektet.
         */
        if (jsonObjects[2]) {
            try {
                const parsed = JSON.parse(jsonObjects[2]);

                if (Array.isArray(parsed)) {
                    return parsed;
                }
            } catch (error) {
                console.warn("Could not parse expected village data:", error);
            }
        }

        /*
         * Fallback: kontrollera alla hittade objekt och leta efter
         * en array som innehåller villages med options.
         */
        for (const jsonString of jsonObjects) {
            try {
                const parsed = JSON.parse(jsonString);

                if (
                    Array.isArray(parsed) &&
                    parsed.some(item => item && item.options)
                ) {
                    return parsed;
                }
            } catch (error) {
                // Objektet var inte den data vi letade efter.
            }
        }

        throw new Error("Could not identify the village scavenging data.");
    }

    function getAmountOfPages(html) {
        const documentObject = new DOMParser().parseFromString(
            html,
            "text/html"
        );

        const pageLinks = Array.from(
            documentObject.querySelectorAll(".paged-nav-item")
        );

        let highestPage = 0;

        for (const link of pageLinks) {
            const href = link.getAttribute("href") || "";
            const match = href.match(/[?&]page=(\d+)/);

            if (match) {
                highestPage = Math.max(
                    highestPage,
                    Number(match[1])
                );
            }
        }

        return highestPage;
    }

    function getCoordinates(village) {
        if (
            village.x !== undefined &&
            village.y !== undefined
        ) {
            return `${village.x}|${village.y}`;
        }

        const possibleNames = [
            village.village_name,
            village.name
        ];

        for (const name of possibleNames) {
            const match = String(name || "").match(/(\d{1,3})\|(\d{1,3})/);

            if (match) {
                return `${match[1]}|${match[2]}`;
            }
        }

        if (village.village_id !== undefined) {
            return `Village ${village.village_id}`;
        }

        return "Unknown village";
    }

    function getOptionText(option) {
        if (!option) {
            return "No run";
        }

        if (option.scavenging_squad?.return_time) {
            return formatRemainingTime(
                option.scavenging_squad.return_time
            );
        }

        if (option.is_locked === true) {
            return "LOCKED";
        }

        return "No run";
    }

    function getVillageLine(village) {
        const coordinates = getCoordinates(village);
        const options = village.options || {};

        const results = [];

        for (let level = 1; level <= 4; level++) {
            const option =
                options[level] ??
                options[String(level)] ??
                options[level - 1];

            results.push(getOptionText(option));
        }

        return `${coordinates}: ${results.join(" - ")}`;
    }

    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return;
        } catch (error) {
            console.warn(
                "Clipboard API unavailable. Using fallback.",
                error
            );
        }

        const textarea = document.createElement("textarea");

        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        textarea.style.top = "-9999px";

        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();

        const copied = document.execCommand("copy");
        textarea.remove();

        if (!copied) {
            throw new Error("Browser refused clipboard access.");
        }
    }

    try {
        showMessage(`${SCRIPT_NAME}: Hämtar scavenging-tider...`, "info");

        const firstPageHtml = await $.get(`${baseUrl}&page=0`);
        const amountOfPages = getAmountOfPages(firstPageHtml);

        const villages = [];

        for (let page = 0; page <= amountOfPages; page++) {
            let html;

            if (page === 0) {
                html = firstPageHtml;
            } else {
                await wait(REQUEST_DELAY);
                html = await $.get(`${baseUrl}&page=${page}`);
            }

            const pageVillages = extractVillageData(html);
            villages.push(...pageVillages);
        }

        if (villages.length === 0) {
            throw new Error("No villages were found.");
        }

        const uniqueVillages = new Map();

        for (const village of villages) {
            const key =
                village.village_id ??
                getCoordinates(village);

            uniqueVillages.set(String(key), village);
        }

        const output = Array.from(uniqueVillages.values())
            .map(getVillageLine)
            .join("\n");

        await copyToClipboard(output);

        console.log(output);

        showMessage(
            `${uniqueVillages.size} byars scavenging-tider kopierades till urklipp.`,
            "success"
        );
    } catch (error) {
        console.error(`${SCRIPT_NAME}:`, error);

        showMessage(
            `${SCRIPT_NAME}: ${error.message || error}`,
            "error"
        );
    }
})();
