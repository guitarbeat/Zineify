import forms from '@tailwindcss/forms';
import containerQueries from '@tailwindcss/container-queries';

/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                "neutral-bg": "#f4f1ea",
                "primary-vibrant": "#ff5555",
            }
        },
    },
    plugins: [
        forms,
        containerQueries,
    ],
};

