(function () {
  const oldBtn = document.getElementById("tw-keyboard-btn");
  if (oldBtn) oldBtn.remove();

  const oldInput = document.getElementById("tw-keyboard-input");
  if (oldInput) oldInput.remove();

  const input = document.createElement("input");
  input.id = "tw-keyboard-input";
  input.type = "text";
  input.autocapitalize = "off";
  input.autocomplete = "off";
  input.autocorrect = "off";
  input.spellcheck = false;

  input.style.cssText =
    "position:fixed;top:0;left:0;width:1px;height:1px;font-size:16px;opacity:0.01;z-index:999998;";

  input.addEventListener("keydown", function (e) {
    if (e.key === "Backspace") {
      e.preventDefault();

      const enterEvent = new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true
      });

      document.dispatchEvent(enterEvent);
    }
  });

  document.body.appendChild(input);

  const btn = document.createElement("button");
  btn.id = "tw-keyboard-btn";
  btn.textContent = "Open keyboard";
  btn.className = "btn";
  btn.style.cssText =
    "position:fixed;bottom:20px;right:20px;z-index:999999;";

  btn.addEventListener("click", function () {
    input.focus();
    input.click();
  });

  document.body.appendChild(btn);
})();
