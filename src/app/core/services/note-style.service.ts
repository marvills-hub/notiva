import { Injectable } from '@angular/core';
import { NOTE_PINS } from '../constants/note-pins.constant';
import { DEFAULT_NOTE_STYLE_ID, NOTE_STYLES } from '../constants/note-styles.constant';
import { NotePinModel } from '../models/note-pin.model';
import { NoteStyleCategory, NoteStyleModel } from '../models/note-style.model';

const LEGACY_STYLE_MAP: Record<string, string> = {
  'classic-yellow': 'classic-yellow',
  'soft-pink': 'pink-sticky',
  'sky-blue': 'blue-sticky',
  'mint-green': 'green-sticky',
  lavender: 'purple-curled-letter',
  peach: 'peach-brush',
  'cream-paper': 'clean-paper',
  'white-clean': 'clean-paper',
  blackboard: 'dark-note',
  'kraft-paper': 'kraft-paper',
  'lined-notebook': 'blue-notebook-rip',
  'grid-paper': 'blueprint-paper',
  'dotted-paper': 'yellow-comic',
  'torn-edge': 'ivory-rip',
  'torn-paper': 'ivory-rip',
  'spiral-note': 'pink-spiral-sheet',
  'spiral-sheet': 'pink-spiral-sheet',
  'legal-pad': 'blue-notebook-rip',
  'sticky-tape': 'classic-yellow',
  polaroid: 'polaroid-note',
  'film-strip': 'polaroid-note',
  'vintage-letter': 'ancient-letter',
  'curled-letter': 'purple-curled-letter',
  watercolor: 'lavender-watercolor',
  'watercolor-mint': 'aqua-paint-splash',
  sakura: 'rose-flower',
  'cherry-blossom': 'rose-flower',
  leaves: 'olive-leaf',
  'green-leaf': 'olive-leaf',
  clouds: 'sky-cloud',
  'cloud-dream': 'sky-cloud',
  'night-sky': 'midnight-stars',
  galaxy: 'midnight-stars',
  sunset: 'peach-brush',
  'sunset-brush': 'peach-brush',
  ocean: 'teal-wave',
  'ocean-wave': 'teal-wave',
  mountains: 'slate-mountain',
  'mountain-paper': 'slate-mountain',
  forest: 'olive-leaf',
  'forest-paper': 'olive-leaf',
  'coffee-stain': 'ancient-letter',
  newspaper: 'cream-receipt',
  'newspaper-clipping': 'cream-receipt',
  blueprint: 'blueprint-paper',
  'cyberpunk-note': 'neon-cyber',
  'neon-glow': 'neon-cyber',
  holographic: 'cyan-crystal',
  'crystal-note': 'cyan-crystal',
  'glass-note': 'cyan-crystal',
  gradient: 'lavender-watercolor',
  'minimal-dark': 'dark-note',
  terminal: 'neon-cyber',
  'retro-tv': 'blue-pixel',
  comic: 'yellow-comic',
  'comic-note': 'yellow-comic',
  'speech-bubble': 'yellow-comic',
  heart: 'pink-heart',
  'heart-note': 'pink-heart',
  star: 'gold-star',
  'star-note': 'gold-star',
  circle: 'classic-yellow',
  hexagon: 'blueprint-paper',
  'cloud-shape': 'sky-cloud',
  'cat-theme': 'cream-kitten',
  'cat-note': 'cream-kitten',
  'dog-theme': 'caramel-puppy',
  'dog-note': 'caramel-puppy',
  'bunny-note': 'blush-bunny',
  'panda-note': 'panda-note',
  'frog-note': 'lime-frog',
  'fox-note': 'ember-fox',
  'cake-note': 'berry-cake',
  'bubble-tea-note': 'milk-tea',
  'donut-note': 'raspberry-donut',
  'cookie-note': 'oat-cookie',
  'magic-scroll': 'burnt-scroll',
  'spellbook-note': 'burgundy-spellbook',
  'fairy-note': 'fairy-paper',
  'enchanted-note': 'fairy-paper',
  'dragon-scale-note': 'burgundy-spellbook',
  'steampunk-note': 'bronze-steampunk',
  'pixel-note': 'blue-pixel',
  'paint-splash-blue': 'aqua-paint-splash',
  'postage-note': 'mint-postage',
  'ripped-notebook': 'blue-notebook-rip',
};

@Injectable({
  providedIn: 'root',
})
export class NoteStyleService {
  readonly styles = NOTE_STYLES;
  readonly pins = NOTE_PINS;

  resolveStyleId(id?: string | null): string {
    if (!id) {
      return DEFAULT_NOTE_STYLE_ID;
    }

    if (this.styles.some((style) => style.id === id)) {
      return id;
    }

    const migratedId = LEGACY_STYLE_MAP[id];

    if (migratedId && this.styles.some((style) => style.id === migratedId)) {
      return migratedId;
    }

    return DEFAULT_NOTE_STYLE_ID;
  }

  getStyle(id?: string | null): NoteStyleModel {
    const resolvedId = this.resolveStyleId(id);

    return this.styles.find((style) => style.id === resolvedId) || this.styles[0];
  }

  getPin(id?: string | null): NotePinModel {
    return this.pins.find((pin) => pin.id === id) || this.pins[0];
  }

  getStylesByCategory(category: NoteStyleCategory | 'all'): NoteStyleModel[] {
    if (category === 'all') {
      return this.styles;
    }

    return this.styles.filter((style) => style.category === category);
  }
}
