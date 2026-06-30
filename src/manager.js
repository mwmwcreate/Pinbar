"use strict";

const form = document.querySelector("#add-form");
const urlInput = document.querySelector("#url");
const nameInput = document.querySelector("#name");
const sizePresetInput = document.querySelector("#default-size");
const userAgentInput = document.querySelector("#user-agent");
const customUserAgentInput = document.querySelector("#custom-user-agent");
const customUserAgentField = document.querySelector("#custom-ua-field");
const showAddressBarInput = document.querySelector("#show-address-bar");
const pinDefaultInput = document.querySelector("#pin-default");
const submitButton = document.querySelector("#submit-site");
const cancelEditButton = document.querySelector("#cancel-edit");
const errorElement = document.querySelector("#error");
const listElement = document.querySelector("#sites");
const emptyElement = document.querySelector("#empty");
const countElement = document.querySelector("#count");
const closeButton = document.querySelector("#close");
const appVersionElement = document.querySelector("#app-version");
const showAboutButton = document.querySelector("#show-about");
const aboutDialog = document.querySelector("#about-dialog");
const openPrivacyButton = document.querySelector("#open-privacy");
const openSupportButton = document.querySelector("#open-support");

let sizePresets = [];
let userAgentPresets = [];
let sitesCache = [];
let editingId = null;

function addOption(select, value, label, selected = false) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  option.selected = selected;
  select.append(option);
  return option;
}

function populateSettingsOptions() {
  sizePresetInput.replaceChildren();
  for (const preset of sizePresets) {
    addOption(
      sizePresetInput,
      preset.id,
      `${preset.label}（${preset.width} × ${preset.height}）`,
      preset.id === "standard",
    );
  }

  userAgentInput.replaceChildren();
  for (const preset of userAgentPresets) {
    addOption(
      userAgentInput,
      preset.id,
      preset.label,
      preset.id === "mac",
    );
  }
}

function updateCustomUserAgentVisibility() {
  customUserAgentField.hidden = userAgentInput.value !== "custom";
}

function resetEditor() {
  editingId = null;
  form.reset();
  sizePresetInput.querySelector("option[data-custom]")?.remove();
  sizePresetInput.value = "standard";
  userAgentInput.value = "mac";
  showAddressBarInput.checked = false;
  pinDefaultInput.checked = false;
  submitButton.textContent = "固定";
  cancelEditButton.hidden = true;
  errorElement.textContent = "";
  updateCustomUserAgentVisibility();
}

function beginEditing(site) {
  editingId = site.id;
  urlInput.value = site.url;
  nameInput.value = site.name;
  customUserAgentInput.value = site.customUserAgent || "";
  userAgentInput.value = site.userAgentPreset || "mac";
  showAddressBarInput.checked = Boolean(site.showAddressBar);
  pinDefaultInput.checked = Boolean(site.pinned);

  const currentPreset = sizePresets.find(
    (preset) =>
      preset.width === site.bounds?.width &&
      preset.height === site.bounds?.height,
  );
  sizePresetInput.querySelector("option[data-custom]")?.remove();
  if (currentPreset) {
    sizePresetInput.value = currentPreset.id;
  } else {
    const option = addOption(
      sizePresetInput,
      "",
      `現在のカスタムサイズ（${site.bounds?.width} × ${site.bounds?.height}）`,
      true,
    );
    option.dataset.custom = "true";
  }

  submitButton.textContent = "更新";
  cancelEditButton.hidden = false;
  errorElement.textContent = "";
  updateCustomUserAgentVisibility();
  urlInput.focus();
  urlInput.select();
}

