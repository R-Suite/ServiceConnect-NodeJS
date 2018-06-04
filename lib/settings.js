'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.default = setting;

var _rabbitMQ = require('./clients/rabbitMQ');

var _rabbitMQ2 = _interopRequireDefault(_rabbitMQ);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function setting() {
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
        client: _rabbitMQ2.default // AMQP client
    };
}
module.exports = exports['default'];
//# sourceMappingURL=settings.js.map