// Theme storage key and the inline script that applies the saved theme before the page paints.
export const THEME_KEY = "bf_theme";
export const themeInitScript = `(function(){try{var m=localStorage.getItem("${THEME_KEY}");var d=m==="dark"||(m!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light"}catch(e){}})()`;
