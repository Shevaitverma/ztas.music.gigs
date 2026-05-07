/**
 * Logger Service
 * Industry-standard logging with proper levels and formatting
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogMessage {
  timestamp: string;
  level: LogLevel;
  context?: string;
  message: string;
  data?: any;
}

class LoggerService {
  private context: string;
  private isDevelopment: boolean;

  constructor(context: string = 'App') {
    this.context = context;
    this.isDevelopment = process.env.NODE_ENV !== 'production';
  }

  /**
   * Create a child logger with a specific context
   */
  child(context: string): LoggerService {
    return new LoggerService(context);
  }

  /**
   * Format log message
   */
  private format(level: LogLevel, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}] [${this.context}]`;
    
    if (data) {
      return `${prefix} ${message}\n${JSON.stringify(data, null, 2)}`;
    }
    
    return `${prefix} ${message}`;
  }

  /**
   * Debug level logging (only in development)
   */
  debug(message: string, data?: any): void {
    if (this.isDevelopment) {
      console.debug(this.format('debug', message, data));
    }
  }

  /**
   * Info level logging
   */
  info(message: string, data?: any): void {
    console.log(this.format('info', message, data));
  }

  /**
   * Warning level logging
   */
  warn(message: string, data?: any): void {
    console.warn(this.format('warn', message, data));
  }

  /**
   * Error level logging
   */
  error(message: string, error?: Error | any): void {
    const formatted = this.format('error', message, error);
    console.error(formatted);
    
    // Log stack trace in development
    if (this.isDevelopment && error?.stack) {
      console.error(error.stack);
    }
  }

  /**
   * Log with custom data
   */
  log(level: LogLevel, message: string, data?: any): void {
    switch (level) {
      case 'debug':
        this.debug(message, data);
        break;
      case 'info':
        this.info(message, data);
        break;
      case 'warn':
        this.warn(message, data);
        break;
      case 'error':
        this.error(message, data);
        break;
    }
  }
}

// Export singleton instance for app-wide logging
export const logger = new LoggerService('ZTS');

// Export class for creating child loggers
export { LoggerService };
