import { BoardDesignModel } from '../models/board-design.model';

export const DEFAULT_BOARD_DESIGN_ID = 'classic-cork';

export const BOARD_DESIGNS: BoardDesignModel[] = [
  {
    id: 'classic-cork',
    name: 'Classic Cork',
    category: 'cork',
    background: `
      radial-gradient(circle at 20% 25%, rgba(105,65,34,.18) 0 1px, transparent 2px),
      radial-gradient(circle at 78% 68%, rgba(88,54,28,.16) 0 1px, transparent 2px),
      radial-gradient(circle at 48% 45%, rgba(255,235,195,.12) 0 1px, transparent 2px),
      linear-gradient(145deg,#b88755,#93663d)
    `,
    backgroundSize: '17px 17px,23px 23px,29px 29px,auto',
    backgroundPosition: '0 0,6px 9px,12px 4px,center',
    overlay: 'rgba(55,32,16,.06)',
    vignette: 'rgba(24,14,8,.28)',
    accentColor: '#bd8a5b',
  },
  {
    id: 'dark-cork',
    name: 'Dark Cork',
    category: 'cork',
    background: `
      radial-gradient(circle at 18% 32%, rgba(210,165,115,.06) 0 1px, transparent 2px),
      radial-gradient(circle at 72% 62%, rgba(255,220,170,.05) 0 1px, transparent 2px),
      linear-gradient(145deg,#6f4c31,#49311f)
    `,
    backgroundSize: '18px 18px,27px 27px,auto',
    backgroundPosition: '0 0,9px 6px,center',
    overlay: 'rgba(0,0,0,.08)',
    vignette: 'rgba(0,0,0,.42)',
    accentColor: '#926945',
  },
  {
    id: 'walnut-wood',
    name: 'Walnut Wood',
    category: 'wood',
    background: `
      repeating-linear-gradient(
        3deg,
        rgba(255,255,255,.025) 0 2px,
        transparent 2px 18px
      ),
      repeating-linear-gradient(
        92deg,
        rgba(45,24,13,.18) 0 1px,
        transparent 1px 42px
      ),
      linear-gradient(120deg,#62432f,#38251d)
    `,
    backgroundSize: 'auto,auto,auto',
    backgroundPosition: 'center',
    overlay: 'rgba(30,16,10,.08)',
    vignette: 'rgba(10,6,4,.32)',
    accentColor: '#80604a',
  },
  {
    id: 'light-oak',
    name: 'Light Oak',
    category: 'wood',
    background: `
      repeating-linear-gradient(
        1deg,
        rgba(104,74,43,.07) 0 1px,
        transparent 1px 24px
      ),
      repeating-linear-gradient(
        90deg,
        rgba(120,85,50,.06) 0 1px,
        transparent 1px 54px
      ),
      linear-gradient(145deg,#c6a47b,#ab845d)
    `,
    backgroundSize: 'auto,auto,auto',
    backgroundPosition: 'center',
    overlay: 'rgba(255,245,225,.03)',
    vignette: 'rgba(74,48,27,.18)',
    accentColor: '#b88d62',
  },
  {
    id: 'warm-linen',
    name: 'Warm Linen',
    category: 'fabric',
    background: `
      repeating-linear-gradient(
        0deg,
        rgba(85,72,58,.06) 0 1px,
        transparent 1px 5px
      ),
      repeating-linear-gradient(
        90deg,
        rgba(85,72,58,.05) 0 1px,
        transparent 1px 5px
      ),
      linear-gradient(145deg,#b9aa94,#978875)
    `,
    backgroundSize: 'auto,auto,auto',
    backgroundPosition: 'center',
    overlay: 'rgba(255,255,255,.025)',
    vignette: 'rgba(45,37,30,.22)',
    accentColor: '#b3a08a',
  },
  {
    id: 'forest-felt',
    name: 'Forest Felt',
    category: 'fabric',
    background: `
      radial-gradient(circle at 30% 20%, rgba(255,255,255,.025) 0 1px, transparent 1.5px),
      radial-gradient(circle at 70% 75%, rgba(0,0,0,.05) 0 1px, transparent 1.5px),
      linear-gradient(145deg,#455e51,#2f443a)
    `,
    backgroundSize: '8px 8px,11px 11px,auto',
    backgroundPosition: '0 0,4px 3px,center',
    overlay: 'rgba(10,30,20,.05)',
    vignette: 'rgba(0,0,0,.25)',
    accentColor: '#668274',
  },
  {
    id: 'charcoal-felt',
    name: 'Charcoal Felt',
    category: 'fabric',
    background: `
      radial-gradient(circle at 20% 20%, rgba(255,255,255,.025) 0 1px, transparent 1.5px),
      radial-gradient(circle at 75% 65%, rgba(0,0,0,.09) 0 1px, transparent 1.5px),
      linear-gradient(145deg,#353a40,#24282d)
    `,
    backgroundSize: '8px 8px,12px 12px,auto',
    backgroundPosition: '0 0,3px 5px,center',
    overlay: 'rgba(0,0,0,.05)',
    vignette: 'rgba(0,0,0,.34)',
    accentColor: '#5b6169',
  },
  {
    id: 'whiteboard',
    name: 'Whiteboard',
    category: 'board',
    background: `
      linear-gradient(
        rgba(98,116,130,.035) 1px,
        transparent 1px
      ),
      linear-gradient(
        90deg,
        rgba(98,116,130,.035) 1px,
        transparent 1px
      ),
      linear-gradient(145deg,#eef1ef,#dfe4e2)
    `,
    backgroundSize: '32px 32px,32px 32px,auto',
    backgroundPosition: 'center',
    overlay: 'rgba(255,255,255,.03)',
    vignette: 'rgba(80,90,90,.12)',
    accentColor: '#aeb8b5',
  },
  {
    id: 'chalkboard',
    name: 'Chalkboard',
    category: 'board',
    background: `
      radial-gradient(circle at 15% 25%, rgba(255,255,255,.025) 0 1px, transparent 2px),
      radial-gradient(circle at 75% 65%, rgba(255,255,255,.02) 0 1px, transparent 2px),
      linear-gradient(145deg,#263a37,#172724)
    `,
    backgroundSize: '19px 19px,31px 31px,auto',
    backgroundPosition: '0 0,8px 5px,center',
    overlay: 'rgba(255,255,255,.01)',
    vignette: 'rgba(0,0,0,.32)',
    accentColor: '#506d67',
  },
  {
    id: 'kraft-board',
    name: 'Kraft Board',
    category: 'paper',
    background: `
      radial-gradient(circle at 10% 20%, rgba(60,39,20,.1) 0 1px, transparent 2px),
      radial-gradient(circle at 75% 70%, rgba(255,255,255,.07) 0 1px, transparent 2px),
      repeating-linear-gradient(
        25deg,
        transparent 0 11px,
        rgba(70,42,20,.025) 12px 13px
      ),
      linear-gradient(145deg,#aa7d50,#8d633f)
    `,
    backgroundSize: '18px 18px,25px 25px,auto,auto',
    backgroundPosition: '0 0,7px 9px,center,center',
    overlay: 'rgba(55,32,16,.04)',
    vignette: 'rgba(40,22,12,.22)',
    accentColor: '#a4774e',
  },
  {
    id: 'blueprint-board',
    name: 'Blueprint',
    category: 'technical',
    background: `
      linear-gradient(
        rgba(190,225,245,.09) 1px,
        transparent 1px
      ),
      linear-gradient(
        90deg,
        rgba(190,225,245,.09) 1px,
        transparent 1px
      ),
      linear-gradient(
        rgba(190,225,245,.035) 1px,
        transparent 1px
      ),
      linear-gradient(
        90deg,
        rgba(190,225,245,.035) 1px,
        transparent 1px
      ),
      linear-gradient(145deg,#224d68,#17384e)
    `,
    backgroundSize: '40px 40px,40px 40px,10px 10px,10px 10px,auto',
    backgroundPosition: 'center',
    overlay: 'rgba(60,140,185,.03)',
    vignette: 'rgba(5,20,30,.3)',
    accentColor: '#4e829e',
  },
  {
    id: 'pegboard',
    name: 'Pegboard',
    category: 'industrial',
    background: `
      radial-gradient(
        circle,
        rgba(44,34,26,.7) 0 2px,
        transparent 2.5px
      ),
      linear-gradient(145deg,#b38b62,#96704d)
    `,
    backgroundSize: '28px 28px,auto',
    backgroundPosition: '14px 14px,center',
    overlay: 'rgba(255,255,255,.02)',
    vignette: 'rgba(55,32,20,.22)',
    accentColor: '#a87e58',
  },
  {
    id: 'artist-canvas',
    name: 'Artist Canvas',
    category: 'fabric',
    background: `
      repeating-linear-gradient(
        0deg,
        rgba(75,68,58,.055) 0 1px,
        transparent 1px 4px
      ),
      repeating-linear-gradient(
        90deg,
        rgba(75,68,58,.045) 0 1px,
        transparent 1px 4px
      ),
      linear-gradient(145deg,#c8c0ae,#aea594)
    `,
    backgroundSize: 'auto,auto,auto',
    backgroundPosition: 'center',
    overlay: 'rgba(255,255,255,.035)',
    vignette: 'rgba(70,60,45,.16)',
    accentColor: '#b7ae9c',
  },
  {
    id: 'concrete-wall',
    name: 'Concrete Wall',
    category: 'industrial',
    background: `
      radial-gradient(circle at 20% 20%, rgba(255,255,255,.025) 0 1px, transparent 2px),
      radial-gradient(circle at 70% 65%, rgba(0,0,0,.05) 0 1px, transparent 2px),
      linear-gradient(145deg,#656a6d,#505559)
    `,
    backgroundSize: '21px 21px,27px 27px,auto',
    backgroundPosition: '0 0,8px 5px,center',
    overlay: 'rgba(255,255,255,.015)',
    vignette: 'rgba(0,0,0,.28)',
    accentColor: '#777d80',
  },
];
