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

export type ChatLog = ChatLogJoin | ChatLogLeave | ChatLogPlain