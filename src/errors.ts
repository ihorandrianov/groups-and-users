export class AppError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const notFound = (entity: string) => new AppError(404, `${entity} not found`);
export const unauthorized = () => new AppError(401, "Missing X-User-Id header");
export const forbidden = () => new AppError(403, "Access denied");
