import { exec } from "child_process";

export const mochaHooks = {
    async beforeAll() {
        return new Promise<void>((resolve, reject) => {
            console.log("Starting RabbitMQ")
            exec("docker run -d -p 5672:5672 --name rabbitmq bitnami/rabbitmq:latest", (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                    return;
                }
                if (stderr) {
                    reject(stderr);
                    return;
                }
                console.log("RabbitMQ started")

                // Takes about 30 seconds to start the container
                setTimeout(() => {
                    resolve();
                }, 40000)
            })
        })
    },
    async afterAll() {
        return new Promise<void>((resolve, reject) => {           
            console.log("Stopping RabbitMQ") 
            exec("docker stop rabbitmq && docker rm rabbitmq", (error, stdout, stderr) => {
                
                if (error) {
                    reject(error);
                    return;
                }
                if (stderr) {
                    reject(stderr);
                    return;
                }
                console.log("RabbitMQ stopped")
                resolve();
            })
        })
    }
};