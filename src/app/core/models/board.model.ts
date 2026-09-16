export const DEFAULT_BOARD_ID = 'default-board';

export type BoardColor = 'violet' | 'blue' | 'green' | 'orange' | 'pink' | 'yellow';

export interface BoardModel {
  id: string;
  name: string;
  description: string;
  color: BoardColor;
  designId: string;
  favorite: boolean;
  createdAt: Date;
  updatedAt: Date;
}
