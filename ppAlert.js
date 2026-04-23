const ids = [
  "premium_exchange_stock_wood",
  "premium_exchange_stock_stone",
  "premium_exchange_stock_iron"
];

const audio = new Audio("https://www.soundjay.com/buttons/sounds/button-3.mp3");
const previousValues = {};

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
    audio.play();
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
