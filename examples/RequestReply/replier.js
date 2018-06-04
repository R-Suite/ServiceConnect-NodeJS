require("babel-core/register");
require("babel-polyfill");

var Bus = require('../../index.js');
var stdin = process.openStdin();

console.log("Starting Consumer");

var bus = new Bus({
    amqpSettings: {
        queue: {
            name: 'ServiceConnect.Samples.Consumer'
        },
        host: "amqp://guest:guest@localhost"
    }
});

bus.init(function(){

    bus.addHandler("ExampleRequest", function(message, type, headers, replyCallback){
        console.log("Received message");
        console.log(message);
        replyCallback("ExampleReply", {
            message: "reply"
        });
    });

    console.log("Enter 'exit' to stop.");
    stdin.addListener("data", function(d) {
        if (d.toString().trim() == "exit"){
            bus.close();
        }
    });

});
