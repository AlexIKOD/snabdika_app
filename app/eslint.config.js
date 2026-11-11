import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "src-tauri"] },
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
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // §4.4, §11.2, §15.6 ТЗ:
      // Запрет прямого обращения к веб-хранилищу вне storage/preferences.ts.
      // Несанкционированный вызов ломает сборку (уровень error).
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[object.name='window'][property.name=/(localStorage|sessionStorage|indexedDB)/]",
          message:
            "Прямое обращение к веб-хранилищу запрещено (§4.4 ТЗ). Используйте только модуль storage/preferences.ts для неконфиденциальных настроек интерфейса.",
        },
        {
          selector:
            "CallExpression[callee.object.name=/(localStorage|sessionStorage|indexedDB)/]",
          message:
            "Прямое обращение к веб-хранилищу запрещено (§4.4 ТЗ). Используйте только модуль storage/preferences.ts для неконфиденциальных настроек интерфейса.",
        },
        {
          selector:
            "Identifier[name=/(localStorage|sessionStorage|indexedDB)/]:not(MemberExpression[object.name='window'] > Identifier)",
          message:
            "Прямое использование веб-хранилища запрещено (§4.4 ТЗ). Разрешено только внутри storage/preferences.ts.",
        },
      ],
    },
  },
  // Исключение: единственный модуль storage/preferences.ts имеет право доступа к веб-хранилищу
  {
    files: ["src/storage/preferences.ts", "src/tests/**/*.ts", "src/tests/**/*.tsx"],
    rules: {
      "no-restricted-syntax": "off",
    },
  }
);
