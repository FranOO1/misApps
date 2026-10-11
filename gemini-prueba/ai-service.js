// Explicit consent, one fixed fictional payload; normal assistant remains paused.
import {createDiagnosticService} from '../controlHoras/ai-service.js';
export {errorMessage,classify,diagnosticQuestion} from '../controlHoras/ai-service.js';
export const {query,invalidate}=createDiagnosticService();
