'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _rabbitMQ = require('./Clients/rabbitMQ');

var _rabbitMQ2 = _interopRequireDefault(_rabbitMQ);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var settings = {
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
        auditEnabled: false
    },
    handlers: {
        // "message type": [ array of callbacks ]
    },
    client: _rabbitMQ2.default // AMQP client
};

exports.default = settings;
//# sourceMappingURL=settings.js.map