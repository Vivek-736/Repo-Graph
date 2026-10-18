import React from "react";

/**
 * Inline SVG Illustrations for Phase 12 Landing Page.
 * Rules from spec:
 * 1. Drawn, not captured (no screenshots).
 * 2. Unlabelled (no directory or file names).
 * 3. Colours strictly inherit canvas tokens (accent, incoming, outgoing, border, surface).
 * 4. Static (nothing animates).
 */

export function HeroIllustration() {
  return (
    <svg
      viewBox="0 0 540 360"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-auto max-w-[540px] select-none"
    >
      {/* Background container border */}
      <rect
        x="10"
        y="10"
        width="520"
        height="340"
        rx="8"
        stroke="var(--color-border)"
        strokeWidth="1.5"
        fill="var(--color-surface)"
      />

      {/* Grid dots */}
      <pattern id="hero-grid" width="20" height="20" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="1" fill="var(--color-border)" opacity="0.6" />
      </pattern>
      <rect x="11" y="11" width="518" height="338" fill="url(#hero-grid)" rx="7" />

      {/* Folded Folder Module 1 (Top Left) */}
      <rect
        x="40"
        y="45"
        width="150"
        height="100"
        rx="6"
        fill="var(--color-surface-raised)"
        stroke="var(--color-border)"
        strokeWidth="1.2"
      />
      <rect x="55" y="60" width="55" height="18" rx="3" fill="var(--color-surface)" stroke="var(--color-border)" />
      <rect x="120" y="60" width="55" height="18" rx="3" fill="var(--color-surface)" stroke="var(--color-border)" />
      <rect x="55" y="95" width="120" height="32" rx="3" fill="var(--color-surface)" stroke="var(--color-border)" />

      {/* Folded Folder Module 2 (Top Right) */}
      <rect
        x="330"
        y="45"
        width="160"
        height="110"
        rx="6"
        fill="var(--color-surface-raised)"
        stroke="var(--color-border)"
        strokeWidth="1.2"
      />
      <rect x="345" y="60" width="60" height="20" rx="3" fill="var(--color-surface)" stroke="var(--color-border)" />
      <rect x="415" y="60" width="60" height="20" rx="3" fill="var(--color-surface)" stroke="var(--color-border)" />
      <rect x="345" y="95" width="130" height="42" rx="3" fill="var(--color-surface)" stroke="var(--color-border)" />

      {/* Central Target Node (Focal Point) */}
      <rect
        x="210"
        y="190"
        width="120"
        height="48"
        rx="6"
        fill="var(--color-surface)"
        stroke="var(--color-accent)"
        strokeWidth="2"
      />
      <rect x="222" y="202" width="70" height="8" rx="2" fill="var(--color-accent)" opacity="0.8" />
      <rect x="222" y="216" width="40" height="6" rx="2" fill="var(--color-muted)" opacity="0.6" />

      {/* Bottom Leaf Modules */}
      <rect
        x="70"
        y="265"
        width="110"
        height="50"
        rx="6"
        fill="var(--color-surface-raised)"
        stroke="var(--color-border)"
        strokeWidth="1.2"
      />
      <rect x="85" y="280" width="80" height="20" rx="3" fill="var(--color-surface)" stroke="var(--color-border)" />

      <rect
        x="360"
        y="265"
        width="120"
        height="50"
        rx="6"
        fill="var(--color-surface-raised)"
        stroke="var(--color-border)"
        strokeWidth="1.2"
      />
      <rect x="375" y="280" width="90" height="20" rx="3" fill="var(--color-surface)" stroke="var(--color-border)" />

      {/* Connective Edges: Directional Incoming (Green) & Outgoing (Amber) */}
      {/* Incoming edge from Module 1 to Focal Node */}
      <path
        d="M 175 145 C 175 180, 200 205, 210 205"
        stroke="var(--color-incoming)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <polygon points="210,205 202,201 204,208" fill="var(--color-incoming)" />

      {/* Incoming edge from Module 2 to Focal Node */}
      <path
        d="M 345 155 C 345 190, 335 205, 330 205"
        stroke="var(--color-incoming)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <polygon points="330,205 338,208 336,201" fill="var(--color-incoming)" />

      {/* Outgoing edge from Focal Node to Bottom Left */}
      <path
        d="M 230 238 C 230 265, 200 280, 180 285"
        stroke="var(--color-outgoing)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <polygon points="180,285 188,289 187,281" fill="var(--color-outgoing)" />

      {/* Outgoing edge from Focal Node to Bottom Right */}
      <path
        d="M 310 238 C 310 265, 330 280, 360 285"
        stroke="var(--color-outgoing)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <polygon points="360,285 352,281 354,289" fill="var(--color-outgoing)" />
    </svg>
  );
}

