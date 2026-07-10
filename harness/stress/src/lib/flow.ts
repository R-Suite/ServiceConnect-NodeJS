import type { Bus } from '@serviceconnect/core';

export type FlowDirection = 'alpha-to-beta' | 'beta-to-alpha';

export interface FlowResult {
    readonly ok: boolean;
    readonly durationMs: number;
    readonly error?: string;
}

export interface PatternFlow {
    readonly name: string;
    register(alpha: Bus, beta: Bus): Promise<void>;
    drive(direction: FlowDirection, flowTimeoutMs: number): Promise<FlowResult>;
}

export type Deferred<T> = {
    resolve(v: T): void;
    reject(e: Error): void;
    readonly promise: Promise<T>;
};

export function deferred<T>(): Deferred<T> {
    let resolve!: (v: T) => void;
    let reject!: (e: Error) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { resolve, reject, promise };
}

export function withTimeout<T>(p: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
            timeoutMs,
        );
        p.then(
            (v) => {
                clearTimeout(timer);
                resolve(v);
            },
            (e: unknown) => {
                clearTimeout(timer);
                reject(e instanceof Error ? e : new Error(String(e)));
            },
        );
    });
}
