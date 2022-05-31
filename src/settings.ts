import client from './clients/rabbitMQ';
import { ILogger } from './types';

export default function setting() {
    return {
        amqpSettings: {
            queue: {
                name: null,
                durable: true,
                exclusive: false,
                autoDelete: false,
                noAck: false,
                maxPriority: null
            },
            ssl: {
                enabled: false,
                key: null,
                passphrase: null,
                cert: null,
                ca: [],
                pfx: null,
                fail_if_no_peer_cert: false,
                verify: 'verify_peer'
            },
            host: "amqp://localhost",
            retryDelay: 3000,
            maxRetries: 3,
            errorQueue: "errors",
            auditQueue: "audit",
            auditEnabled: false,
            prefetch:100
        },
        filters: {
          after: [],
          before: [],
          outgoing: []
        },
        handlers: {
            // "message type": [ array of callbacks ]
        },
        client: client, // AMQP client
        logger: {
            info: (message:string) => console.log(message),
            error: (message:string, err : unknown) => {
                console.log(message);
                console.log(err);
            },
        } as ILogger
    };
}
