/**
 * Jest configuration for the backend (NestJS) project.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  moduleFileExtensions: ['ts', 'js', 'json'],
  testMatch: ['**/*.spec.ts'],
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts', '!src/**/dto/*.ts', '!src/**/interfaces/**'],
  coverageDirectory: './coverage',
};
