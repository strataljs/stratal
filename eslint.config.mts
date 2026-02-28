import js from "@eslint/js";
import json from "@eslint/json";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores([
    "**/node_modules/",
    "**/dist/",
    "**/coverage/",
    "**/.yarn/",
    "**/*.tsbuildinfo",
    "examples/",
    "docs/"
  ]),

  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
      },
    },
  },

  {
    files: ["**/*.{ts,mts,cts}"],
    extends: [
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // TODO: Re-enable once typescript-eslint supports ESLint 10
      "@typescript-eslint/no-deprecated": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-unnecessary-type-parameters": "off",
      "@typescript-eslint/no-extraneous-class": "off",
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      "@typescript-eslint/no-confusing-void-expression": [
        "error",
        { ignoreArrowShorthand: true },
      ],
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true },
      ],
    },
  },

  {
    files: ["**/__tests__/**/*.spec.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/unbound-method": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },

  {
    files: [
      "*.config.{ts,mts,cts,js,mjs,cjs}",
      "**/vitest.config.{ts,mts}",
      "**/vitest.setup.{ts,mts}",
    ],
    extends: [tseslint.configs.disableTypeChecked],
  },

  {
    files: ["**/*.json"],
    plugins: { json },
    language: "json/json",
    extends: ["json/recommended"],
  },
  {
    files: ["**/*.jsonc"],
    plugins: { json },
    language: "json/jsonc",
    extends: ["json/recommended"],
  },
]);
