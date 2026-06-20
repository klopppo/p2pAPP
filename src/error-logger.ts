// Hook console errors to print to terminal
const originalError = console.error;
const originalWarn = console.warn;

console.error = function(...args) {
  // Just forward to original - avoid circular object issues
  originalError.apply(console, args);
};

console.warn = function(...args) {
  originalWarn.apply(console, args);
};

window.addEventListener('error', (event) => {
  originalError('[Window Error]', event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  originalError('[Unhandled Rejection]', event.reason);
});
