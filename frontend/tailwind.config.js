/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'poker-green': '#35654d',
        'poker-felt': '#1a472a',
        'card-red': '#c62828',
        'card-black': '#212121',
      },
    },
  },
  plugins: [],
}
