(function () {
  const old = document.getElementById("tw-keyboard-btn");
  if (old) old.remove();

  const input = document.createElement("input");
  input.type = "text";
  input.style.cssText =
    "position:fixed;top:0;left:0;width:1px;height:1px;font-size:16px;opacity:0.01;z-index:999998;";
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
