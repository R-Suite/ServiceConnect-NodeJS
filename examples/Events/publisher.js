require("babel-core/register");
require("babel-polyfill");

var Bus = require('../../index.js');
var stdin = process.openStdin();

console.log("Starting Sender");

var bus = new Bus({
    amqpSettings: {
        queue: {
            name: 'ServiceConnect.Samples.Publisher'
        },
        host: "amqp://guest:guest@localhost"
    }
});

bus.init(function(){

    console.log("Press any key to send message.  Enter 'exit' to stop.");
    var count = 0;
    stdin.addListener("data", function(d) {
        if (d.toString().trim() == "exit"){
            bus.close();
            process.exit()
        }
        bus.publish("ExampleEvent", { data: count });
        console.log("Published event");
        count++;
    });

});
