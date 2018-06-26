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
    }
});

var printHelpText = function(){
    console.log("Enter");
    console.log("1 To publish message with timeout only (default).");
    console.log("2 To publish message with expected replies only.");
    console.log("3 To publish message with timeout and expected replies.");
    console.log("or enter 'exit' to stop.");
};

bus.init().then(function(){
    printHelpText();

    var count = 0;
    stdin.addListener("data", function(d) {
        var option = d.toString().trim();

        switch(option){
            case "exit":
                bus.close();
                process.exit();
                break;
            case "1":

                console.log("Unknown number of replies with timeout of 0.5 seconds");
                bus.publishRequest("ExampleRequest", { data: count }, function(message){
                    console.log("Received Reply.");
                    console.log(message);
                    console.log();
                }, null, 500);

                break;
            case "2":

                console.log("Expect 2 replies with no timeout");
                bus.publishRequest("ExampleRequest", { data: count }, function(message){
                    console.log("Received Reply.");
                    console.log(message);
                    console.log();
                }, 2, null);

                break;
            case "3":
                console.log("Expect 2 replies but timeout after " + (count % 2 === 0 ? 500 : 2000) + " milliseconds");
                bus.publishRequest("ExampleRequest", { data: count }, function(message){
                    console.log("Received Reply.");
                    console.log(message);
                    console.log();
                }, 2, count % 2 === 0 ? 500 : 2000);

                break;
        }

        count++;
    });

});
