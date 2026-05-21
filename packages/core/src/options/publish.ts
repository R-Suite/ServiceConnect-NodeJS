export interface PublishOptions {
  readonly headers?: Readonly<Record<string, string>>;
  readonly routingKey?: string;
}
