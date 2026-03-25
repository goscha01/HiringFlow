# HiringFlow Branding Menu

Per-flow branding customization. Each flow can have its own look & feel.

## Features

### 1. Logo
- Upload company logo (shown on Start screen, header during flow, End screen)
- Stored in Vercel Blob alongside videos
- Max size: 2MB, formats: PNG, SVG, JPG, WebP

### 2. Brand Colors
- **Primary color** — buttons, links, active states (default: blue-600)
- **Background color** — candidate-facing page background (default: gray-900)
- **Text color** — main text on candidate pages (default: white)
- **Accent color** — highlights, selected options (default: blue-500)
- Color picker + preset palette

### 3. Typography
- Font family selection from Google Fonts (Inter, Roboto, Open Sans, Lato, Poppins, Montserrat, etc.)
- Custom font URL support
- Heading size: Small / Medium / Large
- Body text size: Small / Medium / Large

### 4. Button Style
- Shape: Rounded / Pill / Square
- Size: Compact / Default / Large
- Outline vs Filled
- Hover effect: Darken / Lighten / Lift (shadow)

### 5. Background
- Solid color
- Gradient (two-color with direction)
- Background image upload (with overlay opacity)
- Pattern presets (dots, lines, grid)

### 6. Start Screen Customization
- Logo position (center / top-left)
- Welcome message (already exists)
- Background override
- CTA button text ("Start Interview" / custom)

### 7. End Screen Customization
- Thank you message (already exists)
- Redirect URL (optional — redirect after completion)
- Custom CTA button ("Back to Website" / custom text + URL)

### 8. Layout Options
- Video position on desktop: Left / Center / Right
- Question panel style: Sidebar / Overlay / Below
- Progress indicator: Bar / Steps / None

### 9. Custom CSS (Advanced)
- Raw CSS textarea for power users
- Applied as scoped styles to candidate-facing pages only

## Database Schema

All branding stored as JSON on the Flow model:

```prisma
model Flow {
  // ... existing fields
  branding  Json?  // BrandingConfig JSON
}
```

```typescript
interface BrandingConfig {
  logo?: string           // Blob URL
  colors: {
    primary: string       // hex
    background: string    // hex or gradient
    text: string          // hex
    accent: string        // hex
  }
  typography: {
    fontFamily: string
    fontUrl?: string
    headingSize: 'sm' | 'md' | 'lg'
    bodySize: 'sm' | 'md' | 'lg'
  }
  buttons: {
    shape: 'rounded' | 'pill' | 'square'
    size: 'compact' | 'default' | 'large'
    style: 'filled' | 'outline'
    hoverEffect: 'darken' | 'lighten' | 'lift'
  }
  background: {
    type: 'solid' | 'gradient' | 'image' | 'pattern'
    value: string         // hex, gradient CSS, blob URL, or pattern name
    overlay?: number      // 0-1 opacity for image/pattern
  }
  startScreen: {
    logoPosition: 'center' | 'top-left'
    ctaText: string
    backgroundOverride?: string
  }
  endScreen: {
    redirectUrl?: string
    ctaText?: string
    ctaUrl?: string
  }
  layout: {
    videoPosition: 'left' | 'center' | 'right'
    questionStyle: 'sidebar' | 'overlay' | 'below'
    progressIndicator: 'bar' | 'steps' | 'none'
  }
  customCss?: string
}
```

## Admin UI

New tab in flow builder: **Branding** (alongside Editor / Schema)

Sections:
1. Logo upload area
2. Color palette with pickers
3. Font selector dropdown
4. Button style radio groups
5. Background configurator
6. Start/End screen preview
7. Layout selector with visual thumbnails
8. Custom CSS editor (collapsible)

Live preview panel shows changes in real-time.
