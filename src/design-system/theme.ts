import { defineTheme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral';

/**
 * Populr's Astryx theme — "Warm Editorial Utility." Extends Astryx's
 * neutral theme rather than starting from scratch, then pins the exact
 * hex values already established across the pre-Astryx Tailwind UI
 * (src/index.css's --pop-lime/--pop-cream custom properties and the
 * #111111/#6B6B6B/#E8E4DF/etc. literals used throughout src/pages) so
 * migrated and not-yet-migrated surfaces don't visibly disagree during
 * the incremental rollout.
 *
 * `color: {accent, neutralStyle}` drives Astryx's derived color scale
 * (backgrounds, borders, on-accent contrast, etc.); the explicit `tokens`
 * below only pin the handful of values that need to match Populr's
 * existing palette exactly rather than Astryx's auto-derived shade.
 * Status colors (success/warning/error) are never derived from accent
 * (see @astryxdesign/core's expandColorScale docs), so those are always
 * explicit here.
 */
export const populrTheme = defineTheme({
  name: 'populr',
  extends: neutralTheme,
  color: {
    accent: '#C5FF3D', // chartreuse — matches --pop-lime (78 100% 62%)
    neutralStyle: 'warm',
  },
  typography: {
    body: {
      family: 'Geist',
      fallbacks: '-apple-system, BlinkMacSystemFont, sans-serif',
    },
  },
  tokens: {
    '--color-accent': '#C5FF3D',
    // Chartreuse is very light — explicitly pin dark-on-accent text to
    // match every existing chartreuse button in the app (Sidebar's
    // primary nav item, pop-btn-primary, etc.), rather than trust the
    // auto-contrast algorithm to land on this exact shade.
    '--color-on-accent': '#111111',
    '--color-text-accent': '#111111',
    '--color-icon-accent': '#111111',
    '--color-background-body': '#F3F0EC', // matches --pop-cream (30 23% 94%)
    // Astryx derives these from neutralStyle: 'warm', which shades them a
    // visible yellow-tinted white — never noticed while Button/Spinner were
    // the only Astryx surfaces in use, since neither renders a large fill.
    // Every existing card/input across the pre-Astryx Tailwind UI is a flat
    // #FFFFFF against the cream body background (.pop-card, .pop-input);
    // pinned to match exactly, same as the other tokens below.
    '--color-background-surface': '#FFFFFF',
    '--color-background-card': '#FFFFFF',
    '--color-background-popover': '#FFFFFF',
    '--color-text-primary': '#111111',
    '--color-text-secondary': '#6B6B6B',
    '--color-border': '#E8E4DF',
    '--color-success': '#059669',
    '--color-on-success': '#FFFFFF',
    '--color-error': '#DC2626',
    '--color-on-error': '#FFFFFF',
    '--color-warning': '#D97706',
    '--color-on-warning': '#111111',
  },
});
