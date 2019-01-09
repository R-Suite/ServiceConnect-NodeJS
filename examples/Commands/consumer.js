require('babel-polyfill');
var moment = require("moment");
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

    bus.addHandler("ConsumerCommand", function(message){
        return new Promise((resolve) => {
          return new Promise((resolve) => {
            var expire = moment().add("seconds", 10);
            while (true) {
              var now = moment();
              if (now > expire) {
                break;
              }
            }
            resolve();
          });
          console.log("Received message with promise 1");
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
