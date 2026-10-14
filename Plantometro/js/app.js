import {startCamera,chooseAnalysisPhoto,analyzeCameraImage,captureAndAnalyze,setupCamera} from "./camera.js";
import { renderSettingsUI, setTheme, saveSettings, toggleSummer, continueNickname } from "./settings.js";
import { startFirebase, showGate, doSignIn, doSignOut, hasPendingWrites } from "./sync.js";
import { searchCity, useGPS, loadWeather, refreshWeather, setupWeather } from "./weather.js";
import { openForm, savePlant, chooseFormPhoto, updateReminderUnit, pickPhoto, setLight, exportDownload, importData, invalidateForm } from "./plants.js";
import { aiPhotoPicked, identifyPlant } from "./gemini.js";
import { galleryPicked } from "./photos.js";
import { openModal, closeModal, render, toggleSearch, closeSearch, setupLayout } from "./ui.js";
import { $ } from "./utils.js";
import {startPWA} from './pwa.js';
import {openActivity,markActivityRead} from './activity.js';
import {dismissWeatherSignal} from './weather-effects.js';

// Location search results are bound in weather.js, rather than inline handlers.
const actions = { startCamera,chooseAnalysisPhoto,analyzeCameraImage,captureAndAnalyze, openActivity, markActivityRead, dismissWeatherSignal, refreshWeather, openModal, closeModal, openForm, chooseFormPhoto, setLight, setTheme, saveSettings, searchCity, useGPS, loadWeather, doSignIn, doSignOut, exportDownload, toggleSearch, closeSearch, toggleSummer, identifyPlant };
document.querySelectorAll("[data-action]").forEach(button=>button.addEventListener("click",()=>{
  actions[button.dataset.action]?.(button.dataset.arg);
}));
$("nickname-form").addEventListener("submit",continueNickname);
$("plant-form").addEventListener("submit",savePlant);
$("f-photo").addEventListener("change",pickPhoto);
$("f-freq").addEventListener("input",updateReminderUnit);
$("backup-file").addEventListener("change",importData);
$("q").addEventListener("input",render);
$("f-name").addEventListener("input",invalidateForm);
$("ai-file").addEventListener("change",aiPhotoPicked);
$("g-file").addEventListener("change",galleryPicked);
document.querySelectorAll(".modal").forEach(m=>m.addEventListener("click",e=>{if(e.target===m) closeModal(m.id);}));
document.addEventListener("keydown",e=>{if(e.key==="Escape"){const modals=[...document.querySelectorAll(".modal.open")];if(modals.length) closeModal(modals.at(-1).id);}});
startPWA(hasPendingWrites);

setupCamera(); setupLayout(); renderSettingsUI(); render(); setupWeather();loadWeather();
try { startFirebase(); } catch(e){ showGate("login"); $("gate-error").textContent="Error al iniciar Firebase. Recarga la página."; }
