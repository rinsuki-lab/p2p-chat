import express from "express"
import http = require("http")
import SocketIO from "socket.io"
import uuid from "uuid/v4"
const app = express()
const httpServer = new http.Server(app)
const io = SocketIO(httpServer)

io.on("connect", sock => {
    const userId = uuid()
    console.log("connected", userId)
    sock.emit("user-id", userId)
    sock.on("join", () => {
        io.emit("join", userId)
    })
    sock.on("rtc-sdp", (sdp: RTCSessionDescriptionInit, target?: string) => {
        console.log("send", userId, target)
        io.emit("rtc-sdp", userId, sdp, target)
    })
    sock.on("rtc-candidate", (candidate: RTCIceCandidate, target: string) => {
        console.log("candidate", userId, target)
        io.emit("rtc-candidate", userId, candidate, target)
    })
})

app.use(express.static("public"))

httpServer.listen(3000)