import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import unusedImports from "eslint-plugin-unused-imports";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "playwright-report", "test-results"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "simple-import-sort": simpleImportSort,
      "unused-imports": unusedImports,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "unused-imports/no-unused-imports": "error",
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
      "react-refresh/only-export-components": [
        "error",
        { allowConstantExport: true, allowExportNames: ["useGame"] },
      ],
    },
  },
  {
    files: [
      "src/app/(game)/GameScene.tsx",
      "src/components/models/ChangeableModel1.tsx",
      "src/components/models/ChangeableModel2.tsx",
      "src/components/models/ChangeableModel3.tsx",
      "src/components/models/ChangeableModels.tsx",
      "src/components/models/in-game/Ball.tsx",
      "src/components/models/in-game/GameModel.tsx",
      "src/components/webgl/background/index.tsx",
    ],
    rules: {
      // These files intentionally mutate R3F-owned cameras, textures, uniforms, or actions.
      "react-hooks/immutability": "off",
    },
  },
);
