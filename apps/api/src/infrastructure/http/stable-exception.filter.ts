import { Catch, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";

type ExceptionBody = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
};

function isExceptionBody(value: unknown): value is ExceptionBody {
  return typeof value === "object" && value !== null;
}

function statusCodeFor(status: number): string {
  if (status === HttpStatus.BAD_REQUEST) return "BAD_REQUEST";
  if (status === HttpStatus.UNAUTHORIZED) return "UNAUTHORIZED";
  if (status === HttpStatus.FORBIDDEN) return "PERMISSION_DENIED";
  if (status === HttpStatus.NOT_FOUND) return "NOT_FOUND";
  if (status === HttpStatus.CONFLICT) return "CONFLICT";
  if (status === HttpStatus.TOO_MANY_REQUESTS) return "RATE_LIMITED";
  return "INTERNAL_SERVER_ERROR";
}

@Catch()
export class StableExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(StableExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const rawBody = isHttpException ? exception.getResponse() : null;
    const body = isExceptionBody(rawBody) ? rawBody : {};
    const rawMessage = body.message;
    const message = Array.isArray(rawMessage)
      ? rawMessage.filter((item): item is string => typeof item === "string").join(" ")
      : typeof rawMessage === "string"
        ? rawMessage
        : status >= HttpStatus.INTERNAL_SERVER_ERROR
          ? "Une erreur interne est survenue."
          : "La requête n'a pas pu être traitée.";
    const code = typeof body.code === "string" ? body.code : statusCodeFor(status);

    if (!isHttpException || status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(exception instanceof Error ? exception.message : "Unhandled exception");
    }

    response.status(status).json({
      code,
      message: status >= HttpStatus.INTERNAL_SERVER_ERROR ? "Une erreur interne est survenue." : message,
      ...(body.details !== undefined ? { details: body.details } : {}),
    });
  }
}
