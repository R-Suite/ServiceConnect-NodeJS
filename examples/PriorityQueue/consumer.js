require('babel-polyfill');
var Bus = require('../../index.js');
var stdin = process.openStdin();

console.log("Starting Consumer");

var bus = new Bus({
    amqpSettings: {
        queue: {
            name: 'ServiceConnect.Samples.PriorityQueue.Consumer',
            maxPriority: 3
        },
        host: "amqp://guest:guest@localhost",
        prefetch: 2
    }
});

bus.init().then(function(){

    bus.addHandler("ConsumerCommand", function(message){

      sleep(100);

      return new Promise((resolve) => {
          console.log("Received message with promise..");
          console.log(message);
          resolve();
      });
    });

    console.log("Enter 'exit' to stop.");
    stdin.addListener("data", function(d) {
        if (d.toString().trim() == "exit"){
            bus.close();
        }
    });

});

function sleep(milliseconds) {
  var start = new Date().getTime();
  for (var i = 0; i < 1e7; i++) {
    if ((new Date().getTime() - start) > milliseconds){
      break;
    }
  }
}
