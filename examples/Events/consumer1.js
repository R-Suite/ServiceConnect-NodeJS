require("babel-core/register");
require("babel-polyfill");

var Bus = require('../../index.js');
var stdin = process.openStdin();

console.log("Starting Consumer");

var bus = new Bus({
    amqpSettings: {
        queue: {
            name: 'ServiceConnect.Samples.Consumer1'
        },
        host: "amqp://guest:guest@localhost"
    }
});

bus.init(function(){

    bus.addHandler("ExampleEvent", function(message){
        console.log("Consumer 1: Received event");
        console.log(message);
    });

    console.log("Enter 'exit' to stop.");
    stdin.addListener("data", function(d) {
        if (d.toString().trim() == "exit"){
            bus.close();
        }
    });

});
