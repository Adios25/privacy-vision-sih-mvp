export type RedactionBoxType = 'DOM' | 'OCR' | 'VISUAL' | 'MANUAL';

export interface BoundingBox {
  id: string; x: number; y: number; width: number; height: number;
  type: RedactionBoxType; category: string; label: string;
  active: boolean; isUserAdded: boolean;
}

export interface RedactionState {
  autoDetections: BoundingBox[];
  manualDetections: BoundingBox[];
  mergedActiveMasks: BoundingBox[];
}
