import React = require("react")
import io from "socket.io-client"
import { ChatLog, ChatLogFileSend } from "./chatLog";

interface State {
    peers: {[key: string]: RTCPeerConnection},
    server: SocketIOClient.Socket
    userId?: string
    streams: {[key: string]: RTCDataChannel}
    logs: ChatLog[]
    text: string,
    files: {[key: string]: {
        name: string,
        size: number,
        progress: number,
        buffer: Uint8Array,
    }}
}

function blob2arraybuffer(blob: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
        const fileReader = new FileReader()
        fileReader.onload = () => {
            resolve(fileReader.result! as ArrayBuffer)
        }
        fileReader.onerror = () => {
            reject(fileReader.error)
        }
        fileReader.readAsArrayBuffer(blob)
    })
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
            files: {},
        }
        this.initIO()
        addEventListener("DOMContentLoaded", () => {
            document.body.ondragover = e => {
                e.preventDefault()
            }
            document.body.ondrop = e => {
                e.preventDefault()
                const transfer = e.dataTransfer
                if (transfer == null) return
                (async (files) => {
                    const packetLength = 1024 * 10
                    for (const file of files) {
                        console.log(file.name)
                        const streams = Object.values(this.state.streams)
                        streams.forEach(stream => stream.send(JSON.stringify({
                            type: "file-send",
                            name: file.name,
                            fileSize: file.size,
                            userId: this.state.userId,
                            date: Date.now(),
                        } as ChatLogFileSend)))
                        for (var i=0; i<file.size; i+=packetLength) {
                            const arrayBuffer = await blob2arraybuffer(file.slice(i, i + packetLength))
                            streams.forEach(stream => stream.send(arrayBuffer))
                        }
                    }
                })(Array.from(transfer.files))
            }
        })
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
            if (isSeme) return
            console.log(e, isSeme)
            
            this.setState({
                streams: {
                    ...this.state.streams,
                    [target]: this.setupDataChannel(e.channel, target)
                }
            })
        }
        if (isSeme) {
            const dataChannel = peer.createDataChannel("", {ordered: true})
            this.setState({
                streams: {
                    ...this.state.streams,
                    [target]: this.setupDataChannel(dataChannel, target),
                }
            })
        }
        var disconnected = false
        peer.oniceconnectionstatechange = e => {
            console.log(e)
            const state = peer.iceConnectionState
            console.log(target, "iceState", state)
            if (state === "failed" || state === "closed" || state === "disconnected") {
                if (disconnected) return
                disconnected = true
                this.incomingLog({
                    type: "leave",
                    userId: target,
                    date: Date.now(),
                })
                const { peers, streams } = this.state
                delete peers[target]
                this.setState({peers})
                if (streams[target]) Object.values(streams[target]).map(channel => channel && channel.close())
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
                this.incomingLog(data)
            } else if (data instanceof ArrayBuffer) {
                const dataArr = new Uint8Array(data)
                const file = this.state.files[target]
                if (file == null) return
                file.buffer.set(dataArr, file.progress)
                file.progress += dataArr.length
                console.log(file.progress, file.size)
                this.setState({
                    files: {
                        ...this.state.files,
                        [target]: file
                    }
                })
                if (file.progress === file.size) {
                    // finish
                    const downloadLink = document.createElement("a")
                    downloadLink.href = URL.createObjectURL(new Blob([file.buffer]))
                    downloadLink.download = file.name
                    downloadLink.click()
                }
            }
        }
        dataChannel.onerror = console.error
        var timer: number | null = null
        dataChannel.onopen = () => {
            console.log(target, "open data channel")
            dataChannel.send(JSON.stringify({
                type: "join",
                userId: this.state.userId,
                date: Date.now(),
            } as ChatLog))
        }
        dataChannel.onclose = () => {
            console.log(target, "close data channel")
            if (timer) window.clearInterval(timer)
            timer = null
            const streams = this.state.streams
            delete streams[target]
            this.setState({streams})
            const peer = this.state.peers[target]
            if (peer) peer.close()
        }
        return dataChannel
    }

    join() {
        const { server } = this.state
        server.on("join", async (sender: string) => {
            if (sender === this.state.userId) return // これ俺

            console.log("recv join req", sender)
            const peer = this.getPeerCon(sender)
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

    incomingLog(log: ChatLog) {
        console.log(log)
        if(log.type === "file-send") {
            const uuid = log.userId
            this.setState({
                files: {
                    ...this.state.files,
                    [uuid]: {
                        name: log.name,
                        size: log.fileSize,
                        progress: 0,
                        buffer: new Uint8Array(log.fileSize),
                    }
                }
            })
        }
    }

    publishChatLog(log: ChatLog) {
        Object.values(this.state.streams).forEach(stream => {
            // stream.send(JSON.stringify(log))
        })
        this.incomingLog(log)
    }

    render() {
        return <div>
            <h1>chat</h1>
            <div>UserID: {this.state.userId} Connection: {Object.keys(this.state.peers).length}</div>
            <h2>files</h2>
            <ul>
                {Object.values(this.state.files).map(file => {
                    return <li>{file.name} - <progress value={file.progress} max={file.size}/></li>
                })}
            </ul>

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
                <strong>{log.userId}</strong>と接続しました
            </li>
        case "leave":
            return <li key={log.date}>
                <strong>{log.userId}</strong>が去りました
            </li>
        case "plain":
            return <li key={log.date}>
                <strong>{log.userId}</strong>:&nbsp;{log.text}
            </li>
        default:
            return <li key={(log as any).date}>
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