import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { logger } from '../logging/logger';

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();
    const requestId = request?.requestId;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: any = 'Internal server error';
    let details: any = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') message = res;
      else if (typeof res === 'object') {
        message = (res as any).message || message;
        details = res;
      }
    }

    logger.error({ requestId, status, err: exception }, 'http error');

    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      path: request?.url,
      requestId,
      timestamp: new Date().toISOString(),
      ...(details ? { details } : {}),
    });
  }
}
