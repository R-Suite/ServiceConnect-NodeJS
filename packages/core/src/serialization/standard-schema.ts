export interface StandardSchemaV1<TOutput = unknown> {
    readonly '~standard': {
        readonly version: 1;
        readonly vendor: string;
        readonly validate: (value: unknown) =>
            | { value: TOutput; issues?: never }
            | {
                  value?: never;
                  issues: ReadonlyArray<{ message: string; path?: ReadonlyArray<string | number> }>;
              }
            | Promise<
                  | { value: TOutput; issues?: never }
                  | {
                        value?: never;
                        issues: ReadonlyArray<{
                            message: string;
                            path?: ReadonlyArray<string | number>;
                        }>;
                    }
              >;
        readonly types?: { input: unknown; output: TOutput };
    };
}
