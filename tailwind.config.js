/** @type {import('tailwindcss').Config} */
module.exports = {
  // Configure files to scan for Tailwind classes.
  // This is crucial for Tailwind to know which CSS to generate.
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],

  // Enable dark mode using a class strategy (e.g., <html class="dark">).
  // This matches the `dark:` prefixes used in your components.
  darkMode: 'class',

  theme: {
    extend: {
      // You can extend your theme here for custom colors, fonts, etc.
    },
  },
  plugins: [],
};