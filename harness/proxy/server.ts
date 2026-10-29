// Allowlist forward proxy for agent containers (HANDOVER §8). HTTP CONNECT only; every decision
// comes from `policy.ts` and is logged as one JSON line on stdout. Started by sandbox-net.sh:
//   PROXY_ALLOW=api.anthropic.com node harness/proxy/server.ts   (listens on PROXY_PORT, default 3128)
import { createServer } from 'node:http';
import { connect, type Socket } from 'node:net';
import { lookup } from 'node:dns/promises';
import { decide, parseAllow, type Decision } from './policy.ts';

const allow = parseAllow(process.env['PROXY_ALLOW'] ?? '');
const port = Number(process.env['PROXY_PORT'] ?? 3128);

function log(d: Decision, client: string): void {
  const { allow: ok, ...rest } = d;
  console.log(JSON.stringify({ t: new Date().toISOString(), decision: ok ? 'allow' : 'deny', client, ...rest }));
}

const server = createServer((req, res) => {
  log({ allow: false, host: req.headers.host ?? '', port: 80, reason: `plain http ${req.method}` }, req.socket.remoteAddress ?? '');
  res.writeHead(403, { connection: 'close' }).end('denied: plain http\n');
});

server.on('connect', (req, client, head) => {
  const from = (client as Socket).remoteAddress ?? '';
  client.on('error', () => client.destroy());
  void decide(req.url ?? '', allow, (h) => lookup(h, { all: true })).then((d) => {
    log(d, from);
    if (!d.allow) {
      client.end('HTTP/1.1 403 Forbidden\r\nconnection: close\r\n\r\n');
      return;
    }
    const upstream = connect({ host: d.address, port: d.port, family: d.family, timeout: 15_000 });
    let open = false;
    upstream.once('connect', () => {
      open = true;
      upstream.setTimeout(0);
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length > 0) upstream.write(head);
      upstream.pipe(client).pipe(upstream);
    });
    const fail = (): void => {
      upstream.destroy();
      if (open) client.destroy();
      else client.end('HTTP/1.1 502 Bad Gateway\r\nconnection: close\r\n\r\n');
    };
    upstream.once('timeout', fail).once('error', fail);
    client.once('close', () => upstream.destroy());
  });
});

server.listen(port, () => console.log(JSON.stringify({ t: new Date().toISOString(), listening: port, allow: [...allow] })));
