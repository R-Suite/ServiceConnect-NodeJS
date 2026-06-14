/** Uppercases the first character (camelCase -> PascalCase). Leaves the rest untouched. */
function toPascal(key: string): string {
    if (key.length === 0) return key;
    return key[0].toUpperCase() + key.slice(1);
}

/** Lowercases the first character (PascalCase -> camelCase). Leaves the rest untouched. */
function toCamel(key: string): string {
    if (key.length === 0) return key;
    return key[0].toLowerCase() + key.slice(1);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return (
        typeof value === 'object' &&
        value !== null &&
        (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
    );
}

function transform(value: unknown, key: (k: string) => string): unknown {
    if (Array.isArray(value)) {
        return value.map((v) => transform(v, key));
    }
    if (isPlainObject(value)) {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value)) {
            out[key(k)] = transform(v, key);
        }
        return out;
    }
    return value;
}

/** Recursively rewrites plain-object keys to PascalCase (for the outbound wire body). */
export function pascalizeKeys(value: unknown): unknown {
    return transform(value, toPascal);
}

/** Recursively rewrites plain-object keys to camelCase (for the inbound body). */
export function camelizeKeys(value: unknown): unknown {
    return transform(value, toCamel);
}
