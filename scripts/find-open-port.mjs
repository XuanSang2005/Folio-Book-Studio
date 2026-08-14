import { createServer } from "node:net";

const server = createServer();
server.unref();
server.once("error", (error) => {
  console.error(`Could not reserve a loopback port: ${error.message}`);
  process.exitCode = 1;
});
server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (!address || typeof address === "string") {
    console.error("Could not determine the reserved loopback port.");
    process.exitCode = 1;
    server.close();
    return;
  }
  console.log(address.port);
  server.close();
});

