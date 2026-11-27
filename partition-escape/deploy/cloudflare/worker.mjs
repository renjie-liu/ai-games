// The public door of a game server that runs on a private machine (HOSTING.md). The Worker has an
// address anyone can reach; the server does not. A request that arrives here goes on, unchanged,
// through a Cloudflare Tunnel to the server, by the Workers VPC service bound as GAME.
//
// The service takes its route from its own settings and uses the address given here only for the
// Host header. So the server is shown this Worker's own name, which is what the server knows as
// its public address (hosting.json, public_origin), and its checks of Host and Origin hold. Who
// may play is decided by the server alone: this passes everything on and adds nothing.
export default {
  async fetch(request, env) {
    const {host, pathname, search} = new URL(request.url);
    return env.GAME.fetch(new Request(`http://${host}${pathname}${search}`, request));
  },
};
