var Bus = require('../../index.js');
var stdin = process.openStdin();

console.log("Starting Sender");

var bus = new Bus({
    amqpSettings: {
        queue: {
            name: 'ServiceConnect.Samples.Sender'
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
        bus.sendRequest('ServiceConnect.Samples.Consumer', "ExampleRequest", { data: count }, function(message, type, headers){
            console.log("Received Reply.");
            console.log(message);
        });
        console.log("Sent command");
        count++;
    });

})





