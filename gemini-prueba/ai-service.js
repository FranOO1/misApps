// Explicit consent, one fixed fictional payload; normal assistant remains paused.
import {createDiagnosticService} from '../controlHoras/ai-service.js?diagnostico=4';
export {errorMessage,classify,diagnosticQuestion} from '../controlHoras/ai-service.js?diagnostico=4';
export const {query,invalidate}=createDiagnosticService();
