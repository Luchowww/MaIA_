---
name: Academic Intelligence Architect
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#47464f'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#787680'
  outline-variant: '#c8c5d0'
  surface-tint: '#5b598c'
  primary: '#070235'
  on-primary: '#ffffff'
  primary-container: '#1e1b4b'
  on-primary-container: '#8683ba'
  inverse-primary: '#c4c1fb'
  secondary: '#006c49'
  on-secondary: '#ffffff'
  secondary-container: '#6cf8bb'
  on-secondary-container: '#00714d'
  tertiary: '#140900'
  on-tertiary: '#ffffff'
  tertiary-container: '#331d00'
  on-tertiary-container: '#c07a00'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e3dfff'
  primary-fixed-dim: '#c4c1fb'
  on-primary-fixed: '#181445'
  on-primary-fixed-variant: '#444173'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1'
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '500'
    lineHeight: '1'
  code-display:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '700'
    lineHeight: '1'
    letterSpacing: 0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  sidebar_width: 280px
  container_max: 1440px
  gutter: 24px
---

## Brand & Style
The design system is engineered for academic clarity and institutional trust. It balances the rigor of higher education with the efficiency of modern SaaS interfaces. The visual language is **Corporate Modern**, prioritizing information density without sacrificing legibility. 

The aesthetic is characterized by high-contrast data visualization, generous whitespace to reduce cognitive load during complex curriculum mapping, and a structured hierarchy that mirrors academic seniority and organization. The goal is to evoke a sense of precision, reliability, and forward-thinking management.

## Colors
The palette is rooted in **Deep Navy**, establishing a foundation of authority and permanence. 

- **Primary (Deep Navy/Indigo):** Used for core navigation, primary actions, and branding elements.
- **Success (Emerald):** Denotes 'Approved' or 'Completed' status.
- **Warning (Amber):** Represents 'In Progress' or 'Prerequisite Required'.
- **Error (Soft Red):** Highlights 'Blocked', 'Failed', or 'Action Required'.
- **Neutral (Slate):** Used for 'Pending', 'Optional', and secondary metadata.
- **Surface:** A cool-toned slate white background ensures maximum contrast for data visualization and complex typography.

## Typography
**Inter** is the sole typeface, utilized for its exceptional legibility in data-dense environments. 

The system introduces a specialized `code-display` role for Course Codes (e.g., CS101), utilizing a heavier weight and slight tracking to ensure they stand out as distinct identifiers. Headlines use tighter tracking and heavier weights to maintain a professional, editorial feel. Labels for "Credits" or "Prerequisites" should always use the `label-md` or `label-sm` tiers to maintain a clear distinction between content and metadata.

## Layout & Spacing
This design system utilizes a **Fixed Grid** model for administrative dashboards and a **Fluid Canvas** for curriculum graph visualizations.

- **Sidebar:** A persistent 280px left-hand navigation allows for deep institutional nesting.
- **Main Content:** Constrained to a 1440px max-width on large displays to ensure line lengths remain readable.
- **Grids:** A 12-column system is used for dashboard layouts, while the curriculum visualization uses a node-link spatial model with a minimum `lg` (24px) clearance between course cards.
- **Mobile:** Reflows to a single column; the sidebar collapses into a bottom-sheet or hamburger menu, and horizontal scrolling is permitted for large data tables.

## Elevation & Depth
Depth is communicated through **Tonal Layers** and **Ambient Shadows** to create a structured hierarchy of information.

1.  **Canvas (Level 0):** Background (#F8FAFC).
2.  **Course Nodes / Cards (Level 1):** White background with a subtle 1px border (#E2E8F0) and a soft, low-opacity shadow (Y: 2px, Blur: 4px, Opacity: 4%) to indicate interactivity.
3.  **Active/Hover State (Level 2):** Increased shadow depth (Y: 8px, Blur: 16px, Opacity: 8%) to draw focus to a specific course path.
4.  **Modals/Overlays (Level 3):** High elevation with a background blur (12px) on the underlying content to focus on specific academic records.

## Shapes
The shape language uses **Rounded** (Level 2) logic. 

Standard components like input fields, buttons, and course cards feature an 8px (0.5rem) radius. Larger containers or sections within the curriculum map utilize the `rounded-lg` (16px) or `rounded-xl` (24px) tokens to create a softer, more modern framing for grouped data. This balance of geometric precision and rounded corners maintains professional authority while feeling accessible.

## Components

- **Buttons:** Primary buttons use the Deep Navy background with white text. Secondary buttons use a slate-gray ghost style. All buttons use 8px rounding.
- **Course Cards:** The primary component of the system. Includes a top-bar color-coded by status (Success, Warning, Error), a clear bold Course Code, and small labels for credit counts.
- **Chips/Status Badges:** Pill-shaped with low-opacity background fills of the status color (e.g., Emerald at 10% opacity) and high-contrast text.
- **Sidebar:** Uses a subtle semi-transparent background with active states highlighted by a left-hand 4px indigo accent bar.
- **Input Fields:** Clean, slate-bordered boxes that transition to a 2px Indigo border on focus.
- **Connection Lines (Graph):** In the curriculum visualization, lines connecting course nodes should be 2px thick, colored Slate-300 by default, and change to the Status color when a path is selected.