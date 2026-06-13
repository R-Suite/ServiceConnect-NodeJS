export interface Logger {
    trace(msg: string, meta?: object): void;
    debug(msg: string, meta?: object): void;
    info(msg: string, meta?: object): void;
    warn(msg: string, meta?: object): void;
    error(msg: string, meta?: object): void;
    fatal(msg: string, meta?: object): void;
    child?(bindings: object): Logger;
}

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

const LEVEL_ORDER: Readonly<Record<LogLevel, number>> = {
    trace: 10,
    debug: 20,
    info: 30,
    warn: 40,
    error: 50,
    fatal: 60,
};

export function consoleLogger(level: LogLevel = 'info', bindings: object = {}): Logger {
    const threshold = LEVEL_ORDER[level];

    function emit(messageLevel: LogLevel, msg: string, meta?: object): void {
        if (LEVEL_ORDER[messageLevel] < threshold) return;
        const line = JSON.stringify({
            level: messageLevel,
            time: new Date().toISOString(),
            ...bindings,
            ...meta,
            msg,
        });
        process.stdout.write(`${line}\n`);
    }

    return {
        trace: (msg, meta) => emit('trace', msg, meta),
        debug: (msg, meta) => emit('debug', msg, meta),
        info: (msg, meta) => emit('info', msg, meta),
        warn: (msg, meta) => emit('warn', msg, meta),
        error: (msg, meta) => emit('error', msg, meta),
        fatal: (msg, meta) => emit('fatal', msg, meta),
        child: (extra) => consoleLogger(level, { ...bindings, ...extra }),
    };
}
