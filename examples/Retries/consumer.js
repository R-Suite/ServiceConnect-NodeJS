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

bus.init().then(function(){

    var retryCount = 0;

    bus.addHandler("ConsumerCommand", function(message){
        console.log("Received message");
        console.log(message);
        if (retryCount > 0){
            console.log("Retry attempt " + retryCount);
        }
        retryCount++;
        throw "Error in example handler";
    });

    console.log("Enter 'exit' to stop.");
    stdin.addListener("data", function(d) {
        if (d.toString().trim() == "exit"){
            bus.close();
        }
    });

});
