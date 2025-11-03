import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import ThemedApp from './App';
import reportWebVitals from './reportWebVitals';
import "@fontsource/inter";

// This is a common workaround for a benign error in development.
// The "ResizeObserver loop completed with undelivered notifications" error
// is often thrown by libraries like Recharts or other chart/animation libraries
// and doesn't typically affect production builds or user experience.
window.onerror = function (message) {
  if (typeof message === 'string' && message.includes('ResizeObserver loop')) {
    // Suppress the error by returning true
    return true;
  }
  // Let other errors be handled by the default handler
  return false;
};

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <ThemedApp />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
