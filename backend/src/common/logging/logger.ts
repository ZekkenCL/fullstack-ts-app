import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  transport: isDev
    ? { target: 'pino-pretty', options: { colorize: true, singleLine: true } }
    : undefined,
  redact: ['req.headers.authorization', 'password'],
});

export type AppLogger = typeof logger;
