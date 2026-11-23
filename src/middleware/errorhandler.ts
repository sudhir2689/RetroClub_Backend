import type { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/AppError";
import { fail } from "../utils/envelope";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json(fail(err.message, "APP_ERROR"));
  }

  console.error("Backend Error:", err);

  const errorObj = err as any;
  const message =
    errorObj?.error?.description ||
    errorObj?.message ||
    "Internal server error";

  return res.status(500).json(fail(message, "INTERNAL"));
}
