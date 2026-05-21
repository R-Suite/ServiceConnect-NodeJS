export interface SendOptions {
  readonly headers?: Readonly<Record<string, string>>;
  readonly endpoint: string;
}
