(function () {
  "use strict";

  var textArea = document.getElementById("message");

  if (!textArea) {
    console.warn("zidSign.js: Could not find textarea with id 'message'.");
    return;
  }

  var color = "#a50000";
  var signature = "[i][b]ZID[/b][/i]";
  var currentText = textArea.value || "";

  if (currentText) {
    textArea.value =
      "[color=" + color + "]" +
      currentText +
      "\n\n" +
      signature +
      "[/color]";
  } else {
    textArea.value =
      "[color=" + color + "]\n\n" +
      signature +
      "[/color]";
  }

  textArea.focus();
})();
