import { createApp } from './src/app';
const res = await createApp().handle(new Request('http://localhost/live'));
const hdrs = ['x-content-type-options','x-frame-options','referrer-policy','permissions-policy','x-ratelimit-limit','x-request-id'];
for (const h of hdrs) console.log((res.headers.get(h) ? 'PRESENT ' : 'MISSING ') + h + ' = ' + (res.headers.get(h) ?? '-'));
