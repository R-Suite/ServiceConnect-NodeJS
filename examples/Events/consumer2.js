var Bus = require('../../index.js');
var stdin = process.openStdin();

console.log("Starting Consumer");

var bus = new Bus({
    amqpSettings: {
        queue: {
            name: 'ServiceConnect.Samples.Consumer2'
        },
        host: "amqp://guest:guest@localhost"
    }
});

bus.init(function(){

    bus.addHandler("ExampleEvent", function(message, type, headers){
        console.log("Consumer 2: Received event");
        console.log(message);
    });

    console.log("Enter 'exit' to stop.");
    stdin.addListener("data", function(d) {
        if (d.toString().trim() == "exit"){
            bus.close();
        }
    });

});



