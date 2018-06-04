require("babel-core/register");
require("babel-polyfill");

var Bus = require('../../index.js');
var stdin = process.openStdin();

console.log("Starting Consumer");

var bus = new Bus({
    amqpSettings: {
        queue: {
            name: 'ServiceConnect.Samples.Consumer'
        },
        host: "amqp://guest:guest@localhost"
    },
    filters: {
      before: [
        (message, headers, type, bus) => {
            return new Promise((resolve, reject) => {
                console.log("");
                console.log("Before filter 1 processed");
                if (message.data % 2 === 0) {
                    resolve(true);
                } else {
                    resolve(false);
                }
            });
        },
        (message, headers, type, bus) => {
            console.log("Before filter 2 processed");
            return true;
        },
      ],
      after: [
        (message, headers, type, bus) => {
            return new Promise((resolve, reject) => {
                console.log("After filter 1 processed");
                if (message.data % 3 == 0) {
                    resolve(true);
                } else {
                    resolve(false);
                }
            });
        },
        (message, headers, type, bus) => {
            console.log("After filter 2 processed");
            return true;
        },
      ]
    }
});

bus.init(function(){

    bus.addHandler("ConsumerCommand", function(message){
        return new Promise((resolve, reject) => {
          console.log("Received message");
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
