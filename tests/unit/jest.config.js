export default {
  preset: "ts-jest/presets/default-esm",
  extensionsToTreatAsEsm: [".ts"],
  testEnvironment: "node",
  testMatch: ["**/*.test.ts"],
  moduleNameMapper: {
    "^@stockcheck/core$": "<rootDir>/../../packages/core/src/index.ts",
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: {
          extends: "../../tsconfig.base.json",
          compilerOptions: { module: "ESNext", moduleResolution: "bundler" },
        },
      },
    ],
  },
};
