/**
 * Jest configuration for the backend (NestJS) project.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  moduleFileExtensions: ['ts', 'js', 'json'],
  // Exclude any file ending with .e2e-spec.ts
  testRegex: '^(?!.*\\.e2e-spec\\.ts$).*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!(uuid)/)', // allow transpile of ESM uuid
  ],
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts', '!src/**/dto/*.ts', '!src/**/interfaces/**'],
  coverageDirectory: './coverage',
};
