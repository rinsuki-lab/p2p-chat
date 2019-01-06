interface ChatLogJoin {
    type: "join"
    userId: string
    date: number
}

interface ChatLogLeave {
    type: "leave"
    userId: string
    date: number
}

interface ChatLogPlain {
    type: "plain"
    userId: string
    date: number
    text: string
}

export interface ChatLogFileSend {
    type: "file-send"
    userId: string
    name: string
    fileSize: number
    date: number
}

export type ChatLog = ChatLogJoin | ChatLogLeave | ChatLogPlain | ChatLogFileSend