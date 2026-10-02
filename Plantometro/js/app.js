import { renderSettingsUI, setTheme, saveSettings, toggleSummer, enableNotifs } from "./settings.js";
import { startFirebase, showGate, doSignIn, doSignOut } from "./sync.js";
import { searchCity, useGPS, loadWeather } from "./weather.js";
import { openForm, savePlant, pickPhoto, setLight, exportDownload, importData, invalidateForm } from "./plants.js";
import { aiPhotoPicked, identifyPlant } from "./gemini.js";
import { galleryPicked } from "./photos.js";
import { openModal, closeModal, render, toggleSearch, closeSearch } from "./ui.js";
import { $ } from "./utils.js";

// Location search results are bound in weather.js, rather than inline handlers.
const actions = { openModal, closeModal, openForm, setLight, setTheme, saveSettings, searchCity, useGPS, loadWeather, doSignIn, doSignOut, exportDownload, toggleSearch, closeSearch, toggleSummer, enableNotifs, identifyPlant };
document.querySelectorAll("[data-action]").forEach(button=>button.addEventListener("click",()=>{
  actions[button.dataset.action]?.(button.dataset.arg);
}));
$("plant-form").addEventListener("submit",savePlant);
$("f-photo").addEventListener("change",pickPhoto);
$("backup-file").addEventListener("change",importData);
$("q").addEventListener("input",render);
$("f-name").addEventListener("input",invalidateForm);
$("ai-file").addEventListener("change",aiPhotoPicked);
$("g-file").addEventListener("change",galleryPicked);
document.querySelectorAll(".modal").forEach(m=>m.addEventListener("click",e=>{if(e.target===m) closeModal(m.id);}));
document.addEventListener("keydown",e=>{if(e.key==="Escape"){const modals=[...document.querySelectorAll(".modal.open")];if(modals.length) closeModal(modals.at(-1).id);}});
if("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{});

renderSettingsUI(); render(); loadWeather();
try { startFirebase(); } catch(e){ showGate("login"); $("gate-error").textContent="Error al iniciar Firebase. Recarga la página."; }
