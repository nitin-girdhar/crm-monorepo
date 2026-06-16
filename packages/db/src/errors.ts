export type DbErrorKind =
  | 'unique_violation'
  | 'foreign_key_violation'
  | 'not_found'
  | 'unknown';

export class DatabaseError extends Error {
  constructor(
    public readonly kind: DbErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export function fromPgError(err: unknown): DatabaseError {
  const pgErr = err as { code?: string; message?: string };
  switch (pgErr.code) {
    case '23505':
      return new DatabaseError('unique_violation', pgErr.message ?? 'Unique constraint violated');
    case '23503':
      return new DatabaseError('foreign_key_violation', pgErr.message ?? 'Foreign key constraint violated');
    default:
      return new DatabaseError('unknown', pgErr.message ?? 'Unknown database error');
  }
}

export function notFound(entity: string): DatabaseError {
  return new DatabaseError('not_found', `${entity} not found`);
}

export function isDatabaseError(err: unknown): err is DatabaseError {
  return err instanceof DatabaseError;
}