export function BlastRadiusIllustration() {
  return (
    <svg
      viewBox="0 0 460 320"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-auto max-w-[460px] select-none"
    >
      <rect
        x="8"
        y="8"
        width="444"
        height="304"
        rx="8"
        stroke="var(--color-border)"
        strokeWidth="1.5"
        fill="var(--color-surface)"
      />

      {/* Concentric 2-hop radius rings */}
      <circle cx="230" cy="160" r="115" stroke="var(--color-border)" strokeDasharray="4 4" strokeWidth="1.2" />
      <circle cx="230" cy="160" r="65" stroke="var(--color-accent)" strokeDasharray="3 3" opacity="0.35" strokeWidth="1.2" />

      {/* Center node */}
      <circle cx="230" cy="160" r="16" fill="var(--color-accent)" />
      <circle cx="230" cy="160" r="8" fill="var(--color-surface)" />

      {/* Hop 1 Nodes (Direct Neighbours) */}
      <circle cx="165" cy="160" r="10" fill="var(--color-incoming)" />
      <path d="M 175 160 L 214 160" stroke="var(--color-incoming)" strokeWidth="1.5" />

      <circle cx="295" cy="160" r="10" fill="var(--color-outgoing)" />
      <path d="M 246 160 L 285 160" stroke="var(--color-outgoing)" strokeWidth="1.5" />

      <circle cx="230" cy="95" r="10" fill="var(--color-incoming)" />
      <path d="M 230 105 L 230 144" stroke="var(--color-incoming)" strokeWidth="1.5" />

      <circle cx="230" cy="225" r="10" fill="var(--color-outgoing)" />
      <path d="M 230 176 L 230 215" stroke="var(--color-outgoing)" strokeWidth="1.5" />

      {/* Hop 2 Nodes (Secondary Blast Radius) */}
      <circle cx="115" cy="130" r="7" fill="var(--color-surface-raised)" stroke="var(--color-incoming)" strokeWidth="1.5" />
      <path d="M 122 135 L 157 155" stroke="var(--color-incoming)" strokeWidth="1" strokeDasharray="2 2" />

      <circle cx="115" cy="190" r="7" fill="var(--color-surface-raised)" stroke="var(--color-incoming)" strokeWidth="1.5" />
      <path d="M 122 185 L 157 165" stroke="var(--color-incoming)" strokeWidth="1" strokeDasharray="2 2" />

      <circle cx="345" cy="130" r="7" fill="var(--color-surface-raised)" stroke="var(--color-outgoing)" strokeWidth="1.5" />
      <path d="M 303 155 L 338 135" stroke="var(--color-outgoing)" strokeWidth="1" strokeDasharray="2 2" />

      <circle cx="345" cy="190" r="7" fill="var(--color-surface-raised)" stroke="var(--color-outgoing)" strokeWidth="1.5" />
      <path d="M 303 165 L 338 185" stroke="var(--color-outgoing)" strokeWidth="1" strokeDasharray="2 2" />
    </svg>
  );
}

