var Bus = require('../../index.js').Bus;
var stdin = process.openStdin();

console.log("Starting Consumer");

var bus = new Bus({
    amqpSettings: {
        queue: {
            name: 'ServiceConnect.Samples.Consumer',
            autoDelete: true
        },
        host: "amqp://guest:guest@localhost"
    },
    handlers: {
        "ConsumerCommand": [
            function(message, headers) {
                console.log("Received message")
                console.log(message);
            }
        ]
    },
    events: {
        connected: function(){
            console.log("Enter 'exit' to stop.");
            stdin.addListener("data", function(d) {
                if (d.toString().trim() == "exit"){
                    bus.close();
                    process.exit()
                }
            });
        }
    }
});




