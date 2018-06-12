import React = require("react")
import io from "socket.io-client"
import { ChatLog } from "./chatLog";

interface State {
    peers: {[key: string]: RTCPeerConnection},
    server: SocketIOClient.Socket
    userId?: string
    streams: {[key: string]: RTCDataChannel}
    logs: ChatLog[]
    text: string
}


export class App extends React.Component<{}, State> {
    constructor(props: any) {
        super(props)
        this.state = {
            peers: {},
            server: io(location.origin),
            streams: {},
            logs: [],
            text: "",
        }
        this.initIO()
    }
    getPeerCon(target: string, isSeme = true) {
        const peer = new RTCPeerConnection({iceServers: [
            {urls: "stun:stun.l.google.com:19302"}
        ]})
        peer.onicecandidate = ({candidate}) => {
            if (candidate === null) {
                return
            }
            console.log(candidate)
            this.state.server.emit("rtc-candidate", candidate, target)
        }
        peer.ondatachannel = e => {
            if (e.channel.label == "dummy") return
            if (isSeme) return
            console.log(e, isSeme)
            
            this.setState({
                streams: {
                    ...this.state.streams,
                    [target]: this.setupDataChannel(e.channel, target)
                }
            })
        }
        peer.onnegotiationneeded = console.log
        if (isSeme) {
            const dataChannel = peer.createDataChannel("chat", {ordered: true})
            this.setState({
                streams: {
                    ...this.state.streams,
                    [target]: this.setupDataChannel(dataChannel, target)
                }
            })
        }
        var disconnected = false
        peer.oniceconnectionstatechange = e => {
            const state = peer.iceConnectionState
            console.log(state)
            if (state === "failed" || state === "closed" || state === "disconnected") {
                if (disconnected) return
                disconnected = true
                this.pushLog({
                    type: "leave",
                    userId: target,
                    date: Date.now(),
                })
                const { peers, streams } = this.state
                delete peers[target]
                this.setState({peers})
                if (streams[target]) streams[target].close()
            }
        }
        this.setState({
            peers: {
                ...this.state.peers,
                [target]: peer,
            }
        })
        return peer
    }

    initIO() {
        const { server, peers } = this.state
        server.on("user-id", async (userId: string) => {
            this.setState({userId})
        })
    }

    setupDataChannel(dataChannel: RTCDataChannel, target: string) {
        console.log("readyState", dataChannel.readyState)
        dataChannel.onmessage = e => {
            var data = e.data
            console.log(data)
            if (typeof data === "string") {
                data = JSON.parse(data)
                this.pushLog(data)
            }
        }
        dataChannel.onerror = console.error
        var timer: number | null = null
        dataChannel.onopen = () => {
            console.log("open data channel")
        }
        dataChannel.onclose = () => {
            console.log("close data channel")
            if (timer) window.clearInterval(timer)
            timer = null
            const streams = this.state.streams
            delete streams[target]
            this.setState({streams})
        }
        return dataChannel
    }

    join() {
        const { server } = this.state
        server.on("join", async (sender: string) => {
            if (sender === this.state.userId) return // これ俺
            console.log("recv join req", sender)
            const peer = this.getPeerCon(sender)
            await new Promise(r => setTimeout(r, 1))
            const sdp = await peer.createOffer()
            await peer.setLocalDescription(sdp)
            console.log(sender, "send sdp offer")
            this.state.server.emit("rtc-sdp", sdp, sender)
        })
        server.on("rtc-sdp", async (sender: string, sdp: RTCSessionDescriptionInit, target?: string) => {
            if (target !== this.state.userId) return // これ俺宛じゃない
            console.log(sender, "recv sdp", sdp.type)
            var peer = this.state.peers[sender]
            if (!peer) {
                peer = this.getPeerCon(sender, false)
            }
            await peer.setRemoteDescription(sdp)
            if (sdp.type === "offer") {
                const answer = await peer.createAnswer()
                await peer.setLocalDescription(answer)
                console.log(sender, "send sdp answer")
                server.emit("rtc-sdp", answer, sender)
                peer.onnegotiationneeded = async () => {
                    const sdp = await peer.createOffer()
                    await peer.setLocalDescription(sdp)
                    this.state.server.emit("rtc-sdp", sdp, sender)
                }
            }
        })
        server.on("rtc-candidate", async (userId: string, candidate: RTCIceCandidate, target: string) => {
            if (target !== this.state.userId) return // これ俺宛じゃない
            console.log(userId, "recv candidate")
            await this.state.peers[userId].addIceCandidate(candidate)
        })

        server.emit("join")
    }

    pushLog(log: ChatLog) {
        this.setState({
            logs: [
                ...this.state.logs,
                log
            ]
        })
    }

    publishChatLog(log: ChatLog) {
        Object.values(this.state.streams).forEach(stream => {
            stream.send(JSON.stringify(log))
        })
        this.pushLog(log)
    }

    render() {
        return <div>
            <h1>chat</h1>
            <div>UserID: {this.state.userId} Connection: {Object.keys(this.state.peers).length}</div>
            <h2>logs</h2>
            <form action="javascript://" onSubmit={e => {
                this.publishChatLog({
                    type: "plain",
                    userId: this.state.userId || "undef",
                    date: Date.now(),
                    text: this.state.text,
                })
            }}>
                <input type="text" onChange={e => this.setState({text: e.target.value})}/>
                <input type="submit" />
            </form>
            <ol>
                {this.state.logs.map(this.renderLog)}
            </ol>
        </div>
    }

    renderLog(log: ChatLog) {
        switch(log.type) {
        case "join":
            return <li key={log.date}>
                {log.userId}と接続しました
            </li>
        default:
            return <li key={log.date}>
                {JSON.stringify(log)}
            </li>
        }
    }

    componentDidMount() {
        setTimeout(() => {
            this.join()
        }, 2000)
    }
}