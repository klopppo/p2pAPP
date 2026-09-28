// Apply the theme before first paint so there's no light/dark flash.
// Mirrors ThemeProvider's storageKey ("theme") + "system" resolution.
(function () {
  try {
    var stored = localStorage.getItem('theme')
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    var theme =
      stored === 'light' || stored === 'dark'
        ? stored
        : prefersDark
          ? 'dark'
          : 'light'
    document.documentElement.classList.add(theme)
  } catch (e) {
    document.documentElement.classList.add(
      window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    )
  }
})()
