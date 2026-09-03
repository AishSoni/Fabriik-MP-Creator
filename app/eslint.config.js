import readableTailwind from "eslint-plugin-readable-tailwind";

/**
 * Tailwind readability lint — complements oxlint (fast) with class hygiene rules.
 * Run with: npx eslint .  (oxlint remains `npm run lint`)
 *
 * Rules:
 * - multiline   — wrap long class strings (>80 cols) into multiline cn()/cva arrays
 * - sort-classes — consistent Tailwind order (pairs with prettier-plugin-tailwindcss)
 * - no-unnecessary-whitespace — collapse duplicate spaces
 *
 * See: https://github.com/schoero/eslint-plugin-readable-tailwind
 */
export default [
  {
    plugins: {
      "readable-tailwind": readableTailwind,
    },
    rules: {
      "readable-tailwind/multiline": ["warn", { printWidth: 80, preferSingleLine: false }],
      "readable-tailwind/sort-classes": "warn",
      "readable-tailwind/no-unnecessary-whitespace": "warn",
    },
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
];
