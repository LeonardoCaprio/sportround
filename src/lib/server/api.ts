import "server-only";

import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function jsonError(error: unknown): Response {
  const headers = { "cache-control": "private, no-store" };

  if (error instanceof ApiError) {
    return Response.json(
      { error: error.message, details: error.details },
      { status: error.status, headers },
    );
  }

  if (error instanceof ZodError) {
    return Response.json(
      { error: "Please check the submitted information.", details: error.flatten() },
      { status: 400, headers },
    );
  }

  console.error(error);
  return Response.json(
    { error: "Something went wrong. Please try again." },
    { status: 500, headers },
  );
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "A valid JSON request body is required.");
  }
}
