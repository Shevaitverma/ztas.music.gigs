/**
 * Base HTTP Exception class
 */
export class HttpException extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = 'HttpException';
  }
}

/**
 * 400 Bad Request Exception
 */
export class BadRequestException extends HttpException {
  constructor(message: string = 'Bad Request') {
    super(400, message);
    this.name = 'BadRequestException';
  }
}

/**
 * 401 Unauthorized Exception
 */
export class UnauthorizedException extends HttpException {
  constructor(message: string = 'Unauthorized') {
    super(401, message);
    this.name = 'UnauthorizedException';
  }
}

/**
 * 403 Forbidden Exception
 */
export class ForbiddenException extends HttpException {
  constructor(message: string = 'Forbidden') {
    super(403, message);
    this.name = 'ForbiddenException';
  }
}

/**
 * 404 Not Found Exception
 */
export class NotFoundException extends HttpException {
  constructor(message: string = 'Not Found') {
    super(404, message);
    this.name = 'NotFoundException';
  }
}

/**
 * 409 Conflict Exception
 */
export class ConflictException extends HttpException {
  constructor(message: string = 'Conflict') {
    super(409, message);
    this.name = 'ConflictException';
  }
}

/**
 * 500 Internal Server Error Exception
 */
export class InternalServerErrorException extends HttpException {
  constructor(message: string = 'Internal Server Error') {
    super(500, message);
    this.name = 'InternalServerErrorException';
  }
}
