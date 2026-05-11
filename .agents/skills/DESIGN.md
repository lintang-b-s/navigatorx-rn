---
name: Navigator High-Contrast
colors:
  surface: '#0b1326'
  surface-dim: '#0b1326'
  surface-bright: '#31394d'
  surface-container-lowest: '#060e20'
  surface-container-low: '#131b2e'
  surface-container: '#171f33'
  surface-container-high: '#222a3d'
  surface-container-highest: '#2d3449'
  on-surface: '#dae2fd'
  on-surface-variant: '#c2c6d6'
  inverse-surface: '#dae2fd'
  inverse-on-surface: '#283044'
  outline: '#8c909f'
  outline-variant: '#424754'
  surface-tint: '#adc6ff'
  primary: '#adc6ff'
  on-primary: '#002e6a'
  primary-container: '#4d8eff'
  on-primary-container: '#00285d'
  inverse-primary: '#005ac2'
  secondary: '#bfc8cd'
  on-secondary: '#293236'
  secondary-container: '#3f484d'
  on-secondary-container: '#adb6bc'
  tertiary: '#c9c6c2'
  on-tertiary: '#31302e'
  tertiary-container: '#93908d'
  on-tertiary-container: '#2a2a27'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#adc6ff'
  on-primary-fixed: '#001a42'
  on-primary-fixed-variant: '#004395'
  secondary-fixed: '#dbe4e9'
  secondary-fixed-dim: '#bfc8cd'
  on-secondary-fixed: '#141d21'
  on-secondary-fixed-variant: '#3f484d'
  tertiary-fixed: '#e6e2de'
  tertiary-fixed-dim: '#c9c6c2'
  on-tertiary-fixed: '#1c1c19'
  on-tertiary-fixed-variant: '#484744'
  background: '#0b1326'
  on-background: '#dae2fd'
  surface-variant: '#2d3449'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '800'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: '1.2'
  nav-instruction:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '500'
    lineHeight: '1.5'
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.4'
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '700'
    lineHeight: '1'
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  container-padding: 24px
  stack-gap: 12px
  control-margin: 16px
  sidebar-width: 320px
---

## Brand & Style
The design system is built for high-stakes, rapid decision-making environments. It prioritizes glanceability and cognitive ease, drawing inspiration from automotive interfaces where information must be processed in milliseconds. 

The aesthetic is **Corporate Modern with High-Contrast accents**. It utilizes a deep navy chrome to frame the map area, creating a "command center" feel that recedes to let the map content shine. The tone is authoritative, precise, and reliable. By combining the friendliness of consumer navigation with the rigor of professional logistics tools, this design system ensures that critical alerts—like traffic or hazards—are immediately actionable without being overwhelming.

## Colors
The palette is anchored by a deep navy (`#0F172A`) used for the UI chrome, sidebars, and top bars to provide a stable, non-distracting frame. The primary brand blue (`#3B82F6`) is reserved exclusively for active routes and primary action buttons, ensuring a high-contrast path for the user's eye.

Neutral tones like `#F2F4F7` and `#666F74` are used for secondary UI elements and inactive states. The off-white `#F8F4F0` serves as the primary text color on dark backgrounds to reduce eye strain compared to pure white. Semantic colors are saturated and bold, ensuring that "Heavy Traffic" or "Road Closure" alerts are unmistakable against the dark interface.

## Typography
This design system utilizes **Inter** for its exceptional legibility and modern, systematic feel. The type hierarchy is intentionally "top-heavy," with large, bold weights for directional instructions and distance markers.

- **Nav-Instruction:** Specifically designed for the next-turn indicator, using high-weight Inter to ensure readability at a distance.
- **Label-Caps:** Used for metadata like "ETA" or "DISTANCE" to distinguish supplementary data from primary instructions.
- **Body-LG:** Optimized for readability in list views like "Alternative Routes."

## Layout & Spacing
The layout follows a **Fluid Grid** model for the map area, with a **Fixed Sidebar** for navigation controls and route details. The system uses a 4px baseline grid to ensure alignment.

Padding within floating map cards is generous (24px) to ensure touch targets are easily hittable while driving. Elements are grouped using a "stack" logic, where related information (e.g., street name and turn icon) is separated by 12px, while distinct modules are separated by 24px.

## Elevation & Depth
Depth in this design system is created through **Tonal Layers** and **Ambient Shadows**. 

The map sits at the lowest elevation. UI panels, such as the search bar or navigation instructions, are treated as physical cards floating above the map. These cards use a subtle 1px border (`#FFFFFF10`) and a deep, diffused shadow (0px 8px 24px rgba(0,0,0,0.4)) to separate them from the map's visual noise. Active states for cards use a secondary glow effect in the primary blue to indicate focus.

## Shapes
The shape language is **Rounded**, using an 8px (0.5rem) base radius. This provides a professional yet accessible feel, softening the high-contrast color palette. Buttons and input fields use this 8px radius, while larger container cards and modals use 16px (1rem) to emphasize their role as primary structural units. 

Directional icons and badges (like speed limits) should maintain crisp, slightly rounded corners to feel technical rather than organic.

## Components
- **Buttons:** Primary buttons are solid `#3B82F6` with white text. Secondary buttons use a ghost style with a `#666F74` border. All buttons have a minimum height of 48px to accommodate touch interaction.
- **Navigation Cards:** These utilize a dark background (`#1E293B`) with high-contrast text. Icons for turns should be oversized and utilize the primary blue.
- **Chips/Status Badges:** Used for traffic levels (e.g., "Heavy," "Light"). These should be pill-shaped with background tints corresponding to their semantic color.
- **Input Fields:** Search bars should be prominent, featuring a `#F2F4F7` background in light mode or a deep navy in dark mode, with clear leading icons.
- **Route Overlays:** The active path on the map should be a 12px thick stroke in `#3B82F6` with a soft outer glow to ensure it is visible over varied map terrain.
- **Traffic Alerts:** Floating map markers should use high-saturation semantic colors (Red/Orange) with white glyphs for maximum visibility.