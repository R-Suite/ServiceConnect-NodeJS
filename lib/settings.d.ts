import client from './clients/rabbitMQ';
import { ILogger } from './types';
export default function setting(): {
    amqpSettings: {
        queue: {
            name: null;
            durable: boolean;
            exclusive: boolean;
            autoDelete: boolean;
            noAck: boolean;
            maxPriority: null;
        };
        ssl: {
            enabled: boolean;
            key: null;
            passphrase: null;
            cert: null;
            ca: never[];
            pfx: null;
            fail_if_no_peer_cert: boolean;
            verify: string;
        };
        host: string;
        retryDelay: number;
        maxRetries: number;
        errorQueue: string;
        auditQueue: string;
        auditEnabled: boolean;
        prefetch: number;
    };
    filters: {
        after: never[];
        before: never[];
        outgoing: never[];
    };
    handlers: {};
    client: typeof client;
    logger: ILogger;
};
