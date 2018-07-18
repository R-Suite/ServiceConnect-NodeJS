require('babel-polyfill');
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

bus.init().then(function(){

    console.log("Press any key to send message.  Enter 'exit' to stop.");
    var count = 0;
    stdin.addListener("data", function(d) {
        if (d.toString().trim() == "exit"){
            bus.close();
            process.exit()
        }
        bus.send('ServiceConnect.Samples.Consumer', "ConsumerCommand", { data: count })
          .then(function(result) {
            console.log(result);
            console.log("Sent command")
          }).catch(function(e) {
            console.log("Error sending command");
            console.log(e);
          });

        count++;
    });

});

bus.on("error", function(err){
  console.log("Error")
  console.log(err);
});
