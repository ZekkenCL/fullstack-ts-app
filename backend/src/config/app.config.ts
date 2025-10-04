export default () => ({
  port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
  environment: process.env.NODE_ENV || 'development',
  apiPrefix: process.env.API_PREFIX || 'api',
});