import {$} from './utils.js';
import {openModal,closeModal,toast} from './ui.js';
import {shrinkImage} from './photos.js';
let stream=null,cameraEpoch=0,cameraCallback=null,cameraImage=null;
function stopCamera(){cameraEpoch++;stream?.getTracks().forEach(t=>t.stop());stream=null;const video=$('camera-video');if(video)video.srcObject=null;const capture=$('camera-capture');if(capture)capture.hidden=true;}
function cancelCamera(){stopCamera();cameraImage=null;cameraCallback=null;}
function openCameraPhoto(callback){
  cancelCamera();cameraCallback=callback;$('camera-status').textContent='Elige una foto o abre la cámara. Se analizará una sola imagen.';
  $('camera-video').hidden=true;$('camera-image').hidden=true;$('camera-capture').hidden=true;$('camera-analyze').hidden=true;
  openModal('camera-modal');
}
async function startCamera(){
  stopCamera();const epoch=cameraEpoch;
  if(!navigator.mediaDevices?.getUserMedia){$('camera-status').textContent='Esta cámara no está disponible. Puedes elegir una foto del teléfono.';return;}
  try{
    const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
    if(epoch!==cameraEpoch||!$('camera-modal').classList.contains('open')){media.getTracks().forEach(t=>t.stop());return;}
    stream=media;cameraImage=null;$('camera-image').hidden=true;$('camera-analyze').hidden=true;
    const video=$('camera-video');video.hidden=false;video.srcObject=media;await video.play();
    if(epoch!==cameraEpoch)return;
    $('camera-capture').hidden=false;$('camera-status').textContent='Encuadra la planta con buena luz. Solo se enviará la captura al analizar.';
  }catch(error){stopCamera();$('camera-video').hidden=true;$('camera-status').textContent=error.name==='NotAllowedError'?'No has dado permiso para la cámara. Puedes elegir una foto.':'No se pudo abrir la cámara. Puedes elegir una foto.';}
}
function chooseAnalysisPhoto(){$('camera-file').value='';$('camera-file').click();}
async function analysisPhotoPicked(e){
  const file=e.target.files?.[0];if(!file)return;
  if(!/^image\/(jpeg|png|webp|gif|heic|heif)$/.test(file.type)||file.size>12*1024*1024){$('camera-status').textContent=file.size>12*1024*1024?'La foto es demasiado grande. Elige una de menos de 12 MB.':'No se pudo leer esa foto. Prueba con JPG, PNG o WebP.';return;}
  const epoch=cameraEpoch;
  try{const photo=await shrinkImage(file,768,.72);if(epoch!==cameraEpoch||!$('camera-modal').classList.contains('open'))return;
    stopCamera();cameraImage=photo;$('camera-image').src=photo;$('camera-image').hidden=false;$('camera-video').hidden=true;$('camera-capture').hidden=true;$('camera-analyze').hidden=false;$('camera-status').textContent='Revisa la foto antes de analizarla.';
  }catch{$('camera-status').textContent='No se pudo leer la foto. Prueba con otra imagen.';}
}
function analyzeCameraImage(){
  const callback=cameraCallback,photo=cameraImage;if(!photo||!callback)return;
  cancelCamera();closeModal('camera-modal');callback(photo);
}
function captureAndAnalyze(){
  const video=$('camera-video');if(!video.videoWidth||!stream){toast('Espera a que se vea la cámara.');return;}
  const canvas=document.createElement('canvas'),scale=Math.min(1,768/Math.max(video.videoWidth,video.videoHeight));
  canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);cameraImage=canvas.toDataURL('image/jpeg',.72);analyzeCameraImage();
}
function setupCamera(){
  $('camera-file').addEventListener('change',analysisPhotoPicked);
  new MutationObserver(()=>{if(!$('camera-modal').classList.contains('open'))cancelCamera();}).observe($('camera-modal'),{attributes:true,attributeFilter:['class']});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCamera();});
}
export {openCameraPhoto,startCamera,chooseAnalysisPhoto,analyzeCameraImage,captureAndAnalyze,setupCamera,cancelCamera};
