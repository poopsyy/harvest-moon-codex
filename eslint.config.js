import localization from "./tools/eslint-localization.js";
import tseslint from "typescript-eslint";
export default tseslint.config(
  { ignores: ["dist/**", "coverage/**", "public/**", "node_modules/**"] },
  ...tseslint.configs.recommended,
  {
    files: ["src/ui/**/*.ts", "src/scenes/**/*.ts"],
    plugins: { localization },
    rules: { "localization/no-literal-ui": "error" },
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-constant-condition": ["error", { checkLoops: false }],
    },
  },
);
