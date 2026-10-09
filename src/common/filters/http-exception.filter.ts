import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error occurred';
    let details: any = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        message = (res as any).message || message;
        details = (res as any).error || (res as any).errors || null;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      // Preserve explicit status or statusCode (e.g. 413 Payload Too Large)
      if ((exception as any).status || (exception as any).statusCode) {
        status = (exception as any).status || (exception as any).statusCode;
      }
      // Handle MongoDB Duplicate Key Error (code 11000)
      if ((exception as any).code === 11000) {
        status = HttpStatus.CONFLICT;
        message = 'A duplicate record already exists with these unique fields';
        details = (exception as any).keyValue;
      }
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      message: Array.isArray(message) ? message.join(', ') : message,
      details,
      timestamp: new Date().toISOString(),
    });
  }
}
