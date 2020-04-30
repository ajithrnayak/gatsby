import { createServer } from "http"
import httpProxy from "http-proxy"
import path from "path"
import fs from "fs-extra"
import { getServices } from "gatsby-core-utils/dist/service-lock"
import st from "st"
import restartingScreen from "./restarting-screen"

interface IProxyControls {
  serveRestartingScreen: () => void
  serveSite: () => void
}

const noop = (): void => {}

const adminFolder = path.join(
  path.dirname(require.resolve(`gatsby-admin`)),
  `public`
)

const serveAdmin = st({
  path: adminFolder,
  url: `/___admin`,
  index: `index.html`,
})

export const startDevelopProxy = (input: {
  proxyPort: number
  targetPort: number
  programPath: string
}): IProxyControls => {
  let shouldServeRestartingScreen = false

  const proxy = httpProxy.createProxyServer({
    target: `http://localhost:${input.targetPort}`,
    changeOrigin: true,
    preserveHeaderKeyCase: true,
    autoRewrite: true,
  })

  // Noop on proxy errors, as this throws a bunch of "Socket hang up"
  // ones whenever the page is refreshed
  proxy.on(`error`, noop)

  const server = createServer((req, res) => {
    const wasAdminRequest = serveAdmin(req, res)
    if (wasAdminRequest) {
      return
    }

    // Add a route at localhost:8000/___services for service discovery
    if (req.url === `/___services`) {
      getServices(input.programPath).then(services => {
        res.setHeader(`Content-Type`, `application/json`)
        res.end(JSON.stringify(services))
      })
      return
    }

    if (req.url === `/socket.io/socket.io.js`) {
      res.end(
        fs.readFileSync(require.resolve(`socket.io-client/dist/socket.io.js`))
      )
      return
    }

    if (
      shouldServeRestartingScreen ||
      req.url === `/___debug-restarting-screen`
    ) {
      res.end(restartingScreen)
      return
    }

    proxy.web(req, res)
  })

  server.listen(input.proxyPort)

  return {
    serveRestartingScreen: (): void => {
      shouldServeRestartingScreen = true
    },
    serveSite: (): void => {
      shouldServeRestartingScreen = false
    },
  }
}