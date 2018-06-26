require("babel-core/register");
require("babel-polyfill");

var Bus = require('../../index.js');
var stdin = process.openStdin();

console.log("Starting Sender");

var bus = new Bus({
    amqpSettings: {
        queue: {
            name: 'ServiceConnect.Samples.Sender'
        },
        host: "amqp://guest:guest@localhost"
    },
    filters: {
      outgoing: [(message, headers, type, bus) => {
          console.log("Outgoing filter processed");
          return true;
      }]
    }
});

bus.init().then(function(){

    console.log("Press any key to send message.  Enter 'exit' to stop.");
    var count = 0;
    stdin.addListener("data", function(d) {
        if (d.toString().trim() == "exit"){
            bus.close();
            process.exit()
        }
        bus.send('ServiceConnect.Samples.Consumer', "ConsumerCommand", { data: count });
        console.log("Sent command");
        count++;
    });

});
