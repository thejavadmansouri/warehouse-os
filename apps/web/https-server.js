const https = require("https");
const fs = require("fs");
const { createProxyServer } = require("http-proxy");

const options = {
key: fs.readFileSync("/Users/proman/10.141.233.130+2-key.pem"),
cert: fs.readFileSync("/Users/proman/10.141.233.130+2.pem"),
};

const proxy = createProxyServer({
  target: "http://localhost:3001",
  ws: true,
  changeOrigin: true,
});

https
  .createServer(options, (req, res) => {
    proxy.web(req, res);
  })
  .on("upgrade", (req, socket, head) => {
    proxy.ws(req, socket, head);
  })
  .listen(3443, "0.0.0.0", () => {
    console.log("HTTPS running: https://10.141.233.130:3443");
  });
