export type DrawingStickerType = 'emoji' | 'symbol' | 'sticker';
export type DrawingStickerCategory =
  | 'emoji'
  | 'reactions'
  | 'arrows'
  | 'symbols'
  | 'shapes'
  | 'stars'
  | 'hearts'
  | 'nature'
  | 'animals'
  | 'food'
  | 'work'
  | 'school'
  | 'tech'
  | 'travel'
  | 'weather'
  | 'labels'
  | 'pins'
  | 'tape'
  | 'doodles';
export interface DrawingStickerDefinition {
  id: string;
  type: DrawingStickerType;
  category: DrawingStickerCategory;
  name: string;
  value: string;
  keywords: string[];
  boardTypes?: string[];
  defaultWidth: number;
  defaultHeight: number;
}
export interface DrawingSticker {
  id: string;
  definitionId: string;
  type: DrawingStickerType;
  category: DrawingStickerCategory;
  name: string;
  value: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  createdAt: number;
  updatedAt: number;
}
export interface DrawingStickerTransform {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}
export interface DrawingStickerCategoryDefinition {
  id: DrawingStickerCategory | 'all';
  name: string;
  icon: string;
}
