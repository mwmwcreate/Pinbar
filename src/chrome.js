"use strict";

const elements = {
  back: document.querySelector("#back"),
  forward: document.querySelector("#forward"),
  reload: document.querySelector("#reload"),
  addressToggle: document.querySelector("#address-toggle"),
  pin: document.querySelector("#pin"),
  detach: document.querySelector("#detach"),
  browser: document.querySelector("#browser"),
  close: document.querySelector("#close"),
  title: document.querySelector("#site-title"),
  addressForm: document.querySelector("#address-form"),
  address: document.querySelector("#address"),
};

function action(name, payload) {
  return window.pinbarChrome.action(name, payload);
}

elements.back.addEventListener("click", () => action("back"));
elements.forward.addEventListener("click", () => action("forward"));
elements.reload.addEventListener("click", (event) =>
  action(event.shiftKey ? "force-reload" : "reload"),
);
elements.addressToggle.addEventListener("click", () => action("address-toggle"));
elements.pin.addEventListener("click", () => action("pin-toggle"));
elements.detach.addEventListener("click", () => action("detach-toggle"));
elements.browser.addEventListener("click", () => action("open-browser"));
elements.close.addEventListener("click", () => action("close"));
elements.addressForm.addEventListener("submit", (event) => {
  event.preventDefault();
  action("navigate", elements.address.value);
});

window.pinbarChrome.onState((state) => {
  elements.title.textContent = state.name || "Website";
  if (document.activeElement !== elements.address) elements.address.value = state.url || "";
  elements.back.disabled = !state.canGoBack;
  elements.forward.disabled = !state.canGoForward;
  elements.pin.classList.toggle("active", state.pinned);
  elements.detach.classList.toggle("active", state.detached);
  elements.addressToggle.classList.toggle("active", state.showAddressBar);
  document.body.classList.toggle("show-address", state.showAddressBar);
  document.body.classList.toggle("detached", state.detached);
  elements.pin.title = state.pinned ? "ピン留めを解除" : "ピン留め";
  elements.detach.title = state.detached ? "メニューバーへ戻す" : "ウィンドウを切り離す";
});

window.pinbarChrome.onFocusAddress(() => {
  elements.address.focus();
  elements.address.select();
});
