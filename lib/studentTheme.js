// lib/studentTheme.js
// Student-facing visual language -- distinct from the navy/gold teacher
// theme (lib/theme.js / components/NavBar). Playful, rounded, high-contrast,
// designed for K-12 students rather than teachers. Shared across Math
// Mastery's desktop dashboard and mobile QR practice flow so both read as
// the same product.
//
// NOTE ON PLACEHOLDER DATA: streaks, points, and badge counts rendered
// with this theme are VISUAL MOCKS as of this pass -- no schema exists yet
// for daily-streak tracking or a points system anywhere in this codebase.
// Only "mastered / not mastered" per unit is real data (from attempts /
// passed_threshold). Anywhere a mock number appears, it's commented
// MOCK -- wire to real data once a streak/points schema exists.

export const S = {
  purple: '#7C5CFC',
  purpleDark: '#5F3DD9',
  purpleLight: '#F0EDFF',
  gold: '#F4B740',
  pink: '#FF6B9D',
  green: '#2FBF71',
  blue: '#3E9DFF',
  bg: '#F7F6FB',
  card: '#FFFFFF',
  border: '#EAE7F5',
  text: '#2D2A3D',
  muted: '#8B87A0',
}

export const FONT_STUDENT = "'Baloo 2', 'Segoe UI', sans-serif"

// Rotating card accent colors, used so a grid of unit/badge cards doesn't
// look monotone -- matches the reference mockup's per-card color variety.
export const CARD_ACCENTS = [S.purple, S.green, S.pink, S.gold, S.blue]
