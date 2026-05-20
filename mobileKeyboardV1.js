(function () {
  const old = document.getElementById("naith-keyboard-trigger");
  if (old) old.remove();

  const input = document.createElement("input");
  input.id = "naith-keyboard-trigger";
  input.type = "text";
  input.autocapitalize = "off";
  input.autocomplete = "off";
  input.autocorrect = "off";
  input.spellcheck = false;

  input.style.cssText =
    "position:fixed;top:10px;left:10px;width:1px;height:1px;font-size:16px;opacity:0.01;z-index:999999;";

  document.body.appendChild(input);

  setTimeout(function () {
    input.focus();
    input.click();
  }, 50);
})();
