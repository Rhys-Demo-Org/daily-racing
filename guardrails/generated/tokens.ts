// GENERATED from guardrails/design/tokens.json by guardrails/scripts/gen-tokens.ts. Do not edit.

export const tokens = {
  "name": "daily-ai-racer",
  "version": "1.0.0",
  "color": {
    "cream": "#F2E6C9",
    "dirt": "#C08A4F",
    "dark-dirt": "#8A5A32",
    "grass": "#6E8B3D",
    "deep-green": "#3F5A2A",
    "teal": "#3E8A8C",
    "rally-red": "#D64933",
    "mustard": "#E3A72F",
    "navy": "#24324A",
    "ink": "#1B1A1F"
  },
  "shadeLadder": {
    "cream": "dirt",
    "mustard": "dirt",
    "dirt": "dark-dirt",
    "rally-red": "dark-dirt",
    "grass": "deep-green",
    "teal": "deep-green",
    "dark-dirt": "ink",
    "navy": "ink",
    "deep-green": "ink",
    "ink": "ink"
  },
  "textPairs": {
    "anySize": [
      [
        "ink",
        "cream"
      ],
      [
        "ink",
        "mustard"
      ],
      [
        "ink",
        "dirt"
      ],
      [
        "cream",
        "navy"
      ],
      [
        "cream",
        "ink"
      ],
      [
        "cream",
        "deep-green"
      ],
      [
        "cream",
        "dark-dirt"
      ],
      [
        "mustard",
        "navy"
      ],
      [
        "mustard",
        "ink"
      ]
    ],
    "largeOnly24px800": [
      [
        "cream",
        "rally-red"
      ],
      [
        "cream",
        "teal"
      ],
      [
        "ink",
        "grass"
      ],
      [
        "ink",
        "teal"
      ],
      [
        "ink",
        "rally-red"
      ]
    ]
  },
  "role": {
    "primary": "rally-red",
    "player": "rally-red",
    "danger": "rally-red",
    "highlight": "mustard",
    "pickup": "mustard",
    "first": "mustard",
    "focus": "mustard",
    "pressed": "mustard",
    "positive": "grass",
    "info": "teal",
    "panelDark": "navy",
    "panelLight": "cream",
    "outline": "ink",
    "shadow": "ink",
    "disabled": "dark-dirt"
  },
  "font": {
    "display": {
      "family": "Barlow Condensed",
      "fallback": "'Arial Narrow', sans-serif",
      "weights": [
        800,
        900
      ],
      "italic": [
        900
      ]
    },
    "text": {
      "family": "Atkinson Hyperlegible",
      "fallback": "Verdana, sans-serif",
      "weights": [
        400,
        700
      ]
    },
    "numeric": "tabular-nums",
    "display_load": "block"
  },
  "typeScale": {
    "countdown": {
      "mobile": 160,
      "desktop": 280,
      "font": "display",
      "weight": 900,
      "italic": true
    },
    "display": {
      "mobile": 56,
      "desktop": 96,
      "font": "display",
      "weight": 900,
      "italic": true
    },
    "hud-xl": {
      "mobile": 44,
      "desktop": 64,
      "font": "display",
      "weight": 800
    },
    "title": {
      "mobile": 32,
      "desktop": 48,
      "font": "display",
      "weight": 900,
      "italic": true
    },
    "hud-l": {
      "mobile": 28,
      "desktop": 40,
      "font": "display",
      "weight": 800
    },
    "button": {
      "mobile": 22,
      "desktop": 28,
      "font": "display",
      "weight": 800
    },
    "label": {
      "mobile": 13,
      "desktop": 16,
      "font": "display",
      "weight": 800,
      "tracking": "0.12em",
      "case": "upper"
    },
    "body": {
      "mobile": 14,
      "desktop": 16,
      "font": "text",
      "weight": 400
    }
  },
  "space": {
    "s1": 4,
    "s2": 8,
    "s3": 12,
    "s4": 16,
    "s5": 24,
    "s6": 32,
    "s7": 48
  },
  "radius": {
    "none": 0,
    "rect": 4,
    "round": "50%"
  },
  "outline": {
    "small": 2,
    "default": 3,
    "large": 4,
    "smallBelowPx": 32,
    "largeAbovePx": 120
  },
  "shadow": {
    "hud": "3px 3px 0 #1B1A1F",
    "button": "4px 4px 0 #1B1A1F",
    "overlay": "6px 6px 0 #1B1A1F",
    "blur": 0
  },
  "focusRing": {
    "width": 4,
    "offset": 4,
    "color": "mustard"
  },
  "safeArea": {
    "frame": [
      844,
      390
    ],
    "left": 48,
    "right": 48,
    "top": 12,
    "bottom": 21
  },
  "centreClearZone": {
    "widthPct": 50,
    "heightPct": 60
  },
  "touch": {
    "minTarget": 48,
    "hitSlop": 12,
    "steerPad": [
      84,
      80
    ],
    "steerGap": 8,
    "gas": 100,
    "brake": 72,
    "action": 64,
    "restAfterMs": 4000
  },
  "motion": {
    "durationMs": {
      "press": 60,
      "release": 120,
      "stamp": 160,
      "slide": 200,
      "wipe": 250,
      "stagger": 40
    },
    "easing": {
      "snap": "cubic-bezier(.2,.9,.3,1)",
      "stamp": "cubic-bezier(.3,1.5,.5,1)",
      "sweep": "cubic-bezier(.6,0,.4,1)"
    },
    "press": {
      "sinkPx": "shadow-1",
      "shadowPx": 1
    },
    "hoverLiftPx": 1,
    "cardLiftPx": 2,
    "dropFromPx": 28,
    "dropScale": 1.25,
    "rowDealPx": 32,
    "bumpScale": 1.12,
    "animate": [
      "transform",
      "box-shadow",
      "clip-path",
      "visibility"
    ],
    "never": [
      "opacity",
      "filter",
      "color-tween"
    ],
    "reducedMotion": "keep press, cut rest"
  },
  "hatch": {
    "color": "ink",
    "lineWidth": 3,
    "pitch": 9,
    "angle": 45
  },
  "desktop": {
    "frame": [
      1440,
      900
    ],
    "scale": 1.45,
    "margin": 32,
    "outline": 4
  },
  "cars": {
    "player": {
      "body": "rally-red",
      "stripe": "cream"
    },
    "ai": [
      "mustard",
      "teal",
      "cream",
      "navy",
      "grass"
    ],
    "cabin": "navy",
    "cabinOnNavy": "teal",
    "wheels": "ink",
    "roundel": "cream"
  }
} as const;

/** Palette colour names. A mesh colour is an index into this array (0..9). */
export const PALETTE = ["cream","dirt","dark-dirt","grass","deep-green","teal","rally-red","mustard","navy","ink"] as const;

export type PaletteName = (typeof PALETTE)[number];

/** Hex value per palette index. */
export const PALETTE_HEX = ["#F2E6C9","#C08A4F","#8A5A32","#6E8B3D","#3F5A2A","#3E8A8C","#D64933","#E3A72F","#24324A","#1B1A1F"] as const;

/** For palette index i, the index one rung down the shade ladder. */
export const LADDER_INDEX = [1,2,9,4,9,4,2,1,9,9] as const;

/** Palette index for a colour name. */
export function paletteIndex(name: PaletteName): number {
  return PALETTE.indexOf(name);
}
