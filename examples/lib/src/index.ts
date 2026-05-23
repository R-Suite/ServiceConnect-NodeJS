export function amqpUrl(): string {
  return process.env.AMQP_URL ?? 'amqp://guest:guest@localhost:5672';
}

export function mongoUri(): string {
  return process.env.MONGODB_URI ?? 'mongodb://localhost:27017';
}

export function announce(label: string, msg: string): void {
  process.stdout.write(`[${label}] ${msg}\n`);
}
