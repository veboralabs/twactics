/* 
 * Premium Exchange Alert
 * 
 * Description:
 * Provides a local alert (sound + tab title) when stock values change
 * on the Premium Exchange page based on user-selected direction, threshold,
 * and alert mode.
 * 
 * This script does NOT perform any actions, requests, or automation.
 * It only observes visible DOM changes.
 */

(function () {
  if (window.ppAlertLoaded) {
    console.log("Premium Exchange Alert already loaded");
    return;
  }

  window.ppAlertLoaded = true;

  const ids = [
    "premium_exchange_stock_wood",
    "premium_exchange_stock_stone",
    "premium_exchange_stock_iron"
  ];

  const previousValues = {};
  const alertBaseValues = {};
  const originalTitle = document.title;

  let blinkInterval = null;
  let audioCtx = null;
  let alertDirection = "increase";
  let alertType = "single";
  let threshold = 500;

  function getAudioContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;

    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }

    return audioCtx;
  }

  function playBeep() {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      if (ctx.state === "suspended") {
        ctx.resume();
      }

      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(800, ctx.currentTime);
      gainNode.gain.setValueAtTime(0.08, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.2);
    } catch (err) {
      console.log("Audio error:", err);
    }
  }

  function playMultipleBeeps(count) {
    const safeCount = Math.min(count, 5);
    for (let i = 0; i < safeCount; i++) {
      setTimeout(() => {
        playBeep();
      }, i * 300);
    }
  }

  function startTitleBlink() {
    if (blinkInterval) return;

    const alertTitle = alertDirection === "increase" ? "BUY RESOURCES" : "SELL RESOURCES";

    let toggle = false;
    blinkInterval = setInterval(() => {
      document.title = toggle ? alertTitle : originalTitle;
      toggle = !toggle;
    }, 1000);
  }

  function initValues() {
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        const value = parseInt(el.textContent.trim(), 10) || 0;
        previousValues[id] = value;
        alertBaseValues[id] = value;
      }
    });
  }

  function checkChange(id, el) {
    const newValue = parseInt(el.textContent.trim(), 10) || 0;
    const oldValue = previousValues[id] || 0;
    const baseValue = alertBaseValues[id] || 0;

    if (alertDirection === "increase") {
      const diffFromPrevious = newValue - oldValue;
      const diffFromBase = newValue - baseValue;

      if (alertType === "single") {
        if (diffFromPrevious >= threshold) {
          console.log(id + " increased: " + oldValue + " → " + newValue);
          playBeep();
          startTitleBlink();
        }
      } else if (alertType === "step") {
        const stepsReached = Math.floor(diffFromBase / threshold);

        if (stepsReached > 0) {
          console.log(
            id + " increased: " + oldValue + " → " + newValue +
            " (" + stepsReached + " threshold step(s))"
          );
          playMultipleBeeps(stepsReached);
          startTitleBlink();
          alertBaseValues[id] = baseValue + (stepsReached * threshold);
        }
      }
    }

    if (alertDirection === "decrease") {
      const diffFromPrevious = oldValue - newValue;
      const diffFromBase = baseValue - newValue;

      if (alertType === "single") {
        if (diffFromPrevious >= threshold) {
          console.log(id + " decreased: " + oldValue + " → " + newValue);
          playBeep();
          startTitleBlink();
        }
      } else if (alertType === "step") {
        const stepsReached = Math.floor(diffFromBase / threshold);

        if (stepsReached > 0) {
          console.log(
            id + " decreased: " + oldValue + " → " + newValue +
            " (" + stepsReached + " threshold step(s))"
          );
          playMultipleBeeps(stepsReached);
          startTitleBlink();
          alertBaseValues[id] = baseValue - (stepsReached * threshold);
        }
      }
    }

    previousValues[id] = newValue;
  }

  function startObservers() {
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;

      const observer = new MutationObserver(() => {
        checkChange(id, el);
      });

      observer.observe(el, {
        childList: true,
        subtree: true,
        characterData: true
      });
    });

    console.log(
      "Premium Exchange Alert active | direction: " +
      alertDirection +
      " | threshold: " +
      threshold +
      " | type: " +
      alertType
    );
  }

  function createButton(label, selected, onClick) {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.type = "button";
    btn.style.padding = "8px 12px";
    btn.style.marginRight = "8px";
    btn.style.marginBottom = "8px";
    btn.style.border = "1px solid #7d510f";
    btn.style.background = selected ? "#cfa95e" : "#f4e4bc";
    btn.style.color = "#2f1b00";
    btn.style.cursor = "pointer";
    btn.style.borderRadius = "4px";
    btn.style.fontWeight = "bold";
    btn.addEventListener("click", onClick);
    return btn;
  }

  function renderDialog() {
    const existing = document.getElementById("pp-alert-dialog-overlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "pp-alert-dialog-overlay";
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(0,0,0,0.45)";
    overlay.style.zIndex = "999999";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";

    const box = document.createElement("div");
    box.style.width = "460px";
    box.style.maxWidth = "90vw";
    box.style.background = "#f4e4bc";
    box.style.border = "2px solid #7d510f";
    box.style.borderRadius = "6px";
    box.style.boxShadow = "0 8px 24px rgba(0,0,0,0.35)";
    box.style.padding = "18px";
    box.style.color = "#2f1b00";
    box.style.fontFamily = "Verdana, Arial, sans-serif";
    box.style.fontSize = "13px";

    const title = document.createElement("div");
    title.textContent = "Premium Exchange Alert";
    title.style.fontSize = "18px";
    title.style.fontWeight = "bold";
    title.style.marginBottom = "14px";

    const desc = document.createElement("div");
    desc.textContent = "Choose how the alert should work.";
    desc.style.marginBottom = "16px";

    const directionLabel = document.createElement("div");
    directionLabel.textContent = "1. Alert direction";
    directionLabel.style.fontWeight = "bold";
    directionLabel.style.marginBottom = "6px";

    const directionHelp = document.createElement("div");
    directionHelp.textContent = "Increase = alert when value goes up. Decrease = alert when value goes down.";
    directionHelp.style.marginBottom = "8px";

    const directionWrap = document.createElement("div");

    const typeLabel = document.createElement("div");
    typeLabel.textContent = "2. Alert type";
    typeLabel.style.fontWeight = "bold";
    typeLabel.style.marginTop = "8px";
    typeLabel.style.marginBottom = "6px";

    const typeHelp = document.createElement("div");
    typeHelp.textContent = "Single = one alert per update if threshold is reached. Step = one alert for every full threshold step passed.";
    typeHelp.style.marginBottom = "8px";

    const typeWrap = document.createElement("div");

    const thresholdLabel = document.createElement("div");
    thresholdLabel.textContent = "3. Threshold";
    thresholdLabel.style.fontWeight = "bold";
    thresholdLabel.style.marginTop = "8px";
    thresholdLabel.style.marginBottom = "6px";

    const thresholdHelp = document.createElement("div");
    thresholdHelp.textContent = "Example: 500 means the alert reacts when the value changes by at least 500.";
    thresholdHelp.style.marginBottom = "8px";

    const thresholdInput = document.createElement("input");
    thresholdInput.type = "number";
    thresholdInput.min = "1";
    thresholdInput.value = String(threshold);
    thresholdInput.style.width = "120px";
    thresholdInput.style.padding = "6px 8px";
    thresholdInput.style.border = "1px solid #7d510f";
    thresholdInput.style.borderRadius = "4px";
    thresholdInput.style.background = "#fffaf0";

    const footer = document.createElement("div");
    footer.style.marginTop = "18px";
    footer.style.display = "flex";
    footer.style.justifyContent = "flex-end";
    footer.style.gap = "10px";

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.type = "button";
    cancelBtn.style.padding = "8px 14px";
    cancelBtn.style.border = "1px solid #7d510f";
    cancelBtn.style.background = "#e6d3a5";
    cancelBtn.style.cursor = "pointer";
    cancelBtn.style.borderRadius = "4px";
    cancelBtn.addEventListener("click", () => {
      overlay.remove();
      window.ppAlertLoaded = false;
      console.log("Premium Exchange Alert cancelled");
    });

    const startBtn = document.createElement("button");
    startBtn.textContent = "Start alert";
    startBtn.type = "button";
    startBtn.style.padding = "8px 14px";
    startBtn.style.border = "1px solid #7d510f";
    startBtn.style.background = "#cfa95e";
    startBtn.style.fontWeight = "bold";
    startBtn.style.cursor = "pointer";
    startBtn.style.borderRadius = "4px";
    startBtn.addEventListener("click", () => {
      const parsedThreshold = parseInt(thresholdInput.value, 10);

      if (isNaN(parsedThreshold) || parsedThreshold <= 0) {
        alert("Please enter a threshold greater than 0.");
        return;
      }

      threshold = parsedThreshold;
      overlay.remove();
      initValues();
      startObservers();
    });

    function refreshDirectionButtons() {
      directionWrap.innerHTML = "";
      directionWrap.appendChild(createButton("Increase", alertDirection === "increase", () => {
        alertDirection = "increase";
        refreshDirectionButtons();
      }));
      directionWrap.appendChild(createButton("Decrease", alertDirection === "decrease", () => {
        alertDirection = "decrease";
        refreshDirectionButtons();
      }));
    }

    function refreshTypeButtons() {
      typeWrap.innerHTML = "";
      typeWrap.appendChild(createButton("Single", alertType === "single", () => {
        alertType = "single";
        refreshTypeButtons();
      }));
      typeWrap.appendChild(createButton("Step", alertType === "step", () => {
        alertType = "step";
        refreshTypeButtons();
      }));
    }

    refreshDirectionButtons();
    refreshTypeButtons();

    footer.appendChild(cancelBtn);
    footer.appendChild(startBtn);

    box.appendChild(title);
    box.appendChild(desc);
    box.appendChild(directionLabel);
    box.appendChild(directionHelp);
    box.appendChild(directionWrap);
    box.appendChild(typeLabel);
    box.appendChild(typeHelp);
    box.appendChild(typeWrap);
    box.appendChild(thresholdLabel);
    box.appendChild(thresholdHelp);
    box.appendChild(thresholdInput);
    box.appendChild(footer);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  renderDialog();
})();
