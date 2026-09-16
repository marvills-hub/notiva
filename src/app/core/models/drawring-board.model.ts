import { DrawingSticker } from './drawing-sticker.model';
import { DrawingSnip } from './drawing-snip.model';
export type DrawingBoardType =
  'whiteboard' | 'blackboard' | 'green-chalkboard' | 'graph-board' | 'notebook' | 'blueprint';
export type DrawingToolType = 'marker' | 'chalk' | 'pen' | 'technical-pen';
export type DrawingStrokeCap = 'round' | 'square';
export interface DrawingPoint {
  x: number;
  y: number;
  pressure: number;
}
export interface DrawingStroke {
  id: string;
  tool: DrawingToolType;
  color: string;
  size: number;
  opacity: number;
  cap: DrawingStrokeCap;
  points: DrawingPoint[];
  createdAt: number;
}
export interface DrawingToolColor {
  id: string;
  name: string;
  value: string;
}
export interface DrawingBoardTool {
  type: DrawingToolType;
  name: string;
  icon: string;
  colors: DrawingToolColor[];
  sizes: number[];
  defaultColor: string;
  defaultSize: number;
  opacity: number;
  cap: DrawingStrokeCap;
}
export interface DrawingBoardDefinition {
  type: DrawingBoardType;
  name: string;
  description: string;
  icon: string;
  background: string;
  surfaceClass: string;
  tool: DrawingBoardTool;
}
export interface DrawingBoardModel {
  id: string;
  boardId: string;
  name: string;
  type: DrawingBoardType;
  strokes: DrawingStroke[];
  stickers: DrawingSticker[];
  snips: DrawingSnip[];
  width: number;
  height: number;
  createdAt: Date;
  updatedAt: Date;
}
