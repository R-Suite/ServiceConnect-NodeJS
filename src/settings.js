import client from './clients/rabbitMQ';

export default function setting() {
    return {
        amqpSettings: {
            queue: {
                name: null,
                durable: true,
                exclusive: false,
                autoDelete: false,
                noAck: false
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
            prefetch: 100,
            reconnect: true,
            reconnectBackoffStrategy: 'linear',
            reconnectExponentialLimit: 120000,
            reconnectBackoffTime: 1000
        },
        filters: {
          after: [],
          before: []
        },
        handlers: {
            // "message type": [ array of callbacks ]
        },
        client: client, // AMQP client
    };
}
