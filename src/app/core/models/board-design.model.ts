export type BoardDesignCategory =
  'cork' | 'wood' | 'fabric' | 'paper' | 'board' | 'industrial' | 'technical';

export interface BoardDesignModel {
  id: string;
  name: string;
  category: BoardDesignCategory;
  background: string;
  backgroundSize: string;
  backgroundPosition: string;
  overlay: string;
  vignette: string;
  accentColor: string;
}
