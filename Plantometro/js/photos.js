import { $, esc, todayStr, fmt } from "./utils.js";
import { whoAmI } from "./settings.js";
import { plants, patchPlant, arrayUnion, arrayRemove, sessionToken } from "./sync.js";
import { trimPlant } from "./plants.js";
import { toast, openModal, closeModal } from "./ui.js";

/* ============ Diario fotográfico ============ */
function renderGallery(p){
  const g = p.gallery || [];
  $("d-gal").innerHTML = g.map((e,i)=>`<button class="gph" data-g="${i}" aria-label="Foto del ${esc(fmt(e.date))}"><img src="${esc(e.img)}" alt=""><span class="gd">${fmt(e.date)}</span></button>`).join("")
    + `<button class="gadd" data-gadd="1" title="Añadir foto al diario" aria-label="Añadir foto al diario">+<span>Foto</span></button>`;
  $("d-gal").querySelectorAll("[data-g]").forEach(b=>b.onclick=()=>openDiaryPhoto(p.id, +b.dataset.g));
  $("d-gal").querySelector("[data-gadd]").onclick = ()=>galleryAdd(p.id);
}
function openDiaryPhoto(id, i){
  const p = plants.find(x=>x.id===id); const e = p?.gallery?.[i]; if(!e) return;
  $("pm-date").textContent = "Foto del " + fmt(e.date);
  $("pm-img").src = e.img;
  $("pm-note").textContent = e.note || "";
  $("pm-del").onclick = async()=>{
    const session=sessionToken(),current=plants.find(x=>x.id===id);
    const index=current?.gallery?.findIndex(photo=>photo.img===e.img&&photo.date===e.date&&(photo.note||'')===(e.note||''));
    if(index==null||index<0){toast('Esta foto ya no está en el diario.');return;}
    const updated={...current,gallery:current.gallery.filter((_,n)=>n!==index),updatedAt:new Date().toISOString(),updatedBy:whoAmI()};
    if(await patchPlant(updated,{gallery:arrayRemove(e)},'photoRemoved') && session===sessionToken()){
      closeModal('photo-modal');const saved=plants.find(x=>x.id===id);if(saved)renderGallery(saved);toast('Foto quitada del diario.');
    }
  };
  openModal("photo-modal");
}
function shrinkImage(file, max, q){
  return new Promise((res, rej)=>{
    const img = new Image();
    img.onload = ()=>{
      const sc = Math.min(1, max/Math.max(img.width, img.height));
      const cv = document.createElement("canvas");
      cv.width = Math.round(img.width*sc); cv.height = Math.round(img.height*sc);
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(img.src);
      res(cv.toDataURL("image/jpeg", q));
    };
    img.onerror = ()=>{URL.revokeObjectURL(img.src);rej(new Error("No se pudo leer la imagen"));};
    img.src = URL.createObjectURL(file);
  });
}
function pushDiary(p,dataUrl,note){
  const id=crypto.randomUUID(),at=new Date().toISOString(),entry={id,date:todayStr(),at,by:whoAmI(),img:dataUrl,note:(note||'').slice(0,140)};
  const updated={...p,gallery:[entry,...(p.gallery||[])],updatedAt:at,updatedBy:whoAmI()};
  return patchPlant(trimPlant(updated),{gallery:arrayUnion(entry)},'photoAdded',{},id);
}
let galAddPlantId = null;
function galleryAdd(id){ galAddPlantId = id; $("g-file").value=""; $("g-file").click(); }
async function galleryPicked(e){
  const file = e.target.files[0]; if(!file) return;
  const p = plants.find(x=>x.id===galAddPlantId); if(!p) return;
  const session=sessionToken();
  try{
    const small = await shrinkImage(file, 480, .6);
    if(session!==sessionToken() || !plants.some(x=>x.id===p.id))return;
    if(await pushDiary(plants.find(x=>x.id===p.id), small, "")){const saved=plants.find(x=>x.id===p.id);if(saved)renderGallery(saved);toast("Foto añadida al diario.");}
  }catch(err){ toast("No se pudo leer la imagen ❌"); }
}

export { renderGallery, openDiaryPhoto, shrinkImage, pushDiary, galleryAdd, galleryPicked };
