import firebaseRulesPlugin from "@firebase/eslint-plugin-security-rules";

export default [
  {
    ignores: [
      "dist/**/*",
      "frontend/dist/**/*",
      "node_modules/**/*",
      "backend/node_modules/**/*",
      "frontend/node_modules/**/*",
    ],
  },
  firebaseRulesPlugin.configs["flat/recommended"],
];
