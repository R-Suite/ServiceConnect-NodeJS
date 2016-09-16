# Service-Connect

[![Join the chat at https://gitter.im/R-Suite/ServiceConnect](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/R-Suite/ServiceConnect?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)


A simple, easy to use asynchronous messaging framework for Node.JS.  It provides a interface for using common asynchronous messaging patterns over different protocols.  It currently supports AMQP and has been tested on RabbitMQ.  The plan is to support more protocols in the future.

## Current Features

* Messaging Patterns
    - Point to Point (Sending commands)
    - Publish/Subscribe (Publishing events)
* Retries
* Auditing
* Error handling
* SSL Support

## Todo

* Messaging Patterns
    - Process Manager
    - Recipient List
    - Scatter Gather
    - Routing Slip
    - Message Aggregation

## Simple example

In this example we simply send a message from one endpoint and consume the same message on another endpoint.
See [Point To Point](https://github.com/twatson83/ServiceConnect-NodeJS/tree/master/examples/Commands) sample application for a complete example.


##### 1. Send message

First we create the Bus passing in the config. See [Settings](https://github.com/twatson83/ServiceConnect-NodeJS/blob/master/src/settings.js) file for a complete list of all settings.  After the connected callback is called we send a message using ```bus.send('ServiceConnect.Samples.Consumer', "ConsumerCommand", { data: count });``` were the first arg is the endpoint we are sending to, the second is the message type and the third is the message.

```js
var Bus = require('../../index.js').Bus;

var bus = new Bus({
    amqpSettings: {
        queue: { name: 'ServiceConnect.Samples.Sender' }
    },
    events: {
        connected: function(){
            bus.send('ServiceConnect.Samples.Consumer', "ConsumerCommand", { data: count });
        }
    }
});
```

##### 2. Receive your message

Again, we create the bus. This time however we add a handler function to the handlers object inside the configuration.  The second way of defining a handler is by using ```bus.on("ConsumerCommand", function(message, headers) {});``` were the first arg is the message type to consume and the second is the callback function.

```js
var Bus = require('../../index.js').Bus;

var bus = new Bus({
    amqpSettings: {
        queue: {
            name: 'ServiceConnect.Samples.Consumer'
        }
    },
    handlers: {
        "ConsumerCommand": [
            function(message, headers) {
                console.log("Handler 1");
                console.log(message);
            }
        ]
    }
});

bus.on("ConsumerCommand", function(message, headers) {
    console.log("Handler 2");
    console.log(message);
});
```