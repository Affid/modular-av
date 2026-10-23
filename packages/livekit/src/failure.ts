import type { ServiceError } from "@modular-av/api";

/** Thrown from `connect()` with the reason the core needs. */
export class LiveKitServiceError extends Error {
  readonly serviceError: ServiceError;

  constructor(serviceError: ServiceError, options?: { cause?: unknown }) {
    super(serviceError.message ?? serviceError.code, options);
    this.name = "LiveKitServiceError";
    this.serviceError = serviceError;
  }
}
