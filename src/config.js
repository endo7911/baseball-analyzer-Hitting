// Feature flags for Baseball Analyzer ver 2.1.0 Release

// Pitcher Module (投手分析機能 - 正式公開)
export const SHOW_PITCHER_MODULE = import.meta.env.VITE_SHOW_PITCHER === 'false' ? false : true;

// Body Composition Module (体組成分析機能 - 正式公開)
export const SHOW_BODY_COMP_MODULE = import.meta.env.VITE_SHOW_BODY_COMP === 'false' ? false : true;


