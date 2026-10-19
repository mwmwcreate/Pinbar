"use strict";

// サイトが通知を出したことを本体に伝えるための合図。
// Electron には Web の通知を本体側で受け取るイベントが無いので、
// ページの通知 API を包んで、この文字列を console に出してもらう。
const NOTIFICATION_SIGNAL = "[pinbar:notification]";

// ページの main world で実行する。何度実行しても二重に包まない。
// ページ自身もこの合図を出せるが、影響はそのサイトのアイコンに丸が付くことだけ。
const NOTIFICATION_HOOK_SCRIPT = `(() => {
  const signal = () => console.debug(${JSON.stringify(NOTIFICATION_SIGNAL)});
  const Original = window.Notification;
  if (typeof Original === "function" && !Original.__pinbarHooked) {
    class PinbarNotification extends Original {
      constructor(...args) {
        super(...args);
        signal();
      }
    }
    Object.defineProperty(PinbarNotification, "__pinbarHooked", { value: true });
    Object.defineProperty(PinbarNotification, "name", { value: "Notification" });
    window.Notification = PinbarNotification;
  }
  const registration = window.ServiceWorkerRegistration && window.ServiceWorkerRegistration.prototype;
  if (
    registration &&
    typeof registration.showNotification === "function" &&
    !registration.showNotification.__pinbarHooked
  ) {
    const originalShow = registration.showNotification;
    const hooked = function showNotification(...args) {
      const result = originalShow.apply(this, args);
      Promise.resolve(result).then(signal, () => {});
      return result;
    };
    Object.defineProperty(hooked, "__pinbarHooked", { value: true });
    registration.showNotification = hooked;
  }
})();`;

module.exports = { NOTIFICATION_HOOK_SCRIPT, NOTIFICATION_SIGNAL };
