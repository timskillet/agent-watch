import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import prettierConfig from "eslint-config-prettier";
import prettierPlugin from "eslint-plugin-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: ["**/dist/", "**/node_modules/", "**/*.config.js", "**/*.config.ts"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      "prettier/prettier": "error",
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: reactHooks.configs.recommended.rules,
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ["apps/server/**/*.ts", "packages/**/*.ts"],
    languageOptions: {
      globals: globals.node,
    },
  },
);
