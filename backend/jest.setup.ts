// Silence schedule decorators only in unit tests (JEST_E2E not set)
if (!process.env.JEST_E2E) {
  jest.mock('@nestjs/schedule', () => {
    return {
      Cron: () => () => {},
      CronExpression: { EVERY_DAY_AT_1AM: '0 1 * * *' },
      SchedulerRegistry: class {},
      ScheduleModule: { forRoot: () => ({}) },
    };
  });
}

// Mock prisma client only for unit tests
if (!process.env.JEST_E2E) {
  jest.mock('@prisma/client');
}
