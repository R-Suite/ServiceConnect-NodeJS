# Service-Connect

A simple, easy to use asynchronous messaging framework for Node.JS.  It provides a interface for using common asynchronous messaging patterns over different protocols.  It currently supports AMQP and has been tested on RabbitMQ.  The plan is to support more protocols in the future.

## Current Features

* Messaging Patterns
    - Point to Point (Sending commands)
    - Publish/Subscribe (Publishing events)
    - Request Reply (RPC)
    - Scatter Gather (Publish event and receive multiple replies)
* Retries
* Auditing
* Error handling
* SSL Support

## Todo

* Documentation
* Messaging Patterns
    - Process Manager
    - Recipient List
    - Routing Slip
    - Message Aggregation
    - Content based routing
    - Message expiration
    - Aggregator
    - Streaming
* Filters

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
    }
});

bus.init(function(){
    bus.send('ServiceConnect.Samples.Consumer', "ConsumerCommand", { data: count });
});
```

##### 2. Receive message

Again, we create the bus. This time however we add a message handler by using ```bus.addHandler("ConsumerCommand", function(message, headers) {});``` were the first arg is the message type to consume and the second is the callback function.

```js
var Bus = require('../../index.js').Bus;

var bus = new Bus({
    amqpSettings: {
        queue: {  name: 'ServiceConnect.Samples.Consumer'  }
    }
});

bus.init(function(){

    bus.addHandler("ConsumerCommand", function(message, headers) {
        console.log(message);
    });

});
```