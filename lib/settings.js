"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const rabbitMQ_1 = __importDefault(require("./clients/rabbitMQ"));
function setting() {
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
            prefetch: 100
        },
        filters: {
            after: [],
            before: [],
            outgoing: []
        },
        handlers: {
        // "message type": [ array of callbacks ]
        },
        client: rabbitMQ_1.default, // AMQP client
    };
}
exports.default = setting;
//# sourceMappingURL=settings.js.map