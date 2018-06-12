import React = require("react")
import io from "socket.io-client"

interface State {
    peers: {[key: string]: RTCPeerConnection},
    server: SocketIOClient.Socket
    userId?: string
    streams: string[]
}

export class App extends React.Component<{}, State> {
    constructor(props: any) {
        super(props)
        this.state = {
            peers: {},
            server: io(location.origin),
            streams: [],
        }
        this.initIO()
    }
    getPeerCon(target: string) {
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
        (peer as any).ondatachannel = (e: any) => {
            console.log(e)
            e.channel.onmessage = (e: any) => console.warn(target, e.data)
        }
        const dataChannel = (peer as any).createDataChannel("test", {ordered: true})
        dataChannel.onmessage = console.log
        dataChannel.onerror = console.error
        dataChannel.onopen = () => {
            console.log("open data channel")
            setInterval(() => dataChannel.send(new Date().toISOString()), 1000)
        }
        return peer
    }

    initIO() {
        const { server, peers } = this.state
        server.on("user-id", async (userId: string) => {
            this.setState({userId})
        })
    }

    join() {
        const { server } = this.state
        server.on("join", async (sender: string) => {
            if (sender === this.state.userId) return // これ俺
            const peer = this.getPeerCon(sender)
            this.setState({
                peers: {
                    ...this.state.peers,
                    [sender]: peer,
                }
            })
            const sdp = await peer.createOffer()
            await peer.setLocalDescription(sdp)
            this.state.server.emit("rtc-sdp", sdp, sender)
        })
        server.on("rtc-sdp", async (sender: string, sdp: RTCSessionDescriptionInit, target?: string) => {
            if (target !== this.state.userId) return // これ俺宛じゃない
            var peer = this.state.peers[sender]
            if (!peer) {
                peer = this.getPeerCon(sender)
                this.setState({
                    peers: {
                        ...this.state.peers,
                        [sender]: peer,
                    }
                })
            }
            await peer.setRemoteDescription(sdp)
            if (sdp.type === "offer") {
                const answer = await peer.createAnswer()
                await peer.setLocalDescription(answer)
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
            await this.state.peers[userId].addIceCandidate(candidate)
        })

        server.emit("join")
    }

    render() {
        return <div>
            <h1>chat</h1>
            <div>UserID: {this.state.userId}</div>
        </div>
    }

    componentDidMount() {
        setTimeout(() => {
            this.join()
        }, 2000)
    }
}