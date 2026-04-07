"use strict";
/**
 * Error classes for ServiceConnect
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidationErrorCodes = exports.ValidationError = exports.MessageErrorCodes = exports.MessageError = exports.ConnectionErrorCodes = exports.ConnectionError = exports.ServiceConnectError = void 0;
var ServiceConnectError_1 = require("./ServiceConnectError");
Object.defineProperty(exports, "ServiceConnectError", { enumerable: true, get: function () { return ServiceConnectError_1.ServiceConnectError; } });
var ConnectionError_1 = require("./ConnectionError");
Object.defineProperty(exports, "ConnectionError", { enumerable: true, get: function () { return ConnectionError_1.ConnectionError; } });
Object.defineProperty(exports, "ConnectionErrorCodes", { enumerable: true, get: function () { return ConnectionError_1.ConnectionErrorCodes; } });
var MessageError_1 = require("./MessageError");
Object.defineProperty(exports, "MessageError", { enumerable: true, get: function () { return MessageError_1.MessageError; } });
Object.defineProperty(exports, "MessageErrorCodes", { enumerable: true, get: function () { return MessageError_1.MessageErrorCodes; } });
var ValidationError_1 = require("./ValidationError");
Object.defineProperty(exports, "ValidationError", { enumerable: true, get: function () { return ValidationError_1.ValidationError; } });
Object.defineProperty(exports, "ValidationErrorCodes", { enumerable: true, get: function () { return ValidationError_1.ValidationErrorCodes; } });
//# sourceMappingURL=index.js.map