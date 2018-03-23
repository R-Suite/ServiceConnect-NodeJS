require('babel-polyfill');
var Bus = require('../../index.js');
var stdin = process.openStdin();

console.log("Starting Sender");

var bus = new Bus({
    amqpSettings: {
        queue: {
            name: 'ServiceConnect.Samples.PriorityQueue.Sender'
        },
        host: "amqp://guest:guest@localhost"
    }
});

bus.init(function(){

    console.log("Press any key to send message.  Enter 'exit' to stop.");
    stdin.addListener("data", function(d) {
        if (d.toString().trim() == "exit"){
            bus.close();
            process.exit()
        }
        for(var i=0; i < 200; i++) {
            bus.send('ServiceConnect.Samples.PriorityQueue.Consumer', "ConsumerCommand", { data: i }, { "Priority": 0});
            console.log("Sent command " + i);
        }

        bus.send('ServiceConnect.Samples.PriorityQueue.Consumer', "ConsumerCommand", { data: "High priority message." }, { "Priority": 9});
        console.log("Sent high priority command");
    });

});