function renderSites(sites) {
  sitesCache = sites;
  listElement.replaceChildren();
  emptyElement.hidden = sites.length > 0;
  countElement.textContent = String(sites.length);

  for (const site of sites) {
    const item = document.createElement("li");
    const details = document.createElement("div");
    const name = document.createElement("div");
    const url = document.createElement("div");
    const actions = document.createElement("div");
    const sizeSelect = document.createElement("select");
    const edit = document.createElement("button");
    const show = document.createElement("button");
    const remove = document.createElement("button");

    name.className = "site-name";
    name.textContent = site.name;
    url.className = "site-url";
    url.textContent = site.url;
    details.append(name, url);

    actions.className = "actions";
    sizeSelect.className = "size-select";
    sizeSelect.setAttribute("aria-label", `${site.name}のウィンドウサイズ`);
    const currentPreset = sizePresets.find(
      (preset) =>
        preset.width === site.bounds?.width &&
        preset.height === site.bounds?.height,
    );
    if (!currentPreset && site.bounds) {
      addOption(
        sizeSelect,
        "",
        `カスタム ${site.bounds.width}×${site.bounds.height}`,
        true,
      );
    }
    for (const preset of sizePresets) {
      addOption(
        sizeSelect,
        preset.id,
        `${preset.label} ${preset.width}×${preset.height}`,
        currentPreset?.id === preset.id,
      );
    }
    sizeSelect.addEventListener("change", async () => {
      if (!sizeSelect.value) return;
      sizeSelect.disabled = true;
      await window.pinbar.setSiteSize(site.id, sizeSelect.value);
      sizeSelect.disabled = false;
    });

    edit.type = "button";
    edit.textContent = "編集";
    edit.addEventListener("click", () => beginEditing(site));
    show.type = "button";
    show.textContent = "開く";
    show.addEventListener("click", () => window.pinbar.showSite(site.id));
    remove.type = "button";
    remove.className = "remove";
    remove.textContent = "削除";
    remove.addEventListener("click", async () => {
      if (!confirm(`「${site.name}」をメニューバーから削除しますか？\nログイン情報も消去されます。`)) return;
      if (editingId === site.id) resetEditor();
      await window.pinbar.removeSite(site.id);
    });
    actions.append(sizeSelect, edit, show, remove);
    item.append(details, actions);
    listElement.append(item);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorElement.textContent = "";
  submitButton.disabled = true;
  const payload = {
    id: editingId,
    url: urlInput.value,
    name: nameInput.value,
    sizePreset: sizePresetInput.value,
    userAgentPreset: userAgentInput.value,
    customUserAgent: customUserAgentInput.value,
    showAddressBar: showAddressBarInput.checked,
    pinned: pinDefaultInput.checked,
  };
  const result = editingId
    ? await window.pinbar.updateSite(payload)
    : await window.pinbar.addSite(payload);
  submitButton.disabled = false;

  if (!result.ok) {
    errorElement.textContent = result.error;
    urlInput.focus();
    return;
  }
  resetEditor();
  urlInput.focus();
});

cancelEditButton.addEventListener("click", () => {
  resetEditor();
  urlInput.focus();
});
userAgentInput.addEventListener("change", updateCustomUserAgentVisibility);
closeButton.addEventListener("click", () => window.pinbar.hideManager());
showAboutButton.addEventListener("click", () => aboutDialog.showModal());
aboutDialog.addEventListener("click", (event) => {
  if (event.target === aboutDialog) aboutDialog.close();
});
window.pinbar.onSitesChanged(renderSites);
window.pinbar.onShowAbout(() => aboutDialog.showModal());

Promise.all([
  window.pinbar.listSites(),
  window.pinbar.listWindowSizes(),
  window.pinbar.listUserAgents(),
  window.pinbar.getAppInfo(),
]).then(([sites, sizes, userAgents, appInfo]) => {
  sizePresets = sizes;
  userAgentPresets = userAgents;
  appVersionElement.textContent = `${appInfo.name} ${appInfo.version}`;
  openPrivacyButton.addEventListener("click", () =>
    window.pinbar.openAppLink(appInfo.privacyUrl),
  );
  openSupportButton.addEventListener("click", () =>
    window.pinbar.openAppLink(appInfo.supportUrl),
  );
  populateSettingsOptions();
  resetEditor();
  renderSites(sites);
});
