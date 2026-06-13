// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
    site: 'https://r-suite.github.io',
    base: '/ServiceConnect-NodeJS/',
    integrations: [
        starlight({
            title: 'ServiceConnect (Node.js)',
            description: 'Asynchronous messaging for Node.js. Distributed systems, done cleanly.',
            favicon: '/favicon.png',
            logo: {
                light: './src/assets/logo-light.png',
                dark: './src/assets/logo-dark.png',
                replacesTitle: true,
            },
            customCss: ['./src/styles/brand.css'],
            social: [
                {
                    icon: 'github',
                    label: 'GitHub',
                    href: 'https://github.com/R-Suite/ServiceConnect-NodeJS',
                },
            ],
            sidebar: [
                {
                    label: 'Learn',
                    items: [
                        { label: 'Getting Started', link: '/learn/getting-started/' },
                        {
                            label: 'Core Concepts',
                            items: [
                                { label: 'The Bus', link: '/learn/core-concepts/the-bus/' },
                                { label: 'Messages', link: '/learn/core-concepts/messages/' },
                                { label: 'Handlers', link: '/learn/core-concepts/handlers/' },
                                { label: 'Endpoints', link: '/learn/core-concepts/endpoints/' },
                            ],
                        },
                        {
                            label: 'Messaging Patterns',
                            items: [
                                { label: 'Pub/Sub', link: '/learn/messaging-patterns/pub-sub/' },
                                {
                                    label: 'Point-to-Point',
                                    link: '/learn/messaging-patterns/point-to-point/',
                                },
                                {
                                    label: 'Request/Reply',
                                    link: '/learn/messaging-patterns/request-reply/',
                                },
                                {
                                    label: 'Scatter-Gather',
                                    link: '/learn/messaging-patterns/scatter-gather/',
                                },
                                {
                                    label: 'Polymorphic Messages',
                                    link: '/learn/messaging-patterns/polymorphic-messages/',
                                },
                                {
                                    label: 'Process Manager',
                                    link: '/learn/messaging-patterns/process-manager/',
                                },
                                {
                                    label: 'Aggregator',
                                    link: '/learn/messaging-patterns/aggregator/',
                                },
                                {
                                    label: 'Routing Slip',
                                    link: '/learn/messaging-patterns/routing-slip/',
                                },
                                {
                                    label: 'Streaming',
                                    link: '/learn/messaging-patterns/streaming/',
                                },
                                { label: 'Filters', link: '/learn/messaging-patterns/filters/' },
                                {
                                    label: 'Content-Based Routing',
                                    link: '/learn/messaging-patterns/content-based-routing/',
                                },
                                {
                                    label: 'Competing Consumers',
                                    link: '/learn/messaging-patterns/competing-consumers/',
                                },
                            ],
                        },
                        {
                            label: 'Operations',
                            items: [
                                { label: 'Cancellation', link: '/learn/operations/cancellation/' },
                                { label: 'Clustering', link: '/learn/operations/clustering/' },
                                {
                                    label: 'Configuration',
                                    link: '/learn/operations/configuration/',
                                },
                                {
                                    label: 'Error Handling',
                                    link: '/learn/operations/error-handling/',
                                },
                                { label: 'Hosting', link: '/learn/operations/hosting/' },
                                { label: 'Idempotency', link: '/learn/operations/idempotency/' },
                                {
                                    label: 'Observability',
                                    link: '/learn/operations/observability/',
                                },
                            ],
                        },
                    ],
                },
                {
                    label: 'Reference',
                    collapsed: true,
                    items: [{ autogenerate: { directory: 'reference' } }],
                },
                {
                    label: 'Project',
                    items: [
                        { label: 'Migrating from v1', link: '/migrating-v1-to-v3/' },
                        { label: 'Samples', link: '/samples/' },
                        { label: 'Releases', link: '/releases/' },
                    ],
                },
            ],
        }),
    ],
});
