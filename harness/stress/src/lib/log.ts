export interface Logger {
    info(msg: string, extra?: Record<string, unknown>): void;
    warn(msg: string, extra?: Record<string, unknown>): void;
    error(msg: string, extra?: Record<string, unknown>): void;
}

export function consoleLogger(): Logger {
    return {
        info(msg, extra) {
            process.stdout.write(`[INFO] ${msg}${extra ? ` ${JSON.stringify(extra)}` : ''}\n`);
        },
        warn(msg, extra) {
            process.stdout.write(`[WARN] ${msg}${extra ? ` ${JSON.stringify(extra)}` : ''}\n`);
        },
        error(msg, extra) {
            process.stderr.write(`[ERROR] ${msg}${extra ? ` ${JSON.stringify(extra)}` : ''}\n`);
        },
    };
}
