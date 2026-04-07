"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = settings;
const rabbitMQ_1 = __importDefault(require("./clients/rabbitMQ"));
/**
 * Default settings for ServiceConnect
 */
function settings() {
    return {
        amqpSettings: {
            queue: {
                name: '',
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
            host: 'amqp://localhost',
            retryDelay: 3000,
            maxRetries: 3,
            errorQueue: 'errors',
            auditQueue: 'audit',
            auditEnabled: false,
            prefetch: 100,
            connectionTimeout: 30000,
            connectionRetryDelay: 30000,
            connectionMaxRetries: 5,
            defaultRequestTimeout: 10000
        },
        filters: {
            after: [],
            before: [],
            outgoing: []
        },
        handlers: {},
        client: rabbitMQ_1.default,
        logger: {
            info: (message) => console.log(message),
            error: (message, err) => {
                console.error(message);
                if (err)
                    console.error(err);
            }
        }
    };
}
//# sourceMappingURL=settings.js.map