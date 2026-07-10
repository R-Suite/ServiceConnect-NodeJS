using System;
using System.Threading;
using ServiceConnect;
using ServiceConnect.Interfaces;

// Message contracts. Their .NET FullName (Interop.Messages.Ping / .Pong) is the type identity the
// Node side registers under, and the pub/sub exchange is FullName.Replace(".","") on both runtimes.
namespace Interop.Messages
{
    public class Ping : Message
    {
        public Ping(Guid correlationId) : base(correlationId) { }
        public string Text { get; set; }
    }

    public class Pong : Message
    {
        public Pong(Guid correlationId) : base(correlationId) { }
        public string Text { get; set; }
    }
}

namespace Interop.Fixture
{
    using Interop.Messages;

    // Auto-discovered by Bus.Initialize. Replies to every Ping with a Pong — this single handler
    // serves both a point-to-point sendRequest (delivered to the csharp-in queue) and a
    // publishRequest (delivered via the Interop.Messages.Ping fanout exchange the consumer binds to).
    public class PingHandler : IMessageHandler<Ping>
    {
        public IConsumeContext Context { get; set; }

        public void Execute(Ping message)
        {
            Console.WriteLine("[fixture] Ping received: " + message.Text);
            Context.Reply(new Pong(message.CorrelationId) { Text = message.Text + "-pong" });
        }
    }

    public static class Program
    {
        public static void Main()
        {
            // Default transport: amqp guest/guest @ localhost:5672 (the broker run.sh starts).
            Bus.Initialize(x => x.SetQueueName("csharp-in"));

            // Allow the consumer topology (queue + type-exchange bindings) to settle before the
            // Node side starts publishing, then signal readiness for the orchestration script.
            Thread.Sleep(2000);
            Console.WriteLine("FIXTURE READY");

            Thread.Sleep(Timeout.Infinite);
        }
    }
}
