export interface DrawingSnip {
  id: string;
  imageData: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  zIndex: number;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}
export interface DrawingSnipSelection {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface DrawingSnipTransform {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}
