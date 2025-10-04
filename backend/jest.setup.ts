// Silence schedule decorators (no actual cron execution in unit tests)
jest.mock('@nestjs/schedule', () => {
  return {
    Cron: () => () => {},
    CronExpression: { EVERY_DAY_AT_1AM: '0 1 * * *' },
    SchedulerRegistry: class {},
    ScheduleModule: { forRoot: () => ({}) },
  };
});

// Mock prisma client to avoid native engine loading
jest.mock('@prisma/client');
