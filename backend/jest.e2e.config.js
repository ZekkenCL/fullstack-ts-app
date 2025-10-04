module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  moduleFileExtensions: ['ts', 'js', 'json'],
  testMatch: ['<rootDir>/test/e2e/**/*.e2e-spec.ts'],
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^uuid$': '<rootDir>/test/mocks/uuid.cjs',
    '^@prisma/client$': '<rootDir>/node_modules/@prisma/client/index.js',
  },
  // Use separate setup to avoid unit-test mocks (prisma, schedule) leaking into e2e
  setupFilesAfterEnv: ['<rootDir>/jest.e2e.setup.ts'],
  globalSetup: '<rootDir>/jest.e2e.global-setup.ts',
  transformIgnorePatterns: [
    'node_modules/(?!(uuid)/)', // allow transpile of ESM uuid in e2e
  ],
  moduleDirectories: [
    'node_modules',
    '<rootDir>/../node_modules',
    '<rootDir>/../../node_modules',
  ],
  maxWorkers: 1,
};