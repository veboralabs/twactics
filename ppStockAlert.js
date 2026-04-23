if (window.ppAlertLoaded) {
  console.log("ppAlert redan laddat");
} else {
  window.ppAlertLoaded = true;

  const ids = [
    "premium_exchange_stock_wood",
    "premium_exchange_stock_stone",
    "premium_exchange_stock_iron"
  ];

  const previousValues = {};
  const originalTitle = document.title;
  let blinkInterval = null;
  let audioCtx = null;

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
      console.log("Beep error:", err);
    }
  }

  function startTitleBlink() {
    if (blinkInterval) return;

    let toggle = false;
    blinkInterval = setInterval(() => {
      document.title = toggle ? "BUY RESOURCES" : originalTitle;
      toggle = !toggle;
    }, 1000);
  }

  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      previousValues[id] = parseInt(el.textContent.trim(), 10) || 0;
    }
  });

  function checkChange(id, el) {
    const newValue = parseInt(el.textContent.trim(), 10) || 0;
    const oldValue = previousValues[id] || 0;

    if (newValue > oldValue) {
      console.log(`${id} ökade: ${oldValue} → ${newValue}`);
      playBeep();
      startTitleBlink();
    }

    previousValues[id] = newValue;
  }

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

  console.log("Stock alert aktivt");
}
