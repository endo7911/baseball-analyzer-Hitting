// Feature flags for Baseball Analyzer
// Automatically enable Pitcher Module in Local Development (npm run dev),
// but keep it hidden on Production deployments (Vercel) until ready for launch.
export const SHOW_PITCHER_MODULE = import.meta.env.DEV || import.meta.env.VITE_SHOW_PITCHER === 'true';