export function ASTPipelineIllustration() {
  return (
    <svg
      viewBox="0 0 460 300"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-auto max-w-[460px] select-none"
    >
      <rect
        x="8"
        y="8"
        width="444"
        height="284"
        rx="8"
        stroke="var(--color-border)"
        strokeWidth="1.5"
        fill="var(--color-surface)"
      />

      {/* Stage 1: File Source */}
      <rect x="40" y="70" width="85" height="150" rx="4" fill="var(--color-surface-raised)" stroke="var(--color-border)" strokeWidth="1.2" />
      <rect x="52" y="85" width="45" height="6" rx="2" fill="var(--color-muted)" opacity="0.7" />
      <rect x="52" y="100" width="60" height="6" rx="2" fill="var(--color-muted)" opacity="0.4" />
      <rect x="52" y="115" width="50" height="6" rx="2" fill="var(--color-muted)" opacity="0.4" />
      <rect x="52" y="130" width="55" height="6" rx="2" fill="var(--color-accent)" opacity="0.8" />
      <rect x="52" y="145" width="40" height="6" rx="2" fill="var(--color-muted)" opacity="0.4" />
      <rect x="52" y="160" width="58" height="6" rx="2" fill="var(--color-muted)" opacity="0.4" />

      {/* Connector Arrow 1 */}
      <path d="M 135 145 L 175 145" stroke="var(--color-border)" strokeWidth="1.5" strokeDasharray="3 3" />
      <polygon points="175,145 168,141 168,149" fill="var(--color-border)" />

      {/* Stage 2: AST Nodes */}
      <rect x="185" y="85" width="95" height="38" rx="4" fill="var(--color-surface-raised)" stroke="var(--color-border)" strokeWidth="1.2" />
      <rect x="197" y="97" width="50" height="6" rx="2" fill="var(--color-incoming)" />
      <rect x="197" y="108" width="30" height="4" rx="2" fill="var(--color-muted)" opacity="0.6" />

      <rect x="185" y="140" width="95" height="38" rx="4" fill="var(--color-surface-raised)" stroke="var(--color-border)" strokeWidth="1.2" />
      <rect x="197" y="152" width="60" height="6" rx="2" fill="var(--color-outgoing)" />
      <rect x="197" y="163" width="40" height="4" rx="2" fill="var(--color-muted)" opacity="0.6" />

      {/* Connector Arrow 2 */}
      <path d="M 290 145 L 330 145" stroke="var(--color-border)" strokeWidth="1.5" strokeDasharray="3 3" />
      <polygon points="330,145 323,141 323,149" fill="var(--color-border)" />

      {/* Stage 3: Resolved Graph */}
      <rect x="340" y="70" width="85" height="150" rx="4" fill="var(--color-surface-raised)" stroke="var(--color-accent)" strokeWidth="1.5" />
      <circle cx="382" cy="100" r="12" fill="var(--color-surface)" stroke="var(--color-incoming)" strokeWidth="2" />
      <circle cx="382" cy="185" r="12" fill="var(--color-surface)" stroke="var(--color-outgoing)" strokeWidth="2" />
      <path d="M 382 112 L 382 173" stroke="var(--color-border)" strokeWidth="1.5" />
    </svg>
  );
}

export function FrameworksIllustration() {
  return (
    <svg
      viewBox="0 0 460 300"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-auto max-w-[460px] select-none"
    >
      <rect
        x="8"
        y="8"
        width="444"
        height="284"
        rx="8"
        stroke="var(--color-border)"
        strokeWidth="1.5"
        fill="var(--color-surface)"
      />

      {/* Table header bar */}
      <rect x="25" y="35" width="410" height="30" rx="4" fill="var(--color-surface-raised)" />
      <rect x="40" y="47" width="50" height="6" rx="2" fill="var(--color-muted)" opacity="0.6" />
      <rect x="150" y="47" width="80" height="6" rx="2" fill="var(--color-muted)" opacity="0.6" />
      <rect x="320" y="47" width="70" height="6" rx="2" fill="var(--color-muted)" opacity="0.6" />

      {/* Row 1: GET */}
      <rect x="40" y="85" width="38" height="18" rx="3" fill="var(--color-incoming)" opacity="0.15" stroke="var(--color-incoming)" strokeWidth="1" />
      <rect x="150" y="91" width="110" height="7" rx="2" fill="var(--color-foreground)" opacity="0.8" />
      <rect x="320" y="91" width="80" height="7" rx="2" fill="var(--color-muted)" opacity="0.6" />

      {/* Row 2: POST */}
      <rect x="40" y="125" width="42" height="18" rx="3" fill="var(--color-accent)" opacity="0.15" stroke="var(--color-accent)" strokeWidth="1" />
      <rect x="150" y="131" width="90" height="7" rx="2" fill="var(--color-foreground)" opacity="0.8" />
      <rect x="320" y="131" width="60" height="7" rx="2" fill="var(--color-muted)" opacity="0.6" />

      {/* Row 3: DELETE */}
      <rect x="40" y="165" width="50" height="18" rx="3" fill="var(--color-outgoing)" opacity="0.15" stroke="var(--color-outgoing)" strokeWidth="1" />
      <rect x="150" y="171" width="120" height="7" rx="2" fill="var(--color-foreground)" opacity="0.8" />
      <rect x="320" y="171" width="75" height="7" rx="2" fill="var(--color-muted)" opacity="0.6" />

      {/* Row 4: PATCH */}
      <rect x="40" y="205" width="45" height="18" rx="3" fill="var(--color-surface-raised)" stroke="var(--color-border)" strokeWidth="1" />
      <rect x="150" y="211" width="70" height="7" rx="2" fill="var(--color-foreground)" opacity="0.8" />
      <rect x="320" y="211" width="90" height="7" rx="2" fill="var(--color-muted)" opacity="0.6" />
    </svg>
  );
}