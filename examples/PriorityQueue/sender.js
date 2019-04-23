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

bus.init().then(function(){

    console.log("Press any key to send message.  Enter 'exit' to stop.");
    stdin.addListener("data", function(d) {
        if (d.toString().trim() == "exit"){
            bus.close();
            process.exit()
        }
        bus.send('ServiceConnect.Samples.PriorityQueue.Consumer', "ConsumerCommand", { data: "0" }, { "Priority": 0});
        bus.send('ServiceConnect.Samples.PriorityQueue.Consumer', "ConsumerCommand", { data: "1" }, { "Priority": 1});
        bus.send('ServiceConnect.Samples.PriorityQueue.Consumer', "ConsumerCommand", { data: "2" }, { "Priority": 2});
        bus.send('ServiceConnect.Samples.PriorityQueue.Consumer', "ConsumerCommand", { data: "3" }, { "Priority": 3});
        bus.send('ServiceConnect.Samples.PriorityQueue.Consumer', "ConsumerCommand", { data: "4" }, { "Priority": 4});
        console.log("Sent high priority command");
    });

});